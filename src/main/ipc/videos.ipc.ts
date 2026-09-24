import { ipcMain } from 'electron';
import { VIDEOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  ArquivarVideoInput,
  AtualizarVideoInput,
  CriarVideoInput,
  ImportarDeSheetsInput,
  ImportarDeSheetsResult,
  MoverVideoInput,
  PreferenciasVideos,
  SalvarRedeInput,
  SalvarTagInput,
  VideosFile,
} from '../../shared/types/videos.types';
import * as videosService from '../modules/videos/videos.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerVideosIpc(): void {
  ipcMain.handle(VIDEOS_CHANNELS.getFile, () => toResult<VideosFile>(videosService.getFile()));

  ipcMain.handle(VIDEOS_CHANNELS.criarVideo, (_event, input: CriarVideoInput) =>
    toResult<VideosFile>(videosService.criarVideo(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.atualizarVideo, (_event, input: AtualizarVideoInput) =>
    toResult<VideosFile>(videosService.atualizarVideo(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.moverVideo, (_event, input: MoverVideoInput) =>
    toResult<VideosFile>(videosService.moverVideo(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.arquivarVideo, (_event, input: ArquivarVideoInput) =>
    toResult<VideosFile>(videosService.arquivarVideo(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.restaurarVideo, (_event, videoId: string) =>
    toResult<VideosFile>(videosService.restaurarVideo(videoId)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.excluirVideo, (_event, videoId: string) =>
    toResult<VideosFile>(videosService.excluirVideo(videoId)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.salvarTag, (_event, input: SalvarTagInput) =>
    toResult<VideosFile>(videosService.salvarTag(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.excluirTag, (_event, tagId: string) =>
    toResult<VideosFile>(videosService.excluirTag(tagId)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.salvarRede, (_event, input: SalvarRedeInput) =>
    toResult<VideosFile>(videosService.salvarRede(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.excluirRede, (_event, redeId: string) =>
    toResult<VideosFile>(videosService.excluirRede(redeId)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.importarDeSheets, (_event, input: ImportarDeSheetsInput) =>
    toResult<ImportarDeSheetsResult>(videosService.importarDeSheets(input)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.salvarPreferencias, (_event, preferencias: PreferenciasVideos) =>
    toResult<VideosFile>(videosService.salvarPreferencias(preferencias)),
  );

  ipcMain.handle(VIDEOS_CHANNELS.listarLinhasImportadas, (_event, tabelaId: string) =>
    toResult<string[]>(videosService.listarLinhasImportadas(tabelaId)),
  );
}
