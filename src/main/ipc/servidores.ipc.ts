import { BrowserWindow, dialog, ipcMain } from 'electron';
import { SERVIDORES_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  AbrirTerminalInput,
  AtualizarServidorInput,
  EscreverTerminalInput,
  RedimensionarTerminalInput,
  ResultadoTesteServidor,
  SessaoTerminal,
  TestarConexaoInput,
  ConfigHealthInput,
  CriarServidorHttpInput,
  CriarServidorSshInput,
  RemoverComandoInput,
  RodarComandoInput,
  SalvarComandoInput,
  ServidoresFile,
} from '../../shared/types/servidores.types';
import * as servidoresService from '../modules/servidores/servidores.service';
import * as terminal from '../modules/servidores/servidores.terminal';
import { reaplicarAgendamentos } from '../core/backgroundServices';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

async function escolherChave(event: Electron.IpcMainInvokeEvent): Promise<string> {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const opcoes: Electron.OpenDialogOptions = {
    title: 'Escolher chave privada',
    properties: ['openFile', 'showHiddenFiles'],
    filters: [
      { name: 'Chaves', extensions: ['pem', 'key', 'ppk'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  };

  const resultado = janela
    ? await dialog.showOpenDialog(janela, opcoes)
    : await dialog.showOpenDialog(opcoes);

  if (resultado.canceled || resultado.filePaths.length === 0) return '';
  return resultado.filePaths[0] as string;
}

export function registerServidoresIpc(): void {
  ipcMain.handle(SERVIDORES_CHANNELS.getState, () =>
    toResult<ServidoresFile>(servidoresService.getState()),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.criarHttp, (_event, input: CriarServidorHttpInput) =>
    toResult<ServidoresFile>(servidoresService.criarHttp(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.criarSsh, (_event, input: CriarServidorSshInput) =>
    toResult<ServidoresFile>(servidoresService.criarSsh(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.atualizar, (_event, input: AtualizarServidorInput) =>
    toResult<ServidoresFile>(servidoresService.atualizar(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.remover, (_event, servidorId: string) =>
    toResult<ServidoresFile>(servidoresService.remover(servidorId)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.checarAgora, (_event, servidorId: string) =>
    toResult<ServidoresFile>(servidoresService.checarAgora(servidorId)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.checarTodos, () =>
    toResult<ServidoresFile>(servidoresService.checarTodos()),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.salvarComando, (_event, input: SalvarComandoInput) =>
    toResult<ServidoresFile>(servidoresService.salvarComando(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.removerComando, (_event, input: RemoverComandoInput) =>
    toResult<ServidoresFile>(servidoresService.removerComando(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.rodarComando, (_event, input: RodarComandoInput) =>
    toResult<void>(servidoresService.rodarComando(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.configHealth, (_event, input: ConfigHealthInput) =>
    toResult<ServidoresFile>(
      servidoresService.configHealth(input).then((file) => {
        reaplicarAgendamentos();
        return file;
      }),
    ),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.escolherChave, (event) =>
    toResult<string>(escolherChave(event)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.testarConexao, (_event, input: TestarConexaoInput) =>
    toResult<ResultadoTesteServidor>(servidoresService.testarConexao(input)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.confiarHost, (_event, servidorId: string) =>
    toResult<ServidoresFile>(servidoresService.confiarHost(servidorId)),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.abrirTerminal, (_event, input: AbrirTerminalInput) =>
    toResult<SessaoTerminal>(servidoresService.abrirTerminal(input)),
  );

  // Teclas e redimensionamento chegam muitas vezes por segundo: síncronos, sem Promise a mais.
  ipcMain.handle(SERVIDORES_CHANNELS.escreverTerminal, (_event, input: EscreverTerminalInput) =>
    toResult<void>(Promise.resolve().then(() => terminal.escreverTerminal(input.sessaoId, input.dados))),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.redimensionarTerminal, (_event, input: RedimensionarTerminalInput) =>
    toResult<void>(Promise.resolve().then(() => terminal.redimensionarTerminal(input.sessaoId, input.cols, input.rows))),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.fecharTerminal, (_event, sessaoId: string) =>
    toResult<void>(Promise.resolve().then(() => terminal.fecharTerminal(sessaoId))),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.listarSessoes, () =>
    toResult<SessaoTerminal[]>(Promise.resolve().then(() => terminal.listarSessoes())),
  );

  ipcMain.handle(SERVIDORES_CHANNELS.lerBufferTerminal, (_event, sessaoId: string) =>
    toResult<string>(Promise.resolve().then(() => terminal.lerBuffer(sessaoId))),
  );
}
