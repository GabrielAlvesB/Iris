import type { IpcResult } from '../../../shared/types/common.types';
import type { CanvasFile, QuadroCanvas, ViewportCanvas } from '../../../shared/types/canvas.types';

/**
 * Cache do canvas.json. As ações de quadro (criar, renomear, trocar) notificam a
 * tela, que redesenha; salvar o quadro e o viewport atualiza o cache **em
 * silêncio** — quem está desenhando já tem o quadro na mão e não pode perder o gesto.
 */

type Listener = (file: CanvasFile) => void;

let file: CanvasFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(r: IpcResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

function aplicar(novo: CanvasFile): void {
  file = novo;
  listener?.(novo);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
  file = null;
}

export function getCurrentState(): CanvasFile | null {
  return file;
}

export async function load(): Promise<void> {
  aplicar(unwrap(await window.irisAPI.canvas.getFile()));
}

export async function criarQuadro(nome: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.canvas.criarQuadro(nome)));
}

export async function renomearQuadro(quadroId: string, nome: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.canvas.renomearQuadro({ quadroId, nome })));
}

export async function duplicarQuadro(quadroId: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.canvas.duplicarQuadro(quadroId)));
}

export async function excluirQuadro(quadroId: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.canvas.excluirQuadro(quadroId)));
}

export async function escolherQuadro(quadroId: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.canvas.escolherQuadro(quadroId)));
}

/** Silencioso: o palco já está com o quadro editado. */
export async function salvarQuadro(quadro: QuadroCanvas): Promise<void> {
  file = unwrap(await window.irisAPI.canvas.salvarQuadro(quadro));
}

export async function salvarViewport(quadroId: string, viewport: ViewportCanvas): Promise<void> {
  file = unwrap(await window.irisAPI.canvas.salvarViewport({ quadroId, viewport }));
}
