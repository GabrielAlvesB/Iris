import type {
  CommitImportSelection,
  CreateColumnDef,
  DetectImportResult,
  SheetColumn,
  SheetColumnType,
  SheetTable,
  SheetsFile,
} from '../../../shared/types/sheets.types';
import * as sheetsState from './sheets.state.js';
import { promptText } from '../../ui/modal.js';

const ICONS = {
  upload:
    '<svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.5V2.5M8 2.5L4.5 6M8 2.5L11.5 6"/><path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11"/></svg>',
  table:
    '<svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M6.3 6.5v7"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  trash:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4.5"/></svg>',
  edit:
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z"/></svg>',
  eye:
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeOff:
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l12 12M6.6 6.7a2 2 0 0 0 2.8 2.7M4 4.4C2.3 5.5 1 8 1 8s2.5 5 7 5c1.2 0 2.2-.3 3.1-.8M9.9 3.2C9.3 3.1 8.7 3 8 3c-.7 0-1.3.1-1.9.3"/></svg>',
  chevron:
    '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
};

function icon(name: keyof typeof ICONS): string {
  return ICONS[name];
}

const COLUMN_TYPE_LABELS: Record<SheetColumnType, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Data',
  select: 'Seleção',
};

function formatCellDisplay(column: SheetColumn, raw: string): string {
  if (!raw) return '';
  if (column.type === 'date') {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR');
    }
    return raw;
  }
  if (column.type === 'select') {
    const option = column.options?.find((o) => o.value === raw);
    return option ? option.label : raw;
  }
  return raw;
}

function parseOptionsInput(value: string): { value: string; label: string }[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => ({ value: part, label: part }));
}

// Ephemeral UI state — survives across store-driven re-renders because it lives
// at module scope, not inside render(). None of it is persisted.
type ImportFlow =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'selecting'; detected: DetectImportResult };

let importFlow: ImportFlow = { status: 'idle' };
let activeTableId: string | null = null;
let selectionMode = false;
let selectedRowIds = new Set<string>();
let lastContainer: HTMLElement | null = null;
let lastState: SheetsFile | null = null;

function refresh(): void {
  if (lastContainer && lastState) renderRoot(lastContainer, lastState);
}

async function handleImportClick(): Promise<void> {
  importFlow = { status: 'detecting' };
  refresh();
  const detected = await sheetsState.detectImport();
  if (!detected) {
    importFlow = { status: 'idle' };
    refresh();
    return;
  }
  importFlow = { status: 'selecting', detected };
  refresh();
}

function handleCancelImport(): void {
  importFlow = { status: 'idle' };
  refresh();
}

async function handleCreateManualTable(): Promise<void> {
  const result = await openManualTableModal();
  if (!result) return;
  await sheetsState.createTable(result);
}

function openManageVisibility(state: SheetsFile): void {
  buildVisibilityModal(state.tables);
}

function buildHeader(state: SheetsFile): HTMLElement {
  const header = document.createElement('div');
  header.className = 'sheets-header';

  const titleWrap = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'sheets-eyebrow';
  eyebrow.textContent = 'Dados';
  titleWrap.appendChild(eyebrow);
  const title = document.createElement('h1');
  title.textContent = 'Sheets';
  titleWrap.appendChild(title);
  header.appendChild(titleWrap);

  const actions = document.createElement('div');
  actions.className = 'sheets-header-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-secondary';
  importBtn.textContent = 'Importar planilha';
  importBtn.addEventListener('click', () => void handleImportClick());
  actions.appendChild(importBtn);

  const visibilityBtn = document.createElement('button');
  visibilityBtn.className = 'btn btn-secondary';
  visibilityBtn.textContent = 'Gerenciar visibilidade';
  visibilityBtn.disabled = state.tables.length === 0;
  visibilityBtn.addEventListener('click', () => openManageVisibility(state));
  actions.appendChild(visibilityBtn);

  const createBtn = document.createElement('button');
  createBtn.className = 'btn';
  createBtn.innerHTML = `${icon('plus')} Nova tabela manual`;
  createBtn.addEventListener('click', () => void handleCreateManualTable());
  actions.appendChild(createBtn);

  header.appendChild(actions);
  return header;
}

