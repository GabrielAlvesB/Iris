import type {
  AddColumnInput,
  CommitImportInput,
  CommitImportResult,
  CreateRowInput,
  CreateTableInput,
  DeleteColumnInput,
  DeleteRowInput,
  DetectImportResult,
  RenameTableInput,
  SheetsFile,
  UpdateColumnInput,
  UpdateRowInput,
  UpdateTableVisibilityInput,
} from '../../../shared/types/sheets.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (state: SheetsFile) => void;

let state: SheetsFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: SheetsFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function getCurrentState(): SheetsFile | null {
  return state;
}

export async function loadFile(): Promise<void> {
  const result = await window.irisAPI.sheets.getFile();
  applyAndNotify(unwrap(result));
}

export async function detectImport(): Promise<DetectImportResult | null> {
  const result = await window.irisAPI.sheets.detectImport();
  return unwrap(result);
}

export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const result = await window.irisAPI.sheets.commitImport(input);
  const data = unwrap(result);
  applyAndNotify(data.file);
  return data;
}

export async function createTable(input: CreateTableInput): Promise<void> {
  const result = await window.irisAPI.sheets.createTable(input);
  applyAndNotify(unwrap(result));
}

export async function renameTable(input: RenameTableInput): Promise<void> {
  const result = await window.irisAPI.sheets.renameTable(input);
  applyAndNotify(unwrap(result));
}

export async function setTableVisibility(input: UpdateTableVisibilityInput): Promise<void> {
  const result = await window.irisAPI.sheets.setTableVisibility(input);
  applyAndNotify(unwrap(result));
}

export async function addColumn(input: AddColumnInput): Promise<void> {
  const result = await window.irisAPI.sheets.addColumn(input);
  applyAndNotify(unwrap(result));
}

export async function updateColumn(input: UpdateColumnInput): Promise<void> {
  const result = await window.irisAPI.sheets.updateColumn(input);
  applyAndNotify(unwrap(result));
}

export async function deleteColumn(input: DeleteColumnInput): Promise<void> {
  const result = await window.irisAPI.sheets.deleteColumn(input);
  applyAndNotify(unwrap(result));
}

export async function createRow(input: CreateRowInput): Promise<void> {
  const result = await window.irisAPI.sheets.createRow(input);
  applyAndNotify(unwrap(result));
}

export async function updateRow(input: UpdateRowInput): Promise<void> {
  const result = await window.irisAPI.sheets.updateRow(input);
  applyAndNotify(unwrap(result));
}

export async function deleteRow(input: DeleteRowInput): Promise<void> {
  const result = await window.irisAPI.sheets.deleteRow(input);
  applyAndNotify(unwrap(result));
}

export function copyToClipboard(text: string): void {
  window.irisAPI.system.copyToClipboard(text);
}
