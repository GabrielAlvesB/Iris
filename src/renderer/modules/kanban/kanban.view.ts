import type { KanbanBoard, KanbanCard, KanbanColumn, KanbanSubtask } from '../../../shared/types/kanban.types';
import * as kanbanState from './kanban.state.js';
import { destroySortables, initSortables } from './kanban.dragdrop.js';
import { openFormModal } from '../../ui/modal.js';

type ViewTab = 'quadro' | 'lista' | 'calendario';

const AVATAR_COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#4c6ef5', '#ec4899', '#14b8a6'];
const PRIORITY_LABELS: Record<'low' | 'medium' | 'high', string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };

let currentBoard: KanbanBoard | null = null;
let activeTab: ViewTab = 'quadro';
let filterWeekOnly = false;
let filterAssignee = 'all';

let panelEl: HTMLElement | null = null;
let panelCardId: string | null = null;
let panelSaveTimer: ReturnType<typeof setTimeout> | null = null;
let panelTickTimer: ReturnType<typeof setInterval> | null = null;
let panelSavedAt: number = Date.now();
let panelDraft: {
  title: string;
  description: string;
  assignee: string;
  priority: '' | 'low' | 'medium' | 'high';
  dueDate: string;
  tags: string[];
  subtasks: KanbanSubtask[];
} | null = null;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function shortId(id: string): string {
  return `C-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

function formatDueDate(dueDate?: string): string {
  if (!dueDate) return '';
  const date = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dueDate;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isThisWeek(dueDate?: string): boolean {
  if (!dueDate) return false;
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const d = new Date(`${dueDate}T00:00:00`);
  return d >= start && d < end;
}

function relativeTime(fromMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - fromMs) / 1000));
  if (seconds < 5) return 'agora';
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.round(minutes / 60);
  return `há ${hours}h`;
}

function avatarEl(name: string, size = 22): HTMLElement {
  const el = document.createElement('span');
  el.className = 'kanban-avatar';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = `${Math.round(size * 0.42)}px`;
  el.style.background = avatarColor(name);
  el.textContent = initials(name);
  el.title = name;
  return el;
}

function subtaskProgress(card: KanbanCard): { done: number; total: number } {
  const subtasks = card.subtasks ?? [];
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}

function filteredCards(board: KanbanBoard): KanbanCard[] {
  return board.cards.filter((card) => {
    if (filterWeekOnly && !isThisWeek(card.dueDate)) return false;
    if (filterAssignee !== 'all' && (card.assignee ?? '') !== filterAssignee) return false;
    return true;
  });
}

function distinctAssignees(board: KanbanBoard): string[] {
  const set = new Set<string>();
  board.cards.forEach((c) => {
    if (c.assignee) set.add(c.assignee);
  });
  return Array.from(set).sort();
}

// ---------- Card element (Quadro tab) ----------

function buildCardElement(card: KanbanCard): HTMLElement {
  const cardEl = document.createElement('div');
  cardEl.className = 'kanban-card';
  cardEl.dataset.cardId = card.id;

  const topRow = document.createElement('div');
  topRow.className = 'kanban-card-top';

  if (card.priority) {
    const priorityEl = document.createElement('span');
    priorityEl.className = `card-priority priority-${card.priority}`;
    priorityEl.textContent = PRIORITY_LABELS[card.priority].toUpperCase();
    topRow.appendChild(priorityEl);
  } else {
    topRow.appendChild(document.createElement('span'));
  }

  if (card.assignee) {
    topRow.appendChild(avatarEl(card.assignee));
  }

  cardEl.appendChild(topRow);

  const titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  titleEl.textContent = card.title;
  cardEl.appendChild(titleEl);

  if (card.description) {
    const descEl = document.createElement('div');
    descEl.className = 'card-description';
    descEl.textContent = card.description;
    cardEl.appendChild(descEl);
  }

  const metaEl = document.createElement('div');
  metaEl.className = 'card-meta';

  (card.tags ?? []).forEach((tag) => {
    const tagEl = document.createElement('span');
    tagEl.className = 'card-tag';
    tagEl.textContent = tag;
    metaEl.appendChild(tagEl);
  });

  if (card.dueDate) {
    const dueEl = document.createElement('span');
    dueEl.className = 'card-due-date';
    dueEl.textContent = formatDueDate(card.dueDate);
    metaEl.appendChild(dueEl);
  }

  const { done, total } = subtaskProgress(card);
  if (total > 0) {
    const subEl = document.createElement('span');
    subEl.className = 'card-subtask-count';
    subEl.textContent = `☑ ${done}/${total}`;
    metaEl.appendChild(subEl);
  }

  if (metaEl.childElementCount > 0) {
    cardEl.appendChild(metaEl);
  }

  cardEl.addEventListener('click', () => {
    if (!currentBoard) return;
    const column = currentBoard.columns.find((c) => c.id === card.columnId);
    if (column) openCardPanel(card, column);
  });

  return cardEl;
}

function buildColumnElement(column: KanbanColumn, cards: KanbanCard[]): HTMLElement {
  const columnEl = document.createElement('div');
  columnEl.className = 'kanban-column';
  columnEl.dataset.columnId = column.id;

  const headerEl = document.createElement('div');
  headerEl.className = 'kanban-column-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'kanban-column-title-wrap';

  const titleInput = document.createElement('input');
  titleInput.className = 'column-title';
  titleInput.value = column.title;
  titleInput.addEventListener('change', () => {
    void kanbanState.renameColumn({ columnId: column.id, title: titleInput.value, wipLimit: column.wipLimit ?? null });
  });
  titleWrap.appendChild(titleInput);

  const countEl = document.createElement('span');
  countEl.className = 'kanban-column-count';
  const atLimit = column.wipLimit != null && cards.length >= column.wipLimit;
  countEl.classList.toggle('kanban-column-count--limit', atLimit);
  countEl.textContent = column.wipLimit != null ? `${cards.length}/${column.wipLimit}` : String(cards.length);
  countEl.title = 'Clique para definir limite de WIP';
  countEl.addEventListener('click', () => void handleSetWipLimit(column));
  titleWrap.appendChild(countEl);

  headerEl.appendChild(titleWrap);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Excluir coluna';
  deleteBtn.addEventListener('click', () => void handleDeleteColumn(column));
  headerEl.appendChild(deleteBtn);

  columnEl.appendChild(headerEl);

  const listEl = document.createElement('div');
  listEl.className = 'kanban-card-list';
  listEl.dataset.columnId = column.id;

  const sortedCards = cards.slice().sort((a, b) => a.order - b.order);
  if (sortedCards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanban-column-empty';
    if (column.order === Math.max(...(currentBoard?.columns.map((c) => c.order) ?? [0]))) {
      empty.innerHTML = 'Nada concluído ainda<br><span>Arraste um card para cá, ou conclua pelo painel do card.</span>';
    } else {
      empty.textContent = 'Nenhum card aqui ainda.';
    }
    listEl.appendChild(empty);
  } else {
    sortedCards.forEach((card) => listEl.appendChild(buildCardElement(card)));
  }

  columnEl.appendChild(listEl);

  if (atLimit) {
    const warning = document.createElement('div');
    warning.className = 'kanban-wip-warning';
    warning.textContent = 'Limite de WIP atingido. Termine algo antes de puxar o próximo.';
    columnEl.appendChild(warning);
  } else {
    const addCardBtn = document.createElement('button');
    addCardBtn.className = 'add-card-btn';
    addCardBtn.textContent = '+ Adicionar card';
    addCardBtn.addEventListener('click', () => openCardPanel(null, column));
    columnEl.appendChild(addCardBtn);
  }

  return columnEl;
}

async function handleSetWipLimit(column: KanbanColumn): Promise<void> {
  const result = await openFormModal('Limite de WIP', [
    {
      name: 'wipLimit',
      label: 'Máximo de cards nesta coluna (vazio = sem limite)',
      type: 'text',
      defaultValue: column.wipLimit != null ? String(column.wipLimit) : '',
    },
  ], 'Salvar');
  if (!result) return;
  const parsed = result.wipLimit.trim() === '' ? null : Number.parseInt(result.wipLimit, 10);
  if (parsed !== null && (Number.isNaN(parsed) || parsed < 1)) return;
  await kanbanState.renameColumn({ columnId: column.id, title: column.title, wipLimit: parsed });
}

async function handleDeleteColumn(column: KanbanColumn): Promise<void> {
  if (!window.confirm(`Excluir a coluna "${column.title}" e todos os seus cards?`)) return;
  await kanbanState.deleteColumn(column.id);
}

async function handleAddColumn(): Promise<void> {
  const result = await openFormModal('Nova coluna', [{ name: 'title', label: 'Título', type: 'text' }], 'Criar');
  if (!result || !result.title.trim()) return;
  await kanbanState.createColumn({ title: result.title.trim() });
}

// ---------- Side panel (create/edit card) ----------

function closeCardPanel(): void {
  if (panelSaveTimer) {
    clearTimeout(panelSaveTimer);
    panelSaveTimer = null;
  }
  if (panelTickTimer) {
    clearInterval(panelTickTimer);
    panelTickTimer = null;
  }
  panelEl?.remove();
  panelEl = null;
  panelCardId = null;
  panelDraft = null;
  document.removeEventListener('keydown', onPanelKeyDown);
}

function onPanelKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeCardPanel();
}

function scheduleSave(): void {
  const savedIndicator = panelEl?.querySelector<HTMLElement>('.kanban-panel-saved');
  if (savedIndicator) savedIndicator.textContent = 'Salvando…';
  if (panelSaveTimer) clearTimeout(panelSaveTimer);
  panelSaveTimer = setTimeout(() => void commitSave(), 500);
}

async function commitSave(): Promise<void> {
  if (!panelDraft) return;
  const draft = panelDraft;

  if (panelCardId) {
    await kanbanState.updateCard({
      cardId: panelCardId,
      title: draft.title.trim() || 'Sem título',
      description: draft.description || undefined,
      assignee: draft.assignee || undefined,
      priority: draft.priority || undefined,
      dueDate: draft.dueDate || undefined,
      tags: draft.tags,
      subtasks: draft.subtasks,
    });
  }

  panelSavedAt = Date.now();
  updateSavedIndicator();
}

function updateSavedIndicator(): void {
  const el = panelEl?.querySelector<HTMLElement>('.kanban-panel-saved');
  if (el) el.textContent = `Salvo automaticamente · ${relativeTime(panelSavedAt)}`;
}

function segmentedPriorityButtons(container: HTMLElement): void {
  container.innerHTML = '';
  (['high', 'medium', 'low'] as const).forEach((value) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kanban-priority-btn priority-${value}`;
    btn.textContent = PRIORITY_LABELS[value];
    btn.classList.toggle('active', panelDraft?.priority === value);
    btn.addEventListener('click', () => {
      if (!panelDraft) return;
      panelDraft.priority = panelDraft.priority === value ? '' : value;
      segmentedPriorityButtons(container);
      scheduleSave();
    });
    container.appendChild(btn);
  });
}

