import type { ArquivosFile, WhitelistItem } from '../../../shared/types/arquivos.types';
import * as arquivosState from './arquivos.state.js';
import * as kanbanState from '../kanban/kanban.state.js';
import * as exportacaoView from '../exportacao/exportacao.view.js';
import { openConfirmModal } from '../../ui/modal.js';

type FilterTab = 'todos' | 'documentos' | 'imagens' | 'ligados';

const DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);

const FILE_ICONS: Record<string, { icon: string; className: string }> = {
  pdf: { icon: '📕', className: 'file-icon--pdf' },
  doc: { icon: '📄', className: 'file-icon--doc' },
  docx: { icon: '📄', className: 'file-icon--doc' },
  txt: { icon: '📄', className: 'file-icon--doc' },
  md: { icon: '📄', className: 'file-icon--doc' },
  csv: { icon: '📊', className: 'file-icon--sheet' },
  xlsx: { icon: '📊', className: 'file-icon--sheet' },
  png: { icon: '🖼️', className: 'file-icon--image' },
  jpg: { icon: '🖼️', className: 'file-icon--image' },
  jpeg: { icon: '🖼️', className: 'file-icon--image' },
  gif: { icon: '🖼️', className: 'file-icon--image' },
  svg: { icon: '🖼️', className: 'file-icon--image' },
  webp: { icon: '🖼️', className: 'file-icon--image' },
};

let activeFilter: FilterTab = 'todos';

function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function categoryOf(item: WhitelistItem): 'documentos' | 'imagens' | 'outros' {
  const ext = extensionOf(item.fileName);
  if (DOC_EXTENSIONS.has(ext)) return 'documentos';
  if (IMAGE_EXTENSIONS.has(ext)) return 'imagens';
  return 'outros';
}