function buildEmptyState(state: SheetsFile): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sheets-empty';

  const heading = document.createElement('div');
  heading.className = 'sheets-empty-heading';
  heading.textContent = 'Nenhuma tabela por aqui ainda';
  wrap.appendChild(heading);

  const options = document.createElement('div');
  options.className = 'sheets-empty-options';

  const importOption = document.createElement('button');
  importOption.type = 'button';
  importOption.className = 'sheets-empty-option';
  importOption.innerHTML = `
    <span class="sheets-empty-option-icon">${icon('upload')}</span>
    <span class="sheets-empty-option-title">Importar planilha</span>
    <span class="sheets-empty-option-desc">Envie um .xlsx, .csv ou .ods e escolha o que aparece aqui.</span>
  `;
  importOption.addEventListener('click', () => void handleImportClick());
  options.appendChild(importOption);

  const manualOption = document.createElement('button');
  manualOption.type = 'button';
  manualOption.className = 'sheets-empty-option';
  manualOption.innerHTML = `
    <span class="sheets-empty-option-icon">${icon('table')}</span>
    <span class="sheets-empty-option-title">Criar tabela manual</span>
    <span class="sheets-empty-option-desc">Defina nome e colunas do zero, sem precisar de um arquivo.</span>
  `;
  manualOption.addEventListener('click', () => void handleCreateManualTable());
  options.appendChild(manualOption);

  wrap.appendChild(options);

  const hiddenCount = state.tables.filter((t) => !t.visible).length;
  if (hiddenCount > 0) {
    const note = document.createElement('button');
    note.type = 'button';
    note.className = 'sheets-empty-hidden-note';
    note.textContent = `Você tem ${hiddenCount} tabela(s) oculta(s). Gerenciar visibilidade`;
    note.addEventListener('click', () => openManageVisibility(state));
    wrap.appendChild(note);
  }

  return wrap;
}

function buildLoadingState(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sheets-loading';
  wrap.innerHTML = `<div class="sheets-spinner"></div><span>Lendo planilha...</span>`;
  return wrap;
}

function gridTemplate(columnCount: number, withCheckbox: boolean): string {
  const cols = new Array(columnCount).fill('minmax(140px, 1fr)');
  cols.push('56px');
  if (withCheckbox) cols.unshift('28px');
  return cols.join(' ');
}

async function handleDeleteTable(table: SheetTable): Promise<void> {
  if (!window.confirm(`Excluir a tabela "${table.name}" e todas as suas linhas? Essa ação não pode ser desfeita.`)) return;
  if (activeTableId === table.id) activeTableId = null;
  await sheetsState.deleteTable({ tableId: table.id });
}

