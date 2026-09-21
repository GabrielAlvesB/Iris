import { BrowserWindow, dialog, ipcMain } from 'electron';
import { GITHUB_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  GithubConfig,
  GithubSnapshot,
  SalvarGithubConfigInput,
} from '../../shared/types/github.types';
import * as githubService from '../modules/github/github.service';
import { reaplicarAgendamentos } from '../core/backgroundServices';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function escolherPasta(event: Electron.IpcMainInvokeEvent): Promise<GithubConfig> {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const opcoes: Electron.OpenDialogOptions = {
    title: 'Escolher pasta de projetos',
    properties: ['openDirectory'],
  };

  const resultado = janela
    ? await dialog.showOpenDialog(janela, opcoes)
    : await dialog.showOpenDialog(opcoes);

  if (resultado.canceled || resultado.filePaths.length === 0) {
    return githubService.getConfig();
  }
  return githubService.adicionarPasta(resultado.filePaths[0] as string);
}

export function registerGithubIpc(): void {
  ipcMain.handle(GITHUB_CHANNELS.getConfig, () => toResult<GithubConfig>(githubService.getConfig()));

  ipcMain.handle(GITHUB_CHANNELS.salvarConfig, (_event, input: SalvarGithubConfigInput) =>
    toResult<GithubConfig>(
      githubService.salvarConfig(input).then((config) => {
        reaplicarAgendamentos();
        return config;
      }),
    ),
  );

  ipcMain.handle(GITHUB_CHANNELS.getSnapshot, () =>
    toResult<GithubSnapshot>(githubService.getSnapshot()),
  );

  ipcMain.handle(GITHUB_CHANNELS.atualizarAgora, () => toResult<void>(githubService.pollOnce()));

  ipcMain.handle(GITHUB_CHANNELS.testarConexao, () => toResult<string>(githubService.testarConexao()));

  ipcMain.handle(GITHUB_CHANNELS.adicionarPasta, (event) => toResult<GithubConfig>(escolherPasta(event)));

  ipcMain.handle(GITHUB_CHANNELS.removerPasta, (_event, pastaId: string) =>
    toResult<GithubConfig>(githubService.removerPasta(pastaId)),
  );

  ipcMain.handle(GITHUB_CHANNELS.abrirRepo, (_event, url: string) =>
    toResult<void>(githubService.abrirRepo(url)),
  );
}
