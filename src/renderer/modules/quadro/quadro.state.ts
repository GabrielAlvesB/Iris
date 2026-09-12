import type {
  CreateBlockInput,
  CreateConnectionInput,
  MoveBlockInput,
  QuadroFile,
  QuadroViewport,
  UpdateBlockInput,
} from '../../../shared/types/quadro.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (state: QuadroFile) => void;

let state: QuadroFile | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<QuadroFile>): QuadroFile {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: QuadroFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function getCurrentState(): QuadroFile | null {
  return state;
}

export async function loadState(): Promise<void> {
  const result = await window.irisAPI.quadro.getState();
  applyAndNotify(unwrap(result));
}

export async function createBlock(input: CreateBlockInput): Promise<void> {
  const result = await window.irisAPI.quadro.createBlock(input);
  applyAndNotify(unwrap(result));
}

export async function updateBlock(input: UpdateBlockInput): Promise<void> {
  const result = await window.irisAPI.quadro.updateBlock(input);
  applyAndNotify(unwrap(result));
}

export async function moveBlock(input: MoveBlockInput): Promise<void> {
  const result = await window.irisAPI.quadro.moveBlock(input);
  applyAndNotify(unwrap(result));
}

export async function deleteBlock(blockId: string): Promise<void> {
  const result = await window.irisAPI.quadro.deleteBlock(blockId);
  applyAndNotify(unwrap(result));
}

export async function createConnection(input: CreateConnectionInput): Promise<void> {
  const result = await window.irisAPI.quadro.createConnection(input);
  applyAndNotify(unwrap(result));
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const result = await window.irisAPI.quadro.deleteConnection(connectionId);
  applyAndNotify(unwrap(result));
}

export async function updateViewport(viewport: QuadroViewport): Promise<void> {
  const result = await window.irisAPI.quadro.updateViewport(viewport);
  applyAndNotify(unwrap(result));
}