function buildColumnMenu(table: SheetTable, column: SheetColumn, anchor: HTMLElement): void {
  document.querySelectorAll('.sheets-column-menu').forEach((el) => el.remove());

  const menu = document.createElement('div');
  menu.className = 'sheets-column-menu';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'sheets-column-menu-field';
  nameLabel.textContent = 'Nome';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = column.label;
  nameLabel.appendChild(nameInput);
  menu.appendChild(nameLabel);

  const typeLabel = document.createElement('label');
  typeLabel.className = 'sheets-column-menu-field';
  typeLabel.textContent = 'Tipo';
  const typeSelect = document.createElement('select');
  (Object.keys(COLUMN_TYPE_LABELS) as SheetColumnType[]).forEach((type) => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = COLUMN_TYPE_LABELS[type];
    if (type === column.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeLabel.appendChild(typeSelect);
  menu.appendChild(typeLabel);

  const optionsLabel = document.createElement('label');
  optionsLabel.className = 'sheets-column-menu-field';
  optionsLabel.textContent = 'Opções (separadas por vírgula)';
  const optionsInput = document.createElement('input');
  optionsInput.type = 'text';
  optionsInput.value = (column.options ?? []).map((o) => o.label).join(', ');
  optionsLabel.appendChild(optionsInput);
  menu.appendChild(optionsLabel);

  function syncOptionsVisibility(): void {
    optionsLabel.style.display = typeSelect.value === 'select' ? 'flex' : 'none';
  }
  typeSelect.addEventListener('change', syncOptionsVisibility);
  syncOptionsVisibility();

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Salvar';
  saveBtn.addEventListener('click', () => {
    void sheetsState.updateColumn({
      tableId: table.id,
      columnId: column.id,
      label: nameInput.value.trim() || column.label,
      type: typeSelect.value as SheetColumnType,
      options: typeSelect.value === 'select' ? parseOptionsInput(optionsInput.value) : undefined,
    });
    menu.remove();
  });
  menu.appendChild(saveBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-secondary sheets-column-menu-danger';
  deleteBtn.textContent = 'Excluir coluna';
  deleteBtn.addEventListener('click', () => {
    if (!window.confirm(`Excluir a coluna "${column.label}"?`)) return;
    void sheetsState.deleteColumn({ tableId: table.id, columnId: column.id });
    menu.remove();
  });
  menu.appendChild(deleteBtn);

  anchor.appendChild(menu);

  setTimeout(() => {
    document.addEventListener(
      'mousedown',
      function onOutside(e) {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('mousedown', onOutside);
        }
      },
      { once: true },
    );
  }, 0);
}

function startCellEdit(cell: HTMLElement, table: SheetTable, column: SheetColumn, row: { id: string; cells: Record<string, string> }): void {
  const currentValue = row.cells[column.id] ?? '';
  cell.innerHTML = '';
  cell.classList.add('sheets-cell--editing');

  let input: HTMLInputElement | HTMLSelectElement;
  if (column.type === 'select') {
    const select = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(vazio)';
    select.appendChild(blank);
    (column.options ?? []).forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    });
    select.value = currentValue;
    input = select;
  } else {
    const textInput = document.createElement('input');
    textInput.type = column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text';
    textInput.value = currentValue;
    input = textInput;
  }

  cell.appendChild(input);
  input.focus();

  let finished = false;
  const commit = (): void => {
    if (finished) return;
    finished = true;
    const newValue = input.value;
    if (newValue !== currentValue) {
      void sheetsState.updateRow({ tableId: table.id, rowId: row.id, cells: { [column.id]: newValue } });
    } else {
      cell.classList.remove('sheets-cell--editing');
      cell.textContent = formatCellDisplay(column, currentValue);
    }
  };
  const cancel = (): void => {
    if (finished) return;
    finished = true;
    cell.classList.remove('sheets-cell--editing');
    cell.textContent = formatCellDisplay(column, currentValue);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    const keyEvent = e as KeyboardEvent;
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      input.blur();
    } else if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      cancel();
    }
  });
}

function buildSelectionToolbar(table: SheetTable): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'sheets-selection-toolbar';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-secondary';
  toggleBtn.classList.toggle('is-active', selectionMode);
  toggleBtn.textContent = selectionMode ? 'Cancelar seleção' : 'Selecionar linhas';
  toggleBtn.addEventListener('click', () => {
    selectionMode = !selectionMode;
    if (!selectionMode) selectedRowIds = new Set();
    refresh();
  });
  toolbar.appendChild(toggleBtn);

  if (selectionMode) {
    const bar = document.createElement('div');
    bar.className = 'sheets-bulkbar';

    const countLabel = document.createElement('span');
    countLabel.textContent = `${selectedRowIds.size} selecionada(s)`;
    bar.appendChild(countLabel);

    const allIds = table.rows.map((r) => r.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedRowIds.has(id));

    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'sheets-bulkbar-link';
    selectAllBtn.textContent = allSelected ? 'Limpar seleção' : 'Selecionar todas';
    selectAllBtn.addEventListener('click', () => {
      selectedRowIds = allSelected ? new Set() : new Set(allIds);
      refresh();
    });
    bar.appendChild(selectAllBtn);

    const deleteSelectedBtn = document.createElement('button');
    deleteSelectedBtn.type = 'button';
    deleteSelectedBtn.className = 'btn btn-secondary sheets-bulkbar-danger';
    deleteSelectedBtn.textContent = 'Excluir selecionadas';
    deleteSelectedBtn.disabled = selectedRowIds.size === 0;
    deleteSelectedBtn.addEventListener('click', () => {
      const ids = Array.from(selectedRowIds);
      const label = ids.length === 1 ? '1 linha selecionada' : `${ids.length} linhas selecionadas`;
      if (!window.confirm(`Excluir ${label}? Essa ação não pode ser desfeita.`)) return;
      selectedRowIds = new Set();
      void sheetsState.deleteRows({ tableId: table.id, rowIds: ids });
    });
    bar.appendChild(deleteSelectedBtn);

    toolbar.appendChild(bar);
  }

  return toolbar;
}

