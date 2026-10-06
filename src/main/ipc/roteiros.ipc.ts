import { ipcMain } from 'electron';
import { ROTEIROS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  AprovarRoteiroInput,
  AtualizarRoteiroInput,
  CriarAdaptacaoInput,
  CriarAdaptacaoResult,
  CriarRoteiroInput,
  MudarStatusRoteiroInput,
  RestaurarVersaoInput,
  RoteirosFile,
  SalvarVersaoInput,
} from '../../shared/types/roteiros.types';
import * as roteirosService from '../modules/roteiros/roteiros.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerRoteirosIpc(): void {
  ipcMain.handle(ROTEIROS_CHANNELS.getFile, () => toResult<RoteirosFile>(roteirosService.getFile()));

  ipcMain.handle(ROTEIROS_CHANNELS.criarRoteiro, (_event, input: CriarRoteiroInput) =>
    toResult<RoteirosFile>(roteirosService.criarRoteiro(input)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.atualizarRoteiro, (_event, input: AtualizarRoteiroInput) =>
    toResult<RoteirosFile>(roteirosService.atualizarRoteiro(input)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.mudarStatus, (_event, input: MudarStatusRoteiroInput) =>
    toResult<RoteirosFile>(roteirosService.mudarStatus(input)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.aprovarRoteiro, (_event, input: AprovarRoteiroInput) =>
    toResult<RoteirosFile>(roteirosService.aprovarRoteiro(input)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.excluirRoteiro, (_event, roteiroId: string) =>
    toResult<RoteirosFile>(roteirosService.excluirRoteiro(roteiroId)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.duplicarRoteiro, (_event, roteiroId: string) =>
    toResult<RoteirosFile>(roteirosService.duplicarRoteiro(roteiroId)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.salvarChecklistPadrao, (_event, itens: string[]) =>
    toResult<RoteirosFile>(roteirosService.salvarChecklistPadrao(itens)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.salvarVersao, (_event, input: SalvarVersaoInput) =>
    toResult<RoteirosFile>(roteirosService.salvarVersao(input)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.restaurarVersao, (_event, input: RestaurarVersaoInput) =>
    toResult<RoteirosFile>(roteirosService.restaurarVersao(input)),
  );

  ipcMain.handle(ROTEIROS_CHANNELS.criarAdaptacao, (_event, input: CriarAdaptacaoInput) =>
    toResult<CriarAdaptacaoResult>(roteirosService.criarAdaptacao(input)),
  );
}
