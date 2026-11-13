import fs from 'node:fs';
import { aguardarEscritas } from '../../storage/jsonStore';
import { getSecret, hasSecret, setSecret } from '../../storage/secretStore';
import { broadcast } from '../../core/broadcast';
import * as exportService from '../export/export.service';
import type { ChaveBundle, ExportBundle } from '../../../shared/types/export.types';
import {
  DIALETOS,
  ID_ORDEM,
  ID_RESTO,
  MAX_NOME_DISPOSITIVO,
  REGRAS_NUVEM,
  VERSAO_ESQUEMA_NUVEM,
  type DialetoSql,
  type EstadoNuvem,
  type ExtracaoGerada,
  type ModoDeEntrada,
  type NuvemFile,
  type ResultadoSync,
  type ResumoArquivoNuvem,
  type TesteNuvem,
} from '../../../shared/types/nuvem.types';
import { decompor, tamanhoDe } from '../../../shared/types/nuvem.sync';
import { sqlDaExtracao, sqlDoEsquema, type LinhaSql } from '../../../shared/types/nuvem.sql';
import { ESPACO_VALIDO, SEGREDO_SUPABASE, criarAdaptador, loadFile, oQueFalta, saveBase, saveFile } from './nuvem.arquivo';
import { aplicarNuvemAuto } from './nuvem.auto';
import { arquivosPausados, estaSincronizando, sincronizar } from './nuvem.motor';
import { criarTabelasNoSupabase, normalizarUrlSupabase } from './provedores/supabase';

/**
 * Nuvem: os dados do Iris num banco de dados. Aqui ficam a configuração, o
 * estado para a tela e o arquivo de extração; a sincronização em si é o motor
 * (nuvem.motor.ts) e cada serviço é um adaptador (provedores/).
 *
 * A chave do banco nunca sai daqui: a tela recebe `temChave` e os 4 últimos caracteres.
 */

