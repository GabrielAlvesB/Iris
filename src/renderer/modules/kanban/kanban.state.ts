import type {
  CreateCardInput,
  CreateColumnInput,
  KanbanBoard,
  KanbanCard,
  MoveCardInput,
  RenameColumnInput,
  ReorderColumnsInput,
  UpdateCardInput,
} from '../../../shared/types/kanban.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (board: KanbanBoard) => void;

let board: KanbanBoard | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<KanbanBoard>): KanbanBoard {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: KanbanBoard): void {
  board = next;
  listener?.(board);
}

export function onBoardChange(cb: Listener): void {
  listener = cb;
}

export function offBoardChange(): void {
  listener = null;
}

export function getCurrentBoard(): KanbanBoard | null {
  return board;
}

export async function loadBoard(): Promise<void> {
  const result = await window.irisAPI.kanban.getBoard();
  applyAndNotify(unwrap(result));
}

export async function createColumn(input: CreateColumnInput): Promise<void> {
  const result = await window.irisAPI.kanban.createColumn(input);
  applyAndNotify(unwrap(result));
}

export async function renameColumn(input: RenameColumnInput): Promise<void> {
  const result = await window.irisAPI.kanban.renameColumn(input);
  applyAndNotify(unwrap(result));
}

export async function reorderColumns(input: ReorderColumnsInput): Promise<void> {
  const result = await window.irisAPI.kanban.reorderColumns(input);
  applyAndNotify(unwrap(result));
}

export async function deleteColumn(columnId: string): Promise<void> {
  const result = await window.irisAPI.kanban.deleteColumn(columnId);
  applyAndNotify(unwrap(result));
}

export async function createCard(input: CreateCardInput): Promise<void> {
  const result = await window.irisAPI.kanban.createCard(input);
  applyAndNotify(unwrap(result));
}

export async function createCardAndReturn(input: CreateCardInput): Promise<KanbanCard | null> {
  const result = await window.irisAPI.kanban.createCard(input);
  const nextBoard = unwrap(result);
  applyAndNotify(nextBoard);
  return nextBoard.cards[nextBoard.cards.length - 1] ?? null;
}

export async function updateCard(input: UpdateCardInput): Promise<void> {
  const result = await window.irisAPI.kanban.updateCard(input);
  applyAndNotify(unwrap(result));
}

export async function deleteCard(cardId: string): Promise<void> {
  const result = await window.irisAPI.kanban.deleteCard(cardId);
  applyAndNotify(unwrap(result));
}

export async function moveCard(input: MoveCardInput): Promise<void> {
  const result = await window.irisAPI.kanban.moveCard(input);
  applyAndNotify(unwrap(result));
}
