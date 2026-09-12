import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { AGENDA_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { AgendaFile, AgendaItemInput, ImportAgendaResult, UpdateAgendaItemInput } from '../../shared/types/agenda.types';
import * as agendaService from '../modules/agenda/agenda.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function importSpreadsheet(senderWindow: BrowserWindow | null): Promise<ImportAgendaResult> {
  const options: OpenDialogOptions = {
    title: 'Importar planilha de agendamentos',
    properties: ['openFile'],
    filters: [{ name: 'Planilhas', extensions: ['csv', 'xlsx', 'xls'] }],
  };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { file: await agendaService.getItems(), importedCount: 0 };
  }

  return agendaService.importFromFile(result.filePaths[0]);
}

export function registerAgendaIpc(): void {
  ipcMain.handle(AGENDA_CHANNELS.getItems, () => toResult<AgendaFile>(agendaService.getItems()));

  ipcMain.handle(AGENDA_CHANNELS.createItem, (_event, input: AgendaItemInput) =>
    toResult<AgendaFile>(agendaService.createItem(input)),
  );

  ipcMain.handle(AGENDA_CHANNELS.updateItem, (_event, input: UpdateAgendaItemInput) =>
    toResult<AgendaFile>(agendaService.updateItem(input)),
  );

  ipcMain.handle(AGENDA_CHANNELS.deleteItem, (_event, itemId: string) =>
    toResult<AgendaFile>(agendaService.deleteItem(itemId)),
  );

  ipcMain.handle(AGENDA_CHANNELS.importSpreadsheet, (event) =>
    toResult<ImportAgendaResult>(importSpreadsheet(BrowserWindow.fromWebContents(event.sender))),
  );
}
