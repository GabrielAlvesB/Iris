import type { CopyFile, CreateSnippetInput, ImportTxtResult, UpdateSnippetInput } from '../../../shared/types/copy.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (state: CopyFile) => void;

let state: CopyFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: CopyFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): CopyFile | null {
  return state;
}

export async function loadSnippets(): Promise<void> {
  const result = await window.irisAPI.copy.getSnippets();
  applyAndNotify(unwrap(result));
}

export async function createSnippet(input: CreateSnippetInput): Promise<void> {
  const result = await window.irisAPI.copy.createSnippet(input);
  applyAndNotify(unwrap(result));
}

export async function updateSnippet(input: UpdateSnippetInput): Promise<void> {
  const result = await window.irisAPI.copy.updateSnippet(input);
  applyAndNotify(unwrap(result));
}

export async function deleteSnippet(snippetId: string): Promise<void> {
  const result = await window.irisAPI.copy.deleteSnippet(snippetId);
  applyAndNotify(unwrap(result));
}

export async function importTxt(): Promise<ImportTxtResult> {
  const result = await window.irisAPI.copy.importTxt();
  return unwrap(result);
}

export function copyToClipboard(text: string): void {
  window.irisAPI.system.copyToClipboard(text);
}
