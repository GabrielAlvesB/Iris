import { ipcMain } from 'electron';
import { DOCUMENTOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import { abrirPdf } from '../core/pdf';

/**
 * O que vale para qualquer documento do app, não para um módulo: hoje, abrir
 * o PDF recém-exportado. Cada módulo exporta pelo seu canal (que sabe o título
 * do rodapé) com core/pdf.ts.
 */
function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}

export function registerDocumentosIpc(): void {
  ipcMain.handle(DOCUMENTOS_CHANNELS.abrirPdf, (_event, filePath: unknown) => toResult<void>(abrirPdf(filePath)));
}
