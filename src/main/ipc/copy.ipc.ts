import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COPY_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { CopyFile, CreateSnippetInput, ImportTxtResult, UpdateSnippetInput } from '../../shared/types/copy.types';
import * as copyService from '../modules/copy/copy.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function importTxt(senderWindow: BrowserWindow | null): Promise<ImportTxtResult> {
  const options: OpenDialogOptions = {
    title: 'Importar texto (.txt)',
    properties: ['openFile'],
    filters: [{ name: 'Texto', extensions: ['txt'] }],
  };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const content = readFileSync(filePath, 'utf-8');
  return { canceled: false, fileName: path.basename(filePath, path.extname(filePath)), content };
}

export function registerCopyIpc(): void {
  ipcMain.handle(COPY_CHANNELS.getSnippets, () => toResult<CopyFile>(copyService.getSnippets()));

  ipcMain.handle(COPY_CHANNELS.createSnippet, (_event, input: CreateSnippetInput) =>
    toResult<CopyFile>(copyService.createSnippet(input)),
  );

  ipcMain.handle(COPY_CHANNELS.updateSnippet, (_event, input: UpdateSnippetInput) =>
    toResult<CopyFile>(copyService.updateSnippet(input)),
  );

  ipcMain.handle(COPY_CHANNELS.deleteSnippet, (_event, snippetId: string) =>
    toResult<CopyFile>(copyService.deleteSnippet(snippetId)),
  );

  ipcMain.handle(COPY_CHANNELS.importTxt, (event) =>
    toResult<ImportTxtResult>(importTxt(BrowserWindow.fromWebContents(event.sender))),
  );
}
