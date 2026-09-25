import { ipcMain } from 'electron';
import { ATUALIZACAO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EstadoAtualizacao } from '../../shared/types/atualizacao.types';
import * as atualizacaoService from '../modules/atualizacao/atualizacao.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerAtualizacaoIpc(): void {
  ipcMain.handle(ATUALIZACAO_CHANNELS.getEstado, () =>
    toResult<EstadoAtualizacao>(Promise.resolve(atualizacaoService.getEstado())),
  );

  ipcMain.handle(ATUALIZACAO_CHANNELS.verificar, () => toResult<EstadoAtualizacao>(atualizacaoService.verificar()));

  ipcMain.handle(ATUALIZACAO_CHANNELS.atualizar, () => toResult<EstadoAtualizacao>(atualizacaoService.atualizar()));

  ipcMain.handle(ATUALIZACAO_CHANNELS.abrirPagina, () => toResult<void>(atualizacaoService.abrirPagina()));
}
