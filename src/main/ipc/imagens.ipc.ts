import { ipcMain } from 'electron';
import { IMAGENS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  ArquivarImagemInput,
  AtualizarImagemInput,
  CriarImagemInput,
  ImagensFile,
  MoverImagemInput,
} from '../../shared/types/imagens.types';
import * as imagensService from '../modules/imagens/imagens.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerImagensIpc(): void {
  ipcMain.handle(IMAGENS_CHANNELS.getFile, () => toResult<ImagensFile>(imagensService.getFile()));

  ipcMain.handle(IMAGENS_CHANNELS.criarImagem, (_event, input: CriarImagemInput) =>
    toResult<ImagensFile>(imagensService.criarImagem(input)),
  );

  ipcMain.handle(IMAGENS_CHANNELS.atualizarImagem, (_event, input: AtualizarImagemInput) =>
    toResult<ImagensFile>(imagensService.atualizarImagem(input)),
  );

  ipcMain.handle(IMAGENS_CHANNELS.moverImagem, (_event, input: MoverImagemInput) =>
    toResult<ImagensFile>(imagensService.moverImagem(input)),
  );

  ipcMain.handle(IMAGENS_CHANNELS.arquivarImagem, (_event, input: ArquivarImagemInput) =>
    toResult<ImagensFile>(imagensService.arquivarImagem(input)),
  );

  ipcMain.handle(IMAGENS_CHANNELS.restaurarImagem, (_event, imagemId: string) =>
    toResult<ImagensFile>(imagensService.restaurarImagem(imagemId)),
  );

  ipcMain.handle(IMAGENS_CHANNELS.excluirImagem, (_event, imagemId: string) =>
    toResult<ImagensFile>(imagensService.excluirImagem(imagemId)),
  );
}
