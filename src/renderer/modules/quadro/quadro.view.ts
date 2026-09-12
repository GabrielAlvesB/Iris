import type {
  QuadroBlock,
  QuadroBlockStatus,
  QuadroBlockType,
  QuadroFile,
  QuadroViewport,
} from '../../../shared/types/quadro.types';
import * as quadroState from './quadro.state.js';
import * as kanbanState from '../kanban/kanban.state.js';
import { openFormModal } from '../../ui/modal.js';

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

let viewportEl: HTMLElement | null = null;
let canvasEl: HTMLElement | null = null;
let minimapEl: HTMLElement | null = null;
let zoomReadoutEl: HTMLElement | null = null;
let currentViewport: QuadroViewport = { x: 0, y: 0, zoom: 1 };
let blockRects = new Map<string, Rect>();
let connectFromId: string | null = null;
let selectedBlockId: string | null = null;
let drag: DragOp | null = null;
let persistViewportTimer: ReturnType<typeof setTimeout> | null = null;
let globalListenersAttached = false;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  canvasEl?.classList.toggle('connect-mode', blockId !== null);
  canvasEl?.querySelectorAll<HTMLElement>('.quadro-block').forEach((el) => {
    el.classList.toggle('connecting-from', el.dataset.blockId === blockId);
  });
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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && connectFromId) {
      setConnectMode(null);
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
  const result = await openFormModal(
    `Nova ${BLOCK_TYPE_LABELS[type].toLowerCase()}`,
    [{ name: 'title', label: 'Título', type: 'text' }],
    'Criar',
  );
  if (!result || !result.title.trim()) return;
  const { x, y } = computeSpawnPosition(220, 120);
  await quadroState.createBlock({ type, title: result.title.trim(), x, y });
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
    setConnectMode(null);
    return;
  }
  const fromId = connectFromId;
  setConnectMode(null);
  await quadroState.createConnection({ fromBlockId: fromId, toBlockId: block.id });
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
    if (connectFromId !== null) {
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
    if (connectFromId !== null) return;
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
  typeBadge.append(BLOCK_TYPE_LABELS[block.type]);
  leftGroup.appendChild(typeBadge);

  if (block.type !== 'nota') {
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

  const actions = document.createElement('div');
  actions.className = 'quadro-block-actions';

  const connectBtn = document.createElement('button');
  connectBtn.className = 'btn-icon';
  connectBtn.textContent = '🔗';
  connectBtn.title = 'Conectar a outro bloco';
  connectBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  connectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleConnectClick(block);
  });
  actions.appendChild(connectBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Excluir bloco';
  deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleDeleteBlock(block);
  });
  actions.appendChild(deleteBtn);

  header.appendChild(actions);
  el.appendChild(header);

  const titleInput = document.createElement('input');
  titleInput.className = 'quadro-block-title';
  titleInput.value = block.title;
  titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
  titleInput.addEventListener('change', () => {
    void quadroState.updateBlock({ blockId: block.id, title: titleInput.value });
  });
  el.appendChild(titleInput);

  const contentArea = document.createElement('textarea');
  contentArea.className = 'quadro-block-content';
  contentArea.value = block.content ?? '';
  contentArea.placeholder = 'Escreva aqui...';
  contentArea.addEventListener('mousedown', (e) => e.stopPropagation());
  contentArea.addEventListener('change', () => {
    void quadroState.updateBlock({ blockId: block.id, content: contentArea.value });
  });
  el.appendChild(contentArea);

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

export function render(container: HTMLElement, state: QuadroFile): void {
  attachGlobalListeners();

  currentViewport = state.viewport;
  blockRects = new Map();
  connectFromId = null;
  drag = null;

  container.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'quadro-shell';

  const header = document.createElement('div');
  header.className = 'quadro-header';

  const title = document.createElement('h1');
  title.textContent = 'Quadro';
  header.appendChild(title);

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

  const sendKanbanBtn = document.createElement('button');
  sendKanbanBtn.className = 'btn quadro-send-kanban';
  sendKanbanBtn.textContent = 'Mandar p/ Kanban';
  sendKanbanBtn.disabled = selectedBlockId === null;
  sendKanbanBtn.addEventListener('click', () => void handleSendToKanban());
  floatingToolbar.appendChild(sendKanbanBtn);

  shell.appendChild(floatingToolbar);

  const hint = document.createElement('div');
  hint.className = 'quadro-hint';
  hint.textContent = 'Arraste o fundo para navegar · Scroll para zoom · clique num bloco para selecionar · 🔗 para conectar';
  shell.appendChild(hint);

  container.appendChild(shell);

  applyCanvasTransform();

  viewportEl.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.quadro-block') || target.closest('.connection-delete')) return;
    if (connectFromId !== null) {
      setConnectMode(null);
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
  selectedBlockId = null;
  viewportEl = null;
  canvasEl = null;
  minimapEl = null;
  zoomReadoutEl = null;
}