function renderTagChips(container: HTMLElement): void {
  container.innerHTML = '';
  (panelDraft?.tags ?? []).forEach((tag, index) => {
    const chip = document.createElement('span');
    chip.className = 'kanban-tag-chip';
    chip.textContent = tag;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      panelDraft?.tags.splice(index, 1);
      renderTagChips(container);
      scheduleSave();
    });
    chip.appendChild(remove);
    container.appendChild(chip);
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'kanban-tag-input';
  input.placeholder = '+ tag';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      panelDraft?.tags.push(input.value.trim());
      input.value = '';
      renderTagChips(container);
      scheduleSave();
    }
  });
  container.appendChild(input);
}

function renderSubtasks(container: HTMLElement): void {
  container.innerHTML = '';
  const subtasks = panelDraft?.subtasks ?? [];
  const done = subtasks.filter((s) => s.done).length;

  const heading = document.createElement('div');
  heading.className = 'kanban-subtasks-heading';
  heading.textContent = `Subtarefas · ${done}/${subtasks.length}`;
  container.appendChild(heading);

  subtasks.forEach((subtask) => {
    const row = document.createElement('div');
    row.className = 'kanban-subtask-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = subtask.done;
    checkbox.addEventListener('change', () => {
      subtask.done = checkbox.checked;
      scheduleSave();
    });
    row.appendChild(checkbox);

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'kanban-subtask-title';
    titleInput.value = subtask.title;
    titleInput.classList.toggle('is-done', subtask.done);
    checkbox.addEventListener('change', () => titleInput.classList.toggle('is-done', subtask.done));
    titleInput.addEventListener('change', () => {
      subtask.title = titleInput.value;
      scheduleSave();
    });
    row.appendChild(titleInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-icon';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      const idx = subtasks.indexOf(subtask);
      if (idx >= 0) subtasks.splice(idx, 1);
      renderSubtasks(container);
      scheduleSave();
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'kanban-subtask-add';
  addBtn.textContent = '+ subtarefa';
  addBtn.addEventListener('click', () => {
    panelDraft?.subtasks.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: '', done: false });
    renderSubtasks(container);
  });
  container.appendChild(addBtn);
}

function openCardPanel(card: KanbanCard | null, column: KanbanColumn): void {
  closeCardPanel();

  panelCardId = card?.id ?? null;
  panelSavedAt = Date.now();
  panelDraft = {
    title: card?.title ?? '',
    description: card?.description ?? '',
    assignee: card?.assignee ?? '',
    priority: card?.priority ?? '',
    dueDate: card?.dueDate ?? '',
    tags: [...(card?.tags ?? [])],
    subtasks: (card?.subtasks ?? []).map((s) => ({ ...s })),
  };

  const isNew = card === null;

  const panel = document.createElement('div');
  panel.className = 'kanban-panel';
  panelEl = panel;

  const header = document.createElement('div');
  header.className = 'kanban-panel-header';

  const idChip = document.createElement('span');
  idChip.className = 'kanban-panel-id';
  idChip.textContent = card ? shortId(card.id) : 'Novo card';
  header.appendChild(idChip);

  const columnChip = document.createElement('span');
  columnChip.className = 'kanban-panel-column-chip';
  columnChip.textContent = column.title;
  header.appendChild(columnChip);

  const spacer = document.createElement('span');
  spacer.className = 'kanban-panel-spacer';
  header.appendChild(spacer);

  const closeHint = document.createElement('span');
  closeHint.className = 'kanban-panel-hint';
  closeHint.textContent = 'Esc para fechar';
  header.appendChild(closeHint);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-icon';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => closeCardPanel());
  header.appendChild(closeBtn);

  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'kanban-panel-body';

  const titleInput = document.createElement('textarea');
  titleInput.className = 'kanban-panel-title';
  titleInput.rows = 1;
  titleInput.placeholder = 'Título do card';
  titleInput.value = panelDraft.title;
  titleInput.addEventListener('input', () => {
    if (panelDraft) panelDraft.title = titleInput.value;
    scheduleSave();
  });
  body.appendChild(titleInput);

  function field(labelText: string, contentEl: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'kanban-panel-field';
    const label = document.createElement('span');
    label.className = 'kanban-panel-label';
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(contentEl);
    body.appendChild(wrap);
  }

  const assigneeInput = document.createElement('input');
  assigneeInput.type = 'text';
  assigneeInput.placeholder = 'Nome da pessoa responsável';
  assigneeInput.value = panelDraft.assignee;
  assigneeInput.addEventListener('input', () => {
    if (panelDraft) panelDraft.assignee = assigneeInput.value;
    scheduleSave();
  });
  field('Responsável', assigneeInput);

  const priorityRow = document.createElement('div');
  priorityRow.className = 'kanban-priority-row';
  segmentedPriorityButtons(priorityRow);
  field('Prioridade', priorityRow);

  const dueWrap = document.createElement('div');
  dueWrap.className = 'kanban-due-wrap';
  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.value = panelDraft.dueDate;
  dueInput.addEventListener('change', () => {
    if (panelDraft) panelDraft.dueDate = dueInput.value;
    scheduleSave();
  });
  dueWrap.appendChild(dueInput);
  [
    ['Hoje', 0],
    ['Amanhã', 1],
    ['Sexta', ((5 - new Date().getDay() + 7) % 7) || 7],
  ].forEach(([label, offset]) => {
    const quickBtn = document.createElement('button');
    quickBtn.type = 'button';
    quickBtn.className = 'kanban-due-quick';
    quickBtn.textContent = label as string;
    quickBtn.addEventListener('click', () => {
      const d = new Date();
      d.setDate(d.getDate() + (offset as number));
      dueInput.value = isoDate(d);
      if (panelDraft) panelDraft.dueDate = dueInput.value;
      scheduleSave();
    });
    dueWrap.appendChild(quickBtn);
  });
  field('Prazo', dueWrap);

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'kanban-tags-wrap';
  renderTagChips(tagsWrap);
  field('Tags', tagsWrap);

  const subtasksWrap = document.createElement('div');
  subtasksWrap.className = 'kanban-subtasks-wrap';
  renderSubtasks(subtasksWrap);
  body.appendChild(subtasksWrap);

  const descTextarea = document.createElement('textarea');
  descTextarea.className = 'kanban-panel-description';
  descTextarea.placeholder = 'Descreva o contexto...';
  descTextarea.value = panelDraft.description;
  descTextarea.addEventListener('input', () => {
    if (panelDraft) panelDraft.description = descTextarea.value;
    scheduleSave();
  });
  body.appendChild(descTextarea);

  panel.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'kanban-panel-footer';

  const savedIndicator = document.createElement('span');
  savedIndicator.className = 'kanban-panel-saved';
  savedIndicator.textContent = isNew ? '' : `Salvo automaticamente · ${relativeTime(panelSavedAt)}`;
  footer.appendChild(savedIndicator);

  const footerActions = document.createElement('div');
  footerActions.className = 'kanban-panel-footer-actions';

  if (!isNew) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-secondary';
    deleteBtn.textContent = 'Excluir';
    deleteBtn.addEventListener('click', async () => {
      if (!panelCardId) return;
      if (!window.confirm('Excluir este card?')) return;
      await kanbanState.deleteCard(panelCardId);
      closeCardPanel();
    });
    footerActions.appendChild(deleteBtn);

    const completeBtn = document.createElement('button');
    completeBtn.className = 'btn';
    completeBtn.textContent = 'Concluir card';
    completeBtn.addEventListener('click', async () => {
      if (!panelCardId || !currentBoard) return;
      const lastColumn = currentBoard.columns.slice().sort((a, b) => b.order - a.order)[0];
      if (lastColumn) {
        await kanbanState.moveCard({ cardId: panelCardId, toColumnId: lastColumn.id, toIndex: 0 });
      }
      closeCardPanel();
    });
    footerActions.appendChild(completeBtn);
  } else {
    const createBtn = document.createElement('button');
    createBtn.className = 'btn';
    createBtn.textContent = 'Criar card';
    createBtn.addEventListener('click', async () => {
      if (!panelDraft || !panelDraft.title.trim()) {
        titleInput.focus();
        return;
      }
      const created = await kanbanState.createCardAndReturn({
        columnId: column.id,
        title: panelDraft.title.trim(),
        description: panelDraft.description || undefined,
        assignee: panelDraft.assignee || undefined,
        priority: panelDraft.priority || undefined,
        dueDate: panelDraft.dueDate || undefined,
      });
      if (created && (panelDraft.tags.length > 0 || panelDraft.subtasks.length > 0)) {
        await kanbanState.updateCard({ cardId: created.id, tags: panelDraft.tags, subtasks: panelDraft.subtasks });
      }
      closeCardPanel();
    });
    footerActions.appendChild(createBtn);
  }

  footer.appendChild(footerActions);
  panel.appendChild(footer);

  document.body.appendChild(panel);
  document.addEventListener('keydown', onPanelKeyDown);
  titleInput.focus();

  if (!isNew) {
    panelTickTimer = setInterval(updateSavedIndicator, 1000);
  }
}

