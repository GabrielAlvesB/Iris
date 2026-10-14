import { ipcMain } from 'electron';
import { POMODORO_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type { EstadoPomodoro } from '../../shared/types/pomodoro.types';
import * as pomodoroService from '../modules/pomodoro/pomodoro.service';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerPomodoroIpc(): void {
  ipcMain.handle(POMODORO_CHANNELS.getEstado, () => toResult<EstadoPomodoro>(Promise.resolve().then(() => pomodoroService.getEstado())));
  ipcMain.handle(POMODORO_CHANNELS.iniciar, (_event, tarefa: unknown) => toResult<EstadoPomodoro>(pomodoroService.iniciar(tarefa)));
  ipcMain.handle(POMODORO_CHANNELS.pausarOuRetomar, () => toResult<EstadoPomodoro>(Promise.resolve().then(() => pomodoroService.pausarOuRetomar())));
  ipcMain.handle(POMODORO_CHANNELS.parar, () => toResult<EstadoPomodoro>(pomodoroService.parar()));
  ipcMain.handle(POMODORO_CHANNELS.salvarDuracoes, (_event, d: unknown) => toResult<EstadoPomodoro>(pomodoroService.salvarDuracoes(d)));
}
