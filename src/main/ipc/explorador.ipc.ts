import { BrowserWindow, dialog, ipcMain } from 'electron';
import { EXPLORADOR_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  AdicionarRecursoInput,
  AdicionarRecursosResult,
  AtualizarRecursoInput,
  BibliotecaInfo,
  BuscarInput,
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  ListarDiretorioInput,
  MoverInput,
  RenomearInput,
  ResultadoBusca,
  SalvarColecaoInput,
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

/**
 * Seletor nativo de arquivos para a Biblioteca. Abre na primeira pasta
 * monitorada; o service recusa o que vier de fora delas.
 */
async function escolherRecursos(
  event: Electron.IpcMainInvokeEvent,
  colecaoId: string | undefined,
): Promise<AdicionarRecursosResult> {
  const { raizes } = await exploradorService.getRaizes();
  const janela = BrowserWindow.fromWebContents(event.sender);
  const opcoes: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    defaultPath: raizes[0]?.caminho,
  };
  const resultado = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);

  if (resultado.canceled || resultado.filePaths.length === 0) {
    return { biblioteca: await exploradorService.getBiblioteca(), adicionados: 0, recusados: [] };
  }
  return exploradorService.adicionarRecursos(resultado.filePaths, colecaoId);
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

  ipcMain.handle(EXPLORADOR_CHANNELS.getBiblioteca, () =>
    toResult<BibliotecaInfo>(exploradorService.getBiblioteca()),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.adicionarRecurso, (_event, input: AdicionarRecursoInput) =>
    toResult<AdicionarRecursosResult>(exploradorService.adicionarRecurso(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.adicionarRecursosPorDialogo, (event, colecaoId?: string) =>
    toResult<AdicionarRecursosResult>(escolherRecursos(event, colecaoId)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.atualizarRecurso, (_event, input: AtualizarRecursoInput) =>
    toResult<BibliotecaInfo>(exploradorService.atualizarRecurso(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.removerRecurso, (_event, recursoId: string) =>
    toResult<BibliotecaInfo>(exploradorService.removerRecurso(recursoId)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.salvarColecao, (_event, input: SalvarColecaoInput) =>
    toResult<BibliotecaInfo>(exploradorService.salvarColecao(input)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.excluirColecao, (_event, colecaoId: string) =>
    toResult<BibliotecaInfo>(exploradorService.excluirColecao(colecaoId)),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.limparRecentes, () =>
    toResult<BibliotecaInfo>(exploradorService.limparRecentes()),
  );

  ipcMain.handle(EXPLORADOR_CHANNELS.buscar, (_event, input: BuscarInput) =>
    toResult<ResultadoBusca>(exploradorService.buscar(input)),
  );
}
