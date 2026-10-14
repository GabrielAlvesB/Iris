import { ipcMain } from 'electron';
import { BUSCA_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { ItemBusca } from '../../shared/types/busca.types';
import * as buscaService from '../modules/busca/busca.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerBuscaIpc(): void {
  ipcMain.handle(BUSCA_CHANNELS.indice, () => toResult<ItemBusca[]>(buscaService.montarIndice()));
}
