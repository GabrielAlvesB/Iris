import { ipcMain, shell } from 'electron';
import { CANVAS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { CanvasFile, ExportarImagemCanvasInput, ViewportCanvas } from '../../shared/types/canvas.types';
import * as canvasService from '../modules/canvas/canvas.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

/** Caminhos exportados nesta sessão: "Mostrar na pasta" só abre o que o próprio diálogo devolveu. */
const exportados = new Set<string>();

export function registerCanvasIpc(): void {
  ipcMain.handle(CANVAS_CHANNELS.getFile, () => toResult<CanvasFile>(canvasService.getFile()));
  ipcMain.handle(CANVAS_CHANNELS.criarQuadro, (_e, nome: string) => toResult<CanvasFile>(canvasService.criarQuadro(String(nome ?? ''))));
  ipcMain.handle(CANVAS_CHANNELS.renomearQuadro, (_e, input: { quadroId: string; nome: string }) => toResult<CanvasFile>(canvasService.renomearQuadro(input)));
  ipcMain.handle(CANVAS_CHANNELS.duplicarQuadro, (_e, quadroId: string) => toResult<CanvasFile>(canvasService.duplicarQuadro(quadroId)));
  ipcMain.handle(CANVAS_CHANNELS.excluirQuadro, (_e, quadroId: string) => toResult<CanvasFile>(canvasService.excluirQuadro(quadroId)));
  ipcMain.handle(CANVAS_CHANNELS.escolherQuadro, (_e, quadroId: string) => toResult<CanvasFile>(canvasService.escolherQuadro(quadroId)));
  ipcMain.handle(CANVAS_CHANNELS.salvarQuadro, (_e, quadro: unknown) => toResult<CanvasFile>(canvasService.salvarQuadro(quadro)));
  ipcMain.handle(CANVAS_CHANNELS.salvarViewport, (_e, input: { quadroId: string; viewport: ViewportCanvas }) =>
    toResult<CanvasFile>(canvasService.salvarViewport(input)),
  );
  ipcMain.handle(CANVAS_CHANNELS.exportarImagem, (event, input: ExportarImagemCanvasInput) =>
    toResult<string | null>(
      canvasService.exportarImagem(event, input).then((caminho) => {
        if (caminho) exportados.add(caminho);
        return caminho;
      }),
    ),
  );
  ipcMain.handle(CANVAS_CHANNELS.mostrarExportado, (_e, caminho: string) =>
    toResult<void>(
      Promise.resolve().then(() => {
        if (exportados.has(caminho)) shell.showItemInFolder(caminho);
      }),
    ),
  );
}
