import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AtualizarRecursoInput,
  BibliotecaInfo,
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  MoverInput,
  RenomearInput,
  ResultadoBusca,
  SalvarColecaoInput,
} from '../../../shared/types/explorador.types';
import { createPushBinding } from '../../core/pushBinding.js';

export interface ExploradorViewState {
  raizes: ExploradorFile;
  raizAtivaId: string | null;
  listagem: ExploradorListagem | null;
  erro: string | null;
  biblioteca: BibliotecaInfo | null;
  busca: ResultadoBusca | null;
  buscando: boolean;
}

type Listener = (state: ExploradorViewState) => void;

let state: ExploradorViewState = {
  raizes: { schemaVersion: 2, updatedAt: '', raizes: [], colecoes: [], recursos: [], recentes: [] },
  raizAtivaId: null,
  listagem: null,
  erro: null,
  biblioteca: null,
  busca: null,
  buscando: false,
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
  try {
    unwrap(await window.irisAPI.explorador.abrirNoSistema(caminho));
    // Abrir entra nos Recentes; recarrega para a aba refletir.
    if (state.biblioteca) await carregarBiblioteca();
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
  }
}

// ---------- Biblioteca ----------

/** Entrada do módulo: pastas e Biblioteca juntas, porque as abas dependem das duas. */
export async function carregarTudo(): Promise<void> {
  await Promise.all([carregarRaizes(), carregarBiblioteca()]);
}

export async function carregarBiblioteca(): Promise<void> {
  try {
    aplicar({ biblioteca: unwrap(await window.irisAPI.explorador.getBiblioteca()) });
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
  }
}

async function aplicarBiblioteca(operacao: Promise<IpcResult<BibliotecaInfo>>): Promise<void> {
  try {
    aplicar({ biblioteca: unwrap(await operacao), erro: null });
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
  }
}

/** Devolve quantos entraram; a view avisa quando algo foi recusado. */
export async function adicionarRecurso(caminho: string, colecaoId?: string): Promise<boolean> {
  try {
    const resultado = unwrap(await window.irisAPI.explorador.adicionarRecurso({ caminho, colecaoId }));
    aplicar({ biblioteca: resultado.biblioteca, erro: null });
    return true;
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export async function adicionarPorDialogo(colecaoId?: string): Promise<void> {
  try {
    const resultado = unwrap(await window.irisAPI.explorador.adicionarRecursosPorDialogo(colecaoId));
    aplicar({
      biblioteca: resultado.biblioteca,
      erro: resultado.recusados.length
        ? `${resultado.recusados.length} item(ns) ficaram de fora por não estarem numa pasta monitorada. Monitore a pasta deles primeiro (aba Pastas).`
        : null,
    });
  } catch (error) {
    aplicar({ erro: error instanceof Error ? error.message : String(error) });
  }
}

export async function atualizarRecurso(input: AtualizarRecursoInput): Promise<void> {
  await aplicarBiblioteca(window.irisAPI.explorador.atualizarRecurso(input));
}

export async function removerRecurso(recursoId: string): Promise<void> {
  await aplicarBiblioteca(window.irisAPI.explorador.removerRecurso(recursoId));
}

export async function salvarColecao(input: SalvarColecaoInput): Promise<void> {
  await aplicarBiblioteca(window.irisAPI.explorador.salvarColecao(input));
}

export async function excluirColecao(colecaoId: string): Promise<void> {
  await aplicarBiblioteca(window.irisAPI.explorador.excluirColecao(colecaoId));
}

export async function limparRecentes(): Promise<void> {
  await aplicarBiblioteca(window.irisAPI.explorador.limparRecentes());
}

export async function buscar(termo: string): Promise<void> {
  if (termo.trim().length < 2) {
    aplicar({ busca: null, buscando: false });
    return;
  }
  aplicar({ buscando: true });
  try {
    const resultado = unwrap(await window.irisAPI.explorador.buscar({ termo }));
    // Uma busca mais nova já começou; a resposta dela é que vale.
    if (resultado.obsoleta) return;
    aplicar({ busca: resultado, buscando: false });
  } catch (error) {
    aplicar({ buscando: false, erro: error instanceof Error ? error.message : String(error) });
  }
}

export function limparErro(): void {
  if (state.erro) aplicar({ erro: null });
}