// ---------- Lista tab ----------

function buildListView(board: KanbanBoard): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'kanban-list-view';

  const header = document.createElement('div');
  header.className = 'kanban-list-row kanban-list-row--header';
  ['Título', 'Coluna', 'Responsável', 'Prioridade', 'Prazo'].forEach((label) => {
    const cell = document.createElement('span');
    cell.textContent = label;
    header.appendChild(cell);
  });
  wrap.appendChild(header);

  const columnsById = new Map(board.columns.map((c) => [c.id, c]));
  const cards = filteredCards(board).slice().sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

  if (cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanban-list-empty';
    empty.textContent = 'Nenhum card corresponde aos filtros atuais.';
    wrap.appendChild(empty);
    return wrap;
  }

  cards.forEach((card) => {
    const row = document.createElement('div');
    row.className = 'kanban-list-row';
    row.addEventListener('click', () => {
      const column = columnsById.get(card.columnId);
      if (column) openCardPanel(card, column);
    });

    const titleCell = document.createElement('span');
    titleCell.className = 'kanban-list-title';
    titleCell.textContent = card.title;
    row.appendChild(titleCell);

    const columnCell = document.createElement('span');
    columnCell.textContent = columnsById.get(card.columnId)?.title ?? '';
    row.appendChild(columnCell);

    const assigneeCell = document.createElement('span');
    if (card.assignee) {
      assigneeCell.appendChild(avatarEl(card.assignee, 18));
      assigneeCell.append(` ${card.assignee}`);
    }
    row.appendChild(assigneeCell);

    const priorityCell = document.createElement('span');
    if (card.priority) {
      priorityCell.className = `card-priority priority-${card.priority}`;
      priorityCell.textContent = PRIORITY_LABELS[card.priority].toUpperCase();
    }
    row.appendChild(priorityCell);

    const dueCell = document.createElement('span');
    dueCell.className = 'kanban-cell-mono';
    dueCell.textContent = formatDueDate(card.dueDate);
    row.appendChild(dueCell);

    wrap.appendChild(row);
  });

  return wrap;
}

