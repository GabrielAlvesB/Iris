import type { KanbanBoard, KanbanCard, KanbanColumn, KanbanSubtask } from '../../../shared/types/kanban.types';
import * as kanbanState from './kanban.state.js';
import { destroySortables, initSortables } from './kanban.dragdrop.js';
import { ICONES_MODAL, openFormModal, openConfirmModal, openAvisoModal, buildSecaoModal, haModalAberto } from '../../ui/modal.js';
import { abrirPainel, lembrarPosicao, lerPosicaoLembrada, type PainelHandle } from '../../ui/painel.js';
import { buildBotao } from '../../ui/pagina.js';

type ViewTab = 'quadro' | 'lista' | 'calendario';

const AVATAR_COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#4c6ef5', '#ec4899', '#14b8a6'];
const PRIORITY_LABELS: Record<'low' | 'medium' | 'high', string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };

let currentBoard: KanbanBoard | null = null;
let activeTab: ViewTab = 'quadro';
let filterWeekOnly = false;
let filterAssignee = 'all';
let boardShortcutsHandler: ((e: KeyboardEvent) => void) | null = null;

let panelHandle: PainelHandle | null = null;
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

function boardPrefix(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? '';
  const letters = firstWord.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return (letters || 'CARD').slice(0, 4);
}

function cardCode(board: KanbanBoard, card: KanbanCard): string {
  return card.seq !== undefined ? `${boardPrefix(board.name)}-${card.seq}` : shortId(card.id);
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

function tagBadge(tag: string): HTMLElement {
  const tagEl = document.createElement('span');
  tagEl.className = 'card-tag';
  tagEl.textContent = tag;
  return tagEl;
}

function buildCardElement(card: KanbanCard): HTMLElement {
  const cardEl = document.createElement('div');
  cardEl.className = 'kanban-card';
  cardEl.dataset.cardId = card.id;

  const tags = card.tags ?? [];

  const topRow = document.createElement('div');
  topRow.className = 'kanban-card-top';

  if (card.priority) {
    const priorityEl = document.createElement('span');
    priorityEl.className = `card-priority priority-${card.priority}`;
    priorityEl.textContent = PRIORITY_LABELS[card.priority].toUpperCase();
    topRow.appendChild(priorityEl);
  }

  // The first tag doubles as a context label next to the priority badge;
  // remaining tags render in the bottom meta row instead.
  const leadTag = tags[0];
  if (leadTag) topRow.appendChild(tagBadge(leadTag));

  if (topRow.childElementCount > 0) cardEl.appendChild(topRow);

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

  tags.slice(leadTag ? 1 : 0).forEach((tag) => metaEl.appendChild(tagBadge(tag)));

  const dueEl = document.createElement('span');
  dueEl.className = 'card-due-date';
  dueEl.textContent = card.dueDate ? formatDueDate(card.dueDate) : 'sem data';
  metaEl.appendChild(dueEl);

  const { done, total } = subtaskProgress(card);
  if (total > 0) {
    const subEl = document.createElement('span');
    subEl.className = 'card-subtask-count';
    subEl.textContent = `☑ ${done}/${total}`;
    metaEl.appendChild(subEl);
  }

  if (card.assignee) {
    const avatar = avatarEl(card.assignee);
    avatar.classList.add('card-meta-avatar');
    metaEl.appendChild(avatar);
  }

  cardEl.appendChild(metaEl);

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
    const isLastColumn = column.order === Math.max(...(currentBoard?.columns.map((c) => c.order) ?? [0]));
    if (isLastColumn) {
      empty.innerHTML = 'Nada concluído ainda<br><span>Arraste um card para cá, ou conclua pelo painel do card.</span>';
      const howItWorksBtn = document.createElement('button');
      howItWorksBtn.type = 'button';
      howItWorksBtn.className = 'kanban-how-it-works-btn';
      howItWorksBtn.textContent = 'Ver como funciona';
      howItWorksBtn.addEventListener('click', () => {
        void openAvisoModal(
          'Como concluir um card',
          'Arraste um card até aqui para concluí-lo, ou abra o card e clique em "Concluir card" no painel lateral. Colunas com limite de WIP avisam quando estão cheias, para você terminar algo antes de puxar o próximo.',
        );
      });
      empty.appendChild(howItWorksBtn);
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
  const result = await openFormModal(
    'Limite de WIP',
    [
      {
        name: 'wipLimit',
        label: 'Máximo de cards nesta coluna',
        type: 'number',
        dica: 'Vazio = sem limite.',
        defaultValue: column.wipLimit != null ? String(column.wipLimit) : '',
      },
    ],
    'Salvar',
    { icone: ICONES_MODAL.colunas, subtitulo: `Coluna "${column.title}". Limitar o trabalho em andamento ajuda a terminar antes de puxar mais.` },
  );
  if (!result) return;
  const parsed = result.wipLimit.trim() === '' ? null : Number.parseInt(result.wipLimit, 10);
  if (parsed !== null && (Number.isNaN(parsed) || parsed < 1)) return;
  await kanbanState.renameColumn({ columnId: column.id, title: column.title, wipLimit: parsed });
}

async function handleDeleteColumn(column: KanbanColumn): Promise<void> {
  const ok = await openConfirmModal({
    title: 'Excluir coluna?',
    message: `A coluna "${column.title}" e todos os seus cards serão removidos permanentemente.`,
    confirmText: 'Excluir coluna',
    danger: true,
  });
  if (!ok) return;
  await kanbanState.deleteColumn(column.id);
}

async function handleAddColumn(): Promise<void> {
  const result = await openFormModal('Nova coluna', [{ name: 'title', label: 'Título', type: 'text' }], 'Criar coluna', {
    icone: ICONES_MODAL.colunas,
  });
  if (!result || !result.title.trim()) return;
  await kanbanState.createColumn({ title: result.title.trim() });
}

function buildAddColumnTile(): HTMLElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'kanban-add-column-tile';
  tile.addEventListener('click', () => void handleAddColumn());

  const label = document.createElement('span');
  label.className = 'kanban-add-column-label';
  label.textContent = '+ Nova coluna';
  tile.appendChild(label);

  return tile;
}

// ---------- Side panel (create/edit card) ----------

function closeCardPanel(): void {
  // Fechar pelo X, Esc ou clique fora também passa por aqui, via aoFechar do painel.
  const handle = panelHandle;
  panelHandle = null;
  if (panelSaveTimer) {
    clearTimeout(panelSaveTimer);
    panelSaveTimer = null;
  }
  if (panelTickTimer) {
    clearInterval(panelTickTimer);
    panelTickTimer = null;
  }
  handle?.fechar();
  panelCardId = null;
  panelDraft = null;
}

function scheduleSave(): void {
  if (!panelCardId) return;
  panelHandle?.marcarSalvando();
  if (panelSaveTimer) clearTimeout(panelSaveTimer);
  panelSaveTimer = setTimeout(() => void commitSave(), 500);
}

async function commitSave(): Promise<void> {
  if (!panelDraft || !panelCardId) return;
  const draft = panelDraft;

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

  panelSavedAt = Date.now();
  updateSavedIndicator();
}

function updateSavedIndicator(): void {
  if (panelHandle) panelHandle.salvo.textContent = `Salvo · ${relativeTime(panelSavedAt)}`;
}

const ICONES_PAINEL = {
  coluna: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bandeira: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  xis: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
} as const;

function iconeSvg(corpo: string, tamanho = 14): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
}

