import type {
  QuadroBlock,
  QuadroBlockStatus,
  QuadroBlockType,
  QuadroFile,
  QuadroViewport,
} from '../../../shared/types/quadro.types';
import * as quadroState from './quadro.state.js';
import * as kanbanState from '../kanban/kanban.state.js';
import { openFormModal, promptText } from '../../ui/modal.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragOp =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'block'; blockId: string; startX: number; startY: number; originX: number; originY: number };

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const VIEWPORT_PERSIST_DELAY = 500;
const BLOCK_TYPE_LABELS: Record<QuadroBlockType, string> = {
  nota: 'Nota',
  tarefa: 'Tarefa',
  rotina: 'Rotina',
};
const STATUS_LABELS: Record<QuadroBlockStatus, string> = {
  todo: 'A fazer',
  doing: 'Em progresso',
  done: 'Concluído',
};
const STATUS_ORDER: QuadroBlockStatus[] = ['todo', 'doing', 'done'];
const MINIMAP_WIDTH = 160;
const MINIMAP_HEIGHT = 110;
const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_FULL = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const WEEKDAY_FULL_LOWER = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DEFAULT_BLOCK_SIZE: Record<QuadroBlockType, { width: number; height: number }> = {
  nota: { width: 240, height: 140 },
  tarefa: { width: 240, height: 150 },
  rotina: { width: 260, height: 170 },
};