// ---------- Calendário tab (grouped by date) ----------

function buildCalendarView(board: KanbanBoard): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'kanban-calendar-view';

  const columnsById = new Map(board.columns.map((c) => [c.id, c]));
  const cards = filteredCards(board);
  const groups = new Map<string, KanbanCard[]>();
  cards.forEach((card) => {
    const key = card.dueDate ?? 'sem-data';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(card);
  });

  const keys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'sem-data') return 1;
    if (b === 'sem-data') return -1;
    return a.localeCompare(b);
  });

  if (keys.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'kanban-list-empty';
    empty.textContent = 'Nenhum card corresponde aos filtros atuais.';
    wrap.appendChild(empty);
    return wrap;
  }

  keys.forEach((key) => {
    const group = document.createElement('div');
    group.className = 'kanban-calendar-group';

    const heading = document.createElement('div');
    heading.className = 'kanban-calendar-date';
    heading.textContent = key === 'sem-data' ? 'Sem data' : formatDueDate(key);
    group.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'kanban-calendar-cards';
    groups.get(key)!.forEach((card) => {
      const chip = document.createElement('div');
      chip.className = 'kanban-calendar-card';
      chip.addEventListener('click', () => {
        const column = columnsById.get(card.columnId);
        if (column) openCardPanel(card, column);
      });

      const title = document.createElement('span');
      title.textContent = card.title;
      chip.appendChild(title);

      const columnTag = document.createElement('span');
      columnTag.className = 'kanban-calendar-column-tag';
      columnTag.textContent = columnsById.get(card.columnId)?.title ?? '';
      chip.appendChild(columnTag);

      list.appendChild(chip);
    });
    group.appendChild(list);
    wrap.appendChild(group);
  });

  return wrap;
}

