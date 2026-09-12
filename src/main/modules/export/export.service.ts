import * as kanbanService from '../kanban/kanban.service';
import * as quadroService from '../quadro/quadro.service';
import * as arquivosService from '../arquivos/arquivos.service';
import * as sheetsService from '../sheets/sheets.service';
import * as linksService from '../links/links.service';
import type { ExportBundle } from '../../../shared/types/export.types';

const SCHEMA_VERSION = 1;

export async function buildExportBundle(): Promise<ExportBundle> {
  const [kanban, quadro, arquivos, sheets, links] = await Promise.all([
    kanbanService.getFullFile(),
    quadroService.getFullFile(),
    arquivosService.getFullFile(),
    sheetsService.getFullFile(),
    linksService.getFullFile(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    kanban,
    quadro,
    arquivos,
    sheets,
    links,
  };
}

function isValidBundle(value: unknown): value is ExportBundle {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExportBundle>;
  return Boolean(candidate.kanban && candidate.quadro && candidate.arquivos);
}

export async function restoreFromBundle(raw: unknown): Promise<void> {
  if (!isValidBundle(raw)) {
    throw new Error('Arquivo de importação inválido: faltam dados de um ou mais módulos (kanban, quadro, arquivos).');
  }

  await Promise.all([
    kanbanService.replaceFile(raw.kanban),
    quadroService.replaceFile(raw.quadro),
    arquivosService.replaceFile(raw.arquivos),
    raw.sheets ? sheetsService.replaceFile(raw.sheets) : Promise.resolve(),
    raw.links ? linksService.replaceFile(raw.links) : Promise.resolve(),
  ]);
}

function escapeCsvCell(cell: string): string {
  if (/["\n\r,;]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export async function buildArquivosCsv(): Promise<string> {
  const file = await arquivosService.getFullFile();
  const headers = ['Nome do arquivo', 'Feito', 'Verificado', 'Observação'];
  const rows = file.items.map((item) => [
    item.fileName,
    item.done ? 'sim' : 'não',
    item.verified ? 'sim' : 'não',
    item.note ?? '',
  ]);
  return buildCsv(headers, rows);
}
