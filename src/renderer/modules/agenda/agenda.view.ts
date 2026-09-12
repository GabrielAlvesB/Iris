import type { AgendaFile, AgendaItem, AgendaItemInput } from '../../../shared/types/agenda.types';
import * as agendaState from './agenda.state.js';
import { openFormModal } from '../../ui/modal.js';

const STATUS_OPTIONS = [
  { value: '', label: '(sem status)' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Agendado', label: 'Agendado' },
  { value: 'Publicado', label: 'Publicado' },
  { value: 'Cancelado', label: 'Cancelado' },
];

const ITEM_FORM_FIELDS = (defaults: Partial<AgendaItemInput>) => [
  { name: 'titulo', label: 'Título', type: 'text' as const, defaultValue: defaults.titulo ?? '' },
  { name: 'plataforma', label: 'Plataforma', type: 'text' as const, defaultValue: defaults.plataforma ?? '', placeholder: 'YouTube, Instagram, TikTok...' },
  { name: 'dataAgendada', label: 'Data e hora agendada', type: 'datetime-local' as const, defaultValue: defaults.dataAgendada ?? '' },
  { name: 'status', label: 'Status', type: 'select' as const, defaultValue: defaults.status ?? '', options: STATUS_OPTIONS },
  { name: 'videoOrigem', label: 'Vídeo de origem', type: 'text' as const, defaultValue: defaults.videoOrigem ?? '' },
  { name: 'formato', label: 'Formato', type: 'text' as const, defaultValue: defaults.formato ?? '', placeholder: 'Reels, Shorts, Vídeo longo...' },
  { name: 'arquivo', label: 'Arquivo', type: 'text' as const, defaultValue: defaults.arquivo ?? '' },
  { name: 'duracao', label: 'Duração', type: 'text' as const, defaultValue: defaults.duracao ?? '', placeholder: '00:45' },
  { name: 'descricao', label: 'Descrição', type: 'textarea' as const, defaultValue: defaults.descricao ?? '' },
  { name: 'hashtags', label: 'Hashtags', type: 'text' as const, defaultValue: defaults.hashtags ?? '' },
  { name: 'observacao', label: 'Observação', type: 'textarea' as const, defaultValue: defaults.observacao ?? '' },
];

interface ColumnDef {
  key: keyof AgendaItem | 'index';
  label: string;
  width: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'index', label: '#', width: '40px' },
  { key: 'arquivo', label: 'Arquivo', width: 'minmax(140px, 1fr)' },
  { key: 'titulo', label: 'Título', width: 'minmax(160px, 1.3fr)' },
  { key: 'descricao', label: 'Descrição', width: 'minmax(200px, 1.8fr)' },
  { key: 'hashtags', label: 'Hashtags', width: 'minmax(140px, 1.1fr)' },
];
const ACTIONS_COLUMN_WIDTH = '96px';
const GRID_TEMPLATE = `${COLUMNS.map((c) => c.width).join(' ')} ${ACTIONS_COLUMN_WIDTH}`;

const ICONS = {
  search:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-3-3"/></svg>',
  copy:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="7" height="7" rx="1.2"/><path d="M3.5 10V4a1 1 0 0 1 1-1h6"/></svg>',
  edit:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z"/></svg>',
  trash:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
};

