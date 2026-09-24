import * as kanbanService from '../kanban/kanban.service';
import * as quadroService from '../quadro/quadro.service';
import * as sheetsService from '../sheets/sheets.service';
import * as linksService from '../links/links.service';
import * as pensamentosService from '../pensamentos/pensamentos.service';
import * as exploradorService from '../explorador/explorador.service';
import * as servidoresService from '../servidores/servidores.service';
import * as n8nService from '../n8n/n8n.service';
import * as githubService from '../github/github.service';
import * as ajustesService from '../ajustes/ajustes.service';
import * as copyService from '../copy/copy.service';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import * as relatoriosService from '../relatorios/relatorios.service';
import type { ExportBundle } from '../../../shared/types/export.types';

const SCHEMA_VERSION = 1;

/**
 * Deliberadamente FORA do backup: secrets.json.
 *
 * São credenciais, e no Windows o safeStorage as cifra com DPAPI atrelado ao
 * usuário do SO — o valor nem seria decifrável em outra máquina. Por isso
 * servidores.json guarda só host/porta/usuário/caminho da chave, e n8n.json só
 * a baseUrl: as credenciais ficam no cofre, referenciadas por chave.
 */
export async function buildExportBundle(): Promise<ExportBundle> {
  const [kanban, quadro, sheets, links, pensamentos, explorador, servidores, n8n, github, ajustes, copy, videos, imagens, relatorios] =
    await Promise.all([
      kanbanService.getFullFile(),
      quadroService.getFullFile(),
      sheetsService.getFullFile(),
      linksService.getFullFile(),
      pensamentosService.getFullFile(),
      exploradorService.getFullFile(),
      servidoresService.getFullFile(),
      n8nService.getFullFile(),
      githubService.getFullFile(),
      ajustesService.getFullFile(),
      copyService.getFullFile(),
      videosService.getFullFile(),
      imagensService.getFullFile(),
      relatoriosService.getFullFile(),
    ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    kanban,
    quadro,
    sheets,
    links,
    pensamentos,
    explorador,
    servidores,
    n8n,
    github,
    ajustes,
    copy,
    videos,
    imagens,
    relatorios,
  };
}

function isValidBundle(value: unknown): value is ExportBundle {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExportBundle>;
  // 'arquivos' saiu do bundle quando o Explorador substituiu aquele módulo.
  // Exports antigos ainda trazem o campo; ele é simplesmente ignorado.
  return Boolean(candidate.kanban && candidate.quadro);
}

export async function restoreFromBundle(raw: unknown): Promise<void> {
  if (!isValidBundle(raw)) {
    throw new Error('Arquivo de importação inválido: faltam dados de Kanban e/ou Quadro.');
  }

  await Promise.all([
    kanbanService.replaceFile(raw.kanban),
    quadroService.replaceFile(raw.quadro),
    raw.sheets ? sheetsService.replaceFile(raw.sheets) : Promise.resolve(),
    raw.links ? linksService.replaceFile(raw.links) : Promise.resolve(),
    raw.pensamentos ? pensamentosService.replaceFile(raw.pensamentos) : Promise.resolve(),
    raw.explorador ? exploradorService.replaceFile(raw.explorador) : Promise.resolve(),
    raw.servidores ? servidoresService.replaceFile(raw.servidores) : Promise.resolve(),
    raw.n8n ? n8nService.replaceFile(raw.n8n) : Promise.resolve(),
    raw.github ? githubService.replaceFile(raw.github) : Promise.resolve(),
    raw.ajustes ? ajustesService.replaceFile(raw.ajustes) : Promise.resolve(),
    raw.copy ? copyService.replaceFile(raw.copy) : Promise.resolve(),
    raw.videos ? videosService.replaceFile(raw.videos) : Promise.resolve(),
    raw.relatorios ? relatoriosService.replaceFile(raw.relatorios) : Promise.resolve(),
  ]);
  // Depois dos vídeos, de propósito: as imagens validam tags e redes contra o
  // catálogo que mora em videos.json, que precisa já ser o do backup.
  if (raw.imagens) await imagensService.replaceFile(raw.imagens);
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
