import { BrowserWindow, ipcMain } from 'electron';
import { ANEXOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { AnexoPostagem, EscolhaDeAnexos, InfoAnexo } from '../../shared/types/postagens.types';
import * as anexosService from '../modules/anexos/anexos.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerAnexosIpc(): void {
  ipcMain.handle(ANEXOS_CHANNELS.escolher, (event) =>
    toResult<EscolhaDeAnexos>(anexosService.escolherArquivos(BrowserWindow.fromWebContents(event.sender))),
  );
  ipcMain.handle(ANEXOS_CHANNELS.info, (_event, anexos: AnexoPostagem[]) => toResult<InfoAnexo[]>(anexosService.info(anexos)));
  ipcMain.handle(ANEXOS_CHANNELS.abrir, (_event, anexo: AnexoPostagem) => toResult<void>(anexosService.abrir(anexo)));
  ipcMain.handle(ANEXOS_CHANNELS.revelar, (_event, anexo: AnexoPostagem) => toResult<void>(anexosService.revelar(anexo)));
  ipcMain.handle(ANEXOS_CHANNELS.exportar, (event, anexo: AnexoPostagem) =>
    toResult<string | null>(anexosService.exportar(anexo, BrowserWindow.fromWebContents(event.sender))),
  );
}
