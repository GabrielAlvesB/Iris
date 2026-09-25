import { ipcMain } from 'electron';
import { PENSAMENTOS_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  CreatePensamentoInput,
  MoverPensamentoInput,
  PensamentosFile,
  PensamentosViewport,
  UpdatePensamentoInput,
} from '../../shared/types/pensamentos.types';
import * as pensamentosService from '../modules/pensamentos/pensamentos.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerPensamentosIpc(): void {
  ipcMain.handle(PENSAMENTOS_CHANNELS.getPensamentos, () =>
    toResult<PensamentosFile>(pensamentosService.getPensamentos()),
  );

  ipcMain.handle(PENSAMENTOS_CHANNELS.createPensamento, (_event, input: CreatePensamentoInput) =>
    toResult<PensamentosFile>(pensamentosService.createPensamento(input)),
  );

  ipcMain.handle(PENSAMENTOS_CHANNELS.updatePensamento, (_event, input: UpdatePensamentoInput) =>
    toResult<PensamentosFile>(pensamentosService.updatePensamento(input)),
  );

  ipcMain.handle(PENSAMENTOS_CHANNELS.moverPensamento, (_event, input: MoverPensamentoInput) =>
    toResult<PensamentosFile>(pensamentosService.moverPensamento(input)),
  );

  ipcMain.handle(PENSAMENTOS_CHANNELS.deletePensamento, (_event, pensamentoId: string) =>
    toResult<PensamentosFile>(pensamentosService.deletePensamento(pensamentoId)),
  );

  ipcMain.handle(PENSAMENTOS_CHANNELS.togglePin, (_event, pensamentoId: string) =>
    toResult<PensamentosFile>(pensamentosService.togglePin(pensamentoId)),
  );

  ipcMain.handle(PENSAMENTOS_CHANNELS.setViewport, (_event, viewport: PensamentosViewport) =>
    toResult<PensamentosFile>(pensamentosService.setViewport(viewport)),
  );
}
