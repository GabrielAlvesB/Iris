import type {
  QuadroBlock,
  QuadroBlockStatus,
  QuadroBlockType,
  QuadroFile,
  QuadroViewport,
} from '../../../shared/types/quadro.types';
import * as quadroState from './quadro.state.js';
import * as kanbanState from '../kanban/kanban.state.js';
import { openFormModal, promptText, openConfirmModal } from '../../ui/modal.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Side = 'top' | 'right' | 'bottom' | 'left';

interface Anchor {
  x: number;
  y: number;
  side: Side;
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
  nota: { width: 260, height: 165 },
  tarefa: { width: 270, height: 175 },
  rotina: { width: 280, height: 185 },
};

let viewportEl: HTMLElement | null = null;
let canvasEl: HTMLElement | null = null;
let minimapEl: HTMLElement | null = null;
let zoomReadoutEl: HTMLElement | null = null;
let shortcutsPopoverEl: HTMLElement | null = null;
let currentViewport: QuadroViewport = { x: 0, y: 0, zoom: 1 };
let blockRects = new Map<string, Rect>();
let selectedBlockId: string | null = null;
let drag: DragOp | null = null;
let connectDrag: { fromBlockId: string; side: Side; pointerX: number; pointerY: number } | null = null;
let dropTargetBlockId: string | null = null;
let hoveredConnectionId: string | null = null;
let hoverHideTimer: ReturnType<typeof setTimeout> | null = null;
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

// Where a line from `rect`'s center towards (towardX, towardY) crosses the
// rectangle's border — connections attach here instead of at raw centers, so
// lines start/end at the card edge rather than cutting through it.
function rectAnchor(rect: Rect, towardX: number, towardY: number): Anchor {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy, side: 'right' };
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  if (scaleX <= scaleY) {
    return { x: cx + dx * scaleX, y: cy + dy * scaleX, side: dx > 0 ? 'right' : 'left' };
  }
  return { x: cx + dx * scaleY, y: cy + dy * scaleY, side: dy > 0 ? 'bottom' : 'top' };
}

function anchorForSide(rect: Rect, side: Side): Anchor {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  switch (side) {
    case 'top':
      return { x: cx, y: rect.y, side };
    case 'bottom':
      return { x: cx, y: rect.y + rect.height, side };
    case 'left':
      return { x: rect.x, y: cy, side };
    case 'right':
      return { x: rect.x + rect.width, y: cy, side };
  }
}

function sideNormal(side: Side): { x: number; y: number } {
  switch (side) {
    case 'right':
      return { x: 1, y: 0 };
    case 'left':
      return { x: -1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

// Control points extend perpendicular to whichever edge each end attaches
// to, so the curve always leaves/enters a card straight-on before bending
// towards the other end — a soft "S" like most whiteboard tools use.
function curveControlPoints(from: Anchor, to: Anchor): { c1: { x: number; y: number }; c2: { x: number; y: number } } {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const mag = clamp(dist * 0.5, 36, 110);
  const n1 = sideNormal(from.side);
  const n2 = sideNormal(to.side);
  return {
    c1: { x: from.x + n1.x * mag, y: from.y + n1.y * mag },
    c2: { x: to.x + n2.x * mag, y: to.y + n2.y * mag },
  };
}

function curvePathD(from: Anchor, to: Anchor): string {
  const { c1, c2 } = curveControlPoints(from, to);
  return `M ${from.x},${from.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`;
}

function bezierMidpoint(from: Anchor, to: Anchor): { x: number; y: number } {
  const { c1, c2 } = curveControlPoints(from, to);
  const t = 0.5;
  const mt = 1 - t;
  const x = mt ** 3 * from.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x;
  const y = mt ** 3 * from.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y;
  return { x, y };
}

function previewPathD(from: Anchor, pointerX: number, pointerY: number): string {
  const dist = Math.hypot(pointerX - from.x, pointerY - from.y);
  const mag = clamp(dist * 0.5, 36, 110);
  const n1 = sideNormal(from.side);
  const c1x = from.x + n1.x * mag;
  const c1y = from.y + n1.y * mag;
  const c2x = pointerX - (pointerX - c1x) * 0.35;
  const c2y = pointerY - (pointerY - c1y) * 0.35;
  return `M ${from.x},${from.y} C ${c1x},${c1y} ${c2x},${c2y} ${pointerX},${pointerY}`;
}

function clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
  if (!viewportEl) return { x: clientX, y: clientY };
  const rect = viewportEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left - currentViewport.x) / currentViewport.zoom,
    y: (clientY - rect.top - currentViewport.y) / currentViewport.zoom,
  };
}