const CHAVES = Object.keys(REGRAS_NUVEM) as ChaveBundle[];

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function versaoDe(dados: unknown): number {
  const v = (dados as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === 'number' ? v : 1;
}

function resumir(bundle: ExportBundle): ResumoArquivoNuvem[] {
  return CHAVES.map((chave) => {
    const regra = REGRAS_NUVEM[chave];
    const registros = regra.sincroniza ? [...decompor(chave, bundle[chave]).values()] : [];
    return {
      chave,
      rotulo: exportService.rotuloDaChave(chave),
      sincroniza: regra.sincroniza,
      porque: regra.porque ?? '',
      registros: registros.length,
      itens: registros.filter((r) => r.id !== ID_RESTO && r.id !== ID_ORDEM).length,
      bytes: registros.reduce((n, r) => n + tamanhoDe(r.dados), 0),
    };
  });
}

function finalDaChave(): string {
  const chave = getSecret(SEGREDO_SUPABASE) ?? '';
  // Chave curta demais mostraria quase tudo: só os 4 últimos de uma chave de verdade.
  return chave.length > 8 ? chave.slice(-4) : '';
}

export async function getEstado(): Promise<EstadoNuvem> {
  const f = loadFile();
  await aguardarEscritas();
  return {
    dispositivo: f.dispositivo,
    espaco: f.espaco,
    arquivos: resumir(await exportService.buildExportBundle()),
    provedor: f.provedor,
    supabase: { url: f.supabase.url, temChave: hasSecret(SEGREDO_SUPABASE), finalChave: finalDaChave() },
    conectado: f.conectado,
    principal: f.principal,
    sincronizando: estaSincronizando(),
    ultimaSyncEm: f.ultimaSyncEm,
    ultimoErro: f.ultimoErro,
    conflitos: f.conflitos,
    pausados: arquivosPausados(),
  };
}

/** Trocar de banco ou de espaço é começar de novo: a base antiga não vale e o computador sai do espaço. */
async function sairDoEspaco(f: NuvemFile): Promise<void> {
  f.conectado = false;
  f.rev = 0;
  f.ultimaSyncEm = '';
  f.ultimoErro = '';
  f.conflitos = [];
  await saveBase(f, {});
}

function exigirParado(): void {
  if (estaSincronizando()) throw new Error('Espere a sincronização terminar.');
}

export async function salvarIdentidade(entrada: unknown): Promise<EstadoNuvem> {
  const e = objeto(entrada);
  exigirParado();
  const f = loadFile();
  if (e.nome !== undefined) {
    const nome = texto(e.nome).trim().slice(0, MAX_NOME_DISPOSITIVO);
    if (!nome) throw new Error('Dê um nome a este computador: é como ele aparece para os outros.');
    f.dispositivo.nome = nome;
  }
  if (e.espaco !== undefined) {
    const espaco = texto(e.espaco).trim().toLowerCase();
    if (!ESPACO_VALIDO.test(espaco)) throw new Error('O espaço aceita letras minúsculas, números e hífen, até 40 caracteres (ex.: "principal", "agencia").');
    if (espaco !== f.espaco) {
      f.espaco = espaco;
      await sairDoEspaco(f);
    }
  }
  await saveFile(f);
  return getEstado();
}

/** Endereço e chave do Supabase. Chave vazia = manter a que está no cofre. */
export async function salvarSupabase(entrada: unknown): Promise<EstadoNuvem> {
  const e = objeto(entrada);
  exigirParado();
  const f = loadFile();
  const url = normalizarUrlSupabase(texto(e.url));
  if (!url) throw new Error('Cole o endereço do projeto (Project URL).');
  const chave = texto(e.chave).trim();
  if (chave) {
    if (/\s/.test(chave) || chave.length < 20) throw new Error('A chave parece incompleta. Copie a chave secreta inteira.');
    await setSecret(SEGREDO_SUPABASE, chave);
  } else if (!hasSecret(SEGREDO_SUPABASE)) {
    throw new Error('Cole a chave secreta do projeto.');
  }
  const mudouDestino = f.provedor !== 'supabase' || f.supabase.url !== url;
  f.provedor = 'supabase';
  f.supabase = { url };
  if (mudouDestino) await sairDoEspaco(f);
  await saveFile(f);
  return getEstado();
}

/** Confere endereço, chave e tabelas, e diz o que há no espaço — é o que decide como este computador entra. */
export async function testar(): Promise<TesteNuvem> {
  const f = loadFile();
  const vazio = { esquema: null, registros: 0, dispositivos: [] };
  const falta = oQueFalta(f);
  if (falta) return { ok: false, mensagem: falta, ...vazio };
  try {
    const adaptador = criarAdaptador(f);
    const esquema = await adaptador.versaoDoEsquema();
    if (esquema === null) {
      return { ok: false, mensagem: 'Conectou. Falta criar as tabelas do Iris neste banco (passo 2).', ...vazio };
    }
    if (esquema > VERSAO_ESQUEMA_NUVEM) {
      return { ok: false, mensagem: 'O banco foi atualizado por uma versão mais nova do Iris. Atualize este Iris.', ...vazio, esquema };
    }
    const [registros, dispositivos] = await Promise.all([adaptador.contar(f.espaco), adaptador.dispositivos(f.espaco)]);
    const outros = dispositivos.filter((d) => d.id !== f.dispositivo.id).length;
    return {
      ok: true,
      mensagem: registros
        ? `Conectado. O espaço "${f.espaco}" já tem ${registros.toLocaleString('pt-BR')} registros${outros ? `, de ${outros} outro(s) computador(es)` : ''}.`
        : `Conectado. O espaço "${f.espaco}" está vazio.`,
      esquema,
      registros,
      dispositivos,
    };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro), ...vazio };
  }
}

/** Cria as tabelas pelo Iris, com o token de acesso da conta (usado uma vez, não guardado). */
export async function criarTabelas(token: unknown): Promise<TesteNuvem> {
  const f = loadFile();
  if (f.provedor !== 'supabase' || !f.supabase.url) throw new Error('Salve o endereço do projeto primeiro.');
  const t = texto(token).trim();
  if (!t) throw new Error('Cole o token de acesso da sua conta do Supabase.');
  await criarTabelasNoSupabase(f.supabase.url, t, sqlDoEsquema('postgres'));
  return testar();
}

