import { ipcMain } from 'electron';
import { AJUSTES_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { AjustesInfo, ModuloInicial } from '../../shared/types/ajustes.types';
import * as ajustesService from '../modules/ajustes/ajustes.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerAjustesIpc(): void {
  ipcMain.handle(AJUSTES_CHANNELS.getAjustes, () => toResult<AjustesInfo>(ajustesService.getAjustes()));

  ipcMain.handle(AJUSTES_CHANNELS.setModuloInicial, (_event, modulo: ModuloInicial) =>
    toResult<AjustesInfo>(ajustesService.setModuloInicial(modulo)),
  );
}
