import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as kanbanService from '../kanban/kanban.service';
import * as videosService from '../videos/videos.service';
import { garantirSeq, listaDeStrings, naoNulo, nowIso, texto } from '../postagens/postagens.comum';
import {
  isFormatoRoteiro,
  isStatusRoteiro,
  type AprovarRoteiroInput,
  type AtualizarRoteiroInput,
  type CriarRoteiroInput,
  type EventoRoteiro,
  type ItemChecklist,
  type MudarStatusRoteiroInput,
  type Roteiro,
  type RoteirosFile,
  type StatusRoteiro,
} from '../../../shared/types/roteiros.types';

const FILE_NAME = 'roteiros.json';
const SCHEMA_VERSION = 1;
const MAX_CHECKLIST = 30;
const MAX_HISTORICO = 100;

const CHECKLIST_PADRAO = ['Gancho prende nos 3 primeiros segundos', 'CTA claro no fim', 'Duração dentro do formato', 'Ortografia revisada'];

function createDefaultFile(): RoteirosFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), seqAtual: 0, roteiros: [], checklistPadrao: [...CHECKLIST_PADRAO] };
}

// ---------- Migração defensiva ----------

function migrateChecklist(raw: unknown): ItemChecklist[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): ItemChecklist | null => {
      const c = (r ?? {}) as Partial<ItemChecklist>;
      const t = texto(c.texto).trim();
      if (!t) return null;
      return { id: typeof c.id === 'string' && c.id ? c.id : randomUUID(), texto: t.slice(0, 200), feito: c.feito === true };
    })
    .filter(naoNulo)
    .slice(0, MAX_CHECKLIST);
}

function migrateEvento(raw: unknown): EventoRoteiro | null {
  const c = (raw ?? {}) as Partial<EventoRoteiro>;
  if (!isStatusRoteiro(c.status) || typeof c.em !== 'string') return null;
  return { em: c.em, status: c.status, comentario: texto(c.comentario) };
}

function migrateRoteiro(raw: unknown): Roteiro | null {
  const c = (raw ?? {}) as Partial<Roteiro>;
  const titulo = texto(c.titulo).trim();
  if (!titulo) return null;
  const timestamp = texto(c.createdAt) || nowIso();
  return {
    id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
    seq: typeof c.seq === 'number' && c.seq > 0 ? c.seq : 0,
    titulo,
    tagIds: [...new Set(listaDeStrings(c.tagIds))],
    formato: isFormatoRoteiro(c.formato) ? c.formato : 'reels',
    duracao: texto(c.duracao).slice(0, 40),
    gancho: texto(c.gancho),
    texto: texto(c.texto),
    cta: texto(c.cta),
    observacoes: texto(c.observacoes),
    checklist: migrateChecklist(c.checklist),
    status: isStatusRoteiro(c.status) ? c.status : 'rascunho',
    historico: (Array.isArray(c.historico) ? c.historico.map(migrateEvento).filter(naoNulo) : []).slice(-MAX_HISTORICO),
    kanbanCardId: typeof c.kanbanCardId === 'string' && c.kanbanCardId ? c.kanbanCardId : undefined,
    createdAt: timestamp,
    updatedAt: texto(c.updatedAt) || timestamp,
  };
}

function migrateFile(raw: unknown): RoteirosFile {
  const c = (raw ?? {}) as Partial<RoteirosFile>;
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

// ---------- API do service ----------

export async function getFile(): Promise<RoteirosFile> {
  return loadFile();
}

export async function getFullFile(): Promise<RoteirosFile> {
  return loadFile();
}

export async function replaceFile(file: RoteirosFile): Promise<RoteirosFile> {
  const normalizado = migrateFile(file);
  await saveFile(normalizado);
  return normalizado;
}

export async function criarRoteiro(input: CriarRoteiroInput): Promise<RoteirosFile> {
  const titulo = texto(input?.titulo).trim();
  if (!titulo) throw new Error('Dê um título ao roteiro.');
  const file = loadFile();
  file.seqAtual += 1;
  const timestamp = nowIso();
  const novo = migrateRoteiro({
    id: randomUUID(),
    seq: file.seqAtual,
    titulo,
    tagIds: input.tagIds ?? [],
    formato: input.formato,
    texto: input.texto,
    duracao: input.duracao,
    checklist: file.checklistPadrao.map((t) => ({ id: randomUUID(), texto: t, feito: false })),
    status: 'rascunho',
    historico: [{ em: timestamp, status: 'rascunho', comentario: 'Roteiro criado' }],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!novo) throw new Error('Não foi possível criar o roteiro.');
  file.roteiros.unshift(novo);
  await saveFile(file);
  return file;
}

export async function atualizarRoteiro(input: AtualizarRoteiroInput): Promise<RoteirosFile> {
  const file = loadFile();
  const atual = encontrar(file, input.roteiroId);
  const { roteiroId: _id, ...campos } = input;
  const validado = migrateRoteiro({ ...atual, ...campos, id: atual.id, seq: atual.seq, createdAt: atual.createdAt, updatedAt: nowIso() });
  if (!validado) throw new Error('O roteiro precisa de um título.');
  // Mexer no texto de um reprovado é começar a nova versão: volta a rascunho.
  const mudouConteudo = ['gancho', 'texto', 'cta', 'titulo'].some((k) => k in campos);
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
  const partes = [
    roteiro.gancho.trim() ? `GANCHO\n${roteiro.gancho.trim()}` : '',
    // Roteiro livre já tem os próprios títulos; o rótulo só separa quando há gancho acima.
    roteiro.texto.trim() ? (roteiro.gancho.trim() ? `ROTEIRO\n${roteiro.texto.trim()}` : roteiro.texto.trim()) : '',
    roteiro.cta.trim() ? `CTA\n${roteiro.cta.trim()}` : '',
    roteiro.observacoes.trim() ? `OBSERVAÇÕES\n${roteiro.observacoes.trim()}` : '',
    `Roteiro #${roteiro.seq}${roteiro.duracao ? ` · ${roteiro.duracao}` : ''}`,
  ];
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
    ...original,
    id: randomUUID(),
    seq: file.seqAtual,
    titulo: `${original.titulo} (cópia)`,
    status: 'rascunho',
    checklist: original.checklist.map((i) => ({ ...i, id: randomUUID(), feito: false })),
    historico: [{ em: timestamp, status: 'rascunho', comentario: `Cópia do roteiro #${original.seq}` }],
    kanbanCardId: undefined,
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