function updateConnectionsForBlock(blockId: string): void {
  if (!canvasEl) return;
  canvasEl.querySelectorAll<SVGPathElement>(`path[data-from="${blockId}"], path[data-to="${blockId}"]`).forEach((path) => {
    const fromRect = blockRects.get(path.dataset.from as string);
    const toRect = blockRects.get(path.dataset.to as string);
    if (!fromRect || !toRect) return;
    const fromCenter = blockCenter(fromRect);
    const toCenter = blockCenter(toRect);
    const from = rectAnchor(fromRect, toCenter.x, toCenter.y);
    const to = rectAnchor(toRect, fromCenter.x, fromCenter.y);
    path.setAttribute('d', curvePathD(from, to));

    const connectionId = path.dataset.connectionId;
    const deleteBtn = canvasEl?.querySelector<HTMLElement>(`.connection-delete[data-connection-id="${connectionId}"]`);
    if (deleteBtn) {
      const mid = bezierMidpoint(from, to);
      deleteBtn.style.left = `${mid.x}px`;
      deleteBtn.style.top = `${mid.y}px`;
    }
  });
}

// ---------- Drag-to-connect ----------

function showConnectionHover(connectionId: string): void {
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
  hoveredConnectionId = connectionId;
  canvasEl?.querySelectorAll<HTMLElement>('.connection-delete').forEach((btn) => {
    btn.classList.toggle('is-visible', btn.dataset.connectionId === connectionId);
  });
  canvasEl?.querySelectorAll<SVGPathElement>('.quadro-connection-line').forEach((line) => {
    line.classList.toggle('is-hovered', line.dataset.connectionId === connectionId);
  });
}

function scheduleHideConnectionHover(connectionId: string): void {
  if (hoverHideTimer) clearTimeout(hoverHideTimer);
  hoverHideTimer = setTimeout(() => {
    if (hoveredConnectionId !== connectionId) return;
    hoveredConnectionId = null;
    canvasEl?.querySelectorAll<HTMLElement>('.connection-delete').forEach((btn) => btn.classList.remove('is-visible'));
    canvasEl?.querySelectorAll<SVGPathElement>('.quadro-connection-line').forEach((line) => line.classList.remove('is-hovered'));
  }, 200);
}

function renderConnectionPreview(): void {
  if (!connectDrag || !canvasEl) return;
  const fromRect = blockRects.get(connectDrag.fromBlockId);
  if (!fromRect) return;
  const from = anchorForSide(fromRect, connectDrag.side);
  const svg = canvasEl.querySelector<SVGSVGElement>('.quadro-connections');
  if (!svg) return;
  let preview = svg.querySelector<SVGPathElement>('.quadro-connection-preview');
  if (!preview) {
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.classList.add('quadro-connection-preview');
    preview.setAttribute('marker-end', 'url(#quadro-arrow-preview)');
    svg.appendChild(preview);
  }
  preview.setAttribute('d', previewPathD(from, connectDrag.pointerX, connectDrag.pointerY));
}

function setDropTarget(blockId: string | null): void {
  if (blockId === dropTargetBlockId) return;
  if (dropTargetBlockId) {
    canvasEl?.querySelector<HTMLElement>(`.quadro-block[data-block-id="${dropTargetBlockId}"]`)?.classList.remove('is-drop-target');
  }
  dropTargetBlockId = blockId;
  if (dropTargetBlockId) {
    canvasEl?.querySelector<HTMLElement>(`.quadro-block[data-block-id="${dropTargetBlockId}"]`)?.classList.add('is-drop-target');
  }
}

