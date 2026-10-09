import { randomBytes, randomUUID } from 'node:crypto';
import { BrowserWindow, Notification, clipboard } from 'electron';
import { broadcast } from '../../core/broadcast';
import { isFalha, request } from '../../core/httpClient';
import * as secretStore from '../../storage/secretStore';
import { soDigitos } from '../../../shared/types/brasil';
import type { ContatosFile, DescartarLeadInput, EmpresaCrm, Pessoa, RefContato, SalvarLeadsConfigInput } from '../../../shared/types/contatos.types';
import {
  CABECALHO_CHAVE,
  FAIXAS_LEAD,
  normalizarUrlNuvem,
  origemDoLead,
  telefoneComparavel,
  validarLead,
  type CanalLead,
  type EntradaLead,
  type EstadoBusca,
  type EstadoServidorLocal,
  type FaixaLead,
  type LeadValido,
  type RelatorioLeads,
  type ResultadoTeste,
  type StatusLeads,
} from '../../../shared/types/leads.types';
import { pontuar } from '../../../shared/types/leads.pontuacao';
import { CAMINHO_WEBHOOK, LEAD_TESTE_N8N, enderecoParaN8n, fluxoN8n, type CenarioN8n, type FluxoN8n } from '../../../shared/types/leads.n8n';
import * as n8nService from '../n8n/n8n.service';
import { agoraLocal, loadFile, migrateEmpresa, migrateLeadsConfig, migratePessoa, migrateRegras, migrateRelatorioLeads, nowIso, saveFile } from './contatos.arquivo';
import { fimDaEtapa, nomeDaEtapa, registrarEvento } from './contatos.service';
import { iconeDoApp } from '../../core/icone';

/**
 * Leads que chegam por API. Os dois caminhos — o servidor local
 * (contatos.servidor.ts) e a caixa na nuvem (buscarNuvem, abaixo) — terminam
 * aqui, em `receberLeads`: mesma validação, mesma regra de duplicado, mesma
 * pontuação, mesmo aviso.
 */

/** A chave que lê a caixa na nuvem. Só no cofre; a tela recebe só se existe e os 4 últimos caracteres. */
export const SEGREDO_CHAVE_IRIS = 'leads.nuvem.chave';

export function gerarChave(prefixo: string, bytes: number): string {
  return prefixo + randomBytes(bytes).toString('base64url');
}

/**
 * Arquivo da parte 1 (ou instalação nova) ainda sem chave do formulário: gera
 * uma na primeira leitura e grava, para os códigos de API e n8n já saírem prontos.
 */
export async function garantirChaveFormulario(file: ContatosFile): Promise<ContatosFile> {
  if (file.leadsConfig.chaveFormulario) return file;
  file.leadsConfig.chaveFormulario = gerarChave('pub_', 18);
  await saveFile(file);
  return file;
}

export function contarNaoVistos(file: ContatosFile): number {
  return file.pessoas.filter((p) => p.entrada && !p.entrada.visto && !p.arquivado).length;
}

// ---------- Receber ----------

export interface LeadParaReceber {
  dados: unknown;
  /** "AAAA-MM-DDTHH:mm" local; sem ele, agora. A nuvem manda a hora em que a caixa recebeu. */
  recebidoEm?: string;
  /** Id na caixa da nuvem, para não importar duas vezes. */
  idExterno?: string;
}

export type ResultadoLead =
  | { tipo: 'criado' | 'retorno'; ref: RefContato; nome: string; pontos: number; faixa: FaixaLead; origem: string }
  | { tipo: 'isca' }
  | { tipo: 'invalido'; erros: Record<string, string> };

function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mesmo e-mail ou mesmo telefone (só dígitos): é a mesma pessoa voltando. */
function acharPessoa(file: ContatosFile, lead: LeadValido): Pessoa | undefined {
  const email = lead.enviado.email.toLowerCase();
  const tel = telefoneComparavel(lead.enviado.telefone);
  return (
    file.pessoas.find((p) => p.emails.some((e) => e.toLowerCase() === email)) ??
    (tel.length >= 10 ? file.pessoas.find((p) => p.telefones.some((t) => telefoneComparavel(t.numero) === tel)) : undefined)
  );
}

