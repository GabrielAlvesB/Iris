import type { IpcResult } from '../../../shared/types/common.types';
import type {
  CreatePensamentoInput,
  MoverPensamentoInput,
  PensamentosFile,
  PensamentosViewport,
  UpdatePensamentoInput,
} from '../../../shared/types/pensamentos.types';

type Listener = (state: PensamentosFile) => void;

let state: PensamentosFile | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<PensamentosFile>): PensamentosFile {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: PensamentosFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): PensamentosFile | null {
  return state;
}

export async function loadPensamentos(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.getPensamentos()));
}

/** Devolve o id do post-it criado, para a tela já abri-lo em edição. */
export async function createPensamento(input: CreatePensamentoInput): Promise<string | null> {
  const antes = new Set((state?.pensamentos ?? []).map((p) => p.id));
  const next = unwrap(await window.irisAPI.pensamentos.createPensamento(input));
  const novo = next.pensamentos.find((p) => !antes.has(p.id));
  applyAndNotify(next);
  return novo?.id ?? null;
}

export async function updatePensamento(input: UpdatePensamentoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.updatePensamento(input)));
}

export async function moverPensamento(input: MoverPensamentoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.moverPensamento(input)));
}

export async function deletePensamento(pensamentoId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.deletePensamento(pensamentoId)));
}

export async function togglePin(pensamentoId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.togglePin(pensamentoId)));
}

/**
 * Só atualiza o cache, sem notificar: a tela já está no enquadramento novo, e
 * redesenhar a cada pan/zoom derrubaria uma edição em andamento.
 */
export async function setViewport(viewport: PensamentosViewport): Promise<void> {
  state = unwrap(await window.irisAPI.pensamentos.setViewport(viewport));
}
