import type { IpcResult } from '../../../shared/types/common.types';
import type {
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  MoverInput,
  RenomearInput,
} from '../../../shared/types/explorador.types';
import { createPushBinding } from '../../core/pushBinding.js';

export interface ExploradorViewState {
  raizes: ExploradorFile;
  raizAtivaId: string | null;
  listagem: ExploradorListagem | null;
  erro: string | null;
}

type Listener = (state: ExploradorViewState) => void;

let state: ExploradorViewState = {
  raizes: { schemaVersion: 1, updatedAt: '', raizes: [] },
  raizAtivaId: null,
  listagem: null,
  erro: null,
};
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function notify(): void {
  listener?.(state);
}

function aplicar(parcial: Partial<ExploradorViewState>): void {
  state = { ...state, ...parcial };
  notify();
}

/**
 * O watcher do main avisa quais pastas mudaram; só re-listamos se a pasta
 * aberta estiver entre elas, porque re-listar um diretório é barato mas
 * redesenhar a tela à toa não é.
 */
const push = createPushBinding([
  () =>
    window.irisAPI.events.on('explorador:mudou', ({ raizId, pastasAfetadas }) => {
      if (!state.listagem || state.raizAtivaId !== raizId) return;
      const aberta = state.listagem.relativo;
      if (pastasAfetadas.includes(aberta) || pastasAfetadas.includes('')) {
        void recarregar();
      }
    }),
  () =>
    window.irisAPI.events.on('app:erro', ({ escopo, mensagem }) => {
      if (escopo === 'explorador') aplicar({ erro: mensagem });
    }),
]);

export function onStateChange(cb: Listener): void {
  listener = cb;
  push.attach();
}

export function offStateChange(): void {
  listener = null;
  push.detach();
}

export function getCurrentState(): ExploradorViewState {
  return state;
}

export async function carregarRaizes(): Promise<void> {
  const raizes = unwrap(await window.irisAPI.explorador.getRaizes());
  const primeira = raizes.raizes[0];
  const aindaExiste = raizes.raizes.some((r) => r.id === state.raizAtivaId);
  const raizAtivaId = aindaExiste ? state.raizAtivaId : (primeira?.id ?? null);

  aplicar({ raizes, raizAtivaId });
  if (raizAtivaId) await abrirDiretorio(raizAtivaId, '');
  else aplicar({ listagem: null });
}

export async function abrirDiretorio(raizId: string, relativo: string): Promise<void> {
  try {
    const listagem = unwrap(await window.irisAPI.explorador.listarDiretorio({ raizId, relativo }));
    aplicar({ raizAtivaId: raizId, listagem, erro: null });
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
  }
}

export async function recarregar(): Promise<void> {
  if (!state.raizAtivaId || !state.listagem) return;
  await abrirDiretorio(state.raizAtivaId, state.listagem.relativo);
}

export async function adicionarRaiz(): Promise<void> {
  const raizes = unwrap(await window.irisAPI.explorador.adicionarRaiz());
  aplicar({ raizes });

  // Foca a pasta recém-adicionada, que é sempre a última da lista.
  const nova = raizes.raizes[raizes.raizes.length - 1];
  if (nova) await abrirDiretorio(nova.id, '');
}

export async function removerRaiz(raizId: string): Promise<void> {
  const raizes = unwrap(await window.irisAPI.explorador.removerRaiz(raizId));
  const proxima = raizes.raizes[0];
  aplicar({ raizes, raizAtivaId: proxima?.id ?? null, listagem: null });
  if (proxima) await abrirDiretorio(proxima.id, '');
}

async function aplicarOperacao(operacao: Promise<IpcResult<ExploradorListagem>>): Promise<void> {
  try {
    const listagem = unwrap(await operacao);
    aplicar({ listagem, erro: null });
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
  }
}

export async function criar(input: CriarInput): Promise<void> {
  await aplicarOperacao(window.irisAPI.explorador.criar(input));
}

export async function renomear(input: RenomearInput): Promise<void> {
  await aplicarOperacao(window.irisAPI.explorador.renomear(input));
}

export async function mover(input: MoverInput): Promise<void> {
  await aplicarOperacao(window.irisAPI.explorador.mover(input));
}

export async function excluir(input: ExcluirInput): Promise<void> {
  await aplicarOperacao(window.irisAPI.explorador.excluir(input));
}

export async function revelarNoSistema(caminho: string): Promise<void> {
  unwrap(await window.irisAPI.explorador.revelarNoSistema(caminho));
}

export async function abrirNoSistema(caminho: string): Promise<void> {
  unwrap(await window.irisAPI.explorador.abrirNoSistema(caminho));
}

export function limparErro(): void {
  if (state.erro) aplicar({ erro: null });
}
