import type { KanbanFile } from './kanban.types';
import type { QuadroFile } from './quadro.types';
import type { ArquivosFile } from './arquivos.types';
import type { SheetsFile } from './sheets.types';
import type { LinksFile } from './links.types';

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  kanban: KanbanFile;
  quadro: QuadroFile;
  arquivos: ArquivosFile;
  // Optional: exports created before the Sheets/Links modules existed won't have these.
  sheets?: SheetsFile;
  links?: LinksFile;
}

export type FileOpResult = { canceled: true } | { canceled: false; filePath: string };
