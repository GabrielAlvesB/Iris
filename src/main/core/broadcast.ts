import { BrowserWindow } from 'electron';
import { PUSH_CHANNEL } from '../../shared/ipcChannels';
import type { IrisEvent, IrisEventPayload, IrisEventTopic } from '../../shared/types/events.types';

/**
 * Envia um evento para todas as janelas vivas.
 *
 * Nunca lança: um broadcast com falha não pode derrubar um watcher, um health
 * check ou o agendador que o chamou.
 */
export function broadcast<T extends IrisEventTopic>(topic: T, payload: IrisEventPayload<T>): void {
  const evento = { topic, payload } as IrisEvent;

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    const contents = win.webContents;
    if (contents.isDestroyed() || contents.isCrashed()) continue;
    try {
      contents.send(PUSH_CHANNEL, evento);
    } catch (error) {
      console.error(`[broadcast] falha ao enviar "${topic}"`, error);
    }
  }
}

/**
 * Erros de tarefas de fundo não têm um IpcResult onde falhar — sem isto, uma
 * falha de watcher ou de polling ficaria invisível para o usuário.
 */
export function broadcastErro(escopo: string, error: unknown): void {
  broadcast('app:erro', {
    escopo,
    mensagem: error instanceof Error ? error.message : String(error),
  });
}
