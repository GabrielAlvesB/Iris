import type { IpcResult } from '../../../shared/types/common.types';
import type { FileOpResult } from '../../../shared/types/export.types';
import type {
  CriarRelatorioInput,
  ExportarPdfInput,
  Relatorio,
  RelatoriosFile,
  SalvarCategoriasInput,
} from '../../../shared/types/relatorios.types';

type Listener = (state: RelatoriosFile) => void;

let state: RelatoriosFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: RelatoriosFile): RelatoriosFile {
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

export function getCurrentState(): RelatoriosFile | null {
  return state;
}

export async function load(): Promise<RelatoriosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.relatorios.getFile()));
}

export async function criarRelatorio(input: CriarRelatorioInput): Promise<RelatoriosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.relatorios.criarRelatorio(input)));
}

export async function salvarRelatorio(relatorio: Relatorio): Promise<RelatoriosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.relatorios.salvarRelatorio(relatorio)));
}

export async function duplicarRelatorio(relatorioId: string): Promise<RelatoriosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.relatorios.duplicarRelatorio(relatorioId)));
}

export async function excluirRelatorio(relatorioId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.relatorios.excluirRelatorio(relatorioId)));
}

export async function salvarCategorias(input: SalvarCategoriasInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.relatorios.salvarCategorias(input)));
}

export async function exportarPdf(input: ExportarPdfInput): Promise<FileOpResult> {
  return unwrap(await window.irisAPI.relatorios.exportarPdf(input));
}

export async function abrirPdf(filePath: string): Promise<void> {
  unwrap(await window.irisAPI.relatorios.abrirPdf(filePath));
}