let viewportEl: HTMLElement | null = null;
let canvasEl: HTMLElement | null = null;
let minimapEl: HTMLElement | null = null;
let zoomReadoutEl: HTMLElement | null = null;
let connectToolbarBtn: HTMLButtonElement | null = null;
let shortcutsPopoverEl: HTMLElement | null = null;
let currentViewport: QuadroViewport = { x: 0, y: 0, zoom: 1 };
let blockRects = new Map<string, Rect>();
let connectFromId: string | null = null;
let connectArmed = false;
let selectedBlockId: string | null = null;
let drag: DragOp | null = null;
let persistViewportTimer: ReturnType<typeof setTimeout> | null = null;
let globalListenersAttached = false;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function relativeTimeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD} d`;
}

function routineFrequencyLabel(days: number[] | undefined): string {
  if (!days || days.length === 0) return '';
  const set = new Set(days);
  const isWeekdays = [1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5;
  if (isWeekdays) return 'SEG A SEX';
  if (set.size === 7) return 'TODOS OS DIAS';
  const isWeekend = [0, 6].every((d) => set.has(d)) && set.size === 2;
  if (isWeekend) return 'FDS';
  const sorted = Array.from(set).sort((a, b) => a - b);
  // Cap the label length so it never wraps onto a second line and collides
  // with the "⋯" menu button in the card header.
  if (sorted.length <= 3) return sorted.map((d) => WEEKDAY_FULL[d]).join(' · ');
  return `${sorted.length}x/SEMANA`;
}

function nextOccurrenceLabel(days: number[] | undefined, time: string | undefined): string {
  if (!days || days.length === 0) return 'sem dias definidos';
  const [hh, mm] = (time ?? '09:00').split(':').map((n) => Number(n) || 0);
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + i);
    candidate.setHours(hh, mm, 0, 0);
    if (days.includes(candidate.getDay()) && candidate.getTime() >= now.getTime()) {
      const timeStr = `${String(candidate.getHours()).padStart(2, '0')}:${String(candidate.getMinutes()).padStart(2, '0')}`;
      if (i === 0) return `hoje ${timeStr}`;
      if (i === 1) return `amanhã ${timeStr}`;
      return `${WEEKDAY_FULL_LOWER[candidate.getDay()]} ${timeStr}`;
    }
  }
  return '';
}

function applyCanvasTransform(): void {
  if (!canvasEl) return;
  canvasEl.style.transform = `translate(${currentViewport.x}px, ${currentViewport.y}px) scale(${currentViewport.zoom})`;
  if (zoomReadoutEl) zoomReadoutEl.textContent = `${Math.round(currentViewport.zoom * 100)}%`;
  renderMinimap();
}

function renderMinimap(): void {
  if (!minimapEl || !viewportEl) return;
  const blocks = Array.from(blockRects.entries());
  minimapEl.innerHTML = '';
  if (blocks.length === 0) {
    minimapEl.classList.add('is-empty');
    return;
  }
  minimapEl.classList.remove('is-empty');

  const minX = Math.min(...blocks.map(([, r]) => r.x));
  const minY = Math.min(...blocks.map(([, r]) => r.y));
  const maxX = Math.max(...blocks.map(([, r]) => r.x + r.width));
  const maxY = Math.max(...blocks.map(([, r]) => r.y + r.height));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min(MINIMAP_WIDTH / spanX, MINIMAP_HEIGHT / spanY) * 0.9;
  const offsetX = (MINIMAP_WIDTH - spanX * scale) / 2;
  const offsetY = (MINIMAP_HEIGHT - spanY * scale) / 2;

  blockRects.forEach((rect, blockId) => {
    const type = canvasEl?.querySelector<HTMLElement>(`.quadro-block[data-block-id="${blockId}"]`)?.dataset.blockType;
    const dot = document.createElement('div');
    dot.className = `quadro-minimap-block quadro-minimap-block--${type ?? 'nota'}`;
    dot.style.left = `${offsetX + (rect.x - minX) * scale}px`;
    dot.style.top = `${offsetY + (rect.y - minY) * scale}px`;
    dot.style.width = `${Math.max(rect.width * scale, 4)}px`;
    dot.style.height = `${Math.max(rect.height * scale, 4)}px`;
    minimapEl?.appendChild(dot);
  });

  const viewRect = viewportEl.getBoundingClientRect();
  const viewX = (0 - currentViewport.x) / currentViewport.zoom;
  const viewY = (0 - currentViewport.y) / currentViewport.zoom;
  const viewW = viewRect.width / currentViewport.zoom;
  const viewH = viewRect.height / currentViewport.zoom;

  const cursor = document.createElement('div');
  cursor.className = 'quadro-minimap-viewport';
  cursor.style.left = `${offsetX + (viewX - minX) * scale}px`;
  cursor.style.top = `${offsetY + (viewY - minY) * scale}px`;
  cursor.style.width = `${viewW * scale}px`;
  cursor.style.height = `${viewH * scale}px`;
  minimapEl.appendChild(cursor);
}

function fitToView(): void {
  if (!viewportEl || blockRects.size === 0) return;
  const rects = Array.from(blockRects.values());
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const rect = viewportEl.getBoundingClientRect();
  const padding = 60;
  const zoom = clamp(Math.min((rect.width - padding) / spanX, (rect.height - padding) / spanY), MIN_ZOOM, MAX_ZOOM);

  currentViewport = {
    zoom,
    x: rect.width / 2 - (minX + spanX / 2) * zoom,
    y: rect.height / 2 - (minY + spanY / 2) * zoom,
  };
  applyCanvasTransform();
  schedulePersistViewport();
}

function schedulePersistViewport(): void {
  if (persistViewportTimer) clearTimeout(persistViewportTimer);
  persistViewportTimer = setTimeout(() => {
    void quadroState.updateViewport({ ...currentViewport });
  }, VIEWPORT_PERSIST_DELAY);
}

function blockCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function updateConnectionsForBlock(blockId: string): void {
  if (!canvasEl) return;
  canvasEl.querySelectorAll<SVGLineElement>(`line[data-from="${blockId}"], line[data-to="${blockId}"]`).forEach((line) => {
    const fromRect = blockRects.get(line.dataset.from as string);
    const toRect = blockRects.get(line.dataset.to as string);
    if (!fromRect || !toRect) return;
    const from = blockCenter(fromRect);
    const to = blockCenter(toRect);
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));

    const connectionId = line.dataset.connectionId;
    const deleteBtn = canvasEl?.querySelector<HTMLElement>(`.connection-delete[data-connection-id="${connectionId}"]`);
    if (deleteBtn) {
      deleteBtn.style.left = `${(from.x + to.x) / 2}px`;
      deleteBtn.style.top = `${(from.y + to.y) / 2}px`;
    }
  });
}

function setConnectMode(blockId: string | null): void {
  connectFromId = blockId;
  canvasEl?.classList.toggle('connect-mode', blockId !== null || connectArmed);
  canvasEl?.querySelectorAll<HTMLElement>('.quadro-block').forEach((el) => {
    el.classList.toggle('connecting-from', el.dataset.blockId === blockId);
  });
}

function resetConnect(): void {
  connectArmed = false;
  setConnectMode(null);
  connectToolbarBtn?.classList.remove('is-active');
}

function setConnectArmed(value: boolean): void {
  if (!value) {
    resetConnect();
    return;
  }
  connectArmed = true;
  canvasEl?.classList.add('connect-mode');
  connectToolbarBtn?.classList.add('is-active');
}

function closeAllBlockMenus(): void {
  canvasEl?.querySelectorAll('.quadro-block-menu.is-open').forEach((menu) => menu.classList.remove('is-open'));
}

function attachGlobalListeners(): void {
  if (globalListenersAttached) return;
  globalListenersAttached = true;

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      currentViewport = {
        ...currentViewport,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      };
      applyCanvasTransform();
    } else {
      const dx = (e.clientX - drag.startX) / currentViewport.zoom;
      const dy = (e.clientY - drag.startY) / currentViewport.zoom;
      const x = drag.originX + dx;
      const y = drag.originY + dy;
      const rect = blockRects.get(drag.blockId);
      if (!rect) return;
      rect.x = x;
      rect.y = y;
      const el = canvasEl?.querySelector<HTMLElement>(`.quadro-block[data-block-id="${drag.blockId}"]`);
      if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
      updateConnectionsForBlock(drag.blockId);
    }
  });

  window.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      schedulePersistViewport();
    } else {
      const rect = blockRects.get(drag.blockId);
      if (rect) {
        void quadroState.moveBlock({ blockId: drag.blockId, x: rect.x, y: rect.y });
      }
    }
    drag = null;
  });

  window.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.quadro-block-menu, .quadro-block-menu-btn')) {
      closeAllBlockMenus();
    }
    if (!target.closest('.quadro-shortcuts-wrap')) {
      shortcutsPopoverEl?.classList.remove('is-open');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (connectArmed || connectFromId) resetConnect();
      closeAllBlockMenus();
    }
  });
}

function computeSpawnPosition(width: number, height: number): { x: number; y: number } {
  if (!viewportEl) return { x: 0, y: 0 };
  const rect = viewportEl.getBoundingClientRect();
  // Cascade successive new blocks so they don't stack exactly on top of each other.
  const blockCount = quadroState.getCurrentState()?.blocks.length ?? 0;
  const cascade = (blockCount % 8) * 32;
  const localX = (rect.width / 2 - currentViewport.x) / currentViewport.zoom - width / 2 + cascade;
  const localY = (rect.height / 2 - currentViewport.y) / currentViewport.zoom - height / 2 + cascade;
  return { x: localX, y: localY };
}

async function handleAddBlock(type: QuadroBlockType): Promise<void> {
  const { width, height } = DEFAULT_BLOCK_SIZE[type];

  if (type === 'nota') {
    const result = await openFormModal(
      'Nova nota',
      [
        { name: 'content', label: 'Conteúdo', type: 'textarea', placeholder: 'Cliente quer exportar por período...' },
        { name: 'assignee', label: 'Autor (iniciais)', type: 'text', placeholder: 'Ex: MR' },
      ],
      'Criar',
    );
    if (!result || !result.content.trim()) return;
    const { x, y } = computeSpawnPosition(width, height);
    await quadroState.createBlock({
      type,
      title: result.content.trim().slice(0, 60),
      content: result.content.trim(),
      assignee: result.assignee.trim() || undefined,
      width,
      height,
      x,
      y,
    });
    return;
  }

  if (type === 'tarefa') {
    const result = await openFormModal(
      'Nova tarefa',
      [
        { name: 'title', label: 'Título', type: 'text' },
        { name: 'content', label: 'Descrição', type: 'textarea', placeholder: 'Validar fluxo ponta a ponta...' },
        { name: 'assignee', label: 'Responsável (iniciais)', type: 'text', placeholder: 'Ex: CD' },
      ],
      'Criar',
    );
    if (!result || !result.title.trim()) return;
    const { x, y } = computeSpawnPosition(width, height);
    await quadroState.createBlock({
      type,
      title: result.title.trim(),
      content: result.content.trim() || undefined,
      assignee: result.assignee.trim() || undefined,
      width,
      height,
      x,
      y,
    });
    return;
  }

  const result = await openFormModal(
    'Nova rotina',
    [
      { name: 'title', label: 'Título', type: 'text', placeholder: 'Revisão diária do quadro' },
      { name: 'days', label: 'Dias da semana', type: 'weekdays', defaultValue: '1,2,3,4,5' },
      { name: 'time', label: 'Horário', type: 'time', defaultValue: '18:00' },
    ],
    'Criar',
  );
  if (!result || !result.title.trim()) return;
  const { x, y } = computeSpawnPosition(width, height);
  const routineDays = result.days
    ? result.days
        .split(',')
        .filter((v) => v !== '')
        .map(Number)
    : [];
  await quadroState.createBlock({
    type,
    title: result.title.trim(),
    routineDays,
    routineTime: result.time || undefined,
    width,
    height,
    x,
    y,
  });
}

function selectBlock(blockId: string | null): void {
  selectedBlockId = blockId;
  canvasEl?.querySelectorAll<HTMLElement>('.quadro-block').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.blockId === blockId);
  });
  const sendBtn = document.querySelector<HTMLButtonElement>('.quadro-send-kanban');
  if (sendBtn) sendBtn.disabled = blockId === null;
}

async function handleSendToKanban(): Promise<void> {
  if (!selectedBlockId) return;
  const block = quadroState.getCurrentState()?.blocks.find((b) => b.id === selectedBlockId);
  if (!block) return;

  await kanbanState.loadBoard();
  const board = kanbanState.getCurrentBoard();
  const firstColumn = board?.columns.slice().sort((a, b) => a.order - b.order)[0];
  if (!firstColumn) return;

  await kanbanState.createCard({ columnId: firstColumn.id, title: block.title, description: block.content });

  const btn = document.querySelector<HTMLButtonElement>('.quadro-send-kanban');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Enviado ✓';
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  }
}

function cycleStatus(block: QuadroBlock): QuadroBlockStatus | null {
  const current = block.status ?? null;
  if (current === null) return STATUS_ORDER[0];
  const idx = STATUS_ORDER.indexOf(current);
  return idx >= STATUS_ORDER.length - 1 ? null : STATUS_ORDER[idx + 1];
}

async function handleDeleteBlock(block: QuadroBlock): Promise<void> {
  if (!window.confirm(`Excluir o bloco "${block.title}"?`)) return;
  await quadroState.deleteBlock(block.id);
}

async function handleConnectClick(block: QuadroBlock): Promise<void> {
  if (connectFromId === null) {
    setConnectMode(block.id);
    return;
  }
  if (connectFromId === block.id) {
    resetConnect();
    return;
  }
  const fromId = connectFromId;
  resetConnect();
  await quadroState.createConnection({ fromBlockId: fromId, toBlockId: block.id });
}

function buildBlockMenu(block: QuadroBlock): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'quadro-block-menu-wrap';

  const menuBtn = document.createElement('button');
  menuBtn.className = 'btn-icon quadro-block-menu-btn';
  menuBtn.textContent = '⋯';
  menuBtn.title = 'Mais ações';
  menuBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = wrap.querySelector('.quadro-block-menu');
    const willOpen = !menu?.classList.contains('is-open');
    closeAllBlockMenus();
    if (willOpen) menu?.classList.add('is-open');
  });
  wrap.appendChild(menuBtn);

  const menu = document.createElement('div');
  menu.className = 'quadro-block-menu';
  menu.addEventListener('mousedown', (e) => e.stopPropagation());

  const deleteItem = document.createElement('button');
  deleteItem.type = 'button';
  deleteItem.className = 'quadro-block-menu-item quadro-block-menu-item--danger';
  deleteItem.textContent = 'Excluir bloco';
  deleteItem.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllBlockMenus();
    void handleDeleteBlock(block);
  });
  menu.appendChild(deleteItem);

  wrap.appendChild(menu);
  return wrap;
}

function buildBlockElement(block: QuadroBlock): HTMLElement {
  blockRects.set(block.id, { x: block.x, y: block.y, width: block.width, height: block.height });

  const el = document.createElement('div');
  el.className = `quadro-block quadro-block--${block.type}`;
  el.classList.toggle('is-selected', block.id === selectedBlockId);
  el.dataset.blockId = block.id;
  el.dataset.blockType = block.type;
  el.style.left = `${block.x}px`;
  el.style.top = `${block.y}px`;
  el.style.width = `${block.width}px`;
  el.style.height = `${block.height}px`;

  el.addEventListener('click', (e) => {
    if (connectArmed || connectFromId !== null) {
      e.stopPropagation();
      void handleConnectClick(block);
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button')) return;
    selectBlock(selectedBlockId === block.id ? null : block.id);
  });

  const header = document.createElement('div');
  header.className = 'quadro-block-header';
  header.addEventListener('mousedown', (e) => {
    if (connectArmed || connectFromId !== null) return;
    e.stopPropagation();
    const rect = blockRects.get(block.id);
    if (!rect) return;
    drag = { kind: 'block', blockId: block.id, startX: e.clientX, startY: e.clientY, originX: rect.x, originY: rect.y };
  });

  const leftGroup = document.createElement('div');
  leftGroup.className = 'quadro-block-header-left';

  const typeBadge = document.createElement('span');
  typeBadge.className = 'quadro-block-type';
  const dot = document.createElement('span');
  dot.className = 'quadro-block-dot';
  typeBadge.appendChild(dot);
  const typeLabel = BLOCK_TYPE_LABELS[block.type] + (block.type === 'rotina' && block.routineDays?.length ? ` · ${routineFrequencyLabel(block.routineDays)}` : '');
  const typeLabelEl = document.createElement('span');
  typeLabelEl.className = 'quadro-block-type-label';
  typeLabelEl.textContent = typeLabel;
  typeLabelEl.title = typeLabel;
  typeBadge.appendChild(typeLabelEl);
  leftGroup.appendChild(typeBadge);

  if (block.type === 'tarefa') {
    const statusPill = document.createElement('button');
    statusPill.type = 'button';
    statusPill.className = `quadro-status-pill${block.status ? ` quadro-status-pill--${block.status}` : ' quadro-status-pill--empty'}`;
    statusPill.textContent = block.status ? STATUS_LABELS[block.status].toUpperCase() : '+ status';
    statusPill.title = 'Clique para avançar o status';
    statusPill.addEventListener('mousedown', (e) => e.stopPropagation());
    statusPill.addEventListener('click', (e) => {
      e.stopPropagation();
      void quadroState.updateBlock({ blockId: block.id, status: cycleStatus(block) });
    });
    leftGroup.appendChild(statusPill);
  }

  header.appendChild(leftGroup);
  header.appendChild(buildBlockMenu(block));
  el.appendChild(header);

  if (block.type !== 'nota') {
    const titleInput = document.createElement('input');
    titleInput.className = 'quadro-block-title';
    titleInput.value = block.title;
    titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
    titleInput.addEventListener('change', () => {
      void quadroState.updateBlock({ blockId: block.id, title: titleInput.value });
    });
    el.appendChild(titleInput);
  }

  if (block.type === 'tarefa') {
    const contentArea = document.createElement('textarea');
    contentArea.className = 'quadro-block-content';
    contentArea.value = block.content ?? '';
    contentArea.placeholder = 'Escreva aqui...';
    contentArea.addEventListener('mousedown', (e) => e.stopPropagation());
    contentArea.addEventListener('change', () => {
      void quadroState.updateBlock({ blockId: block.id, content: contentArea.value });
    });
    el.appendChild(contentArea);

    const avatar = document.createElement('button');
    avatar.type = 'button';
    avatar.className = 'quadro-avatar';
    avatar.textContent = block.assignee ? block.assignee.trim().slice(0, 2).toUpperCase() : '+';
    avatar.title = block.assignee ? `Responsável: ${block.assignee}` : 'Definir responsável';
    avatar.addEventListener('mousedown', (e) => e.stopPropagation());
    avatar.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = await promptText('Responsável', 'Iniciais', block.assignee ?? '');
      if (value === null) return;
      void quadroState.updateBlock({ blockId: block.id, assignee: value.trim() });
    });
    el.appendChild(avatar);
  } else if (block.type === 'nota') {
    const contentArea = document.createElement('textarea');
    contentArea.className = 'quadro-block-content quadro-block-content--nota';
    contentArea.value = block.content ?? '';
    contentArea.placeholder = 'Escreva aqui...';
    contentArea.addEventListener('mousedown', (e) => e.stopPropagation());
    contentArea.addEventListener('change', () => {
      void quadroState.updateBlock({ blockId: block.id, content: contentArea.value });
    });
    el.appendChild(contentArea);

    const footer = document.createElement('div');
    footer.className = 'quadro-nota-footer';

    const editedSpan = document.createElement('span');
    editedSpan.textContent = `editado ${relativeTimeLabel(block.updatedAt)}`;
    footer.appendChild(editedSpan);

    const authorBtn = document.createElement('button');
    authorBtn.type = 'button';
    authorBtn.className = 'quadro-nota-author';
    authorBtn.textContent = block.assignee ? `· ${block.assignee}` : '· + autor';
    authorBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    authorBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = await promptText('Autor', 'Iniciais', block.assignee ?? '');
      if (value === null) return;
      void quadroState.updateBlock({ blockId: block.id, assignee: value.trim() });
    });
    footer.appendChild(authorBtn);

    el.appendChild(footer);
  } else {
    const daysRow = document.createElement('div');
    daysRow.className = 'quadro-routine-days';
    const activeDays = new Set(block.routineDays ?? []);
    WEEKDAY_SHORT.forEach((label, dayIndex) => {
      const dayBtn = document.createElement('button');
      dayBtn.type = 'button';
      dayBtn.className = 'quadro-routine-day';
      dayBtn.classList.toggle('is-active', activeDays.has(dayIndex));
      dayBtn.textContent = label;
      dayBtn.title = WEEKDAY_FULL[dayIndex];
      dayBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      dayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeDays.has(dayIndex)) activeDays.delete(dayIndex);
        else activeDays.add(dayIndex);
        void quadroState.updateBlock({ blockId: block.id, routineDays: Array.from(activeDays).sort((a, b) => a - b) });
      });
      daysRow.appendChild(dayBtn);
    });
    el.appendChild(daysRow);

    const footer = document.createElement('div');
    footer.className = 'quadro-routine-footer';

    const streak = block.streakCount ?? 0;
    const streakBtn = document.createElement('button');
    streakBtn.type = 'button';
    streakBtn.className = 'quadro-routine-streak';
    streakBtn.textContent = `${streak} dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}`;
    streakBtn.title = 'Marcar mais um dia seguido';
    streakBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    streakBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void quadroState.updateBlock({ blockId: block.id, streakCount: streak + 1 });
    });
    footer.appendChild(streakBtn);

    const nextSpan = document.createElement('span');
    nextSpan.textContent = ` · próxima ${nextOccurrenceLabel(block.routineDays, block.routineTime)}`;
    footer.appendChild(nextSpan);

    el.appendChild(footer);
  }

  return el;
}

function buildConnectionsLayer(state: QuadroFile): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
  svg.classList.add('quadro-connections');

  const defs = document.createElementNS(svgNs, 'defs');
  const marker = document.createElementNS(svgNs, 'marker');
  marker.setAttribute('id', 'quadro-arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(svgNs, 'path');
  arrowPath.setAttribute('d', 'M0,0 L8,3 L0,6 Z');
  arrowPath.setAttribute('class', 'quadro-arrow-head');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  state.connections.forEach((connection) => {
    const fromRect = blockRects.get(connection.fromBlockId);
    const toRect = blockRects.get(connection.toBlockId);
    if (!fromRect || !toRect) return;
    const from = blockCenter(fromRect);
    const to = blockCenter(toRect);

    const line = document.createElementNS(svgNs, 'line');
    line.dataset.connectionId = connection.id;
    line.dataset.from = connection.fromBlockId;
    line.dataset.to = connection.toBlockId;
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    line.setAttribute('marker-end', 'url(#quadro-arrow)');
    line.classList.add('quadro-connection-line');
    svg.appendChild(line);
  });

  return svg;
}

function buildConnectionDeleteButtons(state: QuadroFile): HTMLButtonElement[] {
  return state.connections
    .map((connection) => {
      const fromRect = blockRects.get(connection.fromBlockId);
      const toRect = blockRects.get(connection.toBlockId);
      if (!fromRect || !toRect) return null;
      const from = blockCenter(fromRect);
      const to = blockCenter(toRect);

      const btn = document.createElement('button');
      btn.className = 'connection-delete';
      btn.dataset.connectionId = connection.id;
      btn.textContent = '✕';
      btn.title = 'Remover conexão';
      btn.style.left = `${(from.x + to.x) / 2}px`;
      btn.style.top = `${(from.y + to.y) / 2}px`;
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void quadroState.deleteConnection(connection.id);
      });
      return btn;
    })
    .filter((el): el is HTMLButtonElement => el !== null);
}

async function handleRenameBoard(currentName: string): Promise<void> {
  const value = await promptText('Renomear quadro', 'Nome do projeto', currentName);
  if (value === null || !value.trim()) return;
  await quadroState.updateBoardName(value.trim());
}

function buildShortcutsPopover(): HTMLElement {
  const popover = document.createElement('div');
  popover.className = 'quadro-shortcuts-popover';
  const items = [
    'Arraste o fundo para navegar',
    'Scroll para dar zoom',
    'Clique num bloco para selecioná-lo',
    'Use "Conectar" e clique em dois blocos para ligá-los',
  ];
  items.forEach((text) => {
    const li = document.createElement('div');
    li.className = 'quadro-shortcuts-item';
    li.textContent = text;
    popover.appendChild(li);
  });
  return popover;
}

export function render(container: HTMLElement, state: QuadroFile): void {
  attachGlobalListeners();

  currentViewport = state.viewport;
  blockRects = new Map();
  connectFromId = null;
  connectArmed = false;
  drag = null;

  container.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'quadro-shell';

  const header = document.createElement('div');
  header.className = 'quadro-header';

  const title = document.createElement('h1');
  title.textContent = 'Quadro';
  header.appendChild(title);

  const boardBadge = document.createElement('button');
  boardBadge.type = 'button';
  boardBadge.className = 'quadro-board-badge';
  boardBadge.textContent = state.boardName || 'Projeto';
  boardBadge.title = 'Clique para renomear';
  boardBadge.addEventListener('click', () => void handleRenameBoard(state.boardName || ''));
  header.appendChild(boardBadge);

  const headerSpacer = document.createElement('span');
  headerSpacer.className = 'quadro-header-spacer';
  header.appendChild(headerSpacer);

  zoomReadoutEl = document.createElement('span');
  zoomReadoutEl.className = 'quadro-zoom-readout';
  zoomReadoutEl.textContent = `${Math.round(currentViewport.zoom * 100)}%`;
  header.appendChild(zoomReadoutEl);

  const fitBtn = document.createElement('button');
  fitBtn.className = 'btn btn-secondary';
  fitBtn.textContent = 'Ajustar à tela';
  fitBtn.addEventListener('click', () => fitToView());
  header.appendChild(fitBtn);

  const shortcutsWrap = document.createElement('div');
  shortcutsWrap.className = 'quadro-shortcuts-wrap';
  const shortcutsBtn = document.createElement('button');
  shortcutsBtn.className = 'btn btn-secondary';
  shortcutsBtn.textContent = '? atalhos';
  const shortcutsPopover = buildShortcutsPopover();
  shortcutsPopoverEl = shortcutsPopover;
  shortcutsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shortcutsPopover.classList.toggle('is-open');
  });
  shortcutsWrap.appendChild(shortcutsBtn);
  shortcutsWrap.appendChild(shortcutsPopover);
  header.appendChild(shortcutsWrap);

  shell.appendChild(header);

  viewportEl = document.createElement('div');
  viewportEl.className = 'quadro-viewport';

  canvasEl = document.createElement('div');
  canvasEl.className = 'quadro-canvas';

  state.blocks.forEach((block) => {
    blockRects.set(block.id, { x: block.x, y: block.y, width: block.width, height: block.height });
  });

  canvasEl.appendChild(buildConnectionsLayer(state));
  state.blocks.forEach((block) => canvasEl?.appendChild(buildBlockElement(block)));
  // Delete buttons are appended last so they stack above blocks whenever a
  // connection's midpoint lands underneath a nearby block.
  buildConnectionDeleteButtons(state).forEach((btn) => canvasEl?.appendChild(btn));

  viewportEl.appendChild(canvasEl);

  minimapEl = document.createElement('div');
  minimapEl.className = 'quadro-minimap';
  minimapEl.style.width = `${MINIMAP_WIDTH}px`;
  minimapEl.style.height = `${MINIMAP_HEIGHT}px`;
  viewportEl.appendChild(minimapEl);

  shell.appendChild(viewportEl);

  const floatingToolbar = document.createElement('div');
  floatingToolbar.className = 'quadro-floating-toolbar';

  (['nota', 'tarefa', 'rotina'] as QuadroBlockType[]).forEach((type) => {
    const count = state.blocks.filter((b) => b.type === type).length;
    const btn = document.createElement('button');
    btn.className = `btn btn-secondary quadro-toolbar-type quadro-toolbar-type--${type}`;
    btn.textContent = count > 0 ? `+ ${BLOCK_TYPE_LABELS[type]} ${count}` : `+ ${BLOCK_TYPE_LABELS[type]}`;
    btn.addEventListener('click', () => void handleAddBlock(type));
    floatingToolbar.appendChild(btn);
  });

  const divider = document.createElement('span');
  divider.className = 'quadro-toolbar-divider';
  floatingToolbar.appendChild(divider);

  connectToolbarBtn = document.createElement('button');
  connectToolbarBtn.className = 'btn btn-secondary quadro-toolbar-connect';
  connectToolbarBtn.textContent = 'Conectar';
  connectToolbarBtn.classList.toggle('is-active', connectArmed);
  connectToolbarBtn.addEventListener('click', () => setConnectArmed(!connectArmed && connectFromId === null));
  floatingToolbar.appendChild(connectToolbarBtn);

  const sendKanbanBtn = document.createElement('button');
  sendKanbanBtn.className = 'btn quadro-send-kanban';
  sendKanbanBtn.textContent = 'Mandar p/ Kanban';
  sendKanbanBtn.disabled = selectedBlockId === null;
  sendKanbanBtn.addEventListener('click', () => void handleSendToKanban());
  floatingToolbar.appendChild(sendKanbanBtn);

  shell.appendChild(floatingToolbar);

  container.appendChild(shell);

  applyCanvasTransform();

  viewportEl.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.quadro-block') || target.closest('.connection-delete')) return;
    if (connectArmed || connectFromId !== null) {
      resetConnect();
      return;
    }
    if (selectedBlockId !== null) selectBlock(null);
    drag = { kind: 'pan', startX: e.clientX, startY: e.clientY, originX: currentViewport.x, originY: currentViewport.y };
  });

  viewportEl.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (!viewportEl) return;
      const rect = viewportEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const localX = (mouseX - currentViewport.x) / currentViewport.zoom;
      const localY = (mouseY - currentViewport.y) / currentViewport.zoom;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = clamp(currentViewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);

      currentViewport = {
        zoom: newZoom,
        x: mouseX - localX * newZoom,
        y: mouseY - localY * newZoom,
      };
      applyCanvasTransform();
      schedulePersistViewport();
    },
    { passive: false },
  );
}

export function destroy(): void {
  if (persistViewportTimer) {
    clearTimeout(persistViewportTimer);
    persistViewportTimer = null;
  }
  drag = null;
  connectFromId = null;
  connectArmed = false;
  selectedBlockId = null;
  viewportEl = null;
  canvasEl = null;
  minimapEl = null;
  zoomReadoutEl = null;
  connectToolbarBtn = null;
  shortcutsPopoverEl = null;
}
