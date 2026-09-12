import type {
  CreateMarkdownInput,
  ExportMarkdownPdfInput,
  LinkMarkdownToCardInput,
  MarkdownConfig,
  MarkdownFileMeta,
  OpenMarkdownFileResult,
  WriteMarkdownInput,
} from '../../../shared/types/markdown.types';
import type { FileOpResult } from '../../../shared/types/export.types';
import type { IpcResult } from '../../../shared/types/common.types';

type Listener = (config: MarkdownConfig) => void;

let config: MarkdownConfig | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: MarkdownConfig): void {
  config = next;
  listener?.(config);
}

export function onConfigChange(cb: Listener): void {
  listener = cb;
}

export function offConfigChange(): void {
  listener = null;
}

export function getConfig(): MarkdownConfig | null {
  return config;
}

export async function loadConfig(): Promise<void> {
  const result = await window.irisAPI.markdown.getConfig();
  applyAndNotify(unwrap(result));
}

export async function chooseFolder(): Promise<void> {
  const result = await window.irisAPI.markdown.chooseFolder();
  applyAndNotify(unwrap(result));
}

export async function openFile(): Promise<OpenMarkdownFileResult> {
  const result = await window.irisAPI.markdown.openFile();
  const data = unwrap(result);
  if (data.config) applyAndNotify(data.config);
  return data;
}

export async function createFile(input: CreateMarkdownInput): Promise<MarkdownFileMeta> {
  const result = await window.irisAPI.markdown.createFile(input);
  const meta = unwrap(result);
  await loadConfig();
  return meta;
}

export async function readFile(filePath: string): Promise<string> {
  const result = await window.irisAPI.markdown.readFile(filePath);
  return unwrap(result);
}

export async function writeFile(input: WriteMarkdownInput): Promise<void> {
  const result = await window.irisAPI.markdown.writeFile(input);
  unwrap(result);
}

export async function linkFileToCard(input: LinkMarkdownToCardInput): Promise<void> {
  const result = await window.irisAPI.markdown.linkFileToCard(input);
  unwrap(result);
  await loadConfig();
}

export async function exportPdf(input: ExportMarkdownPdfInput): Promise<FileOpResult> {
  const result = await window.irisAPI.markdown.exportPdf(input);
  return unwrap(result);
}
