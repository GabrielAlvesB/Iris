import { registerKanbanIpc } from './kanban.ipc';
import { registerQuadroIpc } from './quadro.ipc';
import { registerArquivosIpc } from './arquivos.ipc';
import { registerSheetsIpc } from './sheets.ipc';
import { registerExportIpc } from './export.ipc';
import { registerLinksIpc } from './links.ipc';
import { registerCopyIpc } from './copy.ipc';
import { registerMarkdownIpc } from './markdown.ipc';

export function registerAllIpcHandlers(): void {
  registerKanbanIpc();
  registerQuadroIpc();
  registerArquivosIpc();
  registerSheetsIpc();
  registerExportIpc();
  registerLinksIpc();
  registerCopyIpc();
  registerMarkdownIpc();
}
