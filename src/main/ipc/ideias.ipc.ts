import { ipcMain } from 'electron';
import { IDEIAS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { AtualizarIdeiaInput, IdeiasFile, ResultadoVirarPostagem } from '../../shared/types/ideias.types';
import * as ideiasService from '../modules/ideias/ideias.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerIdeiasIpc(): void {
  ipcMain.handle(IDEIAS_CHANNELS.getFile, () => toResult<IdeiasFile>(ideiasService.getFile()));
  ipcMain.handle(IDEIAS_CHANNELS.criar, (_event, entrada: unknown) => toResult<IdeiasFile>(ideiasService.criar(entrada)));
  ipcMain.handle(IDEIAS_CHANNELS.atualizar, (_event, input: AtualizarIdeiaInput) => toResult<IdeiasFile>(ideiasService.atualizar(input)));
  ipcMain.handle(IDEIAS_CHANNELS.excluir, (_event, id: string) => toResult<IdeiasFile>(ideiasService.excluir(id)));
  ipcMain.handle(IDEIAS_CHANNELS.virarPostagem, (_event, id: unknown, tipo: unknown) => toResult<ResultadoVirarPostagem>(ideiasService.virarPostagem(id, tipo)));
}
