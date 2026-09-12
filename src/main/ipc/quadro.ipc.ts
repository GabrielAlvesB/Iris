import { ipcMain } from 'electron';
import { QUADRO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  CreateBlockInput,
  CreateConnectionInput,
  MoveBlockInput,
  QuadroFile,
  QuadroViewport,
  UpdateBlockInput,
} from '../../shared/types/quadro.types';
import * as quadroService from '../modules/quadro/quadro.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerQuadroIpc(): void {
  ipcMain.handle(QUADRO_CHANNELS.getState, () => toResult<QuadroFile>(quadroService.getState()));

  ipcMain.handle(QUADRO_CHANNELS.createBlock, (_event, input: CreateBlockInput) =>
    toResult<QuadroFile>(quadroService.createBlock(input)),
  );

  ipcMain.handle(QUADRO_CHANNELS.updateBlock, (_event, input: UpdateBlockInput) =>
    toResult<QuadroFile>(quadroService.updateBlock(input)),
  );

  ipcMain.handle(QUADRO_CHANNELS.moveBlock, (_event, input: MoveBlockInput) =>
    toResult<QuadroFile>(quadroService.moveBlock(input)),
  );

  ipcMain.handle(QUADRO_CHANNELS.deleteBlock, (_event, blockId: string) =>
    toResult<QuadroFile>(quadroService.deleteBlock(blockId)),
  );

  ipcMain.handle(QUADRO_CHANNELS.createConnection, (_event, input: CreateConnectionInput) =>
    toResult<QuadroFile>(quadroService.createConnection(input)),
  );

  ipcMain.handle(QUADRO_CHANNELS.deleteConnection, (_event, connectionId: string) =>
    toResult<QuadroFile>(quadroService.deleteConnection(connectionId)),
  );

  ipcMain.handle(QUADRO_CHANNELS.updateViewport, (_event, viewport: QuadroViewport) =>
    toResult<QuadroFile>(quadroService.updateViewport(viewport)),
  );
}
