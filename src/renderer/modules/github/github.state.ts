import type { IpcResult } from '../../../shared/types/common.types';
import type {
  GithubConfig,
  GithubSnapshot,
  SalvarGithubConfigInput,
} from '../../../shared/types/github.types';
import { createPushBinding } from '../../core/pushBinding.js';

export interface GithubViewState {
  config: GithubConfig;
  snapshot: GithubSnapshot;
  carregando: boolean;
}

type Listener = (state: GithubViewState) => void;

let state: GithubViewState | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: GithubViewState): void {
  state = next;
  listener?.(state);
}

/** O poll roda no main mesmo com a tela fechada; aqui só recebemos o resultado. */
const push = createPushBinding([
  () =>
    window.irisAPI.events.on('github:snapshot', (snapshot) => {
      if (!state) return;
      applyAndNotify({ ...state, snapshot, carregando: false });
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

export function getCurrentState(): GithubViewState | null {
  return state;
}

export async function load(): Promise<void> {
  const config = unwrap(await window.irisAPI.github.getConfig());
  const snapshot = unwrap(await window.irisAPI.github.getSnapshot());
  applyAndNotify({ config, snapshot, carregando: false });
}

export async function atualizarAgora(): Promise<void> {
  if (state) applyAndNotify({ ...state, carregando: true });
  try {
    // O push de 'github:snapshot' é quem entrega o resultado.
    unwrap(await window.irisAPI.github.atualizarAgora());
  } catch (error) {
    if (state) applyAndNotify({ ...state, carregando: false });
    throw error;
  }
}

export async function salvarConfig(input: SalvarGithubConfigInput): Promise<void> {
  const config = unwrap(await window.irisAPI.github.salvarConfig(input));
  if (state) applyAndNotify({ ...state, config });
}

export async function testarConexao(): Promise<string> {
  return unwrap(await window.irisAPI.github.testarConexao());
}

export async function adicionarPasta(): Promise<void> {
  const config = unwrap(await window.irisAPI.github.adicionarPasta());
  if (state) applyAndNotify({ ...state, config });
}

export async function removerPasta(pastaId: string): Promise<void> {
  const config = unwrap(await window.irisAPI.github.removerPasta(pastaId));
  if (state) applyAndNotify({ ...state, config });
}

export async function abrirRepo(url: string): Promise<void> {
  unwrap(await window.irisAPI.github.abrirRepo(url));
}
