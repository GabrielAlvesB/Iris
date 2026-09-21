import type { IpcResult } from '../../../shared/types/common.types';
import type { FileOpResult } from '../../../shared/types/export.types';
import type {} from '../../../shared/types/preload-api.types';
import { openConfirmModal } from '../../ui/modal.js';

let statusEl: HTMLElement | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function showStatus(message: string, isError = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('exportacao-status--error', isError);
}

async function runAction(action: () => Promise<IpcResult<FileOpResult>>, cancelMessage: string, successMessage: (path: string) => string): Promise<void> {
  try {
    const result = unwrap(await action());
    if (result.canceled) {
      showStatus(cancelMessage);
    } else {
      showStatus(successMessage(result.filePath));
    }
  } catch (error) {
    showStatus(`Erro: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

async function handleExportAll(): Promise<void> {
  await runAction(
    () => window.irisAPI.export.exportAll(),
    'Exportação cancelada.',
    (path) => `Todos os dados foram exportados para: ${path}`,
  );
}

async function handleImportAll(): Promise<void> {
  const confirmed = await openConfirmModal({
    title: 'Substituir dados atuais?',
    message: 'Importar vai SUBSTITUIR todos os dados atuais (Kanban, Quadro, Sheets, Links, Pensamentos, Explorador, Servidores, n8n e GitHub) pelo conteúdo do arquivo escolhido. Credenciais não são restauradas. Deseja continuar?',
    confirmText: 'Importar e substituir',
  });
  if (!confirmed) return;

  await runAction(
    () => window.irisAPI.export.importAll(),
    'Importação cancelada.',
    (path) => `Dados restaurados a partir de: ${path}. Navegue para os outros módulos para ver as mudanças.`,
  );
}

export function render(container: HTMLElement): void {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'exportacao-header';

  const title = document.createElement('h1');
  title.textContent = 'Exportação';
  header.appendChild(title);
  container.appendChild(header);

  const intro = document.createElement('p');
  intro.className = 'exportacao-intro';
  intro.textContent =
    'Exporte todos os dados do Iris para um arquivo JSON, para backup ou uso em outro sistema, ou importe um export anterior para restaurar seus dados. Credenciais (API key, token, passphrases) nunca entram no arquivo.';
  container.appendChild(intro);

  const exportSection = document.createElement('section');
  exportSection.className = 'exportacao-section';

  const exportTitle = document.createElement('h2');
  exportTitle.textContent = 'Exportar';
  exportSection.appendChild(exportTitle);

  const exportButtons = document.createElement('div');
  exportButtons.className = 'exportacao-buttons';

  const exportAllBtn = document.createElement('button');
  exportAllBtn.className = 'btn';
  exportAllBtn.textContent = 'Exportar tudo (JSON)';
  exportAllBtn.addEventListener('click', () => void handleExportAll());
  exportButtons.appendChild(exportAllBtn);

  exportSection.appendChild(exportButtons);
  container.appendChild(exportSection);

  const importSection = document.createElement('section');
  importSection.className = 'exportacao-section';

  const importTitle = document.createElement('h2');
  importTitle.textContent = 'Importar';
  importSection.appendChild(importTitle);

  const importDesc = document.createElement('p');
  importDesc.className = 'exportacao-warning';
  importDesc.textContent = 'Atenção: importar substitui todos os dados atuais pelos dados do arquivo JSON escolhido.';
  importSection.appendChild(importDesc);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-secondary';
  importBtn.textContent = 'Importar tudo (JSON)';
  importBtn.addEventListener('click', () => void handleImportAll());
  importSection.appendChild(importBtn);

  container.appendChild(importSection);

  statusEl = document.createElement('div');
  statusEl.className = 'exportacao-status';
  container.appendChild(statusEl);
}

/**
 * statusEl é uma variável de módulo: sem zerar aqui, showStatus escreveria em
 * um nó já removido do DOM depois que o usuário troca de módulo.
 */
export function destroy(): void {
  statusEl = null;
}