/** A empresa do CRM com o mesmo CNPJ ou o mesmo nome; se não houver, cria. */
function empresaDoLead(file: ContatosFile, lead: LeadValido): EmpresaCrm | undefined {
  const { empresa, cnpj } = lead.enviado;
  if (!empresa && !cnpj) return undefined;
  const digitos = soDigitos(cnpj);
  const nome = semAcento(empresa);
  const achada =
    (digitos.length === 14 ? file.empresas.find((e) => soDigitos(e.cnpj) === digitos) : undefined) ??
    (nome ? file.empresas.find((e) => semAcento(e.razaoSocial) === nome || semAcento(e.nomeFantasia) === nome) : undefined);
  if (achada) {
    // Empresa achada pelo nome e ainda sem CNPJ: o do formulário completa o cadastro.
    if (!achada.cnpj && cnpj) achada.cnpj = cnpj;
    return achada;
  }
  const etapas = new Set(file.etapas.map((e) => e.id));
  const primeira = file.etapas[0]!.id;
  const nova = migrateEmpresa(
    {
      id: randomUUID(),
      razaoSocial: empresa || `CNPJ ${cnpj}`,
      nomeFantasia: empresa,
      cnpj,
      origem: 'Formulário do site',
      etapaId: primeira,
      ordem: fimDaEtapa(file, primeira),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    etapas,
    primeira,
  );
  if (!nova) return undefined;
  file.empresas.push(nova);
  registrarEvento(file, { tipo: 'empresa', id: nova.id }, 'Criada a partir de um lead do formulário');
  return nova;
}

/** O texto que vai para o histórico: a mensagem da pessoa e de onde ela veio. */
function textoDoFormulario(lead: LeadValido, abertura: string): string {
  const partes = [abertura];
  if (lead.mensagem) partes.push(lead.mensagem);
  if (lead.interesse) partes.push(`Interesse: ${lead.interesse}`);
  const origem = origemDoLead(lead);
  if (origem !== 'Direto' || lead.pagina) partes.push([`Origem: ${origem}`, lead.pagina ? `página ${lead.pagina}` : ''].filter(Boolean).join(' · '));
  return partes.join('\n\n');
}

function registrarFormulario(file: ContatosFile, pessoaId: string, data: string, texto: string): void {
  file.interacoes.push({ id: randomUUID(), contato: { tipo: 'pessoa', id: pessoaId }, tipo: 'formulario', data, texto, criadoEm: nowIso() });
}

function entradaNova(lead: LeadValido, canal: CanalLead, recebidoEm: string, file: ContatosFile): EntradaLead {
  const base = { ...lead, recebidoEm, canal };
  return { ...base, ...pontuar(base, file.leadsConfig.regras), visto: false, retornos: 0 };
}

/** Aplica um lead já validado no arquivo (sem gravar). */
function aplicarLead(file: ContatosFile, lead: LeadValido, canal: CanalLead, recebidoEm: string): ResultadoLead {
  const etapas = new Set(file.etapas.map((e) => e.id));
  const primeira = file.etapas[0]!.id;
  const existente = acharPessoa(file, lead);

  if (existente) {
    // Voltou: não cria outra pessoa. Completa o que faltava, guarda a volta no
    // histórico e devolve o lead à caixa de entrada como "não visto".
    if (!existente.emails.some((e) => e.toLowerCase() === lead.enviado.email)) existente.emails.push(lead.enviado.email);
    const tel = telefoneComparavel(lead.enviado.telefone);
    if (!existente.telefones.some((t) => telefoneComparavel(t.numero) === tel)) existente.telefones.push({ numero: lead.enviado.telefone, tipo: 'celular' });
    const anterior = existente.entrada;
    if (anterior) {
      const mescla = {
        ...anterior,
        enviado: {
          ...anterior.enviado,
          empresa: anterior.enviado.empresa || lead.enviado.empresa,
          cnpj: anterior.enviado.cnpj || lead.enviado.cnpj,
        },
        mensagem: anterior.mensagem || lead.mensagem,
        interesse: anterior.interesse || lead.interesse,
        formulario: anterior.formulario || lead.formulario,
        pagina: anterior.pagina || lead.pagina,
        utm: anterior.utm.source || anterior.utm.campaign ? anterior.utm : lead.utm,
      };
      existente.entrada = { ...mescla, ...pontuar(mescla, file.leadsConfig.regras), visto: false, retornos: anterior.retornos + 1, ultimoEnvioEm: recebidoEm };
    } else {
      existente.entrada = entradaNova(lead, canal, recebidoEm, file);
    }
    if (!existente.empresaId) {
      const empresa = empresaDoLead(file, lead);
      if (empresa) existente.empresaId = empresa.id;
    }
    existente.updatedAt = nowIso();
    registrarFormulario(file, existente.id, recebidoEm, textoDoFormulario(lead, anterior ? 'Voltou pelo formulário.' : 'Enviou o formulário do site.'));
    const e = existente.entrada!;
    return { tipo: 'retorno', ref: { tipo: 'pessoa', id: existente.id }, nome: existente.nome, pontos: e.pontos, faixa: e.faixa, origem: origemDoLead(e) };
  }

  const empresa = empresaDoLead(file, lead);
  const entrada = entradaNova(lead, canal, recebidoEm, file);
  const pessoa = migratePessoa(
    {
      id: randomUUID(),
      nome: lead.enviado.nome,
      emails: [lead.enviado.email],
      telefones: [{ numero: lead.enviado.telefone, tipo: 'celular' }],
      origem: lead.formulario || 'Formulário do site',
      ...(empresa ? { empresaId: empresa.id } : {}),
      etapaId: primeira,
      ordem: fimDaEtapa(file, primeira),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      entrada,
    },
    etapas,
    primeira,
    file.leadsConfig.regras,
  );
  if (!pessoa) return { tipo: 'invalido', erros: { nome: 'Informe o nome.' } };
  file.pessoas.push(pessoa);
  registrarFormulario(file, pessoa.id, recebidoEm, textoDoFormulario(lead, lead.mensagem || lead.interesse ? 'Mensagem enviada pelo formulário:' : 'Chegou pelo formulário do site.'));
  return { tipo: 'criado', ref: { tipo: 'pessoa', id: pessoa.id }, nome: pessoa.nome, pontos: entrada.pontos, faixa: entrada.faixa, origem: origemDoLead(entrada) };
}

/**
 * Recebe um lote (um lead do servidor local, vários da nuvem) numa leitura e
 * numa gravação só. Entre ler e gravar não há `await`: duas chegadas ao mesmo
 * tempo não se atropelam (a gravação do jsonStore entra na fila antes).
 */
export async function receberLeads(itens: LeadParaReceber[], canal: CanalLead): Promise<ResultadoLead[]> {
  const file = loadFile();
  const jaRecebidos = new Set(file.leadsConfig.idsRecebidos);
  const resultados: ResultadoLead[] = [];
  let mudou = false;
  itens.forEach((item) => {
    if (item.idExterno && jaRecebidos.has(item.idExterno)) return;
    const validacao = validarLead(item.dados);
    if (item.idExterno) {
      file.leadsConfig.idsRecebidos.push(item.idExterno);
      jaRecebidos.add(item.idExterno);
      mudou = true;
    }
    if (!validacao.ok) {
      resultados.push(validacao.isca ? { tipo: 'isca' } : { tipo: 'invalido', erros: validacao.erros });
      return;
    }
    resultados.push(aplicarLead(file, validacao.lead, canal, item.recebidoEm ?? agoraLocal()));
    mudou = true;
  });
  if (!mudou) return resultados;
  file.leadsConfig.idsRecebidos = file.leadsConfig.idsRecebidos.slice(-300);
  await saveFile(file);

  const chegaram = resultados.filter((r): r is Extract<ResultadoLead, { ref: RefContato }> => r.tipo === 'criado' || r.tipo === 'retorno');
  if (chegaram.length) {
    broadcast('contatos:mudou', { novos: chegaram.length, naoVistos: contarNaoVistos(file) });
    notificar(file, chegaram);
  }
  return resultados;
}

export async function receberLead(dados: unknown, canal: CanalLead): Promise<ResultadoLead> {
  return (await receberLeads([{ dados }], canal))[0] ?? { tipo: 'isca' };
}

// ---------- Aviso do Windows ----------

/** Sem referência viva, o coletor de lixo leva a notificação e o clique se perde. */
const notificacoesVivas = new Set<Notification>();

function focarJanela(): void {
  const janela = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

function mostrar(titulo: string, corpo: string, ref?: RefContato): void {
  const n = new Notification({ title: titulo, body: corpo, icon: iconeDoApp() });
  notificacoesVivas.add(n);
  const soltar = (): void => {
    notificacoesVivas.delete(n);
  };
  n.on('click', () => {
    soltar();
    focarJanela();
    broadcast('contatos:abrir', ref ? { ref } : {});
  });
  n.on('close', soltar);
  n.show();
  // Uma notificação que ninguém clicou some da central sozinha; não guardar para sempre.
  setTimeout(soltar, 10 * 60_000);
}

function notificar(file: ContatosFile, chegaram: Array<Extract<ResultadoLead, { ref: RefContato }>>): void {
  if (!file.leadsConfig.notificar) return;
  try {
    if (!Notification.isSupported()) return;
    const rotulo = (f: FaixaLead): string => FAIXAS_LEAD.find((x) => x.id === f)?.rotulo ?? f;
    if (chegaram.length > 3) {
      mostrar(`${chegaram.length} leads novos`, `${chegaram.filter((r) => r.faixa === 'quente').length} quentes — abra Leads`);
      return;
    }
    chegaram.forEach((r) => {
      mostrar(`${r.tipo === 'criado' ? 'Novo lead' : 'Lead voltou'}: ${r.nome} · ${rotulo(r.faixa)} (${r.pontos})`, r.origem === 'Direto' ? 'Formulário do site' : r.origem, r.ref);
    });
  } catch (erro) {
    // Aviso é extra: falhar aqui não pode desfazer o lead já gravado.
    console.error('[leads] notificação falhou', erro);
  }
}

// ---------- Ações da caixa de entrada ----------

export async function marcarVisto(ids: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const todos = ids === 'todos';
  const alvo = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  let mudou = false;
  file.pessoas.forEach((p) => {
    if (p.entrada && !p.entrada.visto && (todos || alvo.has(p.id))) {
      p.entrada.visto = true;
      mudou = true;
    }
  });
  if (mudou) {
    await saveFile(file);
    broadcast('contatos:mudou', { novos: 0, naoVistos: contarNaoVistos(file) });
  }
  return file;
}

/** Descartar = ir para a etapa "perdida" do funil, com o motivo no histórico. */
export async function descartarLead(input: DescartarLeadInput): Promise<ContatosFile> {
  const file = loadFile();
  const pessoa = file.pessoas.find((p) => p.id === input?.pessoaId);
  if (!pessoa) throw new Error('Esse lead não existe mais.');
  const perdida = file.etapas.find((e) => e.tipo === 'perdida');
  if (!perdida) throw new Error('O funil não tem etapa do tipo "perdida". Crie uma em Funil › Editar etapas.');
  const ref: RefContato = { tipo: 'pessoa', id: pessoa.id };
  if (pessoa.etapaId !== perdida.id) {
    registrarEvento(file, ref, `Etapa: ${nomeDaEtapa(file, pessoa.etapaId)} → ${perdida.nome}`);
    pessoa.etapaId = perdida.id;
    pessoa.ordem = fimDaEtapa(file, perdida.id);
  }
  const motivo = typeof input.motivo === 'string' ? input.motivo.trim().slice(0, 500) : '';
  registrarEvento(file, ref, motivo ? `Lead descartado: ${motivo}` : 'Lead descartado');
  if (pessoa.entrada) pessoa.entrada.visto = true;
  pessoa.updatedAt = nowIso();
  await saveFile(file);
  broadcast('contatos:mudou', { novos: 0, naoVistos: contarNaoVistos(file) });
  return file;
}

// ---------- Configuração e chaves ----------

function urlPermitida(url: string): boolean {
  try {
    const u = new URL(url);
    // http só para testar com uma caixa no próprio PC; na internet, sempre https.
    return u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.\d+\.\d+\.\d+)$/.test(u.hostname));
  } catch {
    return false;
  }
}

