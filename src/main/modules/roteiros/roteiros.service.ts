import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as kanbanService from '../kanban/kanban.service';
import * as videosService from '../videos/videos.service';
import { garantirSeq, listaDeStrings, naoNulo, nowIso, texto } from '../postagens/postagens.comum';
import {
  MAX_VERSOES,
  isFormatoRoteiro,
  isStatusRoteiro,
  isTipoCena,
  type ApontamentoRevisao,
  type AprovarRoteiroInput,
  type AtualizarRoteiroInput,
  type BriefingRoteiro,
  type CenaRoteiro,
  type CriarAdaptacaoInput,
  type CriarAdaptacaoResult,
  type CriarRoteiroInput,
  type CriterioRevisao,
  type EventoRoteiro,
  type FonteRoteiro,
  type ItemChecklist,
  type MudarStatusRoteiroInput,
  type PesquisaRoteiro,
  type RestaurarVersaoInput,
  type RevisaoIaRoteiro,
  type Roteiro,
  type RoteirosFile,
  type SalvarVersaoInput,
  type StatusRoteiro,
  type VersaoRoteiro,
} from '../../../shared/types/roteiros.types';
import { cenasDoMarkdown, cenasIniciais, lerDuracaoTexto, markdownDasCenas } from '../../../shared/types/roteiros.conversao';

const FILE_NAME = 'roteiros.json';
// v2: o roteiro vira uma lista de cenas (antes: um texto markdown livre),
// com briefing, pesquisa/fontes, versões e a última revisão da IA.
const SCHEMA_VERSION = 2;
const MAX_CHECKLIST = 30;
const MAX_HISTORICO = 100;
const MAX_CENAS = 200;
const MAX_FONTES = 100;

const CHECKLIST_PADRAO = ['Gancho prende nos 3 primeiros segundos', 'CTA claro no fim', 'Duração dentro do formato', 'Ortografia revisada'];

function createDefaultFile(): RoteirosFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), seqAtual: 0, roteiros: [], checklistPadrao: [...CHECKLIST_PADRAO] };
}

// ---------- Migração defensiva ----------

function id(v: unknown): string {
  return typeof v === 'string' && v ? v : randomUUID();
}

function segundos(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 24 * 3600 ? Math.round(v) : undefined;
}

function migrateChecklist(raw: unknown): ItemChecklist[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): ItemChecklist | null => {
      const c = (r ?? {}) as Partial<ItemChecklist>;
      const t = texto(c.texto).trim();
      if (!t) return null;
      return { id: id(c.id), texto: t.slice(0, 200), feito: c.feito === true };
    })
    .filter(naoNulo)
    .slice(0, MAX_CHECKLIST);
}

function migrateEvento(raw: unknown): EventoRoteiro | null {
  const c = (raw ?? {}) as Partial<EventoRoteiro>;
  if (!isStatusRoteiro(c.status) || typeof c.em !== 'string') return null;
  return { em: c.em, status: c.status, comentario: texto(c.comentario) };
}

function migrateCena(raw: unknown): CenaRoteiro | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<CenaRoteiro>;
  const duracao = segundos(c.duracaoAlvoSeg);
  return {
    id: id(c.id),
    tipo: isTipoCena(c.tipo) ? c.tipo : 'secao',
    titulo: texto(c.titulo).slice(0, 200),
    fala: texto(c.fala),
    visual: texto(c.visual),
    textoTela: texto(c.textoTela),
    notas: texto(c.notas),
    ...(duracao ? { duracaoAlvoSeg: duracao } : {}),
  };
}

function migrateCenas(raw: unknown): CenaRoteiro[] {
  return Array.isArray(raw) ? raw.map(migrateCena).filter(naoNulo).slice(0, MAX_CENAS) : [];
}

function migrateFonte(raw: unknown): FonteRoteiro | null {
  const c = (raw ?? {}) as Partial<FonteRoteiro>;
  const titulo = texto(c.titulo).trim();
  const url = texto(c.url).trim();
  if (!titulo && !url) return null;
  return { id: id(c.id), titulo, url, nota: texto(c.nota) };
}

