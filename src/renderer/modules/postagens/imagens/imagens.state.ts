import type { IpcResult } from '../../../../shared/types/common.types';
import type {
  ArquivarImagemInput,
  AtualizarImagemInput,
  CriarImagemInput,
  ImagensFile,
  MoverImagemInput,
} from '../../../../shared/types/imagens.types';

type Listener = (state: ImagensFile) => void;

let state: ImagensFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: ImagensFile): ImagensFile {
  state = next;
  listener?.(state);
  return next;
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): ImagensFile | null {
  return state;
}

export async function load(): Promise<ImagensFile> {
  return applyAndNotify(unwrap(await window.irisAPI.imagens.getFile()));
}

export async function criarImagem(input: CriarImagemInput): Promise<ImagensFile> {
  return applyAndNotify(unwrap(await window.irisAPI.imagens.criarImagem(input)));
}

export async function atualizarImagem(input: AtualizarImagemInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.imagens.atualizarImagem(input)));
}

export async function moverImagem(input: MoverImagemInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.imagens.moverImagem(input)));
}

export async function arquivarImagem(input: ArquivarImagemInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.imagens.arquivarImagem(input)));
}

export async function restaurarImagem(imagemId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.imagens.restaurarImagem(imagemId)));
}

export async function excluirImagem(imagemId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.imagens.excluirImagem(imagemId)));
}
