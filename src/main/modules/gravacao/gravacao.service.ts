import { randomUUID, randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as roteirosService from '../roteiros/roteiros.service';
import * as ajustesService from '../ajustes/ajustes.service';
import { ppmDe } from '../../../shared/types/roteiros.conversao';
import { agoraCerto } from './gravacao.relogio';
import {
  CHECKLIST_PADRAO,
  CONVITE_RE,
  MARCA_CONVITE,
  isTipoMarca,
  type CenaGravacao,
  type ConjuntaGravacao,
  type ConviteInput,
  type ConviteLido,
  type CriarGravacaoInput,
  type DadosConvite,
  type GravacaoFile,
  type IdPessoa,
  type ItemChecklistGravacao,
  type MarcaTake,
  type PessoaGravacao,
  type RoteiroGravacao,
  type SessaoGravacao,
  type TakeGravacao,
} from '../../../shared/types/gravacao.types';

const FILE_NAME = 'gravacao.json';
// v2: gravação simples (roteiro e parceiro opcionais). A v1 tinha modos, itens e checklist por sessão.
const SCHEMA_VERSION = 2;

const MAX_TEXTO = 20_000;
const MAX_CURTO = 200;
const MAX_TAKES = 2_000;
const MAX_CENAS = 200;
/** Convite descomprimido nunca passa disto: texto colado de fora não pode encher a memória. */
const MAX_CONVITE_BYTES = 400_000;

function nowIso(): string {
  return new Date().toISOString();
}

function texto(v: unknown, max = MAX_TEXTO): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function curto(v: unknown, max = MAX_CURTO): string {
  return texto(v, max).replace(/\s+/g, ' ').trim();
}

function id(v: unknown): string {
  return typeof v === 'string' && v ? v.slice(0, 80) : randomUUID();
}

function iso(v: unknown, padrao: string): string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : padrao;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function epoch(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 1_500_000_000_000 ? Math.round(v) : undefined;
}

function idPessoa(v: unknown): IdPessoa | undefined {
  return v === 'A' || v === 'B' ? v : undefined;
}

// ---------- Migração ----------

function migrarPessoas(raw: unknown): PessoaGravacao[] {
  const brutas = lista(raw) as Array<Partial<PessoaGravacao>>;
  // Sempre A e B, nessa ordem: o palco conta com isso.
  return (['A', 'B'] as IdPessoa[]).map((pid) => ({ id: pid, nome: curto(brutas.find((p) => p?.id === pid)?.nome, 60) || `Pessoa ${pid}` }));
}

function migrarCenas(raw: unknown): CenaGravacao[] {
  return lista(raw)
    .slice(0, MAX_CENAS)
    .map((r) => {
      const c = (r ?? {}) as Partial<CenaGravacao>;
      const t = texto(c.texto);
      const titulo = curto(c.titulo) || 'Cena';
      return t.trim() || c.titulo ? { id: id(c.id), titulo, texto: t } : null;
    })
    .filter((c): c is CenaGravacao => c !== null);
}

function migrarRoteiro(raw: unknown): RoteiroGravacao | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<RoteiroGravacao>;
  const cenas = migrarCenas(c.cenas);
  if (!cenas.length) return undefined;
  const ppm = typeof c.ppm === 'number' && c.ppm >= 60 && c.ppm <= 300 ? Math.round(c.ppm) : undefined;
  return {
    ...(typeof c.roteiroId === 'string' && c.roteiroId ? { roteiroId: c.roteiroId } : {}),
    titulo: curto(c.titulo) || 'Roteiro',
    cenas,
    ...(ppm ? { ppm } : {}),
  };
}

function migrarConjunta(raw: unknown): ConjuntaGravacao | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<ConjuntaGravacao>;
  if (typeof c.chave !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(c.chave)) return undefined;
  const conjunta: ConjuntaGravacao = {
    chave: c.chave,
    papel: c.papel === 'convidado' ? 'convidado' : 'anfitriao',
    parceiro: curto(c.parceiro, 60) || 'Convidado',
    euSou: idPessoa(c.euSou) ?? (c.papel === 'convidado' ? 'B' : 'A'),
  };
  const proximo = epoch(c.proximoInicio);
  if (proximo) conjunta.proximoInicio = proximo;
  return conjunta;
}