function updateDropTarget(clientX: number, clientY: number): void {
  if (!connectDrag) return;
  const el = document.elementFromPoint(clientX, clientY);
  const blockEl = el?.closest<HTMLElement>('.quadro-block');
  const candidateId = blockEl && blockEl.dataset.blockId !== connectDrag.fromBlockId ? (blockEl.dataset.blockId ?? null) : null;
  setDropTarget(candidateId);
}

function startConnectDrag(block: QuadroBlock, side: Side): void {
  const rect = blockRects.get(block.id);
  if (!rect) return;
  const anchor = anchorForSide(rect, side);
  connectDrag = { fromBlockId: block.id, side, pointerX: anchor.x, pointerY: anchor.y };
  canvasEl?.classList.add('connecting');
  canvasEl?.querySelector<HTMLElement>(`.quadro-block[data-block-id="${block.id}"]`)?.classList.add('is-connect-source');
  renderConnectionPreview();
}

function endConnectDrag(): void {
  if (!connectDrag) return;
  const sourceEl = canvasEl?.querySelector<HTMLElement>(`.quadro-block[data-block-id="${connectDrag.fromBlockId}"]`);
  sourceEl?.classList.remove('is-connect-source');
  setDropTarget(null);
  canvasEl?.classList.remove('connecting');
  canvasEl?.querySelector('.quadro-connection-preview')?.remove();
  connectDrag = null;
}

function closeAllBlockMenus(): void {
  canvasEl?.querySelectorAll('.quadro-block-menu.is-open').forEach((menu) => menu.classList.remove('is-open'));
}