function buildTableGrid(table: SheetTable): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sheets-grid-wrap';

  wrap.appendChild(buildSelectionToolbar(table));

  const template = gridTemplate(table.columns.length, selectionMode);

  const headerRow = document.createElement('div');
  headerRow.className = 'sheets-row sheets-row--header';
  headerRow.style.gridTemplateColumns = template;

  if (selectionMode) {
    const headerCheckCell = document.createElement('div');
    headerCheckCell.className = 'sheets-header-cell sheets-header-cell--checkbox';
    const headerCheckbox = document.createElement('input');
    headerCheckbox.type = 'checkbox';
    const allIds = table.rows.map((r) => r.id);
    headerCheckbox.checked = allIds.length > 0 && allIds.every((id) => selectedRowIds.has(id));
    headerCheckbox.addEventListener('change', () => {
      selectedRowIds = headerCheckbox.checked ? new Set(allIds) : new Set();
      refresh();
    });
    headerCheckCell.appendChild(headerCheckbox);
    headerRow.appendChild(headerCheckCell);
  }

  table.columns.forEach((column) => {
    const cell = document.createElement('div');
    cell.className = 'sheets-header-cell';

    const label = document.createElement('span');
    label.textContent = column.label;
    cell.appendChild(label);

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'sheets-column-menu-trigger';
    menuBtn.innerHTML = icon('chevron');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      buildColumnMenu(table, column, cell);
    });
    cell.appendChild(menuBtn);

    headerRow.appendChild(cell);
  });

  const addColumnCell = document.createElement('div');
  addColumnCell.className = 'sheets-header-cell sheets-header-cell--actions';
  const addColumnBtn = document.createElement('button');
  addColumnBtn.type = 'button';
  addColumnBtn.className = 'btn-icon';
  addColumnBtn.title = 'Adicionar coluna';
  addColumnBtn.innerHTML = icon('plus');
  addColumnBtn.addEventListener('click', () => void handleAddColumn(table));
  addColumnCell.appendChild(addColumnBtn);
  headerRow.appendChild(addColumnCell);

  wrap.appendChild(headerRow);

  if (table.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sheets-empty-rows';
    empty.textContent = 'Nenhuma linha ainda. Use "+ Nova linha" para começar.';
    wrap.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'sheets-body';
    table.rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'sheets-row';
      rowEl.classList.toggle('sheets-row--selected', selectedRowIds.has(row.id));
      rowEl.style.gridTemplateColumns = template;

      if (selectionMode) {
        const checkCell = document.createElement('div');
        checkCell.className = 'sheets-cell sheets-cell--checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedRowIds.has(row.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedRowIds.add(row.id);
          else selectedRowIds.delete(row.id);
          refresh();
        });
        checkCell.appendChild(checkbox);
        rowEl.appendChild(checkCell);
      }

      table.columns.forEach((column) => {
        const cell = document.createElement('div');
        cell.className = 'sheets-cell';
        if (column.type === 'number') cell.classList.add('sheets-cell--number');
        cell.textContent = formatCellDisplay(column, row.cells[column.id] ?? '');
        cell.title = 'Clique para copiar · duplo clique para editar';

        // A single click copies the cell's text; a double click edits it.
        // The click handler is delayed so a dblclick can cancel it first —
        // otherwise both clicks of the dblclick would fire a copy too.
        let clickTimer: number | undefined;
        cell.addEventListener('click', () => {
          if (clickTimer !== undefined) return;
          clickTimer = window.setTimeout(() => {
            clickTimer = undefined;
            const text = cell.textContent;
            if (!text) return;
            sheetsState.copyToClipboard(text);
            cell.classList.add('sheets-cell--copied');
            setTimeout(() => cell.classList.remove('sheets-cell--copied'), 500);
          }, 220);
        });
        cell.addEventListener('dblclick', () => {
          if (clickTimer !== undefined) {
            window.clearTimeout(clickTimer);
            clickTimer = undefined;
          }
          startCellEdit(cell, table, column, row);
        });
        rowEl.appendChild(cell);
      });

      const actionsCell = document.createElement('div');
      actionsCell.className = 'sheets-cell sheets-cell--actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-icon';
      deleteBtn.title = 'Excluir linha';
      deleteBtn.innerHTML = icon('trash');
      deleteBtn.addEventListener('click', () => {
        if (!window.confirm('Excluir esta linha?')) return;
        void sheetsState.deleteRow({ tableId: table.id, rowId: row.id });
      });
      actionsCell.appendChild(deleteBtn);
      rowEl.appendChild(actionsCell);

      list.appendChild(rowEl);
    });
    wrap.appendChild(list);
  }

  const addRowBtn = document.createElement('button');
  addRowBtn.type = 'button';
  addRowBtn.className = 'btn btn-secondary sheets-add-row';
  addRowBtn.innerHTML = `${icon('plus')} Nova linha`;
  addRowBtn.addEventListener('click', () => void sheetsState.createRow({ tableId: table.id }));
  wrap.appendChild(addRowBtn);

  return wrap;
}

