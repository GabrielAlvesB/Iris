import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AprovarRoteiroInput,
  AtualizarRoteiroInput,
  CriarAdaptacaoInput,
  CriarRoteiroInput,
  MudarStatusRoteiroInput,
  RestaurarVersaoInput,
  RoteirosFile,
  SalvarVersaoInput,
} from '../../../shared/types/roteiros.types';

type Listener = (state: RoteirosFile) => void;

let state: RoteirosFile | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<RoteirosFile>): RoteirosFile {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: RoteirosFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): RoteirosFile | null {
  return state;
}

export async function load(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.getFile()));
}

/** Devolve o id do roteiro criado, para a tela já abri-lo. */
export async function criarRoteiro(input: CriarRoteiroInput): Promise<string | null> {
  const antes = new Set((state?.roteiros ?? []).map((r) => r.id));
  const next = unwrap(await window.irisAPI.roteiros.criarRoteiro(input));
  const novo = next.roteiros.find((r) => !antes.has(r.id));
  applyAndNotify(next);
  return novo?.id ?? null;
}

/**
 * Salvamento de texto digitado: atualiza o cache sem notificar, para o editor
 * aberto não ser redesenhado no meio da digitação.
 */
export async function atualizarSilencioso(input: AtualizarRoteiroInput): Promise<void> {
  state = unwrap(await window.irisAPI.roteiros.atualizarRoteiro(input));
}

export async function atualizarRoteiro(input: AtualizarRoteiroInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.atualizarRoteiro(input)));
}

export async function mudarStatus(input: MudarStatusRoteiroInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.mudarStatus(input)));
}

export async function aprovarRoteiro(input: AprovarRoteiroInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.aprovarRoteiro(input)));
}

export async function excluirRoteiro(roteiroId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.excluirRoteiro(roteiroId)));
}

export async function duplicarRoteiro(roteiroId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.duplicarRoteiro(roteiroId)));
}

export async function salvarChecklistPadrao(itens: string[]): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.salvarChecklistPadrao(itens)));
}

/** Versão guardada sem redesenhar o Estúdio (as cenas não mudam). */
export async function salvarVersao(input: SalvarVersaoInput): Promise<RoteirosFile> {
  state = unwrap(await window.irisAPI.roteiros.salvarVersao(input));
  return state;
}

export async function restaurarVersao(input: RestaurarVersaoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.roteiros.restaurarVersao(input)));
}

/** Devolve o id do roteiro novo (a adaptação), para o Estúdio abri-lo. */
export async function criarAdaptacao(input: CriarAdaptacaoInput): Promise<string> {
  const r = await window.irisAPI.roteiros.criarAdaptacao(input);
  if (!r.ok) throw new Error(r.error);
  applyAndNotify(r.data.file);
  return r.data.roteiroId;
}
