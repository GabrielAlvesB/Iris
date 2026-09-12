import { ipcMain } from 'electron';
import { KANBAN_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  CreateCardInput,
  CreateColumnInput,
  KanbanBoard,
  MoveCardInput,
  RenameColumnInput,
  ReorderColumnsInput,
  UpdateCardInput,
} from '../../shared/types/kanban.types';
import * as kanbanService from '../modules/kanban/kanban.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerKanbanIpc(): void {
  ipcMain.handle(KANBAN_CHANNELS.getBoard, () => toResult<KanbanBoard>(kanbanService.getBoard()));

  ipcMain.handle(KANBAN_CHANNELS.createColumn, (_event, input: CreateColumnInput) =>
    toResult<KanbanBoard>(kanbanService.createColumn(input)),
  );

  ipcMain.handle(KANBAN_CHANNELS.renameColumn, (_event, input: RenameColumnInput) =>
    toResult<KanbanBoard>(kanbanService.renameColumn(input)),
  );

  ipcMain.handle(KANBAN_CHANNELS.reorderColumns, (_event, input: ReorderColumnsInput) =>
    toResult<KanbanBoard>(kanbanService.reorderColumns(input)),
  );

  ipcMain.handle(KANBAN_CHANNELS.deleteColumn, (_event, columnId: string) =>
    toResult<KanbanBoard>(kanbanService.deleteColumn(columnId)),
  );

  ipcMain.handle(KANBAN_CHANNELS.createCard, (_event, input: CreateCardInput) =>
    toResult<KanbanBoard>(kanbanService.createCard(input)),
  );

  ipcMain.handle(KANBAN_CHANNELS.updateCard, (_event, input: UpdateCardInput) =>
    toResult<KanbanBoard>(kanbanService.updateCard(input)),
  );

  ipcMain.handle(KANBAN_CHANNELS.deleteCard, (_event, cardId: string) =>
    toResult<KanbanBoard>(kanbanService.deleteCard(cardId)),
  );

  ipcMain.handle(KANBAN_CHANNELS.moveCard, (_event, input: MoveCardInput) =>
    toResult<KanbanBoard>(kanbanService.moveCard(input)),
  );
}
