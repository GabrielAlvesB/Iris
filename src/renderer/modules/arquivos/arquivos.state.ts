import type { ArquivosFile, LinkFileToCardInput, UpdateNoteInput } from '../../../shared/types/arquivos.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (state: ArquivosFile) => void;

let state: ArquivosFile | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<ArquivosFile>): ArquivosFile {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: ArquivosFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function getCurrentState(): ArquivosFile | null {
  return state;
}

export async function loadItems(): Promise<void> {
  const result = await window.irisAPI.arquivos.getItems();
  applyAndNotify(unwrap(result));
}

export async function importFiles(): Promise<void> {
  const result = await window.irisAPI.arquivos.importFiles();
  applyAndNotify(unwrap(result));
}

export async function toggleDone(itemId: string): Promise<void> {
  const result = await window.irisAPI.arquivos.toggleDone(itemId);
  applyAndNotify(unwrap(result));
}

export async function toggleVerified(itemId: string): Promise<void> {
  const result = await window.irisAPI.arquivos.toggleVerified(itemId);
  applyAndNotify(unwrap(result));
}

export async function updateNote(input: UpdateNoteInput): Promise<void> {
  const result = await window.irisAPI.arquivos.updateNote(input);
  applyAndNotify(unwrap(result));
}

export async function deleteItem(itemId: string): Promise<void> {
  const result = await window.irisAPI.arquivos.deleteItem(itemId);
  applyAndNotify(unwrap(result));
}

export async function linkFileToCard(input: LinkFileToCardInput): Promise<void> {
  const result = await window.irisAPI.arquivos.linkFileToCard(input);
  applyAndNotify(unwrap(result));
}
