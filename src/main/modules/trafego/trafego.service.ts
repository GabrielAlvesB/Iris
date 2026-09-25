import { randomUUID } from 'node:crypto';
import type * as XlsxTipos from 'xlsx';
import { readStore, writeStore } from '../../storage/jsonStore';
import { DATA_REGEX, garantirSeq, listaDeStrings, naoNulo, nowIso, texto } from '../postagens/postagens.comum';
import {
  isObjetivoTrafego,
  isPlataformaTrafego,
  isStatusCampanha,
  isTipoSite,
  type AtualizarCampanhaInput,
  type Campanha,
  type ContaTrafego,
  type CriarCampanhaInput,
  type ImportarRegistrosResult,
  type LinkCampanha,
  type MoverCampanhaInput,
  type RegistroTrafego,
  type RemoverRegistroInput,
  type SalvarContaInput,
  type SalvarRegistroInput,
  type SalvarSiteInput,
  type SiteTrafego,
  type TrafegoFile,
} from '../../../shared/types/trafego.types';

/**
 * xlsx carrega sob demanda (só ao importar planilha): são ~200 ms de require
 * que não precisam acontecer na abertura do app.
 */
let xlsx: typeof XlsxTipos | null = null;
function XLSX(): typeof XlsxTipos {
  xlsx ??= require('xlsx') as typeof XlsxTipos;
  return xlsx;
}

const FILE_NAME = 'trafego.json';
const SCHEMA_VERSION = 1;
const MAX_REGISTROS = 3000;
const MAX_LINKS = 30;

function createDefaultFile(): TrafegoFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), seqAtual: 0, contas: [], sites: [], campanhas: [] };
}

// ---------- Migração defensiva ----------
// Também valida o que a tela manda salvar: toda entidade passa por aqui.

function id(valor: unknown): string {
  return typeof valor === 'string' && valor ? valor : randomUUID();
}