/** Mescla o que veio da tela; a pontuação de todos se refaz na leitura (migrateEntrada). */
export async function salvarLeadsConfig(input: SalvarLeadsConfigInput): Promise<ContatosFile> {
  const file = loadFile();
  const atual = file.leadsConfig;
  const servidor = { ...atual.servidor, ...(input?.servidor ?? {}) };
  if (input?.servidor?.porta !== undefined) {
    const porta = Number(input.servidor.porta);
    if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) throw new Error('A porta precisa ser um número entre 1024 e 65535.');
    servidor.porta = porta;
  }
  const nuvem = { ...atual.nuvem, ...(input?.nuvem ?? {}) };
  if (input?.nuvem?.url !== undefined) {
    const url = normalizarUrlNuvem(String(input.nuvem.url));
    if (url && !urlPermitida(url)) throw new Error('O endereço da caixa precisa começar com https:// (ex.: https://iris-leads.seu-nome.workers.dev).');
    nuvem.url = url;
  }
  if (nuvem.ativo && !nuvem.url) throw new Error('Cole o endereço da caixa na nuvem antes de ligar a busca.');
  let regras = atual.regras;
  if (input?.regras) {
    const pedido = input.regras;
    if (pedido.quente !== undefined && pedido.morno !== undefined && Number(pedido.morno) >= Number(pedido.quente)) {
      throw new Error('O começo de "Morno" precisa ser menor que o de "Quente".');
    }
    regras = migrateRegras({ ...atual.regras, ...pedido, pesos: { ...atual.regras.pesos, ...(pedido.pesos ?? {}) } });
  }
  file.leadsConfig = migrateLeadsConfig({
    ...atual,
    servidor,
    nuvem,
    regras,
    notificar: input?.notificar ?? atual.notificar,
  });
  await saveFile(file);
  // Relida pela migrate: as pontuações já voltam refeitas com as regras novas.
  return loadFile();
}

