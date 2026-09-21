import type { IpcResult } from '../../../shared/types/common.types';
import type {
  DefinirVinculoInput,
  DispararWorkflowInput,
  DispararWorkflowResult,
  N8nConfig,
  N8nSnapshot,
  SalvarN8nConfigInput,
} from '../../../shared/types/n8n.types';
import { createPushBinding } from '../../core/pushBinding.js';

export interface N8nViewState {
  config: N8nConfig;
  snapshot: N8nSnapshot;
}

type Listener = (state: N8nViewState) => void;

let state: N8nViewState | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: N8nViewState): void {
  state = next;
  listener?.(state);
}

/**
 * O polling roda no processo principal mesmo com o módulo fechado; enquanto a
 * tela está montada, o snapshot novo chega por push em vez de precisar de
 * consulta repetida daqui.
 */
const push = createPushBinding([
  () =>
    window.irisAPI.events.on('n8n:snapshot', (snapshot) => {
      if (!state) return;
      applyAndNotify({ ...state, snapshot });
    }),
]);

export function onStateChange(cb: Listener): void {
  listener = cb;
  push.attach();
}

export function offStateChange(): void {
  listener = null;
  push.detach();
  state = null;
}

export function getCurrentState(): N8nViewState | null {
  return state;
}

export async function load(): Promise<void> {
  const config = unwrap(await window.irisAPI.n8n.getConfig());
  const snapshot = unwrap(await window.irisAPI.n8n.getSnapshot());
  applyAndNotify({ config, snapshot });
}

export async function salvarConfig(input: SalvarN8nConfigInput): Promise<void> {
  const config = unwrap(await window.irisAPI.n8n.salvarConfig(input));
  if (state) applyAndNotify({ ...state, config });
}

export async function atualizarAgora(): Promise<void> {
  // O push de 'n8n:snapshot' é quem entrega o resultado.
  unwrap(await window.irisAPI.n8n.atualizarAgora());
}

export async function testarConexao(): Promise<string> {
  return unwrap(await window.irisAPI.n8n.testarConexao());
}

export async function alternarAtivo(workflowId: string, ativar: boolean): Promise<void> {
  const snapshot = unwrap(await window.irisAPI.n8n.alternarAtivo({ workflowId, ativar }));
  if (state) applyAndNotify({ ...state, snapshot });
}

export async function dispararWorkflow(input: DispararWorkflowInput): Promise<DispararWorkflowResult> {
  return unwrap(await window.irisAPI.n8n.dispararWorkflow(input));
}

export async function definirVinculo(input: DefinirVinculoInput): Promise<void> {
  unwrap(await window.irisAPI.n8n.definirVinculo(input));
}

export async function abrirExecucao(execucaoId: string): Promise<void> {
  unwrap(await window.irisAPI.n8n.abrirExecucao(execucaoId));
}