// ---------- Header ----------

function buildHeader(board: KanbanBoard, onTabChange: () => void): HTMLElement {
  const headerEl = document.createElement('div');
  headerEl.className = 'kanban-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'kanban-title-row';

  const titleEl = document.createElement('h1');
  titleEl.textContent = board.name;
  titleRow.appendChild(titleEl);

  const filtersRow = document.createElement('div');
  filtersRow.className = 'kanban-filters';

  const weekChip = document.createElement('button');
  weekChip.type = 'button';
  weekChip.className = 'kanban-filter-chip';
  weekChip.classList.toggle('active', filterWeekOnly);
  weekChip.textContent = filterWeekOnly ? 'Esta semana ×' : 'Esta semana';
  weekChip.addEventListener('click', () => {
    filterWeekOnly = !filterWeekOnly;
    onTabChange();
  });
  filtersRow.appendChild(weekChip);

  const assigneeSelect = document.createElement('select');
  assigneeSelect.className = 'kanban-filter-select';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Todos os responsáveis';
  assigneeSelect.appendChild(allOption);
  distinctAssignees(board).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    assigneeSelect.appendChild(opt);
  });
  assigneeSelect.value = filterAssignee;
  assigneeSelect.addEventListener('change', () => {
    filterAssignee = assigneeSelect.value;
    onTabChange();
  });
  filtersRow.appendChild(assigneeSelect);

  titleRow.appendChild(filtersRow);
  headerEl.appendChild(titleRow);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'kanban-actions-row';

  const tabs = document.createElement('div');
  tabs.className = 'kanban-tabs';
  (['quadro', 'lista', 'calendario'] as ViewTab[]).forEach((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kanban-tab';
    btn.classList.toggle('active', activeTab === tab);
    btn.textContent = tab === 'quadro' ? 'Quadro' : tab === 'lista' ? 'Lista' : 'Calendário';
    btn.addEventListener('click', () => {
      activeTab = tab;
      onTabChange();
    });
    tabs.appendChild(btn);
  });
  actionsRow.appendChild(tabs);

  const addColumnBtn = document.createElement('button');
  addColumnBtn.className = 'btn btn-secondary';
  addColumnBtn.textContent = '+ Coluna';
  addColumnBtn.addEventListener('click', () => void handleAddColumn());
  actionsRow.appendChild(addColumnBtn);

  const newCardBtn = document.createElement('button');
  newCardBtn.className = 'btn';
  newCardBtn.textContent = 'Novo card';
  newCardBtn.addEventListener('click', () => {
    const firstColumn = board.columns.slice().sort((a, b) => a.order - b.order)[0];
    if (firstColumn) openCardPanel(null, firstColumn);
  });
  actionsRow.appendChild(newCardBtn);

  headerEl.appendChild(actionsRow);

  return headerEl;
}

// ---------- Main render ----------

export function render(container: HTMLElement, board: KanbanBoard): void {
  currentBoard = board;
  container.innerHTML = '';

  const rerender = () => {
    if (currentBoard) render(container, currentBoard);
  };

  container.appendChild(buildHeader(board, rerender));

  if (activeTab === 'quadro') {
    const boardEl = document.createElement('div');
    boardEl.className = 'kanban-board';

    const columnsEl = document.createElement('div');
    columnsEl.className = 'kanban-columns';

    board.columns
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((column) => {
        const cardsInColumn = filteredCards(board).filter((c) => c.columnId === column.id);
        columnsEl.appendChild(buildColumnElement(column, cardsInColumn));
      });

    boardEl.appendChild(columnsEl);
    container.appendChild(boardEl);
    initSortables(boardEl);
  } else {
    destroySortables();
    container.appendChild(activeTab === 'lista' ? buildListView(board) : buildCalendarView(board));
  }
}

export function destroy(): void {
  destroySortables();
  closeCardPanel();
  kanbanState.offBoardChange();
}
