import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { net } from 'electron';
import { readStore, writeStore } from '../../storage/jsonStore';
import { deleteSecret, deleteSecretsByPrefix, getSecret, hasSecret, setSecret } from '../../storage/secretStore';
import { isFalha, request, setHostsInseguros } from '../../core/httpClient';
import { broadcast } from '../../core/broadcast';
import { rodarComandoSsh, testarSsh } from './servidores.ssh';
import * as terminal from './servidores.terminal';
import type { SegredosSsh } from './servidores.conexao';
import type {
  AtualizarServidorInput,
  Checagem,
  ConfigHealthInput,
  CriarServidorHttpInput,
  CriarServidorSshInput,
  RemoverComandoInput,
  AbrirTerminalInput,
  ResultadoTesteServidor,
  RodarComandoInput,
  SalvarComandoInput,
  SessaoTerminal,
  TestarConexaoInput,
  Servidor,
  ServidorHttp,
  ServidorSsh,
  ServidoresFile,
} from '../../../shared/types/servidores.types';

const FILE_NAME = 'servidores.json';
const SCHEMA_VERSION = 2;
/** O jsonStore reescreve o arquivo inteiro a cada ciclo — histórico precisa de teto. */
const LIMITE_HISTORICO = 200;
/** Espaçamento entre hosts no ciclo, para não abrir todos os sockets de uma vez. */
const PASSO_MS = 250;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): ServidoresFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    servidores: [],
    healthAtivo: true,
    healthIntervaloSeg: 60,
  };
}

function migrate(raw: unknown): ServidoresFile {
  const candidate = (raw ?? {}) as Partial<ServidoresFile>;
  const servidores = Array.isArray(candidate.servidores)
    ? candidate.servidores
        .filter((s): s is Servidor => Boolean(s) && (s.tipo === 'http' || s.tipo === 'ssh'))
        .map((s): Servidor => {
          const historico = Array.isArray(s.historico) ? s.historico.slice(-LIMITE_HISTORICO) : [];
          if (s.tipo === 'http') return { ...s, historico };
          // v1 → v2: todo SSH era por chave; senha e impressão digital chegaram depois.
          return {
            ...s,
            historico,
            autenticacao: s.autenticacao === 'senha' ? 'senha' : 'chave',
            caminhoChave: typeof s.caminhoChave === 'string' ? s.caminhoChave : '',
            temPassphrase: s.temPassphrase === true,
            temSenha: s.temSenha === true,
            impressaoDigital: typeof s.impressaoDigital === 'string' && s.impressaoDigital ? s.impressaoDigital : undefined,
            comandos: Array.isArray(s.comandos) ? s.comandos : [],
          };
        })
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    servidores,
    healthAtivo: candidate.healthAtivo !== false,
    healthIntervaloSeg:
      typeof candidate.healthIntervaloSeg === 'number' && candidate.healthIntervaloSeg >= 15
        ? candidate.healthIntervaloSeg
        : 60,
  };
}

function loadFile(): ServidoresFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: ServidoresFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

/** Toda mutação termina aqui: grava e empurra o arquivo inteiro para a tela. */
async function salvarEEmitir(file: ServidoresFile): Promise<ServidoresFile> {
  await saveFile(file);
  broadcast('servidores:estado', file);
  return file;
}