export async function gerarChaveFormulario(): Promise<ContatosFile> {
  const file = loadFile();
  file.leadsConfig.chaveFormulario = gerarChave('pub_', 18);
  await saveFile(file);
  return file;
}

/** Gera, guarda no cofre e copia para a área de transferência — o valor não passa pela tela. */
export async function gerarChaveIris(): Promise<void> {
  const chave = gerarChave('iris_', 32);
  await secretStore.setSecret(SEGREDO_CHAVE_IRIS, chave);
  clipboard.writeText(chave);
}

/** Para quem já tem a caixa configurada (reinstalou, outro PC) e cola a CHAVE_IRIS que está lá. */
export async function definirChaveIris(valor: unknown): Promise<void> {
  const chave = typeof valor === 'string' ? valor.trim() : '';
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(chave)) throw new Error('Essa não parece uma chave válida: use só letras, números, - e _, com pelo menos 16 caracteres.');
  await secretStore.setSecret(SEGREDO_CHAVE_IRIS, chave);
}

export function copiarChaveIris(): void {
  const chave = secretStore.getSecret(SEGREDO_CHAVE_IRIS);
  if (!chave) throw new Error('Ainda não há chave do Iris. Gere uma primeiro.');
  clipboard.writeText(chave);
}

// ---------- Caixa na nuvem ----------