function attachGlobalListeners(): void {
  if (globalListenersAttached) return;
  globalListenersAttached = true;

  window.addEventListener('mousemove', (e) => {
    if (connectDrag) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      connectDrag.pointerX = pt.x;
      connectDrag.pointerY = pt.y;
      renderConnectionPreview();
      updateDropTarget(e.clientX, e.clientY);
      return;
    }
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
    if (connectDrag) {
      const fromId = connectDrag.fromBlockId;
      const toId = dropTargetBlockId;
      endConnectDrag();
      if (toId && toId !== fromId) {
        void quadroState.createConnection({ fromBlockId: fromId, toBlockId: toId });
      }
      return;
    }
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
      if (connectDrag) endConnectDrag();
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
  const confirmed = await openConfirmModal({
    title: 'Excluir bloco',
    message: `Excluir o bloco "${block.title || 'Sem título'}"? Essa ação não pode ser desfeita.`,
    confirmText: 'Excluir bloco',
  });
  if (!confirmed) return;
  await quadroState.deleteBlock(block.id);
}

async function openEditBlockModal(block: QuadroBlock): Promise<void> {
  if (block.type === 'tarefa') {
    const result = await openFormModal(
      'Editar tarefa',
      [
        { name: 'title', label: 'Título da tarefa', type: 'text', defaultValue: block.title },
        { name: 'content', label: 'Descrição / Detalhes', type: 'textarea', defaultValue: block.content ?? '', placeholder: 'Detalhes ou notas da tarefa...' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          defaultValue: block.status ?? 'todo',
          options: [
            { value: 'todo', label: 'A fazer' },
            { value: 'doing', label: 'Em progresso' },
            { value: 'done', label: 'Concluído' },
          ],
        },
        { name: 'assignee', label: 'Responsável (iniciais)', type: 'text', defaultValue: block.assignee ?? '', placeholder: 'Ex: MR' },
      ],
      'Salvar alterações',
    );
    if (!result) return;
    await quadroState.updateBlock({
      blockId: block.id,
      title: result.title.trim() || block.title,
      content: result.content.trim() || undefined,
      status: (result.status as QuadroBlockStatus) || 'todo',
      assignee: result.assignee.trim() || undefined,
    });
    return;
  }

  if (block.type === 'nota') {
    const result = await openFormModal(
      'Editar nota',
      [
        { name: 'content', label: 'Conteúdo da nota', type: 'textarea', defaultValue: block.content ?? block.title, placeholder: 'Escreva sua ideia ou anotação...' },
        { name: 'assignee', label: 'Autor (iniciais)', type: 'text', defaultValue: block.assignee ?? '', placeholder: 'Ex: GA' },
      ],
      'Salvar alterações',
    );
    if (!result || !result.content.trim()) return;
    await quadroState.updateBlock({
      blockId: block.id,
      title: result.content.trim().slice(0, 60),
      content: result.content.trim(),
      assignee: result.assignee.trim() || undefined,
    });
    return;
  }

  if (block.type === 'rotina') {
    const result = await openFormModal(
      'Editar rotina',
      [
        { name: 'title', label: 'Nome da rotina', type: 'text', defaultValue: block.title },
        { name: 'days', label: 'Dias da semana', type: 'weekdays', defaultValue: (block.routineDays ?? [1, 2, 3, 4, 5]).join(',') },
        { name: 'time', label: 'Horário', type: 'time', defaultValue: block.routineTime || '18:00' },
        { name: 'streak', label: 'Contagem de dias seguidos (Streak)', type: 'text', defaultValue: String(block.streakCount ?? 0) },
      ],
      'Salvar alterações',
    );
    if (!result || !result.title.trim()) return;
    const routineDays = result.days
      ? result.days
          .split(',')
          .filter((v) => v !== '')
          .map(Number)
      : [];
    const streakCount = Math.max(0, parseInt(result.streak, 10) || 0);
    await quadroState.updateBlock({
      blockId: block.id,
      title: result.title.trim(),
      routineDays,
      routineTime: result.time || undefined,
      streakCount,
    });
  }
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

  const editItem = document.createElement('button');
  editItem.type = 'button';
  editItem.className = 'quadro-block-menu-item';
  editItem.textContent = 'Editar bloco';
  editItem.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllBlockMenus();
    void openEditBlockModal(block);
  });
  menu.appendChild(editItem);

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
    const target = e.target as HTMLElement;
    if (target.closest('button, .quadro-connect-handle')) return;
    selectBlock(selectedBlockId === block.id ? null : block.id);
  });

  el.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, .quadro-connect-handle')) return;
    void openEditBlockModal(block);
  });

  // Connection handles live directly on the outer element (not the clipped
  // inner wrapper below) so they can poke out past the card's border.
  (['top', 'right', 'bottom', 'left'] as Side[]).forEach((side) => {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `quadro-connect-handle quadro-connect-handle--${side}`;
    handle.title = 'Arraste até outro bloco para conectar';
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startConnectDrag(block, side);
    });
    el.appendChild(handle);
  });

  const inner = document.createElement('div');
  inner.className = 'quadro-block-inner';
  inner.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const rect = blockRects.get(block.id);
    if (!rect) return;
    drag = { kind: 'block', blockId: block.id, startX: e.clientX, startY: e.clientY, originX: rect.x, originY: rect.y };
  });
  el.appendChild(inner);

  const header = document.createElement('div');
  header.className = 'quadro-block-header';

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

  const rightGroup = document.createElement('div');
  rightGroup.className = 'quadro-block-header-right';

  if (block.type === 'rotina' && block.routineTime) {
    const timeBadge = document.createElement('span');
    timeBadge.className = 'quadro-routine-time-badge';
    timeBadge.textContent = `⏰ ${block.routineTime}`;
    rightGroup.appendChild(timeBadge);
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-icon quadro-block-edit-btn';
  editBtn.title = 'Editar bloco (duplo clique)';
  editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  editBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void openEditBlockModal(block);
  });
  rightGroup.appendChild(editBtn);

  rightGroup.appendChild(buildBlockMenu(block));
  header.appendChild(rightGroup);
  inner.appendChild(header);

  if (block.type !== 'nota') {
    const titleView = document.createElement('div');
    titleView.className = 'quadro-block-title-view';
    titleView.textContent = block.title || '(Sem título)';
    if (!block.title) titleView.classList.add('is-empty');
    inner.appendChild(titleView);
  }

  if (block.type === 'tarefa') {
    const contentView = document.createElement('div');
    contentView.className = 'quadro-block-content-view';
    contentView.textContent = block.content || '(Sem descrição - duplo clique para editar)';
    if (!block.content) contentView.classList.add('is-empty');
    inner.appendChild(contentView);

    const footer = document.createElement('div');
    footer.className = 'quadro-block-footer quadro-task-footer';

    const hint = document.createElement('span');
    hint.className = 'quadro-task-hint';
    hint.textContent = 'Duplo clique p/ editar';
    footer.appendChild(hint);

    const avatar = document.createElement('button');
    avatar.type = 'button';
    avatar.className = 'quadro-avatar';
    const avatarIcon = document.createElement('span');
    avatarIcon.className = 'quadro-avatar-icon';
    avatarIcon.textContent = '👤';
    avatar.appendChild(avatarIcon);

    const avatarText = document.createElement('span');
    avatarText.className = 'quadro-avatar-text';
    avatarText.textContent = block.assignee ? block.assignee.trim().slice(0, 3).toUpperCase() : '+ Resp';
    avatar.appendChild(avatarText);

    avatar.title = block.assignee ? `Responsável: ${block.assignee}` : 'Definir responsável';
    avatar.addEventListener('mousedown', (e) => e.stopPropagation());
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      void openEditBlockModal(block);
    });
    footer.appendChild(avatar);
    inner.appendChild(footer);
  } else if (block.type === 'nota') {
    const contentView = document.createElement('div');
    contentView.className = 'quadro-block-content-view quadro-block-content-view--nota';
    contentView.textContent = block.content || '(Nota vazia - duplo clique para editar)';
    if (!block.content) contentView.classList.add('is-empty');
    inner.appendChild(contentView);

    const footer = document.createElement('div');
    footer.className = 'quadro-block-footer quadro-nota-footer';

    const editedSpan = document.createElement('span');
    editedSpan.textContent = `editado ${relativeTimeLabel(block.updatedAt)}`;
    footer.appendChild(editedSpan);

    const authorBtn = document.createElement('button');
    authorBtn.type = 'button';
    authorBtn.className = 'quadro-nota-author';
    authorBtn.textContent = block.assignee ? `· ${block.assignee}` : '· + autor';
    authorBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    authorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void openEditBlockModal(block);
    });
    footer.appendChild(authorBtn);

    inner.appendChild(footer);
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
    inner.appendChild(daysRow);

    const footer = document.createElement('div');
    footer.className = 'quadro-block-footer quadro-routine-footer';

    const streak = block.streakCount ?? 0;
    const streakBtn = document.createElement('button');
    streakBtn.type = 'button';
    streakBtn.className = 'quadro-routine-streak';
    streakBtn.textContent = `🔥 ${streak} dia${streak === 1 ? '' : 's'}`;
    streakBtn.title = 'Marcar mais um dia seguido (+1)';
    streakBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    streakBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void quadroState.updateBlock({ blockId: block.id, streakCount: streak + 1 });
    });
    footer.appendChild(streakBtn);

    const nextSpan = document.createElement('span');
    nextSpan.textContent = ` · ${nextOccurrenceLabel(block.routineDays, block.routineTime)}`;
    footer.appendChild(nextSpan);

    inner.appendChild(footer);
  }

  return el;
}