async function handleAddColumn(table: SheetTable): Promise<void> {
  const label = await promptText('Nova coluna', 'Nome da coluna');
  if (!label || !label.trim()) return;
  await sheetsState.addColumn({ tableId: table.id, label: label.trim(), type: 'text' });
}

function buildTabs(visibleTables: SheetTable[]): HTMLElement {
  const tabs = document.createElement('div');
  tabs.className = 'sheets-tabs';

  visibleTables.forEach((table) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'sheets-tab';
    tab.classList.toggle('is-active', table.id === activeTableId);

    const label = document.createElement('span');
    label.textContent = table.name;
    tab.appendChild(label);

    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'sheets-tab-delete';
    deleteBtn.title = 'Excluir tabela';
    deleteBtn.innerHTML = icon('close');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleDeleteTable(table);
    });
    tab.appendChild(deleteBtn);

    tab.addEventListener('click', () => {
      if (activeTableId !== table.id) {
        activeTableId = table.id;
        selectionMode = false;
        selectedRowIds = new Set();
      }
      refresh();
    });
    tabs.appendChild(tab);
  });

  return tabs;
}

function buildHomeScreen(container: HTMLElement, state: SheetsFile): void {
  const root = document.createElement('div');
  root.className = 'sheets-view';
  container.appendChild(root);

  root.appendChild(buildHeader(state));

  const visibleTables = state.tables.filter((t) => t.visible);

  if (visibleTables.length === 0) {
    root.appendChild(buildEmptyState(state));
    return;
  }

  if (!activeTableId || !visibleTables.some((t) => t.id === activeTableId)) {
    activeTableId = visibleTables[0].id;
  }

  root.appendChild(buildTabs(visibleTables));

  const activeTable = visibleTables.find((t) => t.id === activeTableId);
  if (activeTable) {
    root.appendChild(buildTableGrid(activeTable));
  }
}

function buildTablePreview(columns: { label: string }[], rows: string[][]): HTMLElement {
  const preview = document.createElement('div');
  preview.className = 'sheets-preview';

  const headerRow = document.createElement('div');
  headerRow.className = 'sheets-preview-row sheets-preview-row--header';
  columns.forEach((c) => {
    const cell = document.createElement('span');
    cell.textContent = c.label;
    headerRow.appendChild(cell);
  });
  preview.appendChild(headerRow);

  rows.slice(0, 4).forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'sheets-preview-row';
    columns.forEach((_, index) => {
      const cell = document.createElement('span');
      cell.textContent = row[index] ?? '';
      rowEl.appendChild(cell);
    });
    preview.appendChild(rowEl);
  });

  return preview;
}

