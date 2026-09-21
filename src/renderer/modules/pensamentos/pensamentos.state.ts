import type { IpcResult } from '../../../shared/types/common.types';
import type {
  CreatePensamentoInput,
  MarcarPromovidoInput,
  PensamentosFile,
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

export async function createPensamento(input: CreatePensamentoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.createPensamento(input)));
}

export async function updatePensamento(input: UpdatePensamentoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.updatePensamento(input)));
}

export async function deletePensamento(pensamentoId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.deletePensamento(pensamentoId)));
}

export async function togglePin(pensamentoId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.togglePin(pensamentoId)));
}

export async function marcarPromovido(input: MarcarPromovidoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.pensamentos.marcarPromovido(input)));
}