let ultimaBusca: EstadoBusca | undefined;
/** Relógio da caixa na última busca: a próxima só lista se chegou algo depois (ver leads.worker.ts). */
let desdeNuvem = 0;
let buscaEmAndamento: Promise<EstadoBusca> | null = null;

export function statusLeads(servidor: EstadoServidorLocal): StatusLeads {
  const file = loadFile();
  const chave = secretStore.hasSecret(SEGREDO_CHAVE_IRIS) ? secretStore.getSecret(SEGREDO_CHAVE_IRIS) : null;
  let suportadas = false;
  try {
    suportadas = Notification.isSupported();
  } catch {
    suportadas = false;
  }
  return {
    servidor,
    nuvem: {
      ativo: file.leadsConfig.nuvem.ativo,
      url: file.leadsConfig.nuvem.url,
      temChaveIris: Boolean(chave),
      finalChaveIris: chave ? chave.slice(-4) : '',
      ...(ultimaBusca ? { ultimaBusca } : {}),
    },
    notificacoesSuportadas: suportadas,
  };
}

function lerJson(corpo: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(corpo) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** ISO (relógio da caixa, UTC) → "AAAA-MM-DDTHH:mm" no fuso deste PC. */
function localDeIso(iso: unknown): string {
  const d = typeof iso === 'string' ? new Date(iso) : new Date(NaN);
  if (Number.isNaN(d.getTime())) return agoraLocal();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function mensagemDeHttp(status: number, corpo: string): string {
  const erro = lerJson(corpo)?.erro;
  if (status === 401) return 'A chave do Iris não confere com a variável CHAVE_IRIS da caixa. Gere a chave aqui e cole a mesma no Worker (ou cole aqui a que está lá).';
  if (status === 404) return 'Esse endereço não tem a caixa do Iris. Confira o endereço e se o código do Worker foi colado e publicado.';
  return `A caixa respondeu com erro (HTTP ${status})${typeof erro === 'string' ? `: ${erro}` : ''}.`;
}

function registrarBusca(ok: boolean, mensagem: string, importados = 0): EstadoBusca {
  const anterior = ultimaBusca;
  ultimaBusca = { em: nowIso(), ok, mensagem, importados };
  // O módulo API e n8n acompanha a situação: avisa só quando muda, não a cada minuto.
  if (!anterior || anterior.ok !== ok || anterior.mensagem !== mensagem) {
    broadcast('contatos:mudou', { novos: 0, naoVistos: contarNaoVistos(loadFile()) });
  }
  return ultimaBusca;
}

interface LeadDaCaixa {
  id: string;
  recebidoEm?: string;
  dados: unknown;
}

async function buscarUmaVez(signal: AbortSignal | undefined, forcar: boolean): Promise<EstadoBusca> {
  const config = loadFile().leadsConfig;
  const url = config.nuvem.url;
  if (!url) return registrarBusca(false, 'Falta o endereço da caixa na nuvem.');
  const chave = secretStore.getSecret(SEGREDO_CHAVE_IRIS);
  if (!chave) return registrarBusca(false, 'Falta a chave do Iris: gere uma em API e n8n › Chaves e cole no Worker como CHAVE_IRIS.');
  const cabecalhos = { Authorization: `Bearer ${chave}` };

  let importados = 0;
  // A caixa devolve até 100 por vez; com "mais", busca de novo na hora (até 5 rodadas).
  for (let rodada = 0; rodada < 5; rodada += 1) {
    const desde = forcar || rodada > 0 ? 0 : desdeNuvem;
    const resposta = await request(`${url}/v1/leads${desde ? `?desde=${desde}` : ''}`, { headers: cabecalhos, signal, timeoutMs: 15_000 });
    if (isFalha(resposta)) {
      if (resposta.motivo === 'abortado') return ultimaBusca ?? { em: nowIso(), ok: false, mensagem: 'Busca interrompida.', importados };
      return registrarBusca(false, resposta.motivo === 'timeout' ? 'A caixa na nuvem demorou demais para responder.' : `Sem conexão com a caixa: ${resposta.mensagem}`, importados);
    }
    if (!resposta.ok) return registrarBusca(false, mensagemDeHttp(resposta.status, resposta.body), importados);
    const corpo = lerJson(resposta.body);
    if (!corpo || corpo.ok !== true || !Array.isArray(corpo.leads)) return registrarBusca(false, 'A resposta não parece da caixa do Iris — confira o endereço.', importados);

    const itens = (corpo.leads as unknown[])
      .map((x) => (x ?? {}) as Partial<LeadDaCaixa>)
      .filter((x): x is LeadDaCaixa => typeof x.id === 'string' && x.id.length > 0 && x.id.length < 120);
    const resultados = itens.length
      ? await receberLeads(
          itens.map((i) => ({ dados: i.dados, recebidoEm: localDeIso(i.recebidoEm), idExterno: i.id })),
          'nuvem',
        )
      : [];
    importados += resultados.filter((r) => r.tipo === 'criado' || r.tipo === 'retorno').length;

    let confirmou = true;
    if (itens.length) {
      // Confirma tudo o que foi lido — importado, repetido ou recusado — para a caixa esvaziar.
      const confirmacao = await request(`${url}/v1/leads/confirmar`, {
        method: 'POST',
        headers: { ...cabecalhos, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: itens.map((i) => i.id) }),
        signal,
        timeoutMs: 15_000,
      });
      confirmou = !isFalha(confirmacao) && confirmacao.ok;
    }
    // Sem confirmar, a próxima busca lista tudo de novo (os ids já importados não duplicam).
    desdeNuvem = confirmou && typeof corpo.agora === 'number' ? corpo.agora : 0;
    if (corpo.mais !== true) break;
  }
  return registrarBusca(true, importados ? `${importados} ${importados === 1 ? 'lead importado' : 'leads importados'}` : 'Nenhum lead novo', importados);
}

/** Uma busca por vez: o "Buscar agora" pega carona na que já está rodando. */
export function buscarNuvem(signal?: AbortSignal, forcar = false): Promise<EstadoBusca> {
  if (!buscaEmAndamento) {
    buscaEmAndamento = buscarUmaVez(signal, forcar).finally(() => {
      buscaEmAndamento = null;
    });
  }
  return buscaEmAndamento;
}

/** "Testar conexão": a caixa está no ar, com KV e as duas chaves certas? */
export async function testarNuvem(): Promise<ResultadoTeste> {
  const config = loadFile().leadsConfig;
  if (!config.nuvem.url) return { ok: false, mensagem: 'Cole o endereço da caixa primeiro.', detalhes: [] };
  const chave = secretStore.getSecret(SEGREDO_CHAVE_IRIS);
  const resposta = await request(`${config.nuvem.url}/v1/status?formulario=${encodeURIComponent(config.chaveFormulario)}`, {
    headers: chave ? { Authorization: `Bearer ${chave}` } : {},
    timeoutMs: 12_000,
  });
  if (isFalha(resposta)) {
    return { ok: false, mensagem: resposta.motivo === 'timeout' ? 'A caixa não respondeu a tempo.' : `Não deu para falar com a caixa: ${resposta.mensagem}`, detalhes: [] };
  }
  const corpo = lerJson(resposta.body);
  if (!resposta.ok || !corpo || corpo.servico !== 'iris-leads') {
    return { ok: false, mensagem: resposta.ok ? 'Esse endereço respondeu, mas não é a caixa do Iris.' : mensagemDeHttp(resposta.status, resposta.body), detalhes: [], status: resposta.status, corpo: resposta.body.slice(0, 2000) };
  }
  const detalhes: string[] = [];
  const problemas: string[] = [];
  const conferir = (ok: boolean, bom: string, ruim: string): void => {
    (ok ? detalhes : problemas).push(ok ? `✓ ${bom}` : `✗ ${ruim}`);
  };
  conferir(corpo.kv === true, 'KV LEADS ligado', 'Falta ligar o KV ao Worker com o nome LEADS');
  conferir(corpo.chaveFormulario === true, 'Variável CHAVE_FORMULARIO preenchida', 'Falta a variável CHAVE_FORMULARIO');
  if (corpo.chaveFormulario === true) conferir(corpo.formularioConfere === true, 'CHAVE_FORMULARIO igual à chave do formulário daqui', 'CHAVE_FORMULARIO diferente da chave do formulário daqui — copie de novo');
  conferir(corpo.chaveIris === true, 'Variável CHAVE_IRIS preenchida', 'Falta a variável CHAVE_IRIS');
  if (corpo.chaveIris === true) conferir(corpo.autorizado === true, 'CHAVE_IRIS igual à chave do Iris daqui', chave ? 'CHAVE_IRIS diferente da chave do Iris daqui' : 'Gere a chave do Iris aqui e cole no Worker');
  return {
    ok: problemas.length === 0,
    mensagem: problemas.length ? 'A caixa está no ar, mas falta ajustar:' : 'Tudo certo: a caixa está no ar e as chaves conferem.',
    detalhes: [...problemas, ...detalhes],
    status: resposta.status,
  };
}

/** "Testar agora": um lead de exemplo no servidor local, pelo mesmo caminho de um formulário. */
export async function enviarTeste(servidor: EstadoServidorLocal): Promise<ResultadoTeste> {
  if (!servidor.ouvindo) return { ok: false, mensagem: servidor.erro ?? 'Ligue o servidor local primeiro.', detalhes: [] };
  const chave = loadFile().leadsConfig.chaveFormulario;
  const corpo = {
    nome: 'Lead de teste',
    email: 'teste@exemplo.com.br',
    telefone: '(11) 90000-0000',
    empresa: 'Empresa de Teste',
    mensagem: 'Enviado pelo botão "Testar agora" de API e n8n › Servidor local. Pode excluir este contato quando quiser.',
    formulario: 'Teste do Iris',
    utm_source: 'iris',
    utm_medium: 'teste',
  };
  const resposta = await request(`http://127.0.0.1:${new URL(servidor.endereco).port}/v1/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CABECALHO_CHAVE]: chave },
    body: JSON.stringify(corpo),
    timeoutMs: 8000,
  });
  if (isFalha(resposta)) return { ok: false, mensagem: `O servidor local não respondeu: ${resposta.mensagem}`, detalhes: [] };
  return {
    ok: resposta.status === 201,
    mensagem: resposta.status === 201 ? 'Recebido: o lead de teste está em Leads (repetir o teste soma uma volta no histórico, não cria outro).' : 'O servidor respondeu com erro.',
    detalhes: [],
    status: resposta.status,
    corpo: resposta.body.slice(0, 2000),
  };
}

// ---------- Relatórios de leads (só a configuração) ----------

/**
 * Grava (ou atualiza) a configuração de um relatório. `exportou` marca a data
 * do PDF; salvar sem exportar mantém a do último PDF.
 */
export async function salvarRelatorioLeads(raw: unknown, exportou: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const agora = nowIso();
  const i = file.relatoriosLeads.findIndex((r) => r.id === (raw as Partial<RelatorioLeads> | null)?.id);
  const anterior = i >= 0 ? file.relatoriosLeads[i] : undefined;
  const exportadoEm = exportou === true ? agora : anterior?.exportadoEm;
  const relatorio = migrateRelatorioLeads({
    ...((raw ?? {}) as object),
    criadoEm: anterior?.criadoEm ?? agora,
    atualizadoEm: agora,
    exportadoEm,
  });
  if (!relatorio) throw new Error('Relatório inválido.');
  if (i >= 0) file.relatoriosLeads[i] = relatorio;
  else file.relatoriosLeads.push(relatorio);
  file.relatoriosLeads = file.relatoriosLeads.slice(-100);
  await saveFile(file);
  return file;
}

export async function excluirRelatorioLeads(id: unknown): Promise<ContatosFile> {
  const file = loadFile();
  const antes = file.relatoriosLeads.length;
  file.relatoriosLeads = file.relatoriosLeads.filter((r) => r.id !== id);
  if (file.relatoriosLeads.length === antes) throw new Error('Esse relatório não existe mais.');
  await saveFile(file);
  return file;
}

/** A pontuação é refeita em toda leitura (migrateEntrada); gravar deixa o arquivo alinhado no disco. */
export async function repontuar(): Promise<ContatosFile> {
  const file = loadFile();
  await saveFile(file);
  return file;
}

// ---------- n8n ----------

/** O fluxo pronto com o endereço do cenário e a chave do formulário de agora. */
export function fluxoParaN8n(cenario: unknown): FluxoN8n {
  const c: CenarioN8n = cenario === 'docker' || cenario === 'servidor' ? cenario : 'local';
  const config = loadFile().leadsConfig;
  const endereco = enderecoParaN8n(c, { porta: config.servidor.porta, urlNuvem: config.nuvem.url });
  if (!endereco) throw new Error('Para um n8n num servidor, configure antes a caixa na nuvem: de lá ele não alcança o seu computador.');
  return fluxoN8n({ endereco, chave: config.chaveFormulario, webhookId: randomUUID() });
}

export async function criarFluxoN8n(cenario: unknown): Promise<n8nService.WorkflowCriado> {
  return n8nService.criarWorkflow(fluxoParaN8n(cenario));
}

/** Manda o lead de exemplo ao webhook do fluxo no n8n: se chegar ao Iris, o caminho inteiro funciona. */
export async function testarFluxoN8n(): Promise<ResultadoTeste> {
  const r = await n8nService.chamarWebhook(CAMINHO_WEBHOOK, LEAD_TESTE_N8N);
  return { ok: r.ok, mensagem: r.mensagem, detalhes: [], ...(r.status ? { status: r.status, corpo: r.corpo } : {}) };
}