function fileIconFor(item: WhitelistItem): { icon: string; className: string } {
  const ext = extensionOf(item.fileName);
  return FILE_ICONS[ext] ?? { icon: '📁', className: 'file-icon--other' };
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'hoje';
  if (diffDays === 1) return '1 dia';
  if (diffDays < 30) return `${diffDays} dias`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function matchesFilter(item: WhitelistItem, filter: FilterTab): boolean {
  if (filter === 'todos') return true;
  if (filter === 'ligados') return !!item.linkedCardId;
  return categoryOf(item) === filter;
}

async function handleDelete(item: WhitelistItem): Promise<void> {
  const confirmed = await openConfirmModal({
    title: 'Remover arquivo',
    message: `Remover "${item.fileName}" da lista de arquivos?`,
    confirmText: 'Remover',
  });
  if (!confirmed) return;
  await arquivosState.deleteItem(item.id);
}

async function buildLinkedCardCell(item: WhitelistItem): Promise<HTMLElement> {
  const cell = document.createElement('div');
  cell.className = 'arquivo-linked-cell';

  await kanbanState.loadBoard();
  const board = kanbanState.getCurrentBoard();
  const cards = board?.cards ?? [];

  const select = document.createElement('select');
  select.className = 'arquivo-link-select';

  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '— sem card —';
  select.appendChild(noneOption);

  cards.forEach((card) => {
    const opt = document.createElement('option');
    opt.value = card.id;
    opt.textContent = card.title;
    if (card.id === item.linkedCardId) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    void arquivosState.linkFileToCard({ itemId: item.id, cardId: select.value || null });
  });

  cell.appendChild(select);
  return cell;
}

function buildItemRow(item: WhitelistItem): HTMLElement {
  const row = document.createElement('div');
  row.className = 'arquivo-row';
  row.dataset.itemId = item.id;

  const { icon, className } = fileIconFor(item);
  const iconEl = document.createElement('span');
  iconEl.className = `file-icon ${className}`;
  iconEl.textContent = icon;
  row.appendChild(iconEl);

  const nameEl = document.createElement('span');
  nameEl.className = 'arquivo-name';
  nameEl.textContent = item.fileName;
  if (item.done) nameEl.classList.add('is-done');
  row.appendChild(nameEl);

  const linkedCell = document.createElement('div');
  linkedCell.className = 'arquivo-linked-cell arquivo-linked-cell--loading';
  linkedCell.textContent = '…';
  row.appendChild(linkedCell);
  void buildLinkedCardCell(item).then((cell) => linkedCell.replaceWith(cell));

  const sizeEl = document.createElement('span');
  sizeEl.className = 'arquivo-size';
  sizeEl.textContent = formatSize(item.size);
  row.appendChild(sizeEl);

  const whenEl = document.createElement('span');
  whenEl.className = 'arquivo-when';
  whenEl.textContent = formatRelativeDate(item.createdAt);
  row.appendChild(whenEl);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Remover da lista';
  deleteBtn.addEventListener('click', () => void handleDelete(item));
  row.appendChild(deleteBtn);

  return row;
}

function buildFilesPane(state: ArquivosFile, rerender: () => void): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'arquivos-pane';

  const header = document.createElement('div');
  header.className = 'arquivos-header';

  const title = document.createElement('h1');
  title.textContent = 'Arquivos e Exportação';
  header.appendChild(title);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn';
  importBtn.textContent = 'Enviar';
  importBtn.addEventListener('click', () => void arquivosState.importFiles());
  header.appendChild(importBtn);

  pane.appendChild(header);

  const tabs = document.createElement('div');
  tabs.className = 'arquivos-tabs';
  const tabDefs: Array<[FilterTab, string]> = [
    ['todos', 'Todos'],
    ['documentos', 'Documentos'],
    ['imagens', 'Imagens'],
    ['ligados', 'Ligados a card'],
  ];
  tabDefs.forEach(([value, label]) => {
    const btn = document.createElement('button');
    btn.className = 'arquivos-tab';
    btn.classList.toggle('active', activeFilter === value);
    btn.textContent = label;
    btn.addEventListener('click', () => {
      activeFilter = value;
      rerender();
    });
    tabs.appendChild(btn);
  });
  pane.appendChild(tabs);

  const filtered = state.items.filter((item) => matchesFilter(item, activeFilter));

  if (state.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'arquivos-empty';
    empty.textContent = 'Nenhum arquivo importado ainda. Clique em "Enviar" para começar.';
    pane.appendChild(empty);
  } else if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'arquivos-empty';
    empty.textContent = 'Nenhum arquivo corresponde a este filtro.';
    pane.appendChild(empty);
  } else {
    const listHeader = document.createElement('div');
    listHeader.className = 'arquivo-row arquivo-row--header';
    listHeader.innerHTML =
      '<span></span><span>Nome</span><span>Ligado a</span><span>Tamanho</span><span>Quando</span><span></span>';
    pane.appendChild(listHeader);

    const list = document.createElement('div');
    list.className = 'arquivos-list';
    filtered.forEach((item) => list.appendChild(buildItemRow(item)));
    pane.appendChild(list);
  }

  const dropZone = document.createElement('div');
  dropZone.className = 'arquivos-dropzone';
  dropZone.innerHTML = '<strong>Arraste arquivos aqui</strong><span>Solte sobre a lista para importar. Depois, ligue a um card pelo seletor da linha.</span>';
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('is-dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
    void arquivosState.importFiles();
  });
  pane.appendChild(dropZone);

  return pane;
}

export function render(container: HTMLElement, state: ArquivosFile): void {
  container.innerHTML = '';

  const rerender = () => render(container, arquivosState.getCurrentState() ?? state);

  const layout = document.createElement('div');
  layout.className = 'arquivos-layout';

  layout.appendChild(buildFilesPane(state, rerender));

  const exportPane = document.createElement('div');
  exportPane.className = 'arquivos-export-pane';
  exportacaoView.render(exportPane);
  layout.appendChild(exportPane);

  container.appendChild(layout);
}

export function destroy(): void {
  // No listeners or timers to tear down for this module.
}
