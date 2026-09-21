import { ipcMain } from 'electron';
import { N8N_CHANNELS } from '../../shared/ipcChannels';
import type { IpcResult } from '../../shared/types/common.types';
import type {
  DefinirVinculoInput,
  DispararWorkflowInput,
  DispararWorkflowResult,
  N8nConfig,
  N8nFile,
  N8nSnapshot,
  SalvarN8nConfigInput,
} from '../../shared/types/n8n.types';
import * as n8nService from '../modules/n8n/n8n.service';
import { reaplicarAgendamentos } from '../core/backgroundServices';

function toResult<T>(promise: Promise<T>): Promise<IpcResult<T>> {
  return promise
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((error: unknown): IpcResult<T> => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}

export function registerN8nIpc(): void {
  ipcMain.handle(N8N_CHANNELS.getConfig, () => toResult<N8nConfig>(n8nService.getConfig()));

  ipcMain.handle(N8N_CHANNELS.salvarConfig, (_event, input: SalvarN8nConfigInput) =>
    toResult<N8nConfig>(
      n8nService.salvarConfig(input).then((config) => {
        // Mudou intervalo ou ativou o polling: reflete sem reiniciar o app.
        reaplicarAgendamentos();
        return config;
      }),
    ),
  );

  ipcMain.handle(N8N_CHANNELS.getSnapshot, () => toResult<N8nSnapshot>(n8nService.getSnapshot()));

  ipcMain.handle(N8N_CHANNELS.atualizarAgora, () =>
    toResult<void>(n8nService.pollOnce()),
  );

  ipcMain.handle(N8N_CHANNELS.testarConexao, () => toResult<string>(n8nService.testarConexao()));

  ipcMain.handle(N8N_CHANNELS.dispararWorkflow, (_event, input: DispararWorkflowInput) =>
    toResult<DispararWorkflowResult>(n8nService.dispararWorkflow(input)),
  );

  ipcMain.handle(N8N_CHANNELS.alternarAtivo, (_event, input: { workflowId: string; ativar: boolean }) =>
    toResult<N8nSnapshot>(n8nService.alternarAtivo(input.workflowId, input.ativar)),
  );

  ipcMain.handle(N8N_CHANNELS.definirVinculo, (_event, input: DefinirVinculoInput) =>
    toResult<N8nFile>(n8nService.definirVinculo(input)),
  );

  ipcMain.handle(N8N_CHANNELS.abrirExecucao, (_event, execucaoId: string) =>
    toResult<void>(n8nService.abrirExecucao(execucaoId)),
  );
}