function achar(file: ServidoresFile, servidorId: string): Servidor {
  const servidor = file.servidores.find((s) => s.id === servidorId);
  if (!servidor) throw new Error('Servidor não encontrado.');
  return servidor;
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Mantém o httpClient sabendo quais hosts aceitam certificado inválido. */
function aplicarPoliticaTls(file: ServidoresFile): void {
  const hosts = file.servidores
    .filter((s): s is ServidorHttp => s.tipo === 'http' && s.permitirTlsInseguro)
    .map((s) => hostDe(s.url))
    .filter((host): host is string => Boolean(host));
  setHostsInseguros(hosts, 'servidores');
}

function registrar(servidor: Servidor, checagem: Checagem): void {
  servidor.historico.push(checagem);
  if (servidor.historico.length > LIMITE_HISTORICO) {
    servidor.historico = servidor.historico.slice(-LIMITE_HISTORICO);
  }
  servidor.updatedAt = nowIso();
}

export async function getState(): Promise<ServidoresFile> {
  const file = loadFile();
  aplicarPoliticaTls(file);
  return file;
}

export async function criarHttp(input: CriarServidorHttpInput): Promise<ServidoresFile> {
  if (!/^https?:\/\//i.test(input.url)) {
    throw new Error('A URL precisa começar com http:// ou https://.');
  }

  const file = loadFile();
  const timestamp = nowIso();

  file.servidores.push({
    id: randomUUID(),
    tipo: 'http',
    nome: input.nome.trim() || input.url,
    grupo: input.grupo,
    intervaloSegundos: Math.max(0, input.intervaloSegundos),
    historico: [],
    url: input.url.trim(),
    metodo: input.metodo,
    statusEsperado: input.statusEsperado || 200,
    timeoutMs: input.timeoutMs || 8000,
    permitirTlsInseguro: input.permitirTlsInseguro,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  aplicarPoliticaTls(file);
  return salvarEEmitir(file);
}

function validarSsh(input: Pick<CriarServidorSshInput, 'host' | 'usuario' | 'autenticacao' | 'caminhoChave'>): void {
  if (!input.host.trim()) throw new Error('Informe o host do servidor.');
  if (!input.usuario.trim()) throw new Error('Informe o usuário do SSH.');
  if (input.autenticacao !== 'senha' && !fs.existsSync(input.caminhoChave)) {
    throw new Error('O arquivo de chave privada não foi encontrado.');
  }
}

export async function criarSsh(input: CriarServidorSshInput): Promise<ServidoresFile> {
  validarSsh(input);
  const porSenha = input.autenticacao === 'senha';
  if (porSenha && !input.senha) throw new Error('Informe a senha.');

  const file = loadFile();
  const timestamp = nowIso();
  const id = randomUUID();

  file.servidores.push({
    id,
    tipo: 'ssh',
    nome: input.nome.trim() || input.host,
    grupo: input.grupo,
    intervaloSegundos: 0, // SSH roda sob demanda, não em ciclo.
    historico: [],
    host: input.host.trim(),
    porta: input.porta || 22,
    usuario: input.usuario.trim(),
    autenticacao: porSenha ? 'senha' : 'chave',
    caminhoChave: porSenha ? '' : input.caminhoChave,
    temPassphrase: !porSenha && Boolean(input.passphrase),
    temSenha: porSenha,
    impressaoDigital: input.impressaoDigital || undefined,
    comandos: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (porSenha) {
    await setSecret(`servidor.${id}.senha`, input.senha as string);
  } else if (input.passphrase) {
    await setSecret(`servidor.${id}.passphrase`, input.passphrase);
  }

  return salvarEEmitir(file);
}

export async function atualizar(input: AtualizarServidorInput): Promise<ServidoresFile> {
  const file = loadFile();
  const servidor = achar(file, input.servidorId);

  if (input.nome !== undefined) servidor.nome = input.nome;
  if (input.grupo !== undefined) servidor.grupo = input.grupo;
  if (input.intervaloSegundos !== undefined) {
    servidor.intervaloSegundos = Math.max(0, input.intervaloSegundos);
  }

  if (servidor.tipo === 'http') {
    if (input.url !== undefined) servidor.url = input.url;
    if (input.metodo !== undefined) servidor.metodo = input.metodo;
    if (input.statusEsperado !== undefined) servidor.statusEsperado = input.statusEsperado;
    if (input.timeoutMs !== undefined) servidor.timeoutMs = input.timeoutMs;
    if (input.permitirTlsInseguro !== undefined) servidor.permitirTlsInseguro = input.permitirTlsInseguro;
  } else {
    // Outro host ou outra porta = outra máquina: a impressão digital antiga não vale mais.
    if ((input.host !== undefined && input.host.trim() !== servidor.host) || (input.porta !== undefined && (input.porta || 22) !== servidor.porta)) {
      servidor.impressaoDigital = undefined;
    }
    if (input.host !== undefined) servidor.host = input.host.trim();
    if (input.porta !== undefined) servidor.porta = input.porta || 22;
    if (input.usuario !== undefined) servidor.usuario = input.usuario.trim();
    if (input.autenticacao !== undefined) servidor.autenticacao = input.autenticacao;
    if (input.caminhoChave !== undefined) servidor.caminhoChave = input.caminhoChave;
    validarSsh(servidor);

    if (input.senha !== undefined) {
      const chave = `servidor.${servidor.id}.senha`;
      if (input.senha) {
        await setSecret(chave, input.senha);
        servidor.temSenha = true;
      } else {
        await deleteSecret(chave);
        servidor.temSenha = false;
      }
    }
    if (servidor.autenticacao === 'senha' && !servidor.temSenha) throw new Error('Informe a senha.');

    if (input.passphrase !== undefined) {
      const chave = `servidor.${servidor.id}.passphrase`;
      if (input.passphrase) {
        await setSecret(chave, input.passphrase);
        servidor.temPassphrase = true;
      } else {
        await deleteSecret(chave);
        servidor.temPassphrase = false;
      }
    }
  }

  servidor.updatedAt = nowIso();
  aplicarPoliticaTls(file);
  return salvarEEmitir(file);
}

export async function remover(servidorId: string): Promise<ServidoresFile> {
  const file = loadFile();
  file.servidores = file.servidores.filter((s) => s.id !== servidorId);
  terminal.fecharDoServidor(servidorId);
  // Não deixa passphrase nem senha órfã no cofre depois que o servidor some.
  await deleteSecretsByPrefix(`servidor.${servidorId}.`);
  aplicarPoliticaTls(file);
  return salvarEEmitir(file);
}

async function checarHttp(servidor: ServidorHttp, signal?: AbortSignal): Promise<Checagem> {
  const resposta = await request(servidor.url, {
    method: servidor.metodo,
    timeoutMs: servidor.timeoutMs,
    permitirTlsInseguro: servidor.permitirTlsInseguro,
    descartarCorpo: true,
    signal,
  });

  if (isFalha(resposta)) {
    const erro =
      resposta.motivo === 'timeout'
        ? `Sem resposta em ${servidor.timeoutMs} ms.`
        : resposta.motivo === 'abortado'
          ? 'Checagem cancelada.'
          : resposta.mensagem;
    return { em: nowIso(), ok: false, latenciaMs: resposta.latenciaMs, erro };
  }

  const ok = resposta.status === servidor.statusEsperado;
  return {
    em: nowIso(),
    ok,
    status: resposta.status,
    latenciaMs: resposta.latenciaMs,
    erro: ok ? undefined : `Esperava HTTP ${servidor.statusEsperado}, veio ${resposta.status}.`,
  };
}

export async function checarAgora(servidorId: string): Promise<ServidoresFile> {
  const file = loadFile();
  aplicarPoliticaTls(file);
  const servidor = achar(file, servidorId);

  if (servidor.tipo !== 'http') {
    throw new Error('Só servidores HTTP têm checagem automática.');
  }

  registrar(servidor, await checarHttp(servidor));
  return salvarEEmitir(file);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Um ciclo completo de health check; chamado pelo agendador do main. */
export async function runHealthCycle(signal?: AbortSignal): Promise<void> {
  const file = loadFile();
  aplicarPoliticaTls(file);

  const alvos = file.servidores.filter(
    (s): s is ServidorHttp => s.tipo === 'http' && s.intervaloSegundos > 0,
  );
  if (alvos.length === 0) return;

  // Sem rede, todo alvo "cairia" ao mesmo tempo e encheria o histórico de
  // falsos negativos — melhor não registrar nada.
  if (!net.isOnline()) return;

  for (const servidor of alvos) {
    if (signal?.aborted) return;

    const ultima = servidor.historico[servidor.historico.length - 1];
    if (ultima) {
      const desde = Date.now() - new Date(ultima.em).getTime();
      if (desde < servidor.intervaloSegundos * 1000) continue;
    }

    registrar(servidor, await checarHttp(servidor, signal));
    await esperar(PASSO_MS);
  }

  await salvarEEmitir(file);
}

export async function checarTodos(): Promise<ServidoresFile> {
  const file = loadFile();
  aplicarPoliticaTls(file);

  const alvos = file.servidores.filter((s): s is ServidorHttp => s.tipo === 'http');
  for (const servidor of alvos) {
    registrar(servidor, await checarHttp(servidor));
  }

  return salvarEEmitir(file);
}

export async function salvarComando(input: SalvarComandoInput): Promise<ServidoresFile> {
  const file = loadFile();
  const servidor = achar(file, input.servidorId);
  if (servidor.tipo !== 'ssh') throw new Error('Comandos salvos existem só em servidores SSH.');

  if (!input.comando.trim()) throw new Error('Informe o comando.');

  const existente = input.comandoId
    ? servidor.comandos.find((c) => c.id === input.comandoId)
    : undefined;

  if (existente) {
    existente.rotulo = input.rotulo.trim() || input.comando.trim();
    existente.comando = input.comando.trim();
  } else {
    servidor.comandos.push({
      id: randomUUID(),
      rotulo: input.rotulo.trim() || input.comando.trim(),
      comando: input.comando.trim(),
    });
  }

  servidor.updatedAt = nowIso();
  return salvarEEmitir(file);
}

export async function removerComando(input: RemoverComandoInput): Promise<ServidoresFile> {
  const file = loadFile();
  const servidor = achar(file, input.servidorId);
  if (servidor.tipo !== 'ssh') throw new Error('Comandos salvos existem só em servidores SSH.');

  servidor.comandos = servidor.comandos.filter((c) => c.id !== input.comandoId);
  servidor.updatedAt = nowIso();
  return salvarEEmitir(file);
}

/**
 * Dispara o comando e retorna imediatamente: a saída chega em pedaços pelo
 * tópico 'servidores:saida', para a tela ir preenchendo sem re-renderizar tudo.
 */
export async function rodarComando(input: RodarComandoInput): Promise<void> {
  const file = loadFile();
  const servidor = achar(file, input.servidorId);
  if (servidor.tipo !== 'ssh') throw new Error('Só servidores SSH executam comandos.');

  const comando = servidor.comandos.find((c) => c.id === input.comandoId);
  if (!comando) throw new Error('Comando não encontrado.');

  const segredos = segredosDe(servidor);
  if (input.passphrase) segredos.passphrase = input.passphrase;

  const vista = await rodarComandoSsh(servidor, comando, segredos);
  await gravarPrimeiraImpressao(servidor.id, vista);
}

function segredosDe(servidor: ServidorSsh): SegredosSsh {
  return servidor.autenticacao === 'senha'
    ? { senha: getSecret(`servidor.${servidor.id}.senha`) ?? undefined }
    : { passphrase: getSecret(`servidor.${servidor.id}.passphrase`) ?? undefined };
}

/**
 * Confiança na primeira conexão (como o `ssh` faz com o known_hosts): a chave que
 * o servidor mostrou da primeira vez é a que vale dali em diante.
 */
async function gravarPrimeiraImpressao(servidorId: string, vista: string | undefined): Promise<void> {
  if (!vista) return;
  const file = loadFile();
  const servidor = file.servidores.find((s): s is ServidorSsh => s.id === servidorId && s.tipo === 'ssh');
  if (!servidor || servidor.impressaoDigital) return;
  servidor.impressaoDigital = vista;
  servidor.updatedAt = nowIso();
  await salvarEEmitir(file);
}

/** O servidor foi reinstalado (ou trocou de chave de propósito): esquece a impressão antiga. */
export async function confiarHost(servidorId: string): Promise<ServidoresFile> {
  const file = loadFile();
  const servidor = achar(file, servidorId);
  if (servidor.tipo !== 'ssh') throw new Error('Só servidores SSH têm chave de host.');
  servidor.impressaoDigital = undefined;
  servidor.updatedAt = nowIso();
  return salvarEEmitir(file);
}

/** "Testar conexão" do cadastro: nada é gravado. */
export async function testarConexao(input: TestarConexaoInput): Promise<ResultadoTesteServidor> {
  const salvo = input.servidorId ? loadFile().servidores.find((s) => s.id === input.servidorId) : undefined;

  if (input.tipo === 'http') {
    if (!/^https?:\/\//i.test(input.url)) return { ok: false, erro: 'A URL precisa começar com http:// ou https://.' };
    const host = hostDe(input.url);
    if (input.permitirTlsInseguro && host) {
      // Só para o teste: um grupo próprio não mexe nos hosts dos servidores salvos.
      setHostsInseguros([host], 'servidores-teste');
    }
    try {
      const checagem = await checarHttp({
        id: '',
        tipo: 'http',
        nome: input.nome,
        url: input.url.trim(),
        metodo: input.metodo,
        intervaloSegundos: 0,
        permitirTlsInseguro: input.permitirTlsInseguro,
        historico: [],
        statusEsperado: input.statusEsperado || 200,
        timeoutMs: input.timeoutMs || 8000,
        createdAt: '',
        updatedAt: '',
      });
      return { ok: checagem.ok, latenciaMs: checagem.latenciaMs, status: checagem.status, erro: checagem.erro };
    } finally {
      setHostsInseguros([], 'servidores-teste');
    }
  }

  const porSenha = input.autenticacao === 'senha';
  if (!input.host.trim()) return { ok: false, erro: 'Informe o host.' };
  if (!input.usuario.trim()) return { ok: false, erro: 'Informe o usuário.' };
  const salvoSsh = salvo?.tipo === 'ssh' ? salvo : undefined;
  const segredos: SegredosSsh = porSenha
    ? { senha: input.senha || (salvoSsh ? getSecret(`servidor.${salvoSsh.id}.senha`) ?? undefined : undefined) }
    : { passphrase: input.passphrase || (salvoSsh ? getSecret(`servidor.${salvoSsh.id}.passphrase`) ?? undefined : undefined) };
  // Mesmo host e porta do salvo: confere contra a chave já confiada.
  const mesmaMaquina = salvoSsh && salvoSsh.host === input.host.trim() && salvoSsh.porta === (input.porta || 22);
  return testarSsh(
    {
      host: input.host.trim(),
      porta: input.porta || 22,
      usuario: input.usuario.trim(),
      autenticacao: porSenha ? 'senha' : 'chave',
      caminhoChave: input.caminhoChave,
      impressaoDigital: mesmaMaquina ? salvoSsh.impressaoDigital : undefined,
    },
    segredos,
  );
}

export async function abrirTerminal(input: AbrirTerminalInput): Promise<SessaoTerminal> {
  const file = loadFile();
  const servidor = achar(file, input.servidorId);
  if (servidor.tipo !== 'ssh') throw new Error('Só servidores SSH abrem terminal.');
  return terminal.abrirTerminal(servidor, segredosDe(servidor), input.cols, input.rows, (vista) => {
    void gravarPrimeiraImpressao(servidor.id, vista).catch(() => undefined);
  });
}

export async function configHealth(input: ConfigHealthInput): Promise<ServidoresFile> {
  const file = loadFile();
  file.healthAtivo = input.healthAtivo;
  file.healthIntervaloSeg = Math.max(15, Math.round(input.healthIntervaloSeg));
  return salvarEEmitir(file);
}

export function getHealthConfig(): { ativo: boolean; intervaloMs: number } {
  const file = loadFile();
  return { ativo: file.healthAtivo, intervaloMs: file.healthIntervaloSeg * 1000 };
}

export function temPassphraseSalva(servidorId: string): boolean {
  return hasSecret(`servidor.${servidorId}.passphrase`);
}

export async function getFullFile(): Promise<ServidoresFile> {
  return loadFile();
}

/** Backup e importação passam pela mesma leitura defensiva do disco: arquivo antigo ou malformado não vai cru. */
export async function replaceFile(file: unknown): Promise<ServidoresFile> {
  const migrado = migrate(file);
  await saveFile(migrado);
  return migrado;
}
