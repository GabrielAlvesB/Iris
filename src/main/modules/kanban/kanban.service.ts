import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import type {
  CreateCardInput,
  CreateColumnInput,
  KanbanBoard,
  KanbanFile,
  MoveCardInput,
  RenameColumnInput,
  ReorderColumnsInput,
  UpdateCardInput,
} from '../../../shared/types/kanban.types';

const FILE_NAME = 'kanban.json';
const SCHEMA_VERSION = 1;

const DEFAULT_COLUMN_TITLES = ['A Fazer', 'Em Progresso', 'Concluído'];

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultBoard(): KanbanBoard {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    name: 'Meu Quadro',
    createdAt: timestamp,
    updatedAt: timestamp,
    columns: DEFAULT_COLUMN_TITLES.map((title, index) => ({
      id: randomUUID(),
      title,
      order: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    cards: [],
  };
}

function createDefaultFile(): KanbanFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    boards: [createDefaultBoard()],
  };
}

function migrateKanbanFile(raw: unknown): KanbanFile {
  const candidate = (raw ?? {}) as Partial<KanbanFile>;
  const boards = Array.isArray(candidate.boards) && candidate.boards.length > 0 ? candidate.boards : [createDefaultBoard()];

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    boards: boards.map((board) => {
      const cards = Array.isArray(board.cards) ? board.cards : [];
      return {
        ...board,
        columns: Array.isArray(board.columns) ? board.columns : [],
        cards,
        cardSeq: board.cardSeq ?? cards.length,
      };
    }),
  };
}

function loadFile(): KanbanFile {
  return readStore(FILE_NAME, createDefaultFile, migrateKanbanFile);
}

async function saveFile(file: KanbanFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function getPrimaryBoard(file: KanbanFile): KanbanBoard {
  const board = file.boards[0];
  if (!board) {
    throw new Error('Nenhum quadro Kanban encontrado.');
  }
  return board;
}

function renormalizeColumnOrders(board: KanbanBoard): void {
  board.columns
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((column, index) => {
      column.order = index;
    });
}

function renormalizeCardOrders(board: KanbanBoard, columnId: string): void {
  board.cards
    .filter((card) => card.columnId === columnId)
    .sort((a, b) => a.order - b.order)
    .forEach((card, index) => {
      card.order = index;
    });
}

export async function getBoard(): Promise<KanbanBoard> {
  const file = loadFile();
  return getPrimaryBoard(file);
}

export async function getFullFile(): Promise<KanbanFile> {
  return loadFile();
}

export async function replaceFile(file: KanbanFile): Promise<KanbanFile> {
  await saveFile(file);
  return file;
}

export async function createColumn(input: CreateColumnInput): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);
  const timestamp = nowIso();

  board.columns.push({
    id: randomUUID(),
    title: input.title,
    color: input.color,
    order: board.columns.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  board.updatedAt = timestamp;

  await saveFile(file);
  return board;
}

export async function renameColumn(input: RenameColumnInput): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);
  const column = board.columns.find((c) => c.id === input.columnId);
  if (!column) {
    throw new Error(`Coluna ${input.columnId} não encontrada.`);
  }

  column.title = input.title;
  if (input.wipLimit !== undefined) {
    column.wipLimit = input.wipLimit === null ? undefined : input.wipLimit;
  }
  column.updatedAt = nowIso();
  board.updatedAt = column.updatedAt;

  await saveFile(file);
  return board;
}

export async function reorderColumns(input: ReorderColumnsInput): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);

  input.orderedColumnIds.forEach((columnId, index) => {
    const column = board.columns.find((c) => c.id === columnId);
    if (column) {
      column.order = index;
    }
  });
  renormalizeColumnOrders(board);
  board.updatedAt = nowIso();

  await saveFile(file);
  return board;
}

export async function deleteColumn(columnId: string): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);

  board.columns = board.columns.filter((c) => c.id !== columnId);
  board.cards = board.cards.filter((c) => c.columnId !== columnId);
  renormalizeColumnOrders(board);
  board.updatedAt = nowIso();

  await saveFile(file);
  return board;
}

export async function createCard(input: CreateCardInput): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);
  const timestamp = nowIso();
  const order = board.cards.filter((c) => c.columnId === input.columnId).length;
  const seq = (board.cardSeq ?? 0) + 1;
  board.cardSeq = seq;

  board.cards.push({
    id: randomUUID(),
    title: input.title,
    description: input.description,
    tags: input.tags,
    priority: input.priority,
    dueDate: input.dueDate,
    assignee: input.assignee,
    subtasks: [],
    columnId: input.columnId,
    order,
    seq,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  board.updatedAt = timestamp;

  await saveFile(file);
  return board;
}

export async function updateCard(input: UpdateCardInput): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);
  const card = board.cards.find((c) => c.id === input.cardId);
  if (!card) {
    throw new Error(`Card ${input.cardId} não encontrado.`);
  }

  if (input.title !== undefined) card.title = input.title;
  if (input.description !== undefined) card.description = input.description;
  if (input.tags !== undefined) card.tags = input.tags;
  if (input.priority !== undefined) card.priority = input.priority;
  if (input.dueDate !== undefined) card.dueDate = input.dueDate;
  if (input.assignee !== undefined) card.assignee = input.assignee;
  if (input.subtasks !== undefined) card.subtasks = input.subtasks;
  card.updatedAt = nowIso();
  board.updatedAt = card.updatedAt;

  await saveFile(file);
  return board;
}

export async function deleteCard(cardId: string): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) {
    throw new Error(`Card ${cardId} não encontrado.`);
  }

  board.cards = board.cards.filter((c) => c.id !== cardId);
  renormalizeCardOrders(board, card.columnId);
  board.updatedAt = nowIso();

  await saveFile(file);
  return board;
}

export async function moveCard(input: MoveCardInput): Promise<KanbanBoard> {
  const file = loadFile();
  const board = getPrimaryBoard(file);
  const card = board.cards.find((c) => c.id === input.cardId);
  if (!card) {
    throw new Error(`Card ${input.cardId} não encontrado.`);
  }

  const fromColumnId = card.columnId;
  card.columnId = input.toColumnId;
  card.updatedAt = nowIso();

  const targetCards = board.cards
    .filter((c) => c.columnId === input.toColumnId && c.id !== card.id)
    .sort((a, b) => a.order - b.order);
  const clampedIndex = Math.max(0, Math.min(input.toIndex, targetCards.length));
  targetCards.splice(clampedIndex, 0, card);
  targetCards.forEach((c, index) => {
    c.order = index;
  });

  if (fromColumnId !== input.toColumnId) {
    renormalizeCardOrders(board, fromColumnId);
  }
  board.updatedAt = card.updatedAt;

  await saveFile(file);
  return board;
}