function migrateBriefing(raw: unknown): BriefingRoteiro {
  const c = (raw ?? {}) as Partial<BriefingRoteiro>;
  const ppm = typeof c.palavrasPorMinuto === 'number' && c.palavrasPorMinuto >= 60 && c.palavrasPorMinuto <= 300 ? Math.round(c.palavrasPorMinuto) : undefined;
  const duracao = segundos(c.duracaoAlvoSeg);
  return {
    tema: texto(c.tema),
    publico: texto(c.publico),
    tom: texto(c.tom),
    objetivo: texto(c.objetivo),
    pontosChave: texto(c.pontosChave),
    ...(duracao ? { duracaoAlvoSeg: duracao } : {}),
    ...(ppm ? { palavrasPorMinuto: ppm } : {}),
  };
}

function migratePesquisa(raw: unknown): PesquisaRoteiro {
  const c = (raw ?? {}) as Partial<PesquisaRoteiro>;
  return {
    notas: texto(c.notas),
    fontes: (Array.isArray(c.fontes) ? c.fontes.map(migrateFonte).filter(naoNulo) : []).slice(0, MAX_FONTES),
  };
}

function migrateVersao(raw: unknown): VersaoRoteiro | null {
  const c = (raw ?? {}) as Partial<VersaoRoteiro>;
  if (typeof c.em !== 'string') return null;
  return {
    id: id(c.id),
    em: c.em,
    rotulo: texto(c.rotulo).slice(0, 120) || 'Versão',
    origem: c.origem === 'ia' || c.origem === 'restaurada' ? c.origem : 'manual',
    titulo: texto(c.titulo),
    cenas: migrateCenas(c.cenas),
  };
}

function nota(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v * 10) / 10)) : 0;
}

function migrateRevisao(raw: unknown): RevisaoIaRoteiro | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<RevisaoIaRoteiro>;
  if (typeof c.em !== 'string') return undefined;
  return {
    em: c.em,
    notaGeral: nota(c.notaGeral),
    resumo: texto(c.resumo),
    criterios: (Array.isArray(c.criterios) ? c.criterios : [])
      .map((x): CriterioRevisao | null => {
        const o = (x ?? {}) as Partial<CriterioRevisao>;
        return texto(o.nome).trim() ? { nome: texto(o.nome).trim(), nota: nota(o.nota), comentario: texto(o.comentario) } : null;
      })
      .filter(naoNulo)
      .slice(0, 12),
    apontamentos: (Array.isArray(c.apontamentos) ? c.apontamentos : [])
      .map((x): ApontamentoRevisao | null => {
        const o = (x ?? {}) as Partial<ApontamentoRevisao>;
        if (!texto(o.problema).trim()) return null;
        return {
          id: id(o.id),
          ...(typeof o.cenaId === 'string' && o.cenaId ? { cenaId: o.cenaId } : {}),
          trecho: texto(o.trecho),
          problema: texto(o.problema),
          sugestao: texto(o.sugestao),
        };
      })
      .filter(naoNulo)
      .slice(0, 40),
  };
}

/** Campos da v1, que só existem no arquivo antigo. */
interface RoteiroV1 {
  texto?: unknown;
  gancho?: unknown;
  cta?: unknown;
  duracao?: unknown;
}

/**
 * A v1 guardava o roteiro como texto livre em markdown, mais gancho/CTA à
 * parte. Vira cenas pela mesma leitura do modo texto livre; o texto original
 * fica em `textoLegado`, intacto, caso algo não tenha sido lido como devia.
 */
