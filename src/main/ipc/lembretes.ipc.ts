import { ipcMain } from 'electron';
import { LEMBRETES_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EstadoLembretes } from '../../shared/types/lembretes.types';
import * as lembretesService from '../modules/lembretes/lembretes.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerLembretesIpc(): void {
  ipcMain.handle(LEMBRETES_CHANNELS.getEstado, () => toResult<EstadoLembretes>(Promise.resolve().then(() => lembretesService.getEstado())));

  ipcMain.handle(LEMBRETES_CHANNELS.salvarConfig, (_event, config: unknown) => toResult<EstadoLembretes>(lembretesService.salvarConfig(config)));

  ipcMain.handle(LEMBRETES_CHANNELS.testar, () => toResult<void>(Promise.resolve().then(() => lembretesService.testar())));
}
