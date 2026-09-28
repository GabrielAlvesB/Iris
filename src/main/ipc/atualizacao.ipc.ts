import { BrowserWindow, ipcMain } from 'electron';
import { ATUALIZACAO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EstadoAtualizacao, InstaladorLocal, VersaoPublicada } from '../../shared/types/atualizacao.types';
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

  ipcMain.handle(ATUALIZACAO_CHANNELS.listarVersoes, () => toResult<VersaoPublicada[]>(atualizacaoService.listarVersoes()));

  ipcMain.handle(ATUALIZACAO_CHANNELS.instalarVersao, (_event, versao: string) =>
    toResult<EstadoAtualizacao>(atualizacaoService.instalarVersao(versao)),
  );

  ipcMain.handle(ATUALIZACAO_CHANNELS.escolherInstalador, (event) =>
    toResult<InstaladorLocal | null>(atualizacaoService.escolherInstalador(BrowserWindow.fromWebContents(event.sender))),
  );

  ipcMain.handle(ATUALIZACAO_CHANNELS.instalarArquivo, () => toResult<EstadoAtualizacao>(atualizacaoService.instalarArquivo()));
}
