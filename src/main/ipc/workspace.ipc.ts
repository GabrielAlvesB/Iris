import { ipcMain } from 'electron';
import { WORKSPACE_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EstadoWorkspace, PedidoInstalar, VersaoAnterior } from '../../shared/types/workspace.types';
import * as workspaceService from '../modules/workspace/workspace.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle(WORKSPACE_CHANNELS.getEstado, () => toResult<EstadoWorkspace>(workspaceService.getEstado()));

  ipcMain.handle(WORKSPACE_CHANNELS.verificar, (_event, appId?: string) =>
    toResult<EstadoWorkspace>(workspaceService.verificar(appId)),
  );

  ipcMain.handle(WORKSPACE_CHANNELS.instalar, (_event, pedido: PedidoInstalar) =>
    toResult<EstadoWorkspace>(workspaceService.instalar(pedido)),
  );

  ipcMain.handle(WORKSPACE_CHANNELS.cancelar, (_event, appId: string) =>
    toResult<EstadoWorkspace>(Promise.resolve().then(() => workspaceService.cancelar(appId))),
  );

  ipcMain.handle(WORKSPACE_CHANNELS.abrir, (_event, appId: string) => toResult<void>(workspaceService.abrir(appId)));

  ipcMain.handle(WORKSPACE_CHANNELS.mostrarNaPasta, (_event, appId: string) =>
    toResult<void>(workspaceService.mostrarNaPasta(appId)),
  );

  ipcMain.handle(WORKSPACE_CHANNELS.abrirPagina, (_event, appId: string, versao?: string) =>
    toResult<void>(workspaceService.abrirPagina(appId, versao)),
  );

  ipcMain.handle(WORKSPACE_CHANNELS.listarVersoes, (_event, appId: string) =>
    toResult<VersaoAnterior[]>(workspaceService.listarVersoes(appId)),
  );

  ipcMain.handle(WORKSPACE_CHANNELS.desinstalar, (_event, appId: string) =>
    toResult<EstadoWorkspace>(workspaceService.desinstalar(appId)),
  );
}