function buildArrowMarker(svgNs: string, id: string, extraClass: string): SVGMarkerElement {
  const marker = document.createElementNS(svgNs, 'marker') as SVGMarkerElement;
  marker.setAttribute('id', id);
  marker.setAttribute('markerWidth', '9');
  marker.setAttribute('markerHeight', '9');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(svgNs, 'path');
  arrowPath.setAttribute('d', 'M0,0 L7,3.5 L0,7 Z');
  arrowPath.setAttribute('class', `quadro-arrow-head ${extraClass}`);
  marker.appendChild(arrowPath);
  return marker;
}

function buildConnectionsLayer(state: QuadroFile): SVGSVGElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
  svg.classList.add('quadro-connections');

  const defs = document.createElementNS(svgNs, 'defs');
  defs.appendChild(buildArrowMarker(svgNs, 'quadro-arrow', ''));
  defs.appendChild(buildArrowMarker(svgNs, 'quadro-arrow-preview', 'quadro-arrow-head--preview'));
  svg.appendChild(defs);

  state.connections.forEach((connection) => {
    const fromRect = blockRects.get(connection.fromBlockId);
    const toRect = blockRects.get(connection.toBlockId);
    if (!fromRect || !toRect) return;
    const fromCenter = blockCenter(fromRect);
    const toCenter = blockCenter(toRect);
    const from = rectAnchor(fromRect, toCenter.x, toCenter.y);
    const to = rectAnchor(toRect, fromCenter.x, fromCenter.y);
    const d = curvePathD(from, to);

    // A wide, invisible path sits under the visible curve so hovering to
    // reveal the delete button doesn't require pixel-perfect aim on a thin line.
    const hit = document.createElementNS(svgNs, 'path');
    hit.dataset.connectionId = connection.id;
    hit.dataset.from = connection.fromBlockId;
    hit.dataset.to = connection.toBlockId;
    hit.setAttribute('d', d);
    hit.classList.add('quadro-connection-hit');
    hit.addEventListener('mouseenter', () => showConnectionHover(connection.id));
    hit.addEventListener('mouseleave', () => scheduleHideConnectionHover(connection.id));
    svg.appendChild(hit);

    const line = document.createElementNS(svgNs, 'path');
    line.dataset.connectionId = connection.id;
    line.dataset.from = connection.fromBlockId;
    line.dataset.to = connection.toBlockId;
    line.setAttribute('d', d);
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
      const fromCenter = blockCenter(fromRect);
      const toCenter = blockCenter(toRect);
      const from = rectAnchor(fromRect, toCenter.x, toCenter.y);
      const to = rectAnchor(toRect, fromCenter.x, fromCenter.y);
      const mid = bezierMidpoint(from, to);

      const btn = document.createElement('button');
      btn.className = 'connection-delete';
      btn.dataset.connectionId = connection.id;
      btn.textContent = '✕';
      btn.title = 'Remover conexão';
      btn.style.left = `${mid.x}px`;
      btn.style.top = `${mid.y}px`;
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('mouseenter', () => showConnectionHover(connection.id));
      btn.addEventListener('mouseleave', () => scheduleHideConnectionHover(connection.id));
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
    'Passe o mouse na borda de um bloco e arraste até outro para conectá-los',
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
  connectDrag = null;
  dropTargetBlockId = null;
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

  const TYPE_ICONS: Record<QuadroBlockType, string> = {
    nota: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    tarefa: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    rotina: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  };

  (['nota', 'tarefa', 'rotina'] as QuadroBlockType[]).forEach((type) => {
    const count = state.blocks.filter((b) => b.type === type).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-secondary quadro-toolbar-type quadro-toolbar-type--${type}`;
    btn.innerHTML = `${TYPE_ICONS[type]} <span>+ ${BLOCK_TYPE_LABELS[type]}${count > 0 ? ` (${count})` : ''}</span>`;
    btn.addEventListener('click', () => void handleAddBlock(type));
    floatingToolbar.appendChild(btn);
  });

  const divider = document.createElement('span');
  divider.className = 'quadro-toolbar-divider';
  floatingToolbar.appendChild(divider);

  const sendKanbanBtn = document.createElement('button');
  sendKanbanBtn.type = 'button';
  sendKanbanBtn.className = 'btn quadro-send-kanban';
  sendKanbanBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg><span>Mandar p/ Kanban</span>';
  sendKanbanBtn.disabled = selectedBlockId === null;
  sendKanbanBtn.addEventListener('click', () => void handleSendToKanban());
  floatingToolbar.appendChild(sendKanbanBtn);

  shell.appendChild(floatingToolbar);

  container.appendChild(shell);

  applyCanvasTransform();

  viewportEl.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.quadro-block') || target.closest('.connection-delete')) return;
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
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
  drag = null;
  connectDrag = null;
  dropTargetBlockId = null;
  hoveredConnectionId = null;
  selectedBlockId = null;
  viewportEl = null;
  canvasEl = null;
  minimapEl = null;
  zoomReadoutEl = null;
  shortcutsPopoverEl = null;
}