function buildImportSelectionScreen(container: HTMLElement, detected: DetectImportResult): void {
  const root = document.createElement('div');
  root.className = 'sheets-view';
  container.appendChild(root);

  const header = document.createElement('div');
  header.className = 'sheets-header';
  const titleWrap = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'sheets-eyebrow';
  eyebrow.textContent = detected.fileName;
  titleWrap.appendChild(eyebrow);
  const title = document.createElement('h1');
  title.textContent = 'Escolha as tabelas para importar';
  titleWrap.appendChild(title);
  header.appendChild(titleWrap);
  root.appendChild(header);

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'sheets-card-list';

  const cardState = detected.sheets.map((sheet) => ({
    sheet,
    visible: true,
    tableName: sheet.sheetName,
  }));

  cardState.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'sheets-card';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'sheets-card-header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'sheets-card-name-input';
    nameInput.value = entry.tableName;
    nameInput.addEventListener('input', () => {
      entry.tableName = nameInput.value;
    });
    cardHeader.appendChild(nameInput);

    const visToggle = document.createElement('button');
    visToggle.type = 'button';
    visToggle.className = 'btn-icon sheets-visibility-toggle';
    visToggle.classList.toggle('is-active', entry.visible);
    visToggle.title = 'Mostrar na tela inicial';
    visToggle.innerHTML = entry.visible ? icon('eye') : icon('eyeOff');
    visToggle.addEventListener('click', () => {
      entry.visible = !entry.visible;
      visToggle.classList.toggle('is-active', entry.visible);
      visToggle.innerHTML = entry.visible ? icon('eye') : icon('eyeOff');
    });
    cardHeader.appendChild(visToggle);

    card.appendChild(cardHeader);

    const meta = document.createElement('div');
    meta.className = 'sheets-card-meta';
    meta.textContent = `${entry.sheet.columns.length} coluna(s) · ${entry.sheet.rows.length} linha(s)`;
    card.appendChild(meta);

    card.appendChild(buildTablePreview(entry.sheet.columns, entry.sheet.rows));

    cardsWrap.appendChild(card);
  });

  root.appendChild(cardsWrap);

  const footer = document.createElement('div');
  footer.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', handleCancelImport);
  footer.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn';
  confirmBtn.textContent = 'Confirmar importação';
  confirmBtn.addEventListener('click', () => {
    const selections: CommitImportSelection[] = cardState.map((entry) => ({
      sheetName: entry.sheet.sheetName,
      tableName: entry.tableName.trim() || entry.sheet.sheetName,
      visible: entry.visible,
      columns: entry.sheet.columns,
      rows: entry.sheet.rows,
    }));
    void sheetsState.commitImport({ fileName: detected.fileName, selections }).then(() => {
      importFlow = { status: 'idle' };
      refresh();
    });
  });
  footer.appendChild(confirmBtn);

  root.appendChild(footer);
}

