import type { KanbanFile } from './kanban.types';
import type { QuadroFile } from './quadro.types';
import type { SheetsFile } from './sheets.types';
import type { LinksFile } from './links.types';
import type { PensamentosFile } from './pensamentos.types';
import type { ExploradorFile } from './explorador.types';
import type { ServidoresFile } from './servidores.types';
import type { N8nFile } from './n8n.types';
import type { GithubFile } from './github.types';
import type { AjustesFile } from './ajustes.types';
import type { CopyFile } from './copy.types';
import type { VideosFile } from './videos.types';
import type { ImagensFile } from './imagens.types';
import type { RelatoriosFile } from './relatorios.types';

export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  kanban: KanbanFile;
  quadro: QuadroFile;
  // Opcionais: exports antigos não têm os módulos criados depois deles.
  sheets?: SheetsFile;
  links?: LinksFile;
  pensamentos?: PensamentosFile;
  explorador?: ExploradorFile;
  servidores?: ServidoresFile;
  n8n?: N8nFile;
  github?: GithubFile;
  ajustes?: AjustesFile;
  copy?: CopyFile;
  /** Chave mantida com o nome antigo: é o arquivo dos vídeos e do catálogo de postagens. */
  videos?: VideosFile;
  imagens?: ImagensFile;
  relatorios?: RelatoriosFile;
  /** @deprecated O módulo Arquivos virou Explorador. Só existe em backups antigos. */
  arquivos?: unknown;
}

export type FileOpResult = { canceled: true } | { canceled: false; filePath: string };
