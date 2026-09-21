import { BrowserWindow, dialog, ipcMain } from 'electron';
import { EXPLORADOR_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  ListarDiretorioInput,
  MoverInput,
  RenomearInput,
} from '../../shared/types/explorador.types';
import * as exploradorService from '../modules/explorador/explorador.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function escolherPasta(event: Electron.IpcMainInvokeEvent): Promise<ExploradorFile> {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const resultado = janela
    ? await dialog.showOpenDialog(janela, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });

  if (resultado.canceled || resultado.filePaths.length === 0) {
    return exploradorService.getRaizes();
  }
  return exploradorService.adicionarRaiz(resultado.filePaths[0] as string);
}

export function registerExploradorIpc(): void {
  ipcMain.handle(EXPLORADOR_CHANNELS.getRaizes, () =>
    toResult<ExploradorFile>(exploradorService.getRaizes()),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.adicionarRaiz, (event) =>
    toResult<ExploradorFile>(escolherPasta(event)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.removerRaiz, (_event, raizId: string) =>
    toResult<ExploradorFile>(exploradorService.removerRaiz(raizId)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.listarDiretorio, (_event, input: ListarDiretorioInput) =>
    toResult<ExploradorListagem>(exploradorService.listarDiretorio(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.criar, (_event, input: CriarInput) =>
    toResult<ExploradorListagem>(exploradorService.criar(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.renomear, (_event, input: RenomearInput) =>
    toResult<ExploradorListagem>(exploradorService.renomear(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.mover, (_event, input: MoverInput) =>
    toResult<ExploradorListagem>(exploradorService.mover(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.excluir, (_event, input: ExcluirInput) =>
    toResult<ExploradorListagem>(exploradorService.excluir(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.revelarNoSistema, (_event, caminho: string) =>
    toResult<void>(exploradorService.revelarNoSistema(caminho)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.abrirNoSistema, (_event, caminho: string) =>
    toResult<void>(exploradorService.abrirNoSistema(caminho)),
  );
}