function data(valor: unknown): string | undefined {
  return typeof valor === 'string' && DATA_REGEX.test(valor) ? valor : undefined;
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

function valorOpcional(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

function url(valor: unknown): string {
  const t = texto(valor).trim();
  if (!t) return '';
  // Sem protocolo, assume https: é o que alguém que cola "meusite.com" quer dizer.
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function datas(c: { createdAt?: unknown; updatedAt?: unknown }): { createdAt: string; updatedAt: string } {
  const createdAt = texto(c.createdAt) || nowIso();
  return { createdAt, updatedAt: texto(c.updatedAt) || createdAt };
}

function migrateConta(raw: unknown): ContaTrafego | null {
  const c = (raw ?? {}) as Partial<ContaTrafego>;
  const nome = texto(c.nome).trim();
  if (!nome) return null;
  return {
    id: id(c.id),
    nome,
    tagIds: [...new Set(listaDeStrings(c.tagIds))],
    orcamentoMensal: valorOpcional(c.orcamentoMensal),
    observacoes: texto(c.observacoes),
    ...datas(c),
  };
}

function migrateSite(raw: unknown): SiteTrafego | null {
  const c = (raw ?? {}) as Partial<SiteTrafego>;
  const nome = texto(c.nome).trim();
  if (!nome) return null;
  return {
    id: id(c.id),
    nome,
    url: url(c.url),
    tipo: isTipoSite(c.tipo) ? c.tipo : 'site',
    contaId: texto(c.contaId) || undefined,
    objetivo: texto(c.objetivo),
    pixel: c.pixel === true,
    analytics: c.analytics === true,
    observacoes: texto(c.observacoes),
    ...datas(c),
  };
}

function migrateLink(raw: unknown): LinkCampanha | null {
  const c = (raw ?? {}) as Partial<LinkCampanha>;
  const endereco = url(c.url);
  if (!endereco) return null;
  return { id: id(c.id), rotulo: texto(c.rotulo).trim(), url: endereco };
}

function migrateRegistro(raw: unknown): RegistroTrafego | null {
  const c = (raw ?? {}) as Partial<RegistroTrafego>;
  const dia = data(c.data);
  if (!dia) return null;
  return {
    id: id(c.id),
    data: dia,
    investimento: numero(c.investimento),
    impressoes: Math.round(numero(c.impressoes)),
    cliques: Math.round(numero(c.cliques)),
    conversoes: numero(c.conversoes),
    receita: numero(c.receita),
  };
}

/** Um registro por dia: se vierem dois do mesmo dia, fica o último. */
function registrosPorDia(lista: RegistroTrafego[]): RegistroTrafego[] {
  const porDia = new Map<string, RegistroTrafego>();
  lista.forEach((r) => porDia.set(r.data, r));
  return [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)).slice(-MAX_REGISTROS);
}

function migrateCampanha(raw: unknown): Campanha | null {
  const c = (raw ?? {}) as Partial<Campanha>;
  const nome = texto(c.nome).trim();
  if (!nome) return null;
  const inicio = data(c.inicio);
  const fim = data(c.fim);
  return {
    id: id(c.id),
    seq: typeof c.seq === 'number' && c.seq > 0 ? c.seq : 0,
    nome,
    contaId: texto(c.contaId) || undefined,
    siteId: texto(c.siteId) || undefined,
    plataforma: isPlataformaTrafego(c.plataforma) ? c.plataforma : 'meta',
    objetivo: isObjetivoTrafego(c.objetivo) ? c.objetivo : 'trafego',
    status: isStatusCampanha(c.status) ? c.status : 'planejamento',
    ordem: typeof c.ordem === 'number' && Number.isFinite(c.ordem) ? c.ordem : 0,
    inicio: inicio && fim && inicio > fim ? fim : inicio,
    fim: inicio && fim && inicio > fim ? inicio : fim,
    orcamentoDiario: valorOpcional(c.orcamentoDiario),
    orcamentoTotal: valorOpcional(c.orcamentoTotal),
    publico: texto(c.publico),
    criativos: texto(c.criativos),
    anotacoes: texto(c.anotacoes),
    links: (Array.isArray(c.links) ? c.links.map(migrateLink).filter(naoNulo) : []).slice(0, MAX_LINKS),
    registros: registrosPorDia(Array.isArray(c.registros) ? c.registros.map(migrateRegistro).filter(naoNulo) : []),
    ...datas(c),
  };
}

function migrateFile(raw: unknown): TrafegoFile {
  const c = (raw ?? {}) as Partial<TrafegoFile>;
  const contas = Array.isArray(c.contas) ? c.contas.map(migrateConta).filter(naoNulo) : [];
  const sites = Array.isArray(c.sites) ? c.sites.map(migrateSite).filter(naoNulo) : [];
  const campanhas = Array.isArray(c.campanhas) ? c.campanhas.map(migrateCampanha).filter(naoNulo) : [];
  // Referências para conta/site apagados viram "sem conta"/"sem site" em vez de apontar para o nada.
  const contaIds = new Set(contas.map((x) => x.id));
  const siteIds = new Set(sites.map((x) => x.id));
  sites.forEach((s) => {
    if (s.contaId && !contaIds.has(s.contaId)) s.contaId = undefined;
  });
  campanhas.forEach((cp) => {
    if (cp.contaId && !contaIds.has(cp.contaId)) cp.contaId = undefined;
    if (cp.siteId && !siteIds.has(cp.siteId)) cp.siteId = undefined;
  });
  const seqAtual = garantirSeq(campanhas, typeof c.seqAtual === 'number' ? c.seqAtual : 0);
  return { schemaVersion: SCHEMA_VERSION, updatedAt: texto(c.updatedAt) || nowIso(), seqAtual, contas, sites, campanhas };
}

function loadFile(): TrafegoFile {
  return readStore(FILE_NAME, createDefaultFile, migrateFile);
}

async function saveFile(file: TrafegoFile): Promise<TrafegoFile> {
  // Passa pela migração de novo: é ela que limpa referências quebradas depois de uma exclusão.
  const normalizado = migrateFile(file);
  normalizado.updatedAt = nowIso();
  await writeStore(FILE_NAME, normalizado);
  return normalizado;
}

function encontrarCampanha(file: TrafegoFile, campanhaId: string): Campanha {
  const campanha = file.campanhas.find((c) => c.id === campanhaId);
  if (!campanha) throw new Error('Campanha não encontrada — ela pode ter sido excluída.');
  return campanha;
}

// ---------- API do service ----------

export async function getFile(): Promise<TrafegoFile> {
  return loadFile();
}

export async function getFullFile(): Promise<TrafegoFile> {
  return loadFile();
}

export async function replaceFile(file: TrafegoFile): Promise<TrafegoFile> {
  return saveFile(migrateFile(file));
}

export async function salvarConta(input: SalvarContaInput): Promise<TrafegoFile> {
  const file = loadFile();
  const atual = input.id ? file.contas.find((c) => c.id === input.id) : undefined;
  const conta = migrateConta({ ...atual, ...input, id: atual?.id, createdAt: atual?.createdAt, updatedAt: nowIso() });
  if (!conta) throw new Error('Dê um nome à conta.');
  if (atual) file.contas[file.contas.indexOf(atual)] = conta;
  else file.contas.push(conta);
  return saveFile(file);
}

export async function excluirConta(contaId: string): Promise<TrafegoFile> {
  const file = loadFile();
  file.contas = file.contas.filter((c) => c.id !== contaId);
  return saveFile(file);
}

export async function salvarSite(input: SalvarSiteInput): Promise<TrafegoFile> {
  const file = loadFile();
  const atual = input.id ? file.sites.find((s) => s.id === input.id) : undefined;
  const site = migrateSite({ ...atual, ...input, id: atual?.id, createdAt: atual?.createdAt, updatedAt: nowIso() });
  if (!site) throw new Error('Dê um nome ao site.');
  if (atual) file.sites[file.sites.indexOf(atual)] = site;
  else file.sites.push(site);
  return saveFile(file);
}

export async function excluirSite(siteId: string): Promise<TrafegoFile> {
  const file = loadFile();
  file.sites = file.sites.filter((s) => s.id !== siteId);
  return saveFile(file);
}

export async function criarCampanha(input: CriarCampanhaInput): Promise<TrafegoFile> {
  const nome = texto(input?.nome).trim();
  if (!nome) throw new Error('Dê um nome à campanha.');
  const file = loadFile();
  file.seqAtual += 1;
  const timestamp = nowIso();
  const nova = migrateCampanha({
    id: randomUUID(),
    seq: file.seqAtual,
    nome,
    contaId: input.contaId,
    plataforma: input.plataforma,
    objetivo: input.objetivo,
    status: 'planejamento',
    ordem: -1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!nova) throw new Error('Não foi possível criar a campanha.');
  file.campanhas.push(nova);
  reordenar(file, 'planejamento');
  return saveFile(file);
}

export async function atualizarCampanha(input: AtualizarCampanhaInput): Promise<TrafegoFile> {
  const file = loadFile();
  const atual = encontrarCampanha(file, input.campanhaId);
  const { campanhaId: _id, ...campos } = input;
  const validada = migrateCampanha({
    ...atual,
    ...campos,
    // status, ordem e registros têm operações próprias.
    status: atual.status,
    ordem: atual.ordem,
    registros: atual.registros,
    id: atual.id,
    seq: atual.seq,
    createdAt: atual.createdAt,
    updatedAt: nowIso(),
  });
  if (!validada) throw new Error('A campanha precisa de um nome.');
  file.campanhas[file.campanhas.indexOf(atual)] = validada;
  return saveFile(file);
}

/** Renumera a ordem de uma coluna de 0 a n, na ordem atual. */
function reordenar(file: TrafegoFile, status: Campanha['status']): void {
  file.campanhas
    .filter((c) => c.status === status)
    .sort((a, b) => a.ordem - b.ordem)
    .forEach((c, i) => (c.ordem = i));
}

export async function moverCampanha(input: MoverCampanhaInput): Promise<TrafegoFile> {
  if (!isStatusCampanha(input.status)) throw new Error('Status inválido.');
  const file = loadFile();
  const campanha = encontrarCampanha(file, input.campanhaId);
  const origem = campanha.status;
  const destino = file.campanhas.filter((c) => c.status === input.status && c.id !== campanha.id).sort((a, b) => a.ordem - b.ordem);
  const indice = Math.max(0, Math.min(destino.length, Math.floor(input.indice)));
  destino.splice(indice, 0, campanha);
  campanha.status = input.status;
  campanha.updatedAt = nowIso();
  destino.forEach((c, i) => (c.ordem = i));
  if (origem !== input.status) reordenar(file, origem);
  return saveFile(file);
}

export async function excluirCampanha(campanhaId: string): Promise<TrafegoFile> {
  const file = loadFile();
  const alvo = encontrarCampanha(file, campanhaId);
  file.campanhas = file.campanhas.filter((c) => c.id !== campanhaId);
  reordenar(file, alvo.status);
  return saveFile(file);
}

export async function duplicarCampanha(campanhaId: string): Promise<TrafegoFile> {
  const file = loadFile();
  const original = encontrarCampanha(file, campanhaId);
  file.seqAtual += 1;
  const timestamp = nowIso();
  // A cópia é o ponto de partida de uma nova rodada: mesma configuração, sem resultados.
  const copia = migrateCampanha({
    ...original,
    id: randomUUID(),
    seq: file.seqAtual,
    nome: `${original.nome} (cópia)`,
    status: 'planejamento',
    ordem: -1,
    registros: [],
    links: original.links.map((l) => ({ ...l, id: randomUUID() })),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (copia) file.campanhas.push(copia);
  reordenar(file, 'planejamento');
  return saveFile(file);
}

export async function salvarRegistro(input: SalvarRegistroInput): Promise<TrafegoFile> {
  const file = loadFile();
  const campanha = encontrarCampanha(file, input.campanhaId);
  const registro = migrateRegistro(input.registro);
  if (!registro) throw new Error('Informe a data do registro.');
  // Editar a data de um registro existente tira ele do dia antigo.
  const semEste = campanha.registros.filter((r) => r.id !== registro.id && r.data !== registro.data);
  campanha.registros = registrosPorDia([...semEste, registro]);
  campanha.updatedAt = nowIso();
  return saveFile(file);
}

export async function removerRegistro(input: RemoverRegistroInput): Promise<TrafegoFile> {
  const file = loadFile();
  const campanha = encontrarCampanha(file, input.campanhaId);
  campanha.registros = campanha.registros.filter((r) => r.id !== input.registroId);
  campanha.updatedAt = nowIso();
  return saveFile(file);
}

// ---------- Importação de planilha ----------
// Os relatórios exportados das plataformas têm nomes de coluna parecidos, mas
// nunca iguais ("Valor usado (BRL)", "Custo", "Amount spent"…). O palpite é
// pelo nome; a ordem de cada lista é a preferência quando há mais de uma.

const COLUNAS: Record<keyof Omit<RegistroTrafego, 'id'>, string[]> = {
  data: ['data', 'dia', 'date', 'day', 'inicio dos relatorios', 'reporting starts'],
  investimento: ['valor usado', 'valor gasto', 'investimento', 'gasto', 'custo', 'amount spent', 'spend', 'cost'],
  impressoes: ['impressoes', 'impressions', 'impr'],
  cliques: ['cliques no link', 'link clicks', 'cliques', 'clicks'],
  conversoes: ['conversoes', 'conversions', 'resultados', 'results', 'leads', 'compras', 'purchases'],
  receita: ['receita', 'faturamento', 'valor de conversao', 'conversion value', 'conv. value', 'revenue', 'purchase value'],
};

function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function acharColunas(cabecalho: string[]): Partial<Record<keyof typeof COLUNAS, number>> {
  const normais = cabecalho.map((c) => normalizar(String(c ?? '')));
  const achadas: Partial<Record<keyof typeof COLUNAS, number>> = {};
  const usadas = new Set<number>();
  (Object.keys(COLUNAS) as Array<keyof typeof COLUNAS>).forEach((campo) => {
    for (const chave of COLUNAS[campo]) {
      // Nome exato primeiro; depois "contém" (ex.: "Valor usado (BRL)").
      let i = normais.findIndex((n, idx) => !usadas.has(idx) && n === chave);
      if (i < 0) i = normais.findIndex((n, idx) => !usadas.has(idx) && n.includes(chave));
      if (i >= 0) {
        achadas[campo] = i;
        usadas.add(i);
        return;
      }
    }
  });
  return achadas;
}

/** "R$ 1.234,56", "1,234.56", "12%", "1.234" → número. */
export function parseNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : 0;
  let t = String(valor ?? '').replace(/[^\d.,-]/g, '');
  if (!t) return 0;
  const ultimoPonto = t.lastIndexOf('.');
  const ultimaVirgula = t.lastIndexOf(',');
  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    // Os dois aparecem: o que vem por último é o decimal.
    t = ultimaVirgula > ultimoPonto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (ultimaVirgula >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date do Excel, "2026-09-24", "24/09/2026" ou "24/09/26" → YYYY-MM-DD. */
export function parseData(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${doisDigitos(valor.getMonth() + 1)}-${doisDigitos(valor.getDate())}`;
  }
  const t = String(valor ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Planilha brasileira: dia primeiro.
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (br) {
    const ano = br[3]!.length === 2 ? `20${br[3]}` : br[3]!;
    const mes = Number(br[2]);
    const dia = Number(br[1]);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  }
  return undefined;
}

function lerTabela(filePath: string): unknown[][] {
  const csv = filePath.toLowerCase().endsWith('.csv');
  // CSV: sem inferência de tipo (uma data "01/02" viraria mês/dia americano).
  // Planilha: datas de verdade (cellDates), para não depender do formato de exibição.
  const workbook = XLSX().readFile(filePath, csv ? { raw: true } : { cellDates: true });
  const primeira = workbook.SheetNames[0];
  if (!primeira) return [];
  return XLSX().utils.sheet_to_json<unknown[]>(workbook.Sheets[primeira]!, { header: 1, raw: true, defval: '' });
}

/**
 * Lê a primeira aba, acha as colunas pelo nome e soma as linhas de um mesmo
 * dia (relatórios por conjunto/anúncio vêm com várias linhas por dia). Cada
 * dia importado substitui o registro daquele dia na campanha.
 */
export async function importarRegistros(campanhaId: string, filePath: string): Promise<ImportarRegistrosResult> {
  const tabela = lerTabela(filePath);
  const inicioCab = tabela.findIndex((linha) => {
    const colunas = acharColunas(linha.map((c) => String(c ?? '')));
    return colunas.data !== undefined && Object.keys(colunas).length >= 2;
  });
  if (inicioCab < 0) {
    throw new Error('Não achei o cabeçalho: a planilha precisa de uma coluna de data e ao menos uma de números (valor gasto, impressões, cliques…).');
  }
  const cabecalho = tabela[inicioCab]!.map((c) => String(c ?? ''));
  const colunas = acharColunas(cabecalho);

  const porDia = new Map<string, Omit<RegistroTrafego, 'id'>>();
  let ignorados = 0;
  tabela.slice(inicioCab + 1).forEach((linha) => {
    const dia = parseData(linha[colunas.data!]);
    if (!dia) {
      if (linha.some((c) => String(c ?? '').trim())) ignorados += 1;
      return;
    }
    const valor = (campo: keyof typeof COLUNAS): number => (colunas[campo] === undefined ? 0 : parseNumero(linha[colunas[campo]!]));
    const atual = porDia.get(dia) ?? { data: dia, investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0 };
    porDia.set(dia, {
      data: dia,
      investimento: atual.investimento + valor('investimento'),
      impressoes: atual.impressoes + valor('impressoes'),
      cliques: atual.cliques + valor('cliques'),
      conversoes: atual.conversoes + valor('conversoes'),
      receita: atual.receita + valor('receita'),
    });
  });

  const file = loadFile();
  const campanha = encontrarCampanha(file, campanhaId);
  const importados = [...porDia.values()].map((r) => ({ ...r, id: randomUUID() }));
  const dias = new Set(importados.map((r) => r.data));
  campanha.registros = registrosPorDia([...campanha.registros.filter((r) => !dias.has(r.data)), ...importados]);
  campanha.updatedAt = nowIso();
  const salvo = await saveFile(file);

  const colunasLidas = (Object.keys(colunas) as Array<keyof typeof COLUNAS>).map((campo) => `${cabecalho[colunas[campo]!]} → ${campo}`);
  return { file: salvo, importados: importados.length, ignorados, colunasLidas };
}