function cenasDaV1(c: RoteiroV1, briefing: BriefingRoteiro, pesquisa: PesquisaRoteiro): CenaRoteiro[] {
  const original = texto(c.texto);
  const leitura = cenasDoMarkdown(original, randomUUID);
  const cenas = leitura.cenas;
  const gancho = texto(c.gancho).trim();
  const cta = texto(c.cta).trim();
  if (gancho) cenas.unshift({ id: randomUUID(), tipo: 'gancho', titulo: 'Gancho', fala: gancho, visual: '', textoTela: '', notas: '' });
  if (cta) cenas.push({ id: randomUUID(), tipo: 'cta', titulo: 'CTA', fala: cta, visual: '', textoTela: '', notas: '' });
  pesquisa.fontes.push(...leitura.fontes);
  briefing.tom ||= leitura.briefing.tom ?? '';
  briefing.publico ||= leitura.briefing.publico ?? '';
  briefing.objetivo ||= leitura.briefing.objetivo ?? '';
  briefing.tema ||= leitura.briefing.tema ?? '';
  const duracao = lerDuracaoTexto(texto(c.duracao)) ?? (leitura.duracaoTexto ? lerDuracaoTexto(leitura.duracaoTexto) : undefined);
  if (duracao && !briefing.duracaoAlvoSeg) briefing.duracaoAlvoSeg = duracao;
  return cenas;
}

function migrateRoteiro(raw: unknown): Roteiro | null {
  const c = (raw ?? {}) as Partial<Roteiro> & RoteiroV1;
  const titulo = texto(c.titulo).trim();
  if (!titulo) return null;
  const timestamp = texto(c.createdAt) || nowIso();
  const briefing = migrateBriefing(c.briefing);
  const pesquisa = migratePesquisa(c.pesquisa);
  const daV1 = !Array.isArray(c.cenas);
  const cenas = daV1 ? cenasDaV1(c, briefing, pesquisa) : migrateCenas(c.cenas);
  const legado = daV1 ? texto(c.texto) : texto(c.textoLegado);
  const revisao = migrateRevisao(c.revisaoIa);
  return {
    id: id(c.id),
    seq: typeof c.seq === 'number' && c.seq > 0 ? c.seq : 0,
    titulo,
    tagIds: [...new Set(listaDeStrings(c.tagIds))],
    formato: isFormatoRoteiro(c.formato) ? c.formato : 'reels',
    briefing,
    cenas,
    pesquisa,
    observacoes: texto(c.observacoes),
    checklist: migrateChecklist(c.checklist),
    status: isStatusRoteiro(c.status) ? c.status : 'rascunho',
    historico: (Array.isArray(c.historico) ? c.historico.map(migrateEvento).filter(naoNulo) : []).slice(-MAX_HISTORICO),
    versoes: (Array.isArray(c.versoes) ? c.versoes.map(migrateVersao).filter(naoNulo) : []).slice(0, MAX_VERSOES),
    ...(revisao ? { revisaoIa: revisao } : {}),
    ...(typeof c.adaptadoDe === 'string' && c.adaptadoDe ? { adaptadoDe: c.adaptadoDe } : {}),
    kanbanCardId: typeof c.kanbanCardId === 'string' && c.kanbanCardId ? c.kanbanCardId : undefined,
    ...(legado.trim() ? { textoLegado: legado } : {}),
    createdAt: timestamp,
    updatedAt: texto(c.updatedAt) || timestamp,
  };
}

/**
 * A leitura da v1 cria ids novos (cenas, fontes) a cada vez: o primeiro
 * getFile depois da migração grava o arquivo, para os ids ficarem estáveis
 * entre uma leitura e outra.
 */
let gravarMigracao = false;

function migrateFile(raw: unknown): RoteirosFile {
  const c = (raw ?? {}) as Partial<RoteirosFile>;
  if (c.schemaVersion !== SCHEMA_VERSION) gravarMigracao = true;
  const roteiros = Array.isArray(c.roteiros) ? c.roteiros.map(migrateRoteiro).filter(naoNulo) : [];
  const seqAtual = garantirSeq(roteiros, typeof c.seqAtual === 'number' ? c.seqAtual : 0);
  const padrao = Array.isArray(c.checklistPadrao)
    ? listaDeStrings(c.checklistPadrao).map((t) => t.trim()).filter(Boolean).slice(0, MAX_CHECKLIST)
    : [...CHECKLIST_PADRAO];
  return { schemaVersion: SCHEMA_VERSION, updatedAt: texto(c.updatedAt) || nowIso(), seqAtual, roteiros, checklistPadrao: padrao };
}

