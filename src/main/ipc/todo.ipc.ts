import { ipcMain } from 'electron';
import { TODO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  AdicionarItensInput,
  ArquivarChecklistInput,
  AtualizarChecklistInput,
  AtualizarItemInput,
  CriarChecklistInput,
  EnviarAoKanbanInput,
  MarcarTodosInput,
  RemoverItemInput,
  ReordenarItensInput,
  TodoFile,
} from '../../shared/types/todo.types';
import * as todoService from '../modules/todo/todo.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerTodoIpc(): void {
  ipcMain.handle(TODO_CHANNELS.getFile, () => toResult<TodoFile>(todoService.getFile()));
  ipcMain.handle(TODO_CHANNELS.criarChecklist, (_event, input: CriarChecklistInput) =>
    toResult<TodoFile>(todoService.criarChecklist(input)),
  );
  ipcMain.handle(TODO_CHANNELS.atualizarChecklist, (_event, input: AtualizarChecklistInput) =>
    toResult<TodoFile>(todoService.atualizarChecklist(input)),
  );
  ipcMain.handle(TODO_CHANNELS.excluirChecklist, (_event, checklistId: string) =>
    toResult<TodoFile>(todoService.excluirChecklist(checklistId)),
  );
  ipcMain.handle(TODO_CHANNELS.duplicarChecklist, (_event, checklistId: string) =>
    toResult<TodoFile>(todoService.duplicarChecklist(checklistId)),
  );
  ipcMain.handle(TODO_CHANNELS.arquivarChecklist, (_event, input: ArquivarChecklistInput) =>
    toResult<TodoFile>(todoService.arquivarChecklist(input)),
  );
  ipcMain.handle(TODO_CHANNELS.reordenarChecklists, (_event, checklistIds: string[]) =>
    toResult<TodoFile>(todoService.reordenarChecklists(checklistIds)),
  );
  ipcMain.handle(TODO_CHANNELS.adicionarItens, (_event, input: AdicionarItensInput) =>
    toResult<TodoFile>(todoService.adicionarItens(input)),
  );
  ipcMain.handle(TODO_CHANNELS.atualizarItem, (_event, input: AtualizarItemInput) =>
    toResult<TodoFile>(todoService.atualizarItem(input)),
  );
  ipcMain.handle(TODO_CHANNELS.removerItem, (_event, input: RemoverItemInput) =>
    toResult<TodoFile>(todoService.removerItem(input)),
  );
  ipcMain.handle(TODO_CHANNELS.reordenarItens, (_event, input: ReordenarItensInput) =>
    toResult<TodoFile>(todoService.reordenarItens(input)),
  );
  ipcMain.handle(TODO_CHANNELS.marcarTodos, (_event, input: MarcarTodosInput) =>
    toResult<TodoFile>(todoService.marcarTodos(input)),
  );
  ipcMain.handle(TODO_CHANNELS.limparConcluidos, (_event, checklistId: string) =>
    toResult<TodoFile>(todoService.limparConcluidos(checklistId)),
  );
  ipcMain.handle(TODO_CHANNELS.enviarAoKanban, (_event, input: EnviarAoKanbanInput) =>
    toResult<TodoFile>(todoService.enviarAoKanban(input)),
  );
}
