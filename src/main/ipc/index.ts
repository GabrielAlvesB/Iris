import { ipcMain } from 'electron';
import { contextoIpc } from '../core/contextoIpc';
import { registerKanbanIpc } from './kanban.ipc';
import { registerQuadroIpc } from './quadro.ipc';
import { registerSheetsIpc } from './sheets.ipc';
import { registerExportIpc } from './export.ipc';
import { registerBackupIpc } from './backup.ipc';
import { registerHistoricoIpc } from './historico.ipc';
import { registerBuscaIpc } from './busca.ipc';
import { registerHojeIpc } from './hoje.ipc';
import { registerLembretesIpc } from './lembretes.ipc';
import { registerPomodoroIpc } from './pomodoro.ipc';
import { registerIdeiasIpc } from './ideias.ipc';
import { registerLinksIpc } from './links.ipc';
import { registerCopyIpc } from './copy.ipc';
import { registerPensamentosIpc } from './pensamentos.ipc';
import { registerTodoIpc } from './todo.ipc';
import { registerIaIpc } from './ia.ipc';
import { registerExploradorIpc } from './explorador.ipc';
import { registerServidoresIpc } from './servidores.ipc';
import { registerN8nIpc } from './n8n.ipc';
import { registerGithubIpc } from './github.ipc';
import { registerAjustesIpc } from './ajustes.ipc';
import { registerVideosIpc } from './videos.ipc';
import { registerAnexosIpc } from './anexos.ipc';
import { registerImagensIpc } from './imagens.ipc';
import { registerRelatoriosIpc } from './relatorios.ipc';
import { registerRoteirosIpc } from './roteiros.ipc';
import { registerTrafegoIpc } from './trafego.ipc';
import { registerAtualizacaoIpc } from './atualizacao.ipc';
import { registerDocumentosIpc } from './documentos.ipc';
import { registerContatosIpc } from './contatos.ipc';
import { registerWhatsappIpc } from './whatsapp.ipc';

/**
 * Além disso, cada handler roda dentro de `contextoIpc` com o nome do canal: é
 * por ele que o histórico (desfazer) distingue a ação do usuário de uma tarefa
 * de fundo. Todo `register…Ipc` precisa registrar de forma síncrona aqui dentro,
 * senão escapa do embrulho.
 *
 * A janela abre sem esperar as migrações da abertura (empresas, WhatsApp
 * interrompido): todo `invoke` espera `dadosProntos` antes de chegar ao
 * service. Assim a tela nunca lê um arquivo no meio da migração, e o HTML/CSS/JS
 * carregam em paralelo com ela. Depois de resolvida, a espera é um microtask.
 */
export function registerAllIpcHandlers(dadosProntos: Promise<unknown>): void {
  const handleOriginal = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (canal, tratar) =>
    handleOriginal(canal, async (event, ...args) => {
      await dadosProntos;
      return contextoIpc.run({ canal }, () => tratar(event, ...args));
    });
  try {
    registrarTodos();
  } finally {
    ipcMain.handle = handleOriginal;
  }
}

function registrarTodos(): void {
  registerKanbanIpc();
  registerQuadroIpc();
  registerSheetsIpc();
  registerExportIpc();
  registerBackupIpc();
  registerHistoricoIpc();
  registerBuscaIpc();
  registerHojeIpc();
  registerLembretesIpc();
  registerPomodoroIpc();
  registerIdeiasIpc();
  registerLinksIpc();
  registerCopyIpc();
  registerPensamentosIpc();
  registerTodoIpc();
  registerIaIpc();
  registerExploradorIpc();
  registerServidoresIpc();
  registerN8nIpc();
  registerGithubIpc();
  registerAjustesIpc();
  registerVideosIpc();
  registerImagensIpc();
  registerAnexosIpc();
  registerRelatoriosIpc();
  registerRoteirosIpc();
  registerTrafegoIpc();
  registerAtualizacaoIpc();
  registerDocumentosIpc();
  registerContatosIpc();
  registerWhatsappIpc();
}
