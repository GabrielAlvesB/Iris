import { BrowserWindow, app, dialog, ipcMain, shell, type SaveDialogOptions } from 'electron';
import path from 'node:path';
import { NUVEM_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EstadoNuvem, ExtracaoGerada, ResultadoSync, TesteNuvem } from '../../shared/types/nuvem.types';
import * as nuvemService from '../modules/nuvem/nuvem.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** O último arquivo gerado: "Mostrar na pasta" não recebe caminho da tela. */
let ultimaExtracao: string | null = null;

/** null = cancelado. O destino vem só deste diálogo. */
async function gerarExtracao(janela: BrowserWindow | null, dialeto: unknown): Promise<ExtracaoGerada | null> {
  if (!nuvemService.ehDialeto(dialeto)) throw new Error('Escolha o tipo de banco de dados.');
  const opcoes: SaveDialogOptions = {
    title: 'Salvar o arquivo para o banco de dados',
    defaultPath: path.join(app.getPath('documents'), nuvemService.nomeDaExtracao(dialeto)),
    filters: [{ name: 'SQL', extensions: ['sql'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return null;
  const gerada = await nuvemService.gerarExtracao(dialeto, escolha.filePath);
  ultimaExtracao = gerada.arquivo;
  // Só o nome volta para a tela: o caminho inteiro fica aqui.
  return { ...gerada, arquivo: path.basename(gerada.arquivo) };
}

export function registerNuvemIpc(): void {
  ipcMain.handle(NUVEM_CHANNELS.getEstado, () => toResult<EstadoNuvem>(nuvemService.getEstado()));

  ipcMain.handle(NUVEM_CHANNELS.salvarIdentidade, (_event, entrada: unknown) => toResult<EstadoNuvem>(nuvemService.salvarIdentidade(entrada)));

  ipcMain.handle(NUVEM_CHANNELS.gerarExtracao, (event, dialeto: unknown) =>
    toResult<ExtracaoGerada | null>(gerarExtracao(BrowserWindow.fromWebContents(event.sender), dialeto)),
  );

  ipcMain.handle(NUVEM_CHANNELS.salvarSupabase, (_event, entrada: unknown) => toResult<EstadoNuvem>(nuvemService.salvarSupabase(entrada)));

  ipcMain.handle(NUVEM_CHANNELS.testar, () => toResult<TesteNuvem>(nuvemService.testar()));

  ipcMain.handle(NUVEM_CHANNELS.criarTabelas, (_event, token: unknown) => toResult<TesteNuvem>(nuvemService.criarTabelas(token)));

  ipcMain.handle(NUVEM_CHANNELS.entrar, (_event, modo: unknown) => toResult<ResultadoSync>(nuvemService.entrar(modo)));

  ipcMain.handle(NUVEM_CHANNELS.sincronizar, () => toResult<ResultadoSync>(nuvemService.sincronizarAgora()));

  ipcMain.handle(NUVEM_CHANNELS.desconectar, () => toResult<EstadoNuvem>(nuvemService.desconectar()));

  ipcMain.handle(NUVEM_CHANNELS.definirPrincipal, (_event, valor: unknown) => toResult<EstadoNuvem>(nuvemService.definirPrincipal(valor)));

  ipcMain.handle(NUVEM_CHANNELS.mostrarExtracao, () =>
    toResult<void>(
      Promise.resolve().then(() => {
        if (!ultimaExtracao) throw new Error('Gere o arquivo primeiro.');
        shell.showItemInFolder(ultimaExtracao);
      }),
    ),
  );
}
