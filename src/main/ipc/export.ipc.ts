import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import fs from 'node:fs';
import { EXPORT_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { FileOpResult } from '../../shared/types/export.types';
import * as exportService from '../modules/export/export.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function saveTextFile(
  senderWindow: BrowserWindow | null,
  options: SaveDialogOptions,
  content: string,
): Promise<FileOpResult> {
  const result = senderWindow ? await dialog.showSaveDialog(senderWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return { canceled: false, filePath: result.filePath };
}

async function exportAll(senderWindow: BrowserWindow | null): Promise<FileOpResult> {
  const bundle = await exportService.buildExportBundle();
  return saveTextFile(
    senderWindow,
    {
      title: 'Exportar todos os dados do Iris',
      defaultPath: `iris-export-${dateStamp()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    },
    JSON.stringify(bundle, null, 2),
  );
}

async function exportAgendaCsv(senderWindow: BrowserWindow | null): Promise<FileOpResult> {
  const csv = await exportService.buildAgendaCsv();
  return saveTextFile(
    senderWindow,
    {
      title: 'Exportar Agenda (CSV)',
      defaultPath: `iris-agenda-${dateStamp()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    },
    csv,
  );
}

async function exportArquivosCsv(senderWindow: BrowserWindow | null): Promise<FileOpResult> {
  const csv = await exportService.buildArquivosCsv();
  return saveTextFile(
    senderWindow,
    {
      title: 'Exportar Arquivos (CSV)',
      defaultPath: `iris-arquivos-${dateStamp()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    },
    csv,
  );
}

async function importAll(senderWindow: BrowserWindow | null): Promise<FileOpResult> {
  const options: OpenDialogOptions = {
    title: 'Importar dados do Iris',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  await exportService.restoreFromBundle(raw);
  return { canceled: false, filePath };
}

export function registerExportIpc(): void {
  ipcMain.handle(EXPORT_CHANNELS.exportAll, (event) =>
    toResult<FileOpResult>(exportAll(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(EXPORT_CHANNELS.importAll, (event) =>
    toResult<FileOpResult>(importAll(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(EXPORT_CHANNELS.exportAgendaCsv, (event) =>
    toResult<FileOpResult>(exportAgendaCsv(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(EXPORT_CHANNELS.exportArquivosCsv, (event) =>
    toResult<FileOpResult>(exportArquivosCsv(BrowserWindow.fromWebContents(event.sender))),
  );
}
