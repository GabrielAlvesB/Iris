import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as kanbanService from '../kanban/kanban.service';
import type { KanbanPriority } from '../../../shared/types/kanban.types';
import {
  CORES_TODO,
  isPrioridadeTodo,
  type AdicionarItensInput,
  type ArquivarChecklistInput,
  type AtualizarChecklistInput,
  type AtualizarItemInput,
  type Checklist,
  type CriarChecklistInput,
  type EnviarAoKanbanInput,
  type EnvioKanban,
  type ItemTodo,
  type MarcarTodosInput,
  type PrioridadeTodo,
  type RemoverItemInput,
  type ReordenarItensInput,
  type TodoFile,
} from '../../../shared/types/todo.types';

const FILE_NAME = 'todo.json';
const SCHEMA_VERSION = 1;

const COR_REGEX = /^#[0-9a-f]{6}$/i;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TITULO_MAX = 200;
const ITEM_MAX = 500;

const PRIORIDADE_NO_KANBAN: Record<PrioridadeTodo, KanbanPriority> = {
  alta: 'high',
  media: 'medium',
  baixa: 'low',
};

function nowIso(): string {
  return new Date().toISOString();
}

function texto(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function corValida(valor: unknown): string | null {
  return typeof valor === 'string' && COR_REGEX.test(valor) ? valor.toLowerCase() : null;
}

function dataValida(valor: unknown): string | undefined {
  return typeof valor === 'string' && DATA_REGEX.test(valor) ? valor : undefined;
}

function createDefaultFile(): TodoFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), checklists: [] };
}

function migrateItem(raw: unknown): ItemTodo | null {
  const c = (raw ?? {}) as Partial<ItemTodo>;
  const t = texto(c.texto, ITEM_MAX);
  if (!t) return null;
  const feito = Boolean(c.feito);
  return {
    id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
    texto: t,
    feito,
    criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : nowIso(),
    feitoEm: feito && typeof c.feitoEm === 'string' ? c.feitoEm : undefined,
  };
}

function migrateEnvio(raw: unknown): EnvioKanban | undefined {
  const c = (raw ?? {}) as Partial<EnvioKanban>;
  if (c.destino !== 'kanban' || typeof c.kanbanCardId !== 'string' || !c.kanbanCardId) return undefined;
  return {
    destino: 'kanban',
    kanbanCardId: c.kanbanCardId,
    colunaNome: typeof c.colunaNome === 'string' ? c.colunaNome : '',
    em: typeof c.em === 'string' ? c.em : nowIso(),
  };
}

function migrateChecklist(raw: unknown, indice: number): Checklist | null {
  const c = (raw ?? {}) as Partial<Checklist>;
  const titulo = texto(c.titulo, TITULO_MAX);
  if (!titulo) return null;
  const timestamp = typeof c.createdAt === 'string' ? c.createdAt : nowIso();
  return {
    id: typeof c.id === 'string' && c.id ? c.id : randomUUID(),
    titulo,
    descricao: typeof c.descricao === 'string' ? c.descricao.trim() : '',
    cor: corValida(c.cor) ?? CORES_TODO[0],
    prioridade: isPrioridadeTodo(c.prioridade) ? c.prioridade : undefined,
    prazo: dataValida(c.prazo),
    itens: (Array.isArray(c.itens) ? c.itens : []).map(migrateItem).filter((i): i is ItemTodo => i !== null),
    ordem: typeof c.ordem === 'number' && Number.isFinite(c.ordem) ? c.ordem : indice,
    arquivada: Boolean(c.arquivada),
    envio: migrateEnvio(c.envio),
    createdAt: timestamp,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : timestamp,
  };
}

function migrateTodoFile(raw: unknown): TodoFile {
  const c = (raw ?? {}) as Partial<TodoFile>;
  const checklists = (Array.isArray(c.checklists) ? c.checklists : [])
    .map(migrateChecklist)
    .filter((l): l is Checklist => l !== null);
  renumerar(checklists);
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowIso(),
    checklists,
  };
}

/** Ordem manual contínua (0, 1, 2…) e a lista já ordenada por ela. */
function renumerar(checklists: Checklist[]): void {
  checklists.sort((a, b) => a.ordem - b.ordem);
  checklists.forEach((l, i) => {
    l.ordem = i;
  });
}

function loadFile(): TodoFile {
  return readStore(FILE_NAME, createDefaultFile, migrateTodoFile);
}