function loadFile(): RoteirosFile {
  return readStore(FILE_NAME, createDefaultFile, migrateFile);
}

async function saveFile(file: RoteirosFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function encontrar(file: RoteirosFile, roteiroId: string): Roteiro {
  const roteiro = file.roteiros.find((r) => r.id === roteiroId);
  if (!roteiro) throw new Error('Roteiro não encontrado — ele pode ter sido excluído.');
  return roteiro;
}

function registrar(roteiro: Roteiro, status: StatusRoteiro, comentario = ''): void {
  roteiro.status = status;
  roteiro.historico.push({ em: nowIso(), status, comentario: comentario.trim() });
  roteiro.historico = roteiro.historico.slice(-MAX_HISTORICO);
  roteiro.updatedAt = nowIso();
}

/** Guarda as cenas atuais como versão (a mais nova primeiro; as mais antigas saem). */
function guardarVersao(roteiro: Roteiro, rotulo: string, origem: VersaoRoteiro['origem']): void {
  roteiro.versoes.unshift({
    id: randomUUID(),
    em: nowIso(),
    rotulo: rotulo.trim().slice(0, 120) || 'Versão',
    origem,
    titulo: roteiro.titulo,
    cenas: structuredClone(roteiro.cenas),
  });
  roteiro.versoes = roteiro.versoes.slice(0, MAX_VERSOES);
}

// ---------- API do service ----------

export async function getFile(): Promise<RoteirosFile> {
  const file = loadFile();
  if (gravarMigracao) {
    gravarMigracao = false;
    await saveFile(file);
  }
  return file;
}

export async function getFullFile(): Promise<RoteirosFile> {
  return loadFile();
}

export async function replaceFile(file: unknown): Promise<RoteirosFile> {
  const normalizado = migrateFile(file);
  await saveFile(normalizado);
  return normalizado;
}

function novoRoteiro(file: RoteirosFile, input: CriarRoteiroInput, extra: Partial<Roteiro> = {}): Roteiro {
  const titulo = texto(input?.titulo).trim();
  if (!titulo) throw new Error('Dê um título ao roteiro.');
  file.seqAtual += 1;
  const timestamp = nowIso();
  const formato = isFormatoRoteiro(input.formato) ? input.formato : 'reels';
  const briefing = migrateBriefing(input.briefing);
  const pesquisa = migratePesquisa(input.pesquisa);
  let cenas = migrateCenas(input.cenas);
  // Texto colado/aberto: a mesma leitura do modo texto livre.
  if (!cenas.length && texto(input.texto).trim()) {
    const leitura = cenasDoMarkdown(texto(input.texto), randomUUID);
    cenas = leitura.cenas;
    pesquisa.fontes.push(...leitura.fontes);
    briefing.tom ||= leitura.briefing.tom ?? '';
    briefing.publico ||= leitura.briefing.publico ?? '';
    const duracao = leitura.duracaoTexto ? lerDuracaoTexto(leitura.duracaoTexto) : undefined;
    if (duracao && !briefing.duracaoAlvoSeg) briefing.duracaoAlvoSeg = duracao;
  }
  if (!cenas.length) cenas = cenasIniciais(randomUUID, formato);
  const novo = migrateRoteiro({
    id: randomUUID(),
    seq: file.seqAtual,
    titulo,
    tagIds: input.tagIds ?? [],
    formato,
    briefing,
    cenas,
    pesquisa,
    checklist: file.checklistPadrao.map((t) => ({ id: randomUUID(), texto: t, feito: false })),
    status: 'rascunho',
    historico: [{ em: timestamp, status: 'rascunho', comentario: 'Roteiro criado' }],
    versoes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  });
  if (!novo) throw new Error('Não foi possível criar o roteiro.');
  file.roteiros.unshift(novo);
  return novo;
}

export async function criarRoteiro(input: CriarRoteiroInput): Promise<RoteirosFile> {
  const file = loadFile();
  novoRoteiro(file, input);
  await saveFile(file);
  return file;
}

export async function atualizarRoteiro(input: AtualizarRoteiroInput): Promise<RoteirosFile> {
  const file = loadFile();
  const atual = encontrar(file, input.roteiroId);
  const { roteiroId: _id, ...campos } = input;
  const validado = migrateRoteiro({ ...atual, ...campos, id: atual.id, seq: atual.seq, createdAt: atual.createdAt, updatedAt: nowIso() });
  if (!validado) throw new Error('O roteiro precisa de um título.');
  // Mexer no conteúdo de um reprovado é começar a nova versão: volta a rascunho.
  const mudouConteudo = ['cenas', 'titulo'].some((k) => k in campos);
  if (validado.status === 'reprovado' && mudouConteudo) registrar(validado, 'rascunho', 'Editado depois da reprovação');
  file.roteiros[file.roteiros.indexOf(atual)] = validado;
  await saveFile(file);
  return file;
}

export async function mudarStatus(input: MudarStatusRoteiroInput): Promise<RoteirosFile> {
  if (!isStatusRoteiro(input.status) || (input.status as string) === 'aprovado') {
    throw new Error('Status inválido. Para aprovar, use "Aprovar e enviar ao Kanban".');
  }
  const file = loadFile();
  const roteiro = encontrar(file, input.roteiroId);
  if (input.status === 'reprovado' && !texto(input.comentario).trim()) {
    throw new Error('Diga o motivo da reprovação — é o que orienta a próxima versão.');
  }
  registrar(roteiro, input.status, texto(input.comentario));
  await saveFile(file);
  return file;
}

function descricaoDoCard(roteiro: Roteiro): string {
  // O seq é interno (não aparece em card nenhum): o card já leva o título.
  const partes = [markdownDasCenas(roteiro, false), roteiro.observacoes.trim() ? `OBSERVAÇÕES\n${roteiro.observacoes.trim()}` : ''];
  return partes.filter(Boolean).join('\n\n');
}

/**
 * Aprova e manda para o Kanban: um card na primeira coluna, com o roteiro na
 * descrição e as tags pelo nome. Aprovar de novo não duplica — se o card ainda
 * existe, só registra a aprovação; se foi apagado no Kanban, cria outro.
 */
export async function aprovarRoteiro(input: AprovarRoteiroInput): Promise<RoteirosFile> {
  const file = loadFile();
  const roteiro = encontrar(file, input.roteiroId);

  const board = await kanbanService.getBoard();
  const cardExiste = roteiro.kanbanCardId !== undefined && board.cards.some((c) => c.id === roteiro.kanbanCardId);
  if (!cardExiste) {
    const primeira = board.columns.slice().sort((a, b) => a.order - b.order)[0];
    if (!primeira) throw new Error('O Kanban não tem nenhuma coluna. Crie uma coluna lá antes de aprovar.');
    const catalogo = videosService.getCatalogo();
    const tags = roteiro.tagIds.map((id) => catalogo.tags.find((t) => t.id === id)?.nome).filter((n): n is string => Boolean(n));
    const depois = await kanbanService.createCard({
      columnId: primeira.id,
      title: roteiro.titulo,
      description: descricaoDoCard(roteiro),
      tags: tags.length ? tags : undefined,
    });
    // createCard devolve o quadro inteiro; o card novo é o do último número.
    const novo = depois.cards.find((c) => c.seq === depois.cardSeq) ?? depois.cards[depois.cards.length - 1];
    roteiro.kanbanCardId = novo?.id;
  }
  registrar(roteiro, 'aprovado', texto(input.comentario) || (cardExiste ? 'Aprovado de novo (o card já estava no Kanban)' : 'Aprovado e enviado ao Kanban'));
  await saveFile(file);
  return file;
}

export async function excluirRoteiro(roteiroId: string): Promise<RoteirosFile> {
  const file = loadFile();
  file.roteiros = file.roteiros.filter((r) => r.id !== roteiroId);
  await saveFile(file);
  return file;
}

export async function duplicarRoteiro(roteiroId: string): Promise<RoteirosFile> {
  const file = loadFile();
  const original = encontrar(file, roteiroId);
  file.seqAtual += 1;
  const timestamp = nowIso();
  const copia = migrateRoteiro({
    ...structuredClone(original),
    id: randomUUID(),
    seq: file.seqAtual,
    titulo: `${original.titulo} (cópia)`,
    status: 'rascunho',
    cenas: original.cenas.map((c) => ({ ...c, id: randomUUID() })),
    checklist: original.checklist.map((i) => ({ ...i, id: randomUUID(), feito: false })),
    historico: [{ em: timestamp, status: 'rascunho', comentario: `Cópia de "${original.titulo}"` }],
    versoes: [],
    revisaoIa: undefined,
    kanbanCardId: undefined,
    textoLegado: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (copia) file.roteiros.unshift(copia);
  await saveFile(file);
  return file;
}

export async function salvarChecklistPadrao(itens: string[]): Promise<RoteirosFile> {
  const file = loadFile();
  file.checklistPadrao = listaDeStrings(itens).map((t) => t.trim().slice(0, 200)).filter(Boolean).slice(0, MAX_CHECKLIST);
  await saveFile(file);
  return file;
}

// ---------- Versões ----------

export async function salvarVersao(input: SalvarVersaoInput): Promise<RoteirosFile> {
  const file = loadFile();
  const roteiro = encontrar(file, input.roteiroId);
  guardarVersao(roteiro, texto(input.rotulo), input.origem === 'ia' ? 'ia' : 'manual');
  await saveFile(file);
  return file;
}

/** Volta a uma versão — a atual vira versão antes, então restaurar também se desfaz. */
export async function restaurarVersao(input: RestaurarVersaoInput): Promise<RoteirosFile> {
  const file = loadFile();
  const roteiro = encontrar(file, input.roteiroId);
  const versao = roteiro.versoes.find((v) => v.id === input.versaoId);
  if (!versao) throw new Error('Essa versão não existe mais.');
  guardarVersao(roteiro, 'Antes de restaurar', 'restaurada');
  roteiro.cenas = structuredClone(versao.cenas);
  roteiro.updatedAt = nowIso();
  if (roteiro.status === 'reprovado') registrar(roteiro, 'rascunho', 'Versão restaurada depois da reprovação');
  await saveFile(file);
  return file;
}

// ---------- Adaptação ----------

/** Roteiro novo em outro formato, a partir de um existente (que não muda). */
export async function criarAdaptacao(input: CriarAdaptacaoInput): Promise<CriarAdaptacaoResult> {
  const file = loadFile();
  const original = encontrar(file, input.roteiroId);
  const novo = novoRoteiro(
    file,
    {
      titulo: texto(input.titulo).trim() || `${original.titulo} (adaptado)`,
      formato: input.formato,
      tagIds: original.tagIds,
      cenas: input.cenas,
      briefing: { ...original.briefing, duracaoAlvoSeg: input.duracaoAlvoSeg, palavrasPorMinuto: undefined },
      pesquisa: structuredClone(original.pesquisa),
    },
    { adaptadoDe: original.id },
  );
  novo.historico = [{ em: novo.createdAt, status: 'rascunho', comentario: `Adaptado de "${original.titulo}"` }];
  await saveFile(file);
  return { file, roteiroId: novo.id };
}
