import * as kanbanService from '../kanban/kanban.service';
import * as quadroService from '../quadro/quadro.service';
import * as arquivosService from '../arquivos/arquivos.service';
import * as agendaService from '../agenda/agenda.service';
import * as linksService from '../links/links.service';
import type { ExportBundle } from '../../../shared/types/export.types';

const SCHEMA_VERSION = 1;

export async function buildExportBundle(): Promise<ExportBundle> {
  const [kanban, quadro, arquivos, agenda, links] = await Promise.all([
    kanbanService.getFullFile(),
    quadroService.getFullFile(),
    arquivosService.getFullFile(),
    agendaService.getFullFile(),
    linksService.getFullFile(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    kanban,
    quadro,
    arquivos,
    agenda,
    links,
  };
}

function isValidBundle(value: unknown): value is ExportBundle {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExportBundle>;
  return Boolean(candidate.kanban && candidate.quadro && candidate.arquivos && candidate.agenda);
}

export async function restoreFromBundle(raw: unknown): Promise<void> {
  if (!isValidBundle(raw)) {
    throw new Error('Arquivo de importação inválido: faltam dados de um ou mais módulos (kanban, quadro, arquivos, agenda).');
  }

  await Promise.all([
    kanbanService.replaceFile(raw.kanban),
    quadroService.replaceFile(raw.quadro),
    arquivosService.replaceFile(raw.arquivos),
    agendaService.replaceFile(raw.agenda),
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

export async function buildAgendaCsv(): Promise<string> {
  const file = await agendaService.getFullFile();
  const baseHeaders = [
    'Vídeo de origem',
    'Formato',
    'Arquivo',
    'Duração',
    'Título',
    'Descrição',
    'Hashtags',
    'Plataforma',
    'Data agendada',
    'Status',
    'Observação',
  ];
  const extraKeys = Array.from(new Set(file.items.flatMap((item) => Object.keys(item.extra ?? {}))));

  const rows = file.items.map((item) => [
    item.videoOrigem ?? '',
    item.formato ?? '',
    item.arquivo ?? '',
    item.duracao ?? '',
    item.titulo,
    item.descricao ?? '',
    item.hashtags ?? '',
    item.plataforma ?? '',
    item.dataAgendada ?? '',
    item.status ?? '',
    item.observacao ?? '',
    ...extraKeys.map((key) => String(item.extra?.[key] ?? '')),
  ]);

  return buildCsv([...baseHeaders, ...extraKeys], rows);
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
