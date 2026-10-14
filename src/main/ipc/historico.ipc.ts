import { ipcMain } from 'electron';
import { HISTORICO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EntradaHistorico } from '../../shared/types/historico.types';
import * as historicoService from '../modules/historico/historico.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerHistoricoIpc(): void {
  ipcMain.handle(HISTORICO_CHANNELS.listar, () => toResult<EntradaHistorico[]>(Promise.resolve().then(() => historicoService.listar())));

  ipcMain.handle(HISTORICO_CHANNELS.desfazer, (_event, id: unknown) => toResult<EntradaHistorico>(historicoService.desfazer(id)));

  ipcMain.handle(HISTORICO_CHANNELS.desfazerUltima, () => toResult<EntradaHistorico>(historicoService.desfazerUltima()));

  ipcMain.handle(HISTORICO_CHANNELS.limpar, () => toResult<void>(Promise.resolve().then(() => historicoService.limpar())));
}