function migrarMarca(raw: unknown): MarcaTake | null {
  const c = (raw ?? {}) as Partial<MarcaTake>;
  if (!isTipoMarca(c.tipo)) return null;
  const tMs = typeof c.tMs === 'number' && Number.isFinite(c.tMs) && c.tMs >= 0 ? Math.round(c.tMs) : 0;
  return { id: id(c.id), tipo: c.tipo, tMs, texto: curto(c.texto, 300) };
}

function migrarTake(raw: unknown): TakeGravacao | null {
  const c = (raw ?? {}) as Partial<TakeGravacao>;
  if (typeof c.inicioEm !== 'string' || Number.isNaN(Date.parse(c.inicioEm))) return null;
  const take: TakeGravacao = {
    id: id(c.id),
    numero: typeof c.numero === 'number' && c.numero >= 1 ? Math.floor(c.numero) : 1,
    inicioEm: c.inicioEm,
    marcas: lista(c.marcas)
      .map(migrarMarca)
      .filter((m): m is MarcaTake => m !== null)
      .sort((a, b) => a.tMs - b.tMs),
    melhor: c.melhor === true,
  };
  if (typeof c.duracaoMs === 'number' && c.duracaoMs > 0) take.duracaoMs = Math.round(c.duracaoMs);
  if (typeof c.cenaId === 'string' && c.cenaId) take.cenaId = c.cenaId;
  return take;
}

/** v1 (modos, itens): os itens com texto viram as cenas do roteiro; os takes ficam. */
function roteiroDaV1(c: Record<string, unknown>): RoteiroGravacao | undefined {
  const itens = lista(c.itens) as Array<{ id?: unknown; titulo?: unknown; texto?: unknown; status?: unknown }>;
  const cenas = itens.filter((i) => i.status !== 'descartado').map((i) => ({ id: i.id, titulo: i.titulo, texto: i.texto }));
  return migrarRoteiro({ titulo: c.titulo, cenas });
}

export function migrarSessao(raw: unknown): SessaoGravacao | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<SessaoGravacao> & Record<string, unknown>;
  const agora = nowIso();
  const takes = lista(c.takes)
    .map((t) => migrarTake(t))
    .filter((t): t is TakeGravacao => t !== null)
    .slice(-MAX_TAKES);
  // Um "melhor" só: o último marcado vale.
  let achou = false;
  for (let i = takes.length - 1; i >= 0; i -= 1) {
    if (takes[i]!.melhor && achou) takes[i]!.melhor = false;
    if (takes[i]!.melhor) achou = true;
  }
  const roteiro = 'roteiro' in c ? migrarRoteiro(c.roteiro) : roteiroDaV1(c);
  const sessao: SessaoGravacao = {
    id: id(c.id),
    titulo: curto(c.titulo) || 'Gravação',
    pessoas: migrarPessoas(c.pessoas),
    takes,
    notas: texto(c.notas),
    createdAt: iso(c.createdAt, agora),
    updatedAt: iso(c.updatedAt, agora),
  };
  if (roteiro) sessao.roteiro = roteiro;
  const conjunta = migrarConjunta(c.conjunta);
  if (conjunta) sessao.conjunta = conjunta;
  return sessao;
}

function migrarChecklist(raw: unknown): ItemChecklistGravacao[] {
  if (!Array.isArray(raw)) return CHECKLIST_PADRAO.map((t) => ({ id: randomUUID(), texto: t }));
  return raw
    .map((r) => {
      const c = (r ?? {}) as Partial<ItemChecklistGravacao>;
      const t = curto(c.texto);
      return t ? { id: id(c.id), texto: t } : null;
    })
    .filter((x): x is ItemChecklistGravacao => x !== null)
    .slice(0, 40);
}

function migrate(raw: unknown): GravacaoFile {
  const c = (raw ?? {}) as Partial<GravacaoFile>;
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: iso(c.updatedAt, nowIso()),
    sessoes: lista(c.sessoes)
      .map(migrarSessao)
      .filter((s): s is SessaoGravacao => s !== null),
    checklist: migrarChecklist(c.checklist),
  };
}

