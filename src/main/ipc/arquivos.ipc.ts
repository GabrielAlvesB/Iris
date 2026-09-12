import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { statSync } from 'node:fs';
import path from 'node:path';
import { ARQUIVOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { ArquivosFile, LinkFileToCardInput, UpdateNoteInput } from '../../shared/types/arquivos.types';
import * as arquivosService from '../modules/arquivos/arquivos.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function importFiles(senderWindow: BrowserWindow | null): Promise<ArquivosFile> {
  const options: OpenDialogOptions = {
    title: 'Importar arquivos',
    properties: ['openFile', 'multiSelections'],
  };
  const result = senderWindow
    ? await dialog.showOpenDialog(senderWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return arquivosService.getItems();
  }

  // Only the file name and size are captured; the full path and file contents are never read or stored.
  const entries = result.filePaths.map((filePath) => {
    let size: number | undefined;
    try {
      size = statSync(filePath).size;
    } catch {
      size = undefined;
    }
    return { fileName: path.basename(filePath), size };
  });
  return arquivosService.addFiles(entries);
}

export function registerArquivosIpc(): void {
  ipcMain.handle(ARQUIVOS_CHANNELS.getItems, () => toResult<ArquivosFile>(arquivosService.getItems()));

  ipcMain.handle(ARQUIVOS_CHANNELS.importFiles, (event) =>
    toResult<ArquivosFile>(importFiles(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(ARQUIVOS_CHANNELS.toggleDone, (_event, itemId: string) =>
    toResult<ArquivosFile>(arquivosService.toggleDone(itemId)),
  );

  ipcMain.handle(ARQUIVOS_CHANNELS.toggleVerified, (_event, itemId: string) =>
    toResult<ArquivosFile>(arquivosService.toggleVerified(itemId)),
  );

  ipcMain.handle(ARQUIVOS_CHANNELS.updateNote, (_event, input: UpdateNoteInput) =>
    toResult<ArquivosFile>(arquivosService.updateNote(input)),
  );

  ipcMain.handle(ARQUIVOS_CHANNELS.deleteItem, (_event, itemId: string) =>
    toResult<ArquivosFile>(arquivosService.deleteItem(itemId)),
  );

  ipcMain.handle(ARQUIVOS_CHANNELS.linkFileToCard, (_event, input: LinkFileToCardInput) =>
    toResult<ArquivosFile>(arquivosService.linkFileToCard(input)),
  );
}
