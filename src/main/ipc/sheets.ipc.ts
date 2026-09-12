import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { SHEETS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  AddColumnInput,
  CommitImportInput,
  CommitImportResult,
  CreateRowInput,
  CreateTableInput,
  DeleteColumnInput,
  DeleteRowInput,
  DetectImportResult,
  RenameTableInput,
  SheetsFile,
  UpdateColumnInput,
  UpdateRowInput,
  UpdateTableVisibilityInput,
} from '../../shared/types/sheets.types';
import * as sheetsService from '../modules/sheets/sheets.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function detectImport(senderWindow: BrowserWindow | null): Promise<DetectImportResult | null> {
  const options: OpenDialogOptions = {
    title: 'Importar planilha',
    properties: ['openFile'],
    filters: [{ name: 'Planilhas', extensions: ['csv', 'xlsx', 'xls', 'ods'] }],
  };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return sheetsService.detectImport(result.filePaths[0]);
}

export function registerSheetsIpc(): void {
  ipcMain.handle(SHEETS_CHANNELS.getFile, () => toResult<SheetsFile>(sheetsService.getFile()));

  ipcMain.handle(SHEETS_CHANNELS.detectImport, (event) =>
    toResult<DetectImportResult | null>(detectImport(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(SHEETS_CHANNELS.commitImport, (_event, input: CommitImportInput) =>
    toResult<CommitImportResult>(sheetsService.commitImport(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.createTable, (_event, input: CreateTableInput) =>
    toResult<SheetsFile>(sheetsService.createTable(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.renameTable, (_event, input: RenameTableInput) =>
    toResult<SheetsFile>(sheetsService.renameTable(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.setTableVisibility, (_event, input: UpdateTableVisibilityInput) =>
    toResult<SheetsFile>(sheetsService.setTableVisibility(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.addColumn, (_event, input: AddColumnInput) =>
    toResult<SheetsFile>(sheetsService.addColumn(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.updateColumn, (_event, input: UpdateColumnInput) =>
    toResult<SheetsFile>(sheetsService.updateColumn(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.deleteColumn, (_event, input: DeleteColumnInput) =>
    toResult<SheetsFile>(sheetsService.deleteColumn(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.createRow, (_event, input: CreateRowInput) =>
    toResult<SheetsFile>(sheetsService.createRow(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.updateRow, (_event, input: UpdateRowInput) =>
    toResult<SheetsFile>(sheetsService.updateRow(input)),
  );

  ipcMain.handle(SHEETS_CHANNELS.deleteRow, (_event, input: DeleteRowInput) =>
    toResult<SheetsFile>(sheetsService.deleteRow(input)),
  );
}