/** Uma linha da lista de propriedades: ícone + rótulo à esquerda, controle à direita. */
function linhaPropriedade(icone: string, rotulo: string, controle: HTMLElement): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'kanban-cp-prop';
  const cabeca = document.createElement('span');
  cabeca.className = 'kanban-cp-prop-rotulo';
  cabeca.innerHTML = iconeSvg(icone);
  cabeca.append(rotulo);
  const valor = document.createElement('div');
  valor.className = 'kanban-cp-prop-valor';
  valor.appendChild(controle);
  linha.append(cabeca, valor);
  return linha;
}

function segmentedPriorityButtons(container: HTMLElement, aoMudar: () => void): void {
  container.innerHTML = '';
  (['high', 'medium', 'low'] as const).forEach((value) => {
    const ativo = panelDraft?.priority === value;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kanban-cp-prioridade is-${value}`;
    btn.classList.toggle('is-ativa', ativo);
    btn.setAttribute('aria-pressed', String(ativo));
    // Prioridade nunca só pela cor: bandeira + texto em todas.
    btn.innerHTML = iconeSvg(ICONES_PAINEL.bandeira, 12);
    btn.append(PRIORITY_LABELS[value]);
    btn.title = ativo ? 'Clique de novo para tirar a prioridade' : `Prioridade ${PRIORITY_LABELS[value].toLowerCase()}`;
    btn.addEventListener('click', () => {
      if (!panelDraft) return;
      panelDraft.priority = panelDraft.priority === value ? '' : value;
      segmentedPriorityButtons(container, aoMudar);
      aoMudar();
    });
    container.appendChild(btn);
  });
}

function renderTagChips(container: HTMLElement, aoMudar: () => void, focar = false): void {
  container.innerHTML = '';
  (panelDraft?.tags ?? []).forEach((tag, index) => {
    const chip = document.createElement('span');
    chip.className = 'kanban-cp-tag';
    chip.textContent = tag;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'kanban-cp-tag-remover';
    remove.title = `Remover a tag "${tag}"`;
    remove.setAttribute('aria-label', `Remover a tag ${tag}`);
    remove.innerHTML = iconeSvg(ICONES_PAINEL.xis, 11);
    remove.addEventListener('click', () => {
      panelDraft?.tags.splice(index, 1);
      renderTagChips(container, aoMudar);
      aoMudar();
    });
    chip.appendChild(remove);
    container.appendChild(chip);
  });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'kanban-cp-tag-input';
  input.placeholder = panelDraft?.tags.length ? 'Adicionar…' : 'Digite e tecle Enter';
  input.setAttribute('aria-label', 'Nova tag');
  const adicionar = (): void => {
    const nome = input.value.trim().replace(/^#/, '');
    if (!nome || !panelDraft) return;
    if (!panelDraft.tags.some((t) => t.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) panelDraft.tags.push(nome);
    renderTagChips(container, aoMudar, true);
    aoMudar();
  };
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      adicionar();
    } else if (e.key === 'Backspace' && !input.value && panelDraft?.tags.length) {
      panelDraft.tags.pop();
      renderTagChips(container, aoMudar, true);
      aoMudar();
    }
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) adicionar();
  });
  container.appendChild(input);
  if (focar) input.focus();
}

function renderSubtasks(container: HTMLElement, aoMudar: () => void, focarNova = false): void {
  container.innerHTML = '';
  const subtasks = panelDraft?.subtasks ?? [];
  const done = subtasks.filter((s) => s.done).length;

  const cabeca = document.createElement('div');
  cabeca.className = 'kanban-cp-sub-cabeca';
  const contador = document.createElement('span');
  contador.className = 'kanban-cp-sub-contador';
  contador.textContent = subtasks.length ? `${done} de ${subtasks.length} concluída${subtasks.length === 1 ? '' : 's'}` : 'Nenhuma subtarefa ainda';
  cabeca.appendChild(contador);
  if (subtasks.length) {
    const barra = document.createElement('span');
    barra.className = 'kanban-cp-sub-barra';
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', String(subtasks.length));
    barra.setAttribute('aria-valuenow', String(done));
    const preenchido = document.createElement('span');
    preenchido.style.width = `${Math.round((done / subtasks.length) * 100)}%`;
    preenchido.classList.toggle('is-completa', done === subtasks.length);
    barra.appendChild(preenchido);
    cabeca.appendChild(barra);
  }
  container.appendChild(cabeca);

  const lista = document.createElement('div');
  lista.className = 'kanban-cp-sub-lista';
  subtasks.forEach((subtask) => {
    const row = document.createElement('div');
    row.className = 'kanban-cp-sub';
    row.classList.toggle('is-feita', subtask.done);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'kanban-cp-check';
    checkbox.checked = subtask.done;
    checkbox.setAttribute('aria-label', `Concluir "${subtask.title || 'subtarefa'}"`);
    checkbox.addEventListener('change', () => {
      subtask.done = checkbox.checked;
      renderSubtasks(container, aoMudar);
      aoMudar();
    });

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'kanban-cp-sub-titulo';
    titleInput.value = subtask.title;
    titleInput.placeholder = 'Subtarefa sem título';
    titleInput.addEventListener('input', () => {
      subtask.title = titleInput.value;
      aoMudar();
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'kanban-cp-sub-remover';
    removeBtn.title = 'Remover subtarefa';
    removeBtn.setAttribute('aria-label', 'Remover subtarefa');
    removeBtn.innerHTML = iconeSvg(ICONES_PAINEL.xis, 13);
    removeBtn.addEventListener('click', () => {
      const idx = subtasks.indexOf(subtask);
      if (idx >= 0) subtasks.splice(idx, 1);
      renderSubtasks(container, aoMudar);
      aoMudar();
    });

    row.append(checkbox, titleInput, removeBtn);
    lista.appendChild(row);
  });
  container.appendChild(lista);

  // Campo sempre visível no fim: Enter adiciona e o foco fica nele para a próxima.
  const nova = document.createElement('div');
  nova.className = 'kanban-cp-sub-nova';
  nova.innerHTML = iconeSvg(ICONES_PAINEL.mais, 14);
  const novaInput = document.createElement('input');
  novaInput.type = 'text';
  novaInput.placeholder = 'Adicionar subtarefa e tecle Enter';
  novaInput.setAttribute('aria-label', 'Nova subtarefa');
  novaInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !novaInput.value.trim()) return;
    e.preventDefault();
    panelDraft?.subtasks.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: novaInput.value.trim(), done: false });
    renderSubtasks(container, aoMudar, true);
    aoMudar();
  });
  nova.appendChild(novaInput);
  container.appendChild(nova);
  if (focarNova) novaInput.focus();
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
  // Coluna escolhida no seletor: num card novo, é onde ele nasce.
  let colunaAlvo = column;
  // Card novo só é gravado no "Criar card"; editar um existente salva na pausa.
  const salvarSeExistir = (): void => {
    if (!isNew) scheduleSave();
  };

  const handle = abrirPainel({
    icone: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    rotulo: card && currentBoard ? cardCode(currentBoard, card) : 'Novo card',
    ariaLabel: isNew ? 'Novo card' : 'Detalhes do card',
    posicao: lerPosicaoLembrada('kanban', 'direita'),
    aoMudarPosicao: (pos) => lembrarPosicao('kanban', pos),
    aoFechar: () => {
      // Fechado por fora (X, Esc, fundo): não perde o que foi digitado há pouco.
      if (panelHandle !== handle) return;
      const pendente = panelSaveTimer !== null && panelCardId !== null;
      if (pendente) void commitSave();
      panelHandle = null;
      closeCardPanel();
    },
    compacto: true,
  });
  panelHandle = handle;
  handle.painel.classList.add('kanban-cp');

  if (isNew) handle.salvo.textContent = 'Esc para cancelar';
  else updateSavedIndicator();

  // ---- Título ----
  const titleInput = document.createElement('textarea');
  titleInput.className = 'kanban-cp-titulo';
  titleInput.rows = 1;
  titleInput.placeholder = isNew ? 'O que precisa ser feito?' : 'Título do card';
  titleInput.setAttribute('aria-label', 'Título do card');
  titleInput.value = panelDraft.title;
  const ajustarTitulo = (): void => {
    titleInput.style.height = 'auto';
    titleInput.style.height = `${titleInput.scrollHeight}px`;
  };
  titleInput.addEventListener('input', () => {
    if (panelDraft) panelDraft.title = titleInput.value;
    ajustarTitulo();
    salvarSeExistir();
  });
  titleInput.addEventListener('keydown', (e) => {
    // Enter no título cria (card novo) ou só confirma; quebra de linha com Shift.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isNew) createBtn?.click();
      else titleInput.blur();
    }
  });
  requestAnimationFrame(ajustarTitulo);
  handle.corpo.insertBefore(titleInput, handle.grade);

  // ---- Propriedades ----
  const props = document.createElement('div');
  props.className = 'kanban-cp-props';

  const colunas = (currentBoard?.columns ?? [column]).slice().sort((a, b) => a.order - b.order);
  const colunaSelect = document.createElement('select');
  colunaSelect.className = 'md-input kanban-cp-select';
  colunaSelect.setAttribute('aria-label', 'Coluna do card');
  colunas.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title;
    colunaSelect.appendChild(opt);
  });
  colunaSelect.value = column.id;
  colunaSelect.addEventListener('change', () => {
    const destino = colunas.find((c) => c.id === colunaSelect.value);
    if (!destino) return;
    colunaAlvo = destino;
    if (isNew || !panelCardId || !currentBoard) return;
    const noFim = currentBoard.cards.filter((c) => c.columnId === destino.id && c.id !== panelCardId).length;
    void kanbanState.moveCard({ cardId: panelCardId, toColumnId: destino.id, toIndex: noFim });
  });
  props.appendChild(linhaPropriedade(ICONES_PAINEL.coluna, 'Coluna', colunaSelect));

  const assigneeWrap = document.createElement('div');
  assigneeWrap.className = 'kanban-cp-responsavel';
  const assigneeAvatar = document.createElement('span');
  assigneeAvatar.className = 'kanban-cp-avatar';
  const assigneeInput = document.createElement('input');
  assigneeInput.type = 'text';
  assigneeInput.className = 'kanban-cp-campo';
  assigneeInput.placeholder = 'Ninguém';
  assigneeInput.setAttribute('aria-label', 'Responsável');
  assigneeInput.value = panelDraft.assignee;
  function updateAssigneeAvatar(): void {
    const name = assigneeInput.value.trim();
    assigneeAvatar.replaceChildren(...(name ? [avatarEl(name, 22)] : []));
    assigneeAvatar.classList.toggle('is-vazio', !name);
    if (!name) assigneeAvatar.innerHTML = iconeSvg(ICONES_PAINEL.pessoa, 12);
  }
  updateAssigneeAvatar();
  assigneeInput.addEventListener('input', () => {
    if (panelDraft) panelDraft.assignee = assigneeInput.value;
    updateAssigneeAvatar();
    salvarSeExistir();
  });
  assigneeWrap.append(assigneeAvatar, assigneeInput);
  props.appendChild(linhaPropriedade(ICONES_PAINEL.pessoa, 'Responsável', assigneeWrap));

  const priorityRow = document.createElement('div');
  priorityRow.className = 'kanban-cp-prioridades';
  segmentedPriorityButtons(priorityRow, salvarSeExistir);
  props.appendChild(linhaPropriedade(ICONES_PAINEL.bandeira, 'Prioridade', priorityRow));

  const dueWrap = document.createElement('div');
  dueWrap.className = 'kanban-cp-prazo';
  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.className = 'md-input kanban-cp-data';
  dueInput.setAttribute('aria-label', 'Prazo');
  dueInput.value = panelDraft.dueDate;
  const atalhos: HTMLButtonElement[] = [];
  const marcarAtalho = (): void => atalhos.forEach((b) => b.classList.toggle('is-ativa', b.dataset.data === dueInput.value));
  dueInput.addEventListener('change', () => {
    if (panelDraft) panelDraft.dueDate = dueInput.value;
    marcarAtalho();
    salvarSeExistir();
  });
  dueWrap.appendChild(dueInput);
  const atalhosWrap = document.createElement('div');
  atalhosWrap.className = 'kanban-cp-atalhos';
  (
    [
      ['Hoje', 0],
      ['Amanhã', 1],
      ['Sexta', ((5 - new Date().getDay() + 7) % 7) || 7],
    ] as const
  ).forEach(([label, offset]) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const quickBtn = document.createElement('button');
    quickBtn.type = 'button';
    quickBtn.className = 'kanban-cp-atalho';
    quickBtn.textContent = label;
    quickBtn.dataset.data = isoDate(d);
    quickBtn.addEventListener('click', () => {
      // Clicar no atalho já marcado limpa o prazo.
      dueInput.value = dueInput.value === quickBtn.dataset.data ? '' : (quickBtn.dataset.data ?? '');
      if (panelDraft) panelDraft.dueDate = dueInput.value;
      marcarAtalho();
      salvarSeExistir();
    });
    atalhos.push(quickBtn);
    atalhosWrap.appendChild(quickBtn);
  });
  marcarAtalho();
  dueWrap.appendChild(atalhosWrap);
  props.appendChild(linhaPropriedade(ICONES_PAINEL.calendario, 'Prazo', dueWrap));

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'kanban-cp-tags';
  renderTagChips(tagsWrap, salvarSeExistir);
  props.appendChild(linhaPropriedade(ICONES_PAINEL.tag, 'Tags', tagsWrap));

  handle.grade.appendChild(props);

  // ---- Subtarefas ----
  const subtarefas = buildSecaoModal('Subtarefas');
  subtarefas.secao.classList.add('kanban-cp-secao');
  const subtasksWrap = document.createElement('div');
  subtasksWrap.className = 'kanban-cp-subtarefas';
  renderSubtasks(subtasksWrap, salvarSeExistir);
  subtarefas.conteudo.appendChild(subtasksWrap);
  handle.grade.appendChild(subtarefas.secao);

  // ---- Descrição ----
  const descricao = buildSecaoModal('Descrição');
  descricao.secao.classList.add('kanban-cp-secao');
  const descTextarea = document.createElement('textarea');
  descTextarea.className = 'md-input md-textarea kanban-cp-descricao';
  descTextarea.rows = 4;
  descTextarea.placeholder = 'Contexto, links, critérios de pronto…';
  descTextarea.setAttribute('aria-label', 'Descrição');
  descTextarea.value = panelDraft.description;
  const ajustarDescricao = (): void => {
    descTextarea.style.height = 'auto';
    descTextarea.style.height = `${Math.max(descTextarea.scrollHeight, 96)}px`;
  };
  descTextarea.addEventListener('input', () => {
    if (panelDraft) panelDraft.description = descTextarea.value;
    ajustarDescricao();
    salvarSeExistir();
  });
  requestAnimationFrame(ajustarDescricao);
  descricao.conteudo.appendChild(descTextarea);
  handle.grade.appendChild(descricao.secao);

  // ---- Rodapé ----
  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  let createBtn: HTMLButtonElement | null = null;

  if (!isNew) {
    const deleteBtn = buildBotao('Excluir', { variante: 'fantasma' });
    deleteBtn.classList.add('is-perigo');
    deleteBtn.addEventListener('click', async () => {
      if (!panelCardId) return;
      const ok = await openConfirmModal({
        title: 'Excluir card?',
        message: 'Este card e todas as suas subtarefas serão removidos permanentemente.',
        confirmText: 'Excluir card',
        danger: true,
      });
      if (!ok || !panelCardId) return;
      const id = panelCardId;
      closeCardPanel();
      await kanbanState.deleteCard(id);
    });

    const completeBtn = buildBotao('Concluir card', { variante: 'primario' });
    completeBtn.addEventListener('click', async () => {
      if (!panelCardId || !currentBoard) return;
      if (panelSaveTimer) {
        clearTimeout(panelSaveTimer);
        panelSaveTimer = null;
        await commitSave();
      }
      const id = panelCardId;
      const lastColumn = currentBoard.columns.slice().sort((a, b) => b.order - a.order)[0];
      closeCardPanel();
      if (lastColumn) {
        await kanbanState.moveCard({ cardId: id, toColumnId: lastColumn.id, toIndex: 0 });
      }
    });
    handle.rodape.append(deleteBtn, espaco, completeBtn);
  } else {
    const cancelBtn = buildBotao('Cancelar', { variante: 'fantasma' });
    cancelBtn.addEventListener('click', () => closeCardPanel());
    createBtn = buildBotao('Criar card', { variante: 'primario' });
    createBtn.addEventListener('click', async () => {
      if (!panelDraft || !panelDraft.title.trim()) {
        titleInput.focus();
        titleInput.classList.add('is-invalido');
        return;
      }
      const draft = panelDraft;
      await kanbanState.createCard({
        columnId: colunaAlvo.id,
        title: draft.title.trim(),
        description: draft.description || undefined,
        assignee: draft.assignee || undefined,
        priority: draft.priority || undefined,
        dueDate: draft.dueDate || undefined,
        tags: draft.tags.length ? draft.tags : undefined,
        subtasks: draft.subtasks.filter((s) => s.title.trim()),
      });
      closeCardPanel();
    });
    handle.rodape.append(espaco, cancelBtn, createBtn);
  }

  titleInput.focus();

  if (!isNew) {
    panelTickTimer = setInterval(updateSavedIndicator, 1000);
  }
}

// ---------- Lista tab ----------

type SortKey = 'title' | 'column' | 'assignee' | 'priority' | 'dueDate';
let listSortKey: SortKey = 'dueDate';
let listSortAsc = true;

function dueBadge(dueDate?: string): HTMLElement {
  const span = document.createElement('span');
  if (!dueDate) {
    span.className = 'kanban-due-badge kanban-due-badge--none';
    span.textContent = 'Sem data';
    return span;
  }
  const today = isoDate(new Date());
  const tomorrow = isoDate(new Date(Date.now() + 86400000));
  if (dueDate < today) {
    span.className = 'kanban-due-badge kanban-due-badge--overdue';
    span.textContent = `⚠ ${formatDueDate(dueDate)}`;
  } else if (dueDate === today) {
    span.className = 'kanban-due-badge kanban-due-badge--today';
    span.textContent = `Hoje`;
  } else if (dueDate === tomorrow) {
    span.className = 'kanban-due-badge kanban-due-badge--tomorrow';
    span.textContent = `Amanhã`;
  } else {
    span.className = 'kanban-due-badge';
    span.textContent = formatDueDate(dueDate);
  }
  return span;
}

function buildListView(board: KanbanBoard): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'kanban-list-view';

  const columnsById = new Map(board.columns.map((c) => [c.id, c]));
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, '': 3 };

  let cards = filteredCards(board).slice();
  cards.sort((a, b) => {
    let cmp = 0;
    if (listSortKey === 'title') cmp = a.title.localeCompare(b.title);
    else if (listSortKey === 'column') cmp = (columnsById.get(a.columnId)?.title ?? '').localeCompare(columnsById.get(b.columnId)?.title ?? '');
    else if (listSortKey === 'assignee') cmp = (a.assignee ?? '').localeCompare(b.assignee ?? '');
    else if (listSortKey === 'priority') cmp = (PRIORITY_ORDER[a.priority ?? ''] ?? 3) - (PRIORITY_ORDER[b.priority ?? ''] ?? 3);
    else cmp = (a.dueDate ?? 'zzzz').localeCompare(b.dueDate ?? 'zzzz');
    return listSortAsc ? cmp : -cmp;
  });

  // Search bar
  const searchWrap = document.createElement('div');
  searchWrap.className = 'kanban-list-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '🔍 Buscar cards...';
  searchInput.className = 'kanban-list-search';
  searchWrap.appendChild(searchInput);
  wrap.appendChild(searchWrap);

  const table = document.createElement('div');
  table.className = 'kanban-list-table';

  const COLS: Array<{ label: string; key: SortKey; className?: string }> = [
    { label: 'Título', key: 'title', className: 'kanban-list-col--title' },
    { label: 'Coluna', key: 'column' },
    { label: 'Responsável', key: 'assignee' },
    { label: 'Prioridade', key: 'priority' },
    { label: 'Prazo', key: 'dueDate' },
  ];

  const headerRow = document.createElement('div');
  headerRow.className = 'kanban-list-row kanban-list-row--header';
  COLS.forEach(({ label, key, className }) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `kanban-list-header-cell${className ? ' ' + className : ''}`;
    const isActive = listSortKey === key;
    cell.innerHTML = `${label}<span class="kanban-sort-arrow">${isActive ? (listSortAsc ? ' ↑' : ' ↓') : ''}</span>`;
    if (isActive) cell.classList.add('kanban-list-header-cell--active');
    cell.addEventListener('click', () => {
      if (listSortKey === key) listSortAsc = !listSortAsc;
      else { listSortKey = key; listSortAsc = true; }
      if (currentBoard) render(wrap.closest('.kanban-list-view')!.parentElement as HTMLElement, currentBoard);
    });
    headerRow.appendChild(cell);
  });
  table.appendChild(headerRow);

  const renderRows = (filter: string) => {
    // Remove old data rows
    table.querySelectorAll('.kanban-list-row:not(.kanban-list-row--header)').forEach((r) => r.remove());
    const empty = table.querySelector('.kanban-list-empty');
    if (empty) empty.remove();

    const filtered = filter ? cards.filter((c) => c.title.toLowerCase().includes(filter.toLowerCase()) || (c.assignee ?? '').toLowerCase().includes(filter.toLowerCase()) || (c.tags ?? []).some((t) => t.toLowerCase().includes(filter.toLowerCase()))) : cards;

    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'kanban-list-empty';
      emptyEl.textContent = filter ? 'Nenhum card encontrado.' : 'Nenhum card corresponde aos filtros.';
      table.appendChild(emptyEl);
      return;
    }

    filtered.forEach((card) => {
      const row = document.createElement('div');
      row.className = 'kanban-list-row';
      row.addEventListener('click', () => {
        const column = columnsById.get(card.columnId);
        if (column) openCardPanel(card, column);
      });

      // Title + tags
      const titleCell = document.createElement('div');
      titleCell.className = 'kanban-list-title kanban-list-col--title';
      const titleText = document.createElement('span');
      titleText.className = 'kanban-list-title-text';
      titleText.textContent = card.title;
      titleCell.appendChild(titleText);
      if (card.tags?.length) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'kanban-list-tags';
        (card.tags ?? []).slice(0, 3).forEach((tag) => {
          const chip = document.createElement('span');
          chip.className = 'kanban-list-tag';
          chip.textContent = tag;
          tagsWrap.appendChild(chip);
        });
        titleCell.appendChild(tagsWrap);
      }
      row.appendChild(titleCell);

      // Column badge
      const columnCell = document.createElement('div');
      const colTitle = columnsById.get(card.columnId)?.title ?? '';
      const colBadge = document.createElement('span');
      colBadge.className = 'kanban-list-column-badge';
      colBadge.textContent = colTitle;
      columnCell.appendChild(colBadge);
      row.appendChild(columnCell);

      // Assignee
      const assigneeCell = document.createElement('div');
      assigneeCell.className = 'kanban-list-assignee';
      if (card.assignee) {
        assigneeCell.appendChild(avatarEl(card.assignee, 20));
        const nameSpan = document.createElement('span');
        nameSpan.className = 'kanban-list-assignee-name';
        nameSpan.textContent = card.assignee;
        assigneeCell.appendChild(nameSpan);
      }
      row.appendChild(assigneeCell);

      // Priority
      const priorityCell = document.createElement('div');
      if (card.priority) {
        const badge = document.createElement('span');
        badge.className = `card-priority priority-${card.priority}`;
        badge.textContent = PRIORITY_LABELS[card.priority].toUpperCase();
        priorityCell.appendChild(badge);
      }
      row.appendChild(priorityCell);

      // Due date
      const dueCell = document.createElement('div');
      dueCell.appendChild(dueBadge(card.dueDate));

      // Subtask progress
      const { done, total } = subtaskProgress(card);
      if (total > 0) {
        const progressWrap = document.createElement('div');
        progressWrap.className = 'kanban-list-subtask-wrap';
        const progressBar = document.createElement('div');
        progressBar.className = 'kanban-list-subtask-bar';
        const fill = document.createElement('div');
        fill.className = 'kanban-list-subtask-fill';
        fill.style.width = `${Math.round((done / total) * 100)}%`;
        progressBar.appendChild(fill);
        progressWrap.appendChild(progressBar);
        const label = document.createElement('span');
        label.className = 'kanban-list-subtask-label';
        label.textContent = `${done}/${total}`;
        progressWrap.appendChild(label);
        dueCell.appendChild(progressWrap);
      }
      row.appendChild(dueCell);

      table.appendChild(row);
    });
  };

  searchInput.addEventListener('input', () => renderRows(searchInput.value));
  renderRows('');
  wrap.appendChild(table);
  return wrap;
}

// ---------- Calendário tab (monthly grid) ----------

let calendarViewDate: Date = new Date();

function buildCalendarView(board: KanbanBoard): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'kanban-calendar-view';

  const columnsById = new Map(board.columns.map((c) => [c.id, c]));
  const allCards = filteredCards(board);

  // Nav bar
  const nav = document.createElement('div');
  nav.className = 'kanban-cal-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn btn-secondary kanban-cal-nav-btn';
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';
  prevBtn.addEventListener('click', () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
    if (currentBoard) render(wrap.closest('[class]')!.parentElement as HTMLElement, currentBoard);
  });
  nav.appendChild(prevBtn);

  const monthLabel = document.createElement('span');
  monthLabel.className = 'kanban-cal-month-label';
  monthLabel.textContent = calendarViewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  nav.appendChild(monthLabel);

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'btn btn-secondary kanban-cal-nav-btn';
  todayBtn.textContent = 'Hoje';
  todayBtn.addEventListener('click', () => {
    calendarViewDate = new Date();
    if (currentBoard) render(wrap.closest('[class]')!.parentElement as HTMLElement, currentBoard);
  });
  nav.appendChild(todayBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn-secondary kanban-cal-nav-btn';
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
  nextBtn.addEventListener('click', () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
    if (currentBoard) render(wrap.closest('[class]')!.parentElement as HTMLElement, currentBoard);
  });
  nav.appendChild(nextBtn);

  wrap.appendChild(nav);

  // Day-of-week headers (Mon–Sun)
  const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const dowRow = document.createElement('div');
  dowRow.className = 'kanban-cal-dow-row';
  DOW_LABELS.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'kanban-cal-dow';
    cell.textContent = d;
    dowRow.appendChild(cell);
  });
  wrap.appendChild(dowRow);

  // Build grid
  const grid = document.createElement('div');
  grid.className = 'kanban-cal-grid';

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const todayStr = isoDate(new Date());

  // Cards indexed by date
  const cardsByDate = new Map<string, KanbanCard[]>();
  const unscheduled: KanbanCard[] = [];
  allCards.forEach((card) => {
    if (!card.dueDate) { unscheduled.push(card); return; }
    if (!cardsByDate.has(card.dueDate)) cardsByDate.set(card.dueDate, []);
    cardsByDate.get(card.dueDate)!.push(card);
  });

  // Start on Monday (ISO week)
  const startOffset = (firstDay.getDay() + 6) % 7;

  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startOffset;
    const date = new Date(year, month, 1 + dayOffset);
    const dateStr = isoDate(date);
    const isCurrentMonth = date.getMonth() === month;
    const isToday = dateStr === todayStr;

    const cell = document.createElement('div');
    cell.className = 'kanban-cal-day';
    if (!isCurrentMonth) cell.classList.add('kanban-cal-day--other-month');
    if (isToday) cell.classList.add('kanban-cal-day--today');

    const dayNum = document.createElement('div');
    dayNum.className = 'kanban-cal-day-num';
    dayNum.textContent = String(date.getDate());
    cell.appendChild(dayNum);

    const dayCards = cardsByDate.get(dateStr) ?? [];
    dayCards.forEach((card) => {
      const chip = document.createElement('div');
      chip.className = `kanban-cal-card-chip${card.priority ? ` kanban-cal-chip--${card.priority}` : ''}`;
      chip.textContent = card.title;
      chip.title = card.title;
      chip.addEventListener('click', () => {
        const col = columnsById.get(card.columnId);
        if (col) openCardPanel(card, col);
      });
      cell.appendChild(chip);
    });

    if (dayCards.length > 3) {
      const more = document.createElement('div');
      more.className = 'kanban-cal-more';
      more.textContent = `+${dayCards.length - 3} mais`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }

  wrap.appendChild(grid);

  // Unscheduled drawer
  if (unscheduled.length > 0) {
    const drawer = document.createElement('div');
    drawer.className = 'kanban-cal-unscheduled';

    const drawerLabel = document.createElement('div');
    drawerLabel.className = 'kanban-cal-unscheduled-label';
    drawerLabel.textContent = `${unscheduled.length} card${unscheduled.length > 1 ? 's' : ''} sem data`;
    drawer.appendChild(drawerLabel);

    const chips = document.createElement('div');
    chips.className = 'kanban-cal-unscheduled-chips';
    unscheduled.forEach((card) => {
      const chip = document.createElement('div');
      chip.className = 'kanban-cal-card-chip kanban-cal-chip--unscheduled';
      chip.textContent = card.title;
      chip.title = card.title;
      chip.addEventListener('click', () => {
        const col = columnsById.get(card.columnId);
        if (col) openCardPanel(card, col);
      });
      chips.appendChild(chip);
    });
    drawer.appendChild(chips);
    wrap.appendChild(drawer);
  }

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
  const TAB_META: Array<{ tab: ViewTab; label: string; icon: string }> = [
    {
      tab: 'quadro',
      label: 'Quadro',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>',
    },
    {
      tab: 'lista',
      label: 'Lista',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    },
    {
      tab: 'calendario',
      label: 'Calendário',
      icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    },
  ];
  TAB_META.forEach(({ tab, label, icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kanban-tab';
    btn.classList.toggle('active', activeTab === tab);
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener('click', () => {
      activeTab = tab;
      onTabChange();
    });
    tabs.appendChild(btn);
  });
  actionsRow.appendChild(tabs);

  const newCardBtn = document.createElement('button');
  newCardBtn.className = 'btn';
  newCardBtn.innerHTML = 'Novo card <span class="kanban-shortcut-hint">⌘K</span>';
  newCardBtn.addEventListener('click', () => {
    const firstColumn = board.columns.slice().sort((a, b) => a.order - b.order)[0];
    if (firstColumn) openCardPanel(null, firstColumn);
  });
  actionsRow.appendChild(newCardBtn);

  headerEl.appendChild(actionsRow);

  return headerEl;
}

// ---------- Global shortcuts ----------

function attachBoardShortcuts(): void {
  if (boardShortcutsHandler) return;
  boardShortcutsHandler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
    e.preventDefault();
    if (panelHandle || haModalAberto() || !currentBoard) return;
    const firstColumn = currentBoard.columns.slice().sort((a, b) => a.order - b.order)[0];
    if (firstColumn) openCardPanel(null, firstColumn);
  };
  document.addEventListener('keydown', boardShortcutsHandler);
}

// ---------- Main render ----------

export function render(container: HTMLElement, board: KanbanBoard): void {
  currentBoard = board;
  attachBoardShortcuts();
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

    columnsEl.appendChild(buildAddColumnTile());

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
  if (boardShortcutsHandler) {
    document.removeEventListener('keydown', boardShortcutsHandler);
    boardShortcutsHandler = null;
  }
}