async function saveFile(file: TodoFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function encontrar(file: TodoFile, checklistId: string): Checklist {
  const checklist = file.checklists.find((l) => l.id === checklistId);
  if (!checklist) throw new Error('Essa checklist não existe mais.');
  return checklist;
}

function encontrarItem(checklist: Checklist, itemId: string): ItemTodo {
  const item = checklist.itens.find((i) => i.id === itemId);
  if (!item) throw new Error('Esse item não existe mais.');
  return item;
}

function novosItens(textos: unknown): ItemTodo[] {
  const agora = nowIso();
  return (Array.isArray(textos) ? textos : [])
    .map((t) => texto(t, ITEM_MAX))
    .filter(Boolean)
    .map((t) => ({ id: randomUUID(), texto: t, feito: false, criadoEm: agora }));
}

/** Muta, marca a data e salva — o miolo de quase toda operação. */
async function alterar(checklistId: string, mudar: (checklist: Checklist, file: TodoFile) => void): Promise<TodoFile> {
  const file = loadFile();
  const checklist = encontrar(file, checklistId);
  mudar(checklist, file);
  checklist.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function getFile(): Promise<TodoFile> {
  return loadFile();
}

export async function getFullFile(): Promise<TodoFile> {
  return loadFile();
}

export async function replaceFile(file: TodoFile): Promise<TodoFile> {
  const migrado = migrateTodoFile(file);
  await saveFile(migrado);
  return migrado;
}

export async function criarChecklist(input: CriarChecklistInput): Promise<TodoFile> {
  const titulo = texto(input.titulo, TITULO_MAX);
  if (!titulo) throw new Error('Dê um título à checklist.');
  const file = loadFile();
  const timestamp = nowIso();
  // A nova entra no topo: é nela que o usuário vai mexer agora.
  file.checklists.forEach((l) => {
    l.ordem += 1;
  });
  file.checklists.unshift({
    id: randomUUID(),
    titulo,
    descricao: typeof input.descricao === 'string' ? input.descricao.trim() : '',
    cor: corValida(input.cor) ?? CORES_TODO[0],
    prioridade: isPrioridadeTodo(input.prioridade) ? input.prioridade : undefined,
    prazo: dataValida(input.prazo),
    itens: novosItens(input.itens),
    ordem: 0,
    arquivada: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await saveFile(file);
  return file;
}

export async function atualizarChecklist(input: AtualizarChecklistInput): Promise<TodoFile> {
  return alterar(input.checklistId, (l) => {
    if (input.titulo !== undefined) {
      const titulo = texto(input.titulo, TITULO_MAX);
      if (!titulo) throw new Error('O título não pode ficar vazio.');
      l.titulo = titulo;
    }
    if (input.descricao !== undefined) l.descricao = input.descricao.trim();
    if (input.cor !== undefined) {
      const cor = corValida(input.cor);
      if (!cor) throw new Error('Cor inválida.');
      l.cor = cor;
    }
    if (input.prioridade !== undefined) l.prioridade = isPrioridadeTodo(input.prioridade) ? input.prioridade : undefined;
    if (input.prazo !== undefined) l.prazo = dataValida(input.prazo);
  });
}

export async function excluirChecklist(checklistId: string): Promise<TodoFile> {
  const file = loadFile();
  file.checklists = file.checklists.filter((l) => l.id !== checklistId);
  renumerar(file.checklists);
  await saveFile(file);
  return file;
}

export async function duplicarChecklist(checklistId: string): Promise<TodoFile> {
  const file = loadFile();
  const original = encontrar(file, checklistId);
  const timestamp = nowIso();
  // A cópia nasce logo abaixo da original, com tudo desmarcado e sem o envio:
  // é uma checklist nova, não o mesmo card do Kanban.
  file.checklists.forEach((l) => {
    if (l.ordem > original.ordem) l.ordem += 1;
  });
  file.checklists.push({
    ...original,
    id: randomUUID(),
    titulo: `${original.titulo} (cópia)`.slice(0, TITULO_MAX),
    itens: original.itens.map((i) => ({ id: randomUUID(), texto: i.texto, feito: false, criadoEm: timestamp })),
    ordem: original.ordem + 1,
    arquivada: false,
    envio: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  renumerar(file.checklists);
  await saveFile(file);
  return file;
}

export async function arquivarChecklist(input: ArquivarChecklistInput): Promise<TodoFile> {
  return alterar(input.checklistId, (l) => {
    l.arquivada = Boolean(input.arquivada);
  });
}

/** Os ids listados ficam nessa ordem; os que não vieram (filtrados na tela) vão depois, como estavam. */
export async function reordenarChecklists(checklistIds: string[]): Promise<TodoFile> {
  const file = loadFile();
  const posicao = new Map((Array.isArray(checklistIds) ? checklistIds : []).map((id, i) => [id, i]));
  const total = posicao.size;
  file.checklists.forEach((l) => {
    const p = posicao.get(l.id);
    l.ordem = p !== undefined ? p : total + l.ordem;
  });
  renumerar(file.checklists);
  await saveFile(file);
  return file;
}

export async function adicionarItens(input: AdicionarItensInput): Promise<TodoFile> {
  const itens = novosItens(input.textos);
  if (!itens.length) throw new Error('Escreva o item antes de adicionar.');
  return alterar(input.checklistId, (l) => {
    // Entram antes dos concluídos, no fim dos pendentes: é onde a tela mostra.
    const primeiroFeito = l.itens.findIndex((i) => i.feito);
    if (primeiroFeito < 0) l.itens.push(...itens);
    else l.itens.splice(primeiroFeito, 0, ...itens);
  });
}

export async function atualizarItem(input: AtualizarItemInput): Promise<TodoFile> {
  return alterar(input.checklistId, (l) => {
    const item = encontrarItem(l, input.itemId);
    if (input.texto !== undefined) {
      const t = texto(input.texto, ITEM_MAX);
      if (!t) throw new Error('O item não pode ficar vazio.');
      item.texto = t;
    }
    if (input.feito !== undefined && item.feito !== Boolean(input.feito)) {
      item.feito = Boolean(input.feito);
      item.feitoEm = item.feito ? nowIso() : undefined;
    }
  });
}

export async function removerItem(input: RemoverItemInput): Promise<TodoFile> {
  return alterar(input.checklistId, (l) => {
    l.itens = l.itens.filter((i) => i.id !== input.itemId);
  });
}

export async function reordenarItens(input: ReordenarItensInput): Promise<TodoFile> {
  return alterar(input.checklistId, (l) => {
    const ids = Array.isArray(input.itemIds) ? input.itemIds : [];
    const listados = ids.map((id) => l.itens.find((i) => i.id === id)).filter((i): i is ItemTodo => Boolean(i));
    const resto = l.itens.filter((i) => !ids.includes(i.id));
    l.itens = [...listados, ...resto];
  });
}

export async function marcarTodos(input: MarcarTodosInput): Promise<TodoFile> {
  return alterar(input.checklistId, (l) => {
    const agora = nowIso();
    l.itens.forEach((i) => {
      if (i.feito === input.feito) return;
      i.feito = input.feito;
      i.feitoEm = input.feito ? agora : undefined;
    });
  });
}

export async function limparConcluidos(checklistId: string): Promise<TodoFile> {
  return alterar(checklistId, (l) => {
    l.itens = l.itens.filter((i) => !i.feito);
  });
}

function descricaoDoCard(l: Checklist): string {
  const partes = [l.descricao.trim(), 'Enviado do To-do do Iris.'].filter(Boolean);
  return partes.join('\n\n');
}

/**
 * Cria o card na coluna escolhida, com os itens como subtarefas (o Kanban já
 * tem checkbox por subtarefa). Não duplica sem pedir: se o card do envio
 * anterior ainda existe, só com `forcarNovo`.
 */
export async function enviarAoKanban(input: EnviarAoKanbanInput): Promise<TodoFile> {
  const file = loadFile();
  const checklist = encontrar(file, input.checklistId);

  const board = await kanbanService.getBoard();
  const coluna = board.columns.find((c) => c.id === input.colunaId);
  if (!coluna) throw new Error('Essa coluna não existe mais no Kanban. Escolha outra.');
  const cardAnterior = checklist.envio && board.cards.some((c) => c.id === checklist.envio?.kanbanCardId);
  if (cardAnterior && !input.forcarNovo) {
    throw new Error('Esta checklist já está no Kanban. Para mandar de novo, confirme a criação de outro card.');
  }

  const itens = checklist.itens.filter((i) => input.incluirFeitos || !i.feito);
  const depois = await kanbanService.createCard({
    columnId: coluna.id,
    title: checklist.titulo,
    description: descricaoDoCard(checklist),
    priority: checklist.prioridade ? PRIORIDADE_NO_KANBAN[checklist.prioridade] : undefined,
    dueDate: checklist.prazo,
    subtasks: itens.map((i) => ({ id: randomUUID(), title: i.texto, done: i.feito })),
  });
  // createCard devolve o quadro inteiro; o card novo é o do último número.
  const novo = depois.cards.find((c) => c.seq === depois.cardSeq) ?? depois.cards[depois.cards.length - 1];
  if (!novo) throw new Error('O Kanban não devolveu o card criado.');

  checklist.envio = { destino: 'kanban', kanbanCardId: novo.id, colunaNome: coluna.title, em: nowIso() };
  checklist.updatedAt = nowIso();
  await saveFile(file);
  return file;
}
