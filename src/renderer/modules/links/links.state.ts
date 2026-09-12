import type { CreateLinkInput, LinksFile, UpdateLinkInput } from '../../../shared/types/links.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (state: LinksFile) => void;

let state: LinksFile | null = null;
let listener: Listener | null = null;

function unwrap(result: IpcResult<LinksFile>): LinksFile {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: LinksFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function getCurrentState(): LinksFile | null {
  return state;
}

export async function loadLinks(): Promise<void> {
  const result = await window.irisAPI.links.getLinks();
  applyAndNotify(unwrap(result));
}

export async function createLink(input: CreateLinkInput): Promise<void> {
  const result = await window.irisAPI.links.createLink(input);
  applyAndNotify(unwrap(result));
}

export async function updateLink(input: UpdateLinkInput): Promise<void> {
  const result = await window.irisAPI.links.updateLink(input);
  applyAndNotify(unwrap(result));
}

export async function deleteLink(linkId: string): Promise<void> {
  const result = await window.irisAPI.links.deleteLink(linkId);
  applyAndNotify(unwrap(result));
}

export async function reorderLinks(orderedLinkIds: string[]): Promise<void> {
  const result = await window.irisAPI.links.reorderLinks(orderedLinkIds);
  applyAndNotify(unwrap(result));
}

export function openLink(url: string): void {
  window.irisAPI.system.openExternalLink(url);
}