function avisar(): void {
  broadcast('nuvem:mudou', { sincronizando: estaSincronizando() });
}

/** A entrada no espaço: a única hora em que o usuário escolhe o que fazer com o que já existe. */
export async function entrar(modo: unknown): Promise<ResultadoSync> {
  if (modo !== 'enviar' && modo !== 'trazer' && modo !== 'juntar') throw new Error('Escolha como este computador entra no espaço.');
  const f = loadFile();
  if (f.conectado) throw new Error('Este computador já está no espaço.');
  const teste = await testar();
  if (!teste.ok) throw new Error(teste.mensagem);
  // "Enviar" é a escolha de quem chega primeiro. Com dados lá, seria juntar sem ter avisado.
  if (modo === 'enviar' && teste.registros > 0) throw new Error('O espaço já tem dados. Escolha trazer os da nuvem ou juntar os dois.');
  if (modo === 'trazer' && teste.registros === 0) throw new Error('O espaço está vazio: não há o que trazer. Escolha enviar os dados deste computador.');
  // Quem chega primeiro é o principal; quem entra depois não, até o usuário trocar.
  f.principal = modo === 'enviar';
  await saveFile(f);
  const resultado = await sincronizar(modo as ModoDeEntrada);
  aplicarNuvemAuto();
  return resultado;
}

/** Troca quem busca os leads e envia os lotes do WhatsApp. Só vale neste computador: desligue no outro. */
export async function definirPrincipal(valor: unknown): Promise<EstadoNuvem> {
  const f = loadFile();
  f.principal = valor === true;
  await saveFile(f);
  return getEstado();
}

export function sincronizarAgora(): Promise<ResultadoSync> {
  return sincronizar();
}

/** Para de sincronizar. Nada é apagado, nem aqui nem na nuvem; a chave continua no cofre. */
export async function desconectar(): Promise<EstadoNuvem> {
  exigirParado();
  const f = loadFile();
  await sairDoEspaco(f);
  await saveFile(f);
  aplicarNuvemAuto();
  avisar();
  return getEstado();
}

// ---------- Arquivo de extração ----------

export function ehDialeto(v: unknown): v is DialetoSql {
  return DIALETOS.some((d) => d.id === v);
}

/** Nome sugerido no diálogo de salvar: a data local, que é o que o usuário reconhece na pasta. */
export function nomeDaExtracao(dialeto: DialetoSql): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `Iris-banco-${dialeto}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.sql`;
}

/**
 * O arquivo de extração: as tabelas e todos os registros que sincronizam, em SQL.
 * O caminho vem só do diálogo do main.
 */
export async function gerarExtracao(dialeto: DialetoSql, destino: string): Promise<ExtracaoGerada> {
  const f = loadFile();
  // Uma edição ainda na fila de gravação precisa estar no disco antes da leitura.
  await aguardarEscritas();
  const bundle = await exportService.buildExportBundle();
  const agora = new Date().toISOString();
  const linhas: LinhaSql[] = [];
  for (const chave of CHAVES) {
    if (!REGRAS_NUVEM[chave].sincroniza) continue;
    const esquema = versaoDe(bundle[chave]);
    for (const r of decompor(chave, bundle[chave]).values()) {
      linhas.push({ arquivo: chave, colecao: r.colecao, id: r.id, dados: r.dados, esquema, atualizadoEm: agora });
    }
  }
  const sql = sqlDaExtracao(dialeto, f.espaco, f.dispositivo.id, linhas, agora);
  // .tmp + renomear: queda no meio não deixa um arquivo pela metade com cara de inteiro.
  const tmp = `${destino}.tmp`;
  fs.writeFileSync(tmp, sql, 'utf-8');
  fs.renameSync(tmp, destino);
  return { arquivo: destino, registros: linhas.length, bytes: Buffer.byteLength(sql, 'utf-8') };
}