function loadFile(): GravacaoFile {
  return readStore(FILE_NAME, () => migrate({}), migrate);
}

async function saveFile(file: GravacaoFile): Promise<GravacaoFile> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
  return file;
}

function achar(file: GravacaoFile, sessaoId: string): SessaoGravacao {
  const s = file.sessoes.find((x) => x.id === sessaoId);
  if (!s) throw new Error('Gravação não encontrada.');
  return s;
}

async function meuNome(): Promise<string> {
  return (await ajustesService.getAjustes()).apelido.trim() || 'Você';
}

function tituloPadrao(): string {
  const d = new Date();
  const dd = (n: number): string => String(n).padStart(2, '0');
  return `Gravação de ${dd(d.getDate())}/${dd(d.getMonth() + 1)} às ${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

// ---------- API ----------

export async function getFile(): Promise<GravacaoFile> {
  return loadFile();
}

export async function getFullFile(): Promise<GravacaoFile> {
  return loadFile();
}

export async function replaceFile(file: unknown): Promise<GravacaoFile> {
  return saveFile(migrate(file));
}

/**
 * A gravação pronta para o palco, **sem gravar nada no arquivo**. É o caminho de
 * "Gravar sozinho": o usuário pediu para o Iris não guardar o que foi gravado.
 */
export async function montarGravacao(input: CriarGravacaoInput): Promise<SessaoGravacao> {
  let roteiro: RoteiroGravacao | undefined;
  if (input.roteiroId) {
    const r = (await roteirosService.getFile()).roteiros.find((x) => x.id === input.roteiroId);
    if (!r) throw new Error('Roteiro não encontrado.');
    roteiro = migrarRoteiro({ roteiroId: r.id, titulo: r.titulo, ppm: ppmDe(r), cenas: r.cenas.map((c) => ({ id: c.id, titulo: c.titulo, texto: c.fala })) });
  }
  const eu = await meuNome();
  const parceiro = curto(input.parceiro, 60);
  const euSou: IdPessoa = input.euSou ?? 'A';
  const nomes: Record<IdPessoa, string> = euSou === 'A' ? { A: eu, B: parceiro || 'Pessoa B' } : { A: parceiro || 'Pessoa A', B: eu };

  const agora = nowIso();
  const sessao = migrarSessao({
    id: randomUUID(),
    titulo: curto(input.titulo) || roteiro?.titulo || tituloPadrao(),
    roteiro,
    conjunta: parceiro ? { chave: randomBytes(12).toString('base64url'), papel: 'anfitriao', parceiro, euSou } : undefined,
    pessoas: [
      { id: 'A', nome: nomes.A },
      { id: 'B', nome: nomes.B },
    ],
    takes: [],
    notas: '',
    createdAt: agora,
    updatedAt: agora,
  });
  if (!sessao) throw new Error('Não foi possível criar a gravação.');
  return sessao;
}

/**
 * Só a gravação com outra pessoa é guardada: o convite precisa da chave da dupla
 * e do próximo horário. Fica a combinação, nunca o que foi gravado.
 */
export async function criarGravacao(input: CriarGravacaoInput): Promise<{ file: GravacaoFile; id: string }> {
  // Monta antes (lê roteiro e apelido): nenhum await entre ler e gravar o arquivo.
  const sessao = await montarGravacao(input);
  const file = loadFile();
  file.sessoes.unshift(sessao);
  return { file: await saveFile(file), id: sessao.id };
}

/** Apaga as gravações guardadas por versões anteriores (takes e marcas). Ficam as combinadas para um horário que ainda vem. */
export async function limparSessoes(): Promise<GravacaoFile> {
  const file = loadFile();
  const agora = Date.now();
  file.sessoes = file.sessoes.filter((s) => (s.conjunta?.proximoInicio ?? 0) > agora);
  return saveFile(file);
}

/** A tela manda a gravação inteira (takes e marcas do palco); tudo passa pela mesma migração da leitura. */
export async function salvarSessao(raw: unknown): Promise<GravacaoFile> {
  const sessao = migrarSessao(raw);
  if (!sessao) throw new Error('Gravação inválida.');
  // O palco não registra mais takes; por garantia, nada de take entra por aqui.
  sessao.takes = [];
  const file = loadFile();
  const i = file.sessoes.findIndex((s) => s.id === sessao.id);
  if (i < 0) throw new Error('Gravação não encontrada.');
  sessao.createdAt = file.sessoes[i]!.createdAt;
  sessao.updatedAt = nowIso();
  file.sessoes[i] = sessao;
  return saveFile(file);
}

export async function excluirSessao(sessaoId: string): Promise<GravacaoFile> {
  const file = loadFile();
  file.sessoes = file.sessoes.filter((s) => s.id !== sessaoId);
  return saveFile(file);
}

export async function salvarChecklist(itens: unknown): Promise<GravacaoFile> {
  const file = loadFile();
  file.checklist = (Array.isArray(itens) ? itens : [])
    .map((t) => curto(t))
    .filter(Boolean)
    .slice(0, 40)
    .map((t) => ({ id: randomUUID(), texto: t }));
  return saveFile(file);
}

// ---------- Convite (Iris com Iris) ----------

/**
 * O convite é texto para mandar por qualquer lugar (WhatsApp, e-mail): uma
 * explicação para gente e, no fim, o código. Comprimido, para um roteiro
 * inteiro caber numa mensagem. Não há servidor no meio: o horário combinado é
 * o que junta os dois Iris.
 */
export async function criarConvite(input: ConviteInput): Promise<{ file: GravacaoFile; texto: string }> {
  const em = epoch(input.inicioEm);
  if (!em) throw new Error('Escolha quando começar.');
  if (em < agoraCerto() + 10_000) throw new Error('Deixe pelo menos 10 segundos para a outra pessoa entrar.');
  const de = await meuNome();
  const file = loadFile();
  const sessao = achar(file, input.sessaoId);
  if (!sessao.conjunta || sessao.conjunta.papel !== 'anfitriao') throw new Error('Esta gravação não é a dois.');

  const dados: DadosConvite = {
    v: 1,
    chave: sessao.conjunta.chave,
    titulo: sessao.titulo,
    de,
    para: sessao.conjunta.parceiro,
    em,
    voce: sessao.conjunta.euSou === 'A' ? 'B' : 'A',
    pessoas: sessao.pessoas,
    ...(sessao.roteiro ? { roteiro: { titulo: sessao.roteiro.titulo, cenas: sessao.roteiro.cenas, ...(sessao.roteiro.ppm ? { ppm: sessao.roteiro.ppm } : {}) } } : {}),
  };
  const codigo = zlib.deflateRawSync(Buffer.from(JSON.stringify(dados), 'utf-8'), { level: 9 }).toString('base64url');
  sessao.conjunta.proximoInicio = em;
  sessao.updatedAt = nowIso();
  await saveFile(file);

  const d = new Date(em);
  const dd = (n: number): string => String(n).padStart(2, '0');
  const hora = `${dd(d.getHours())}:${dd(d.getMinutes())}:${dd(d.getSeconds())}`;
  const texto = [
    `${de} te chamou para gravar no Iris: "${sessao.titulo}"`,
    `Começa às ${hora} (${fusoDe(d)}).`,
    'Copie esta mensagem inteira e abra o Iris em Gravação › Gravar: o convite aparece sozinho.',
    '',
    `${MARCA_CONVITE}${codigo}`,
  ].join('\n');
  return { file, texto };
}

/** "horário de Brasília" ou "GMT+1": o Iris de quem recebe converte sozinho; o texto é para a pessoa. */
function fusoDe(d: Date): string {
  const horas = -d.getTimezoneOffset() / 60;
  if (horas === -3) return 'horário de Brasília';
  return `GMT${horas >= 0 ? '+' : ''}${Number.isInteger(horas) ? horas : horas.toFixed(1)}`;
}

function decodificar(textoColado: string): DadosConvite {
  const achado = CONVITE_RE.exec(textoColado);
  if (!achado) throw new Error('Não achei um convite do Iris nesse texto. Copie a mensagem inteira, com a linha que começa por IRIS-GRAVAR.');
  let json: string;
  try {
    json = zlib.inflateRawSync(Buffer.from(achado[1]!, 'base64url'), { maxOutputLength: MAX_CONVITE_BYTES }).toString('utf-8');
  } catch {
    throw new Error('O convite está incompleto. Copie a mensagem inteira de novo (alguns apps cortam mensagens longas).');
  }
  let bruto: Partial<DadosConvite>;
  try {
    bruto = JSON.parse(json) as Partial<DadosConvite>;
  } catch {
    throw new Error('O convite está estragado.');
  }
  const em = epoch(bruto.em);
  const chave = typeof bruto.chave === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(bruto.chave) ? bruto.chave : null;
  if (bruto.v !== 1 || !em || !chave) throw new Error('Este convite é de uma versão do Iris que este não entende. Atualize os dois.');
  const roteiro = bruto.roteiro ? migrarRoteiro(bruto.roteiro) : undefined;
  return {
    v: 1,
    chave,
    titulo: curto(bruto.titulo) || 'Gravação',
    de: curto(bruto.de, 60) || 'Alguém',
    para: curto(bruto.para, 60),
    em,
    voce: idPessoa(bruto.voce) ?? 'B',
    pessoas: migrarPessoas(bruto.pessoas),
    ...(roteiro ? { roteiro: { titulo: roteiro.titulo, cenas: roteiro.cenas, ...(roteiro.ppm ? { ppm: roteiro.ppm } : {}) } } : {}),
  };
}

export async function lerConvite(textoColado: unknown): Promise<ConviteLido> {
  const dados = decodificar(typeof textoColado === 'string' ? textoColado : '');
  const existente = loadFile().sessoes.find((s) => s.conjunta?.chave === dados.chave);
  if (existente?.conjunta?.papel === 'anfitriao') throw new Error('Este convite é seu: mande para a outra pessoa abrir no Iris dela.');
  return { dados, ...(existente ? { sessaoExistente: existente.id } : {}) };
}

/**
 * Para o aviso "você copiou um convite": só devolve convite de outra pessoa,
 * ainda por começar e em que este Iris ainda não entrou.
 */
export async function conviteNoTexto(textoColado: string): Promise<ConviteLido | null> {
  if (!CONVITE_RE.test(textoColado)) return null;
  try {
    const lido = await lerConvite(textoColado);
    // Já começou: não dá mais para entrar junto (a tela de colar explica, o aviso não insiste).
    if (lido.dados.em <= agoraCerto()) return null;
    const existente = lido.sessaoExistente ? loadFile().sessoes.find((s) => s.id === lido.sessaoExistente) : undefined;
    const inicio = new Date(lido.dados.em).toISOString();
    if (existente?.conjunta?.proximoInicio === lido.dados.em || existente?.takes.some((t) => t.inicioEm === inicio)) return null;
    return { ...lido, codigo: CONVITE_RE.exec(textoColado)![0] };
  } catch {
    return null;
  }
}

/** Entra na gravação do convite: cria a gravação (ou, num take novo da mesma, só marca o horário). */
export async function entrarComConvite(textoColado: unknown): Promise<{ file: GravacaoFile; id: string }> {
  const { dados } = await lerConvite(textoColado);
  const file = loadFile();
  const existente = file.sessoes.find((s) => s.conjunta?.chave === dados.chave);
  if (existente?.conjunta) {
    existente.conjunta.proximoInicio = dados.em;
    existente.titulo = dados.titulo;
    if (dados.roteiro) existente.roteiro = migrarRoteiro(dados.roteiro);
    existente.updatedAt = nowIso();
    return { file: await saveFile(file), id: existente.id };
  }
  const agora = nowIso();
  const sessao = migrarSessao({
    id: randomUUID(),
    titulo: dados.titulo,
    roteiro: dados.roteiro,
    conjunta: { chave: dados.chave, papel: 'convidado', parceiro: dados.de, euSou: dados.voce, proximoInicio: dados.em },
    pessoas: dados.pessoas,
    takes: [],
    notas: '',
    createdAt: agora,
    updatedAt: agora,
  });
  if (!sessao) throw new Error('Não foi possível entrar na gravação.');
  file.sessoes.unshift(sessao);
  return { file: await saveFile(file), id: sessao.id };
}