function iconButton(icon: keyof typeof ICONS, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'agenda-icon-btn';
  btn.title = title;
  btn.innerHTML = ICONS[icon];
  return btn;
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function cellText(item: AgendaItem, key: ColumnDef['key'], index: number): string {
  if (key === 'index') return String(index + 1).padStart(2, '0');
  if (key === 'dataAgendada') return formatDateTime(item.dataAgendada);
  const value = item[key];
  return typeof value === 'string' ? value : '';
}

function buildCopyText(item: AgendaItem): string {
  return [item.titulo, item.descricao, item.hashtags].filter((part) => part && part.trim() !== '').join('\n\n');
}

function buildSpreadsheetTsv(items: AgendaItem[]): string {
  const dataColumns = COLUMNS.filter((c) => c.key !== 'index');
  const headerLine = ['#', ...dataColumns.map((c) => c.label)].join('\t');
  const lines = items.map((item, index) =>
    [String(index + 1), ...dataColumns.map((c) => cellText(item, c.key, index).replace(/\t|\n/g, ' '))].join('\t'),
  );
  return [headerLine, ...lines].join('\n');
}

function matchesSearch(item: AgendaItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.arquivo ?? ''} ${item.titulo} ${item.hashtags ?? ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

async function handleAddItem(): Promise<void> {
  const result = await openFormModal('Novo agendamento', ITEM_FORM_FIELDS({}), 'Criar');
  if (!result || !result.titulo.trim()) return;
  await agendaState.createItem({ ...result, titulo: result.titulo.trim() });
}

async function handleEditItem(item: AgendaItem): Promise<void> {
  const result = await openFormModal('Editar agendamento', ITEM_FORM_FIELDS(item), 'Salvar');
  if (!result || !result.titulo.trim()) return;
  await agendaState.updateItem({ itemId: item.id, ...result, titulo: result.titulo.trim() });
}

async function handleDeleteItem(item: AgendaItem): Promise<void> {
  if (!window.confirm(`Excluir o agendamento "${item.titulo}"?`)) return;
  await agendaState.deleteItem(item.id);
}

function handleCopyItem(item: AgendaItem): void {
  agendaState.copyToClipboard(buildCopyText(item));
}

function flashCopied(cell: HTMLElement): void {
  cell.classList.add('agenda-cell--copied');
  setTimeout(() => cell.classList.remove('agenda-cell--copied'), 500);
}

function handleCopyAll(items: AgendaItem[], feedbackEl: HTMLElement): void {
  agendaState.copyToClipboard(buildSpreadsheetTsv(items));
  const original = feedbackEl.textContent;
  feedbackEl.textContent = 'Copiado!';
  setTimeout(() => {
    feedbackEl.textContent = original;
  }, 1500);
}

async function handleImport(): Promise<void> {
  const result = await agendaState.importSpreadsheet();
  if (result.importedCount > 0) {
    window.alert(`${result.importedCount} agendamento(s) importado(s) com sucesso.`);
  }
}

function buildRow(item: AgendaItem, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'agenda-row';
  row.dataset.itemId = item.id;

  COLUMNS.forEach((column) => {
    const cell = document.createElement('div');
    cell.className = 'agenda-cell';
    if (column.key === 'index') cell.className += ' agenda-cell-index';
    if (column.key === 'arquivo') cell.className += ' agenda-cell-arquivo';
    if (column.key === 'titulo') cell.className += ' agenda-cell-title';
    if (column.key === 'hashtags') cell.className += ' agenda-cell-hashtags';

    const text = cellText(item, column.key, index);
    cell.textContent = text;

    if (column.key !== 'index' && text) {
      cell.classList.add('agenda-cell--copyable');
      cell.title = 'Clique para copiar';
      cell.addEventListener('click', () => {
        agendaState.copyToClipboard(text);
        flashCopied(cell);
      });
    }

    row.appendChild(cell);
  });

  const actionsCell = document.createElement('div');
  actionsCell.className = 'agenda-cell agenda-cell-actions';

  const copyBtn = iconButton('copy', 'Copiar título, descrição e hashtags');
  copyBtn.addEventListener('click', () => handleCopyItem(item));
  actionsCell.appendChild(copyBtn);

  const editBtn = iconButton('edit', 'Editar');
  editBtn.addEventListener('click', () => void handleEditItem(item));
  actionsCell.appendChild(editBtn);

  const deleteBtn = iconButton('trash', 'Excluir');
  deleteBtn.addEventListener('click', () => void handleDeleteItem(item));
  actionsCell.appendChild(deleteBtn);

  row.appendChild(actionsCell);

  return row;
}

export function render(container: HTMLElement, state: AgendaFile): void {
  let searchQuery = '';

  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'agenda-view';
  container.appendChild(root);

  const eyebrow = document.createElement('div');
  eyebrow.className = 'agenda-eyebrow';
  eyebrow.textContent = 'Conteúdo';
  root.appendChild(eyebrow);

  const header = document.createElement('div');
  header.className = 'agenda-header';

  const title = document.createElement('h1');
  title.textContent = 'Agenda de publicação';
  header.appendChild(title);

  const headerActions = document.createElement('div');
  headerActions.className = 'agenda-header-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'agenda-btn agenda-btn--secondary';
  importBtn.textContent = 'Importar planilha';
  importBtn.addEventListener('click', () => void handleImport());
  headerActions.appendChild(importBtn);

  const copyAllBtn = document.createElement('button');
  copyAllBtn.className = 'agenda-btn agenda-btn--secondary';
  copyAllBtn.textContent = 'Copiar tudo';
  headerActions.appendChild(copyAllBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'agenda-btn agenda-btn--primary';
  addBtn.textContent = '+ Novo agendamento';
  addBtn.addEventListener('click', () => void handleAddItem());
  headerActions.appendChild(addBtn);

  header.appendChild(headerActions);
  root.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'agenda-toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'agenda-search';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'agenda-search-icon';
  searchIcon.innerHTML = ICONS.search;
  searchWrap.appendChild(searchIcon);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Buscar arquivo, título ou hashtag';
  searchWrap.appendChild(searchInput);
  toolbar.appendChild(searchWrap);

  const countEl = document.createElement('span');
  countEl.className = 'agenda-count';
  toolbar.appendChild(countEl);

  root.appendChild(toolbar);

  copyAllBtn.addEventListener('click', () => handleCopyAll(state.items, countEl));

  const tableHost = document.createElement('div');
  root.appendChild(tableHost);

  function renderTable(): void {
    tableHost.innerHTML = '';
    const filtered = state.items.filter((item) => matchesSearch(item, searchQuery));
    countEl.textContent = `${filtered.length} de ${state.items.length} agendamento(s)`;

    if (state.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agenda-empty';
      empty.textContent = 'Nenhum agendamento ainda. Crie um manualmente ou importe uma planilha.';
      tableHost.appendChild(empty);
      return;
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agenda-empty';
      empty.textContent = 'Nenhum agendamento encontrado para essa busca.';
      tableHost.appendChild(empty);
      return;
    }

    const listHeader = document.createElement('div');
    listHeader.className = 'agenda-row agenda-row--header';
    listHeader.style.gridTemplateColumns = GRID_TEMPLATE;
    COLUMNS.forEach((column) => {
      const cell = document.createElement('span');
      cell.textContent = column.label;
      listHeader.appendChild(cell);
    });
    const actionsHeaderCell = document.createElement('span');
    actionsHeaderCell.textContent = 'Ações';
    listHeader.appendChild(actionsHeaderCell);
    tableHost.appendChild(listHeader);

    const list = document.createElement('div');
    list.className = 'agenda-list';
    filtered.forEach((item, index) => {
      const row = buildRow(item, index);
      row.style.gridTemplateColumns = GRID_TEMPLATE;
      list.appendChild(row);
    });
    tableHost.appendChild(list);
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderTable();
  });

  renderTable();
}
