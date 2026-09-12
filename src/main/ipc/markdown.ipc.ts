import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import fs from 'node:fs';
import { MARKDOWN_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { FileOpResult } from '../../shared/types/export.types';
import type {
  CreateMarkdownInput,
  ExportMarkdownPdfInput,
  LinkMarkdownToCardInput,
  MarkdownConfig,
  MarkdownFileMeta,
  OpenMarkdownFileResult,
  WriteMarkdownInput,
} from '../../shared/types/markdown.types';
import * as markdownService from '../modules/markdown/markdown.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function chooseFolder(senderWindow: BrowserWindow | null): Promise<MarkdownConfig> {
  const options: OpenDialogOptions = { title: 'Escolher pasta de markdown', properties: ['openDirectory'] };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return markdownService.getConfig();
  }
  return markdownService.setLinkedFolder(result.filePaths[0]);
}

async function openFile(senderWindow: BrowserWindow | null): Promise<OpenMarkdownFileResult> {
  const options: OpenDialogOptions = {
    title: 'Abrir arquivo markdown',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  };
  const result = senderWindow ? await dialog.showOpenDialog(senderWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const config = await markdownService.registerOpenedFile(filePath);
  return { canceled: false, path: filePath, config };
}

async function exportPdf(senderWindow: BrowserWindow | null, input: ExportMarkdownPdfInput): Promise<FileOpResult> {
  const options = {
    title: 'Exportar PDF',
    defaultPath: `${input.suggestedName || 'documento'}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const saveResult = senderWindow ? await dialog.showSaveDialog(senderWindow, options) : await dialog.showSaveDialog(options);
  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const hiddenWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    const wrapped = `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; padding: 32px; line-height: 1.6; }
      h1,h2,h3 { font-family: inherit; }
      pre { background: #f4f5f7; padding: 10px; border-radius: 6px; overflow-x: auto; }
      code { background: #f4f5f7; padding: 1px 4px; border-radius: 3px; }
      table { border-collapse: collapse; }
      td, th { border: 1px solid #ccc; padding: 6px 10px; }
      blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 12px; color: #555; }
    </style></head><body>${input.html}</body></html>`;

    await hiddenWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wrapped)}`);
    const pdfBuffer = await hiddenWindow.webContents.printToPDF({});
    fs.writeFileSync(saveResult.filePath, pdfBuffer);
    return { canceled: false, filePath: saveResult.filePath };
  } finally {
    hiddenWindow.destroy();
  }
}

export function registerMarkdownIpc(): void {
  ipcMain.handle(MARKDOWN_CHANNELS.getConfig, () => toResult<MarkdownConfig>(markdownService.getConfig()));

  ipcMain.handle(MARKDOWN_CHANNELS.chooseFolder, (event) =>
    toResult<MarkdownConfig>(chooseFolder(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(MARKDOWN_CHANNELS.openFile, (event) =>
    toResult<OpenMarkdownFileResult>(openFile(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(MARKDOWN_CHANNELS.listFiles, () => toResult<MarkdownConfig>(markdownService.getConfig()));

  ipcMain.handle(MARKDOWN_CHANNELS.readFile, (_event, filePath: string) =>
    toResult<string>(markdownService.readFile(filePath)),
  );

  ipcMain.handle(MARKDOWN_CHANNELS.writeFile, (_event, input: WriteMarkdownInput) =>
    toResult<void>(markdownService.writeFile(input.path, input.content)),
  );

  ipcMain.handle(MARKDOWN_CHANNELS.createFile, (_event, input: CreateMarkdownInput) =>
    toResult<MarkdownFileMeta>(markdownService.createFile(input.name, input.target)),
  );

  ipcMain.handle(MARKDOWN_CHANNELS.linkFileToCard, (_event, input: LinkMarkdownToCardInput) =>
    toResult<void>(markdownService.linkFileToCard(input.path, input.cardId)),
  );

  ipcMain.handle(MARKDOWN_CHANNELS.exportPdf, (event, input: ExportMarkdownPdfInput) =>
    toResult<FileOpResult>(exportPdf(BrowserWindow.fromWebContents(event.sender), input)),
  );
}
