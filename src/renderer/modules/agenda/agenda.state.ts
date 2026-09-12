import type {
  AgendaFile,
  AgendaItemInput,
  ImportAgendaResult,
  UpdateAgendaItemInput,
} from '../../../shared/types/agenda.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (state: AgendaFile) => void;

let state: AgendaFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: AgendaFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function getCurrentState(): AgendaFile | null {
  return state;
}

export async function loadItems(): Promise<void> {
  const result = await window.irisAPI.agenda.getItems();
  applyAndNotify(unwrap(result));
}

export async function createItem(input: AgendaItemInput): Promise<void> {
  const result = await window.irisAPI.agenda.createItem(input);
  applyAndNotify(unwrap(result));
}

export async function updateItem(input: UpdateAgendaItemInput): Promise<void> {
  const result = await window.irisAPI.agenda.updateItem(input);
  applyAndNotify(unwrap(result));
}

export async function deleteItem(itemId: string): Promise<void> {
  const result = await window.irisAPI.agenda.deleteItem(itemId);
  applyAndNotify(unwrap(result));
}

export async function deleteItems(itemIds: string[]): Promise<void> {
  const result = await window.irisAPI.agenda.deleteItems(itemIds);
  applyAndNotify(unwrap(result));
}

export async function deleteAllItems(): Promise<void> {
  const result = await window.irisAPI.agenda.deleteAllItems();
  applyAndNotify(unwrap(result));
}

export async function importSpreadsheet(): Promise<ImportAgendaResult> {
  const result = await window.irisAPI.agenda.importSpreadsheet();
  const data = unwrap(result);
  applyAndNotify(data.file);
  return data;
}

export function copyToClipboard(text: string): void {
  window.irisAPI.system.copyToClipboard(text);
}