function buildVisibilityModal(tables: SheetTable[]): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal sheets-visibility-modal';

  const heading = document.createElement('h2');
  heading.textContent = 'Gerenciar visibilidade';
  modal.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'sheets-visibility-list';

  tables.forEach((table) => {
    const row = document.createElement('div');
    row.className = 'sheets-visibility-row';

    const info = document.createElement('div');
    info.className = 'sheets-visibility-info';
    const name = document.createElement('span');
    name.className = 'sheets-visibility-name';
    name.textContent = table.name;
    info.appendChild(name);
    const meta = document.createElement('span');
    meta.className = 'sheets-visibility-meta';
    meta.textContent = `${table.origin === 'imported' ? 'Importada' : 'Manual'} · ${table.columns.length} coluna(s) · ${table.rows.length} linha(s)`;
    info.appendChild(meta);
    row.appendChild(info);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn-icon sheets-visibility-toggle';
    toggle.classList.toggle('is-active', table.visible);
    toggle.innerHTML = table.visible ? icon('eye') : icon('eyeOff');
    toggle.addEventListener('click', () => {
      const nextVisible = !toggle.classList.contains('is-active');
      toggle.classList.toggle('is-active', nextVisible);
      toggle.innerHTML = nextVisible ? icon('eye') : icon('eyeOff');
      void sheetsState.setTableVisibility({ tableId: table.id, visible: nextVisible });
    });
    row.appendChild(toggle);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-icon sheets-visibility-delete';
    deleteBtn.title = 'Excluir tabela';
    deleteBtn.innerHTML = icon('trash');
    deleteBtn.addEventListener('click', () => {
      if (!window.confirm(`Excluir a tabela "${table.name}" e todas as suas linhas? Essa ação não pode ser desfeita.`)) return;
      if (activeTableId === table.id) activeTableId = null;
      void sheetsState.deleteTable({ tableId: table.id });
      row.remove();
    });
    row.appendChild(deleteBtn);

    list.appendChild(row);
  });

  modal.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn';
  closeBtn.textContent = 'Fechar';
  closeBtn.addEventListener('click', () => overlay.remove());
  actions.appendChild(closeBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function openManualTableModal(): Promise<{ name: string; columns: CreateColumnDef[] } | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal sheets-manual-modal';

    const heading = document.createElement('h2');
    heading.textContent = 'Nova tabela manual';
    modal.appendChild(heading);

    function finish(result: { name: string; columns: CreateColumnDef[] } | null): void {
      overlay.remove();
      resolve(result);
    }

    const nameField = document.createElement('label');
    nameField.className = 'modal-field';
    const nameLabelSpan = document.createElement('span');
    nameLabelSpan.textContent = 'Nome da tabela';
    nameField.appendChild(nameLabelSpan);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Ex.: Ideias de conteúdo';
    nameField.appendChild(nameInput);
    modal.appendChild(nameField);

    const columnsHeading = document.createElement('div');
    columnsHeading.className = 'sheets-manual-columns-heading';
    columnsHeading.textContent = 'Colunas';
    modal.appendChild(columnsHeading);

    const columnsList = document.createElement('div');
    columnsList.className = 'sheets-manual-columns';
    modal.appendChild(columnsList);

    interface ColumnRow {
      labelInput: HTMLInputElement;
      typeSelect: HTMLSelectElement;
      optionsInput: HTMLInputElement;
    }
    const columnRows: ColumnRow[] = [];

    function addColumnRow(): void {
      const row = document.createElement('div');
      row.className = 'sheets-manual-column-row';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Nome da coluna';
      row.appendChild(labelInput);

      const typeSelect = document.createElement('select');
      (Object.keys(COLUMN_TYPE_LABELS) as SheetColumnType[]).forEach((type) => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = COLUMN_TYPE_LABELS[type];
        typeSelect.appendChild(opt);
      });
      row.appendChild(typeSelect);

      const optionsInput = document.createElement('input');
      optionsInput.type = 'text';
      optionsInput.className = 'sheets-manual-column-options';
      optionsInput.placeholder = 'Opções separadas por vírgula';
      optionsInput.style.display = 'none';
      row.appendChild(optionsInput);

      typeSelect.addEventListener('change', () => {
        optionsInput.style.display = typeSelect.value === 'select' ? 'block' : 'none';
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-icon';
      removeBtn.innerHTML = icon('close');
      removeBtn.addEventListener('click', () => {
        row.remove();
        const idx = columnRows.findIndex((c) => c.labelInput === labelInput);
        if (idx >= 0) columnRows.splice(idx, 1);
      });
      row.appendChild(removeBtn);

      columnsList.appendChild(row);
      columnRows.push({ labelInput, typeSelect, optionsInput });
    }

    addColumnRow();

    const addColumnBtn = document.createElement('button');
    addColumnBtn.type = 'button';
    addColumnBtn.className = 'btn btn-secondary';
    addColumnBtn.innerHTML = `${icon('plus')} Adicionar coluna`;
    addColumnBtn.addEventListener('click', addColumnRow);
    modal.appendChild(addColumnBtn);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => finish(null));
    actions.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn';
    submitBtn.textContent = 'Criar';
    submitBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const columns: CreateColumnDef[] = columnRows
        .map((row) => ({
          label: row.labelInput.value.trim(),
          type: row.typeSelect.value as SheetColumnType,
          options: row.typeSelect.value === 'select' ? parseOptionsInput(row.optionsInput.value) : undefined,
        }))
        .filter((c) => c.label !== '');

      if (!name || columns.length === 0) {
        window.alert('Informe um nome para a tabela e pelo menos uma coluna.');
        return;
      }
      finish({ name, columns });
    });
    actions.appendChild(submitBtn);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null);
    });
    document.body.appendChild(overlay);
    nameInput.focus();
  });
}

function renderRoot(container: HTMLElement, state: SheetsFile): void {
  container.innerHTML = '';

  if (importFlow.status === 'detecting') {
    const root = document.createElement('div');
    root.className = 'sheets-view';
    root.appendChild(buildLoadingState());
    container.appendChild(root);
    return;
  }

  if (importFlow.status === 'selecting') {
    buildImportSelectionScreen(container, importFlow.detected);
    return;
  }

  buildHomeScreen(container, state);
}

export function render(container: HTMLElement, state: SheetsFile): void {
  lastContainer = container;
  lastState = state;
  renderRoot(container, state);
}
