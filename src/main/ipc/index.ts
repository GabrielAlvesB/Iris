import { registerKanbanIpc } from './kanban.ipc';
import { registerQuadroIpc } from './quadro.ipc';
import { registerSheetsIpc } from './sheets.ipc';
import { registerExportIpc } from './export.ipc';
import { registerLinksIpc } from './links.ipc';
import { registerCopyIpc } from './copy.ipc';
import { registerPensamentosIpc } from './pensamentos.ipc';
import { registerExploradorIpc } from './explorador.ipc';
import { registerServidoresIpc } from './servidores.ipc';
import { registerN8nIpc } from './n8n.ipc';
import { registerGithubIpc } from './github.ipc';
import { registerAjustesIpc } from './ajustes.ipc';
import { registerVideosIpc } from './videos.ipc';
import { registerImagensIpc } from './imagens.ipc';
import { registerRelatoriosIpc } from './relatorios.ipc';
import { registerRoteirosIpc } from './roteiros.ipc';
import { registerTrafegoIpc } from './trafego.ipc';
import { registerAtualizacaoIpc } from './atualizacao.ipc';

export function registerAllIpcHandlers(): void {
  registerKanbanIpc();
  registerQuadroIpc();
  registerSheetsIpc();
  registerExportIpc();
  registerLinksIpc();
  registerCopyIpc();
  registerPensamentosIpc();
  registerExploradorIpc();
  registerServidoresIpc();
  registerN8nIpc();
  registerGithubIpc();
  registerAjustesIpc();
  registerVideosIpc();
  registerImagensIpc();
  registerRelatoriosIpc();
  registerRoteirosIpc();
  registerTrafegoIpc();
  registerAtualizacaoIpc();
}
