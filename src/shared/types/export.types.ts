import type { KanbanFile } from './kanban.types';
import type { QuadroFile } from './quadro.types';
import type { ArquivosFile } from './arquivos.types';
import type { AgendaFile } from './agenda.types';
import type { LinksFile } from './links.types';

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  kanban: KanbanFile;
  quadro: QuadroFile;
  arquivos: ArquivosFile;
  agenda: AgendaFile;
  // Optional: exports created before the Links module existed won't have this.
  links?: LinksFile;
}

export type FileOpResult = { canceled: true } | { canceled: false; filePath: string };
