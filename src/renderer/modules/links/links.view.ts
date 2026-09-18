/// <reference path="../../types/sortablejs-global.d.ts" />
import type { LinksFile, QuickLink } from '../../../shared/types/links.types';
import * as linksState from './links.state.js';
import { promptText, openConfirmModal } from '../../ui/modal.js';

// Curated set of local, monochrome line icons — the app runs 100% offline, so
// icons ship as inline SVG instead of being fetched from an icon CDN at runtime.
const ICON_LIBRARY: Array<{ id: string; label: string; path: string }> = [
  { id: 'web', label: 'Site', path: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.8 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.8-4-9s1.5-6.5 4-9z"/>' },
  { id: 'mail', label: 'E-mail', path: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' },
  { id: 'calendar', label: 'Calendário', path: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { id: 'folder', label: 'Pasta', path: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>' },
  { id: 'cloud', label: 'Nuvem', path: '<path d="M7 18a4 4 0 0 1-.6-7.96A5 5 0 0 1 16 7.6 4.5 4.5 0 0 1 17.5 18H7z"/>' },
  { id: 'doc', label: 'Documento', path: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>' },
  { id: 'chart', label: 'Planilha', path: '<path d="M4 20V10M11 20V4M18 20v-7"/><path d="M3 20h18"/>' },
  { id: 'image', label: 'Imagem', path: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-5 5"/>' },
  { id: 'video', label: 'Vídeo', path: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>' },
  { id: 'music', label: 'Música', path: '<circle cx="6" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/><path d="M8.5 18V6l11-2v12"/>' },
  { id: 'camera', label: 'Câmera', path: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.3"/>' },
  { id: 'cart', label: 'Loja', path: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/>' },
  { id: 'briefcase', label: 'Trabalho', path: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>' },
  { id: 'bank', label: 'Financeiro', path: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3 6 1.5 6 4.5 0 1.4-1.3 2.5-3 2.5s-3-1.1-3-2.5"/>' },
  { id: 'chat', label: 'Conversa', path: '<path d="M4 5h16v11H8l-4 4z"/>' },
  { id: 'code', label: 'Código', path: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6M13 4l-2 16"/>' },
  { id: 'gamepad', label: 'Jogos', path: '<rect x="2" y="8" width="20" height="9" rx="4"/><path d="M7 10.5v4M5 12.5h4M15.5 11.5h.01M18 13.5h.01"/>' },
  { id: 'heart', label: 'Favorito', path: '<path d="M12 20s-7-4.4-9.5-9C.8 7.6 2.4 4 6 4c2 0 3.5 1 6 3.5C14.5 5 16 4 18 4c3.6 0 5.2 3.6 3.5 7-2.5 4.6-9.5 9-9.5 9z"/>' },
  { id: 'star', label: 'Estrela', path: '<path d="M12 3l2.7 5.9 6.3.6-4.8 4.3 1.4 6.2L12 16.9 6.4 20l1.4-6.2L3 9.5l6.3-.6z"/>' },
  { id: 'bookmark', label: 'Marcador', path: '<path d="M6 3h12v18l-6-4-6 4z"/>' },
  { id: 'link', label: 'Link', path: '<path d="M9 15l6-6M8 13l-2.5 2.5a3.5 3.5 0 1 0 5 5L13 18M16 11l2.5-2.5a3.5 3.5 0 1 0-5-5L11 6"/>' },
  { id: 'home', label: 'Início', path: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>' },
  { id: 'book', label: 'Leitura', path: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M19 17H6a2 2 0 0 0-2 2"/>' },
  { id: 'settings', label: 'Configuração', path: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5"/>' },
  { id: 'map-pin', label: 'Local', path: '<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/>' },
  { id: 'users', label: 'Pessoas', path: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 9a3 3 0 1 0 0-6M22 20c0-2.8-2-5-4.5-5.6"/>' },
  { id: 'bell', label: 'Notificação', path: '<path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10z"/><path d="M10 19a2 2 0 0 0 4 0"/>' },
  { id: 'lock', label: 'Privado', path: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/>' },
];

const ICON_MAP = new Map(ICON_LIBRARY.map((icon) => [icon.id, icon]));

const SEARCH_ICON_PATH = '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>';

// Cycled per named group so cards in the same group share an accent color;
// hues chosen to spread evenly around the wheel starting from the app accent.
const GROUP_PALETTE = [
  'oklch(0.72 0.15 292)',
  'oklch(0.75 0.13 195)',
  'oklch(0.72 0.17 350)',
  'oklch(0.78 0.15 70)',
  'oklch(0.75 0.14 145)',
  'oklch(0.72 0.15 250)',
];
const DEFAULT_GROUP_COLOR = 'oklch(0.55 0 0)';

function iconSvg(path: string, size = '1em'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// Renders either a curated icon id (as SVG) or a legacy/custom value (emoji or
// plain character) typed by the user, so old links keep working unchanged.
function renderIconContent(el: HTMLElement, iconValue: string): void {
  const icon = ICON_MAP.get(iconValue);
  if (icon) {
    el.innerHTML = iconSvg(icon.path);
  } else {
    el.textContent = iconValue || '🌐';
  }
}

const ICON_KEYWORDS: Array<[string, string]> = [
  ['instagram', 'camera'],
  ['facebook', 'users'],
  ['twitter', 'chat'],
  ['x.com', 'chat'],
  ['github', 'code'],
  ['chatgpt', 'chat'],
  ['openai', 'chat'],
  ['claude', 'chat'],
  ['anthropic', 'chat'],
  ['youtube', 'video'],
  ['spotify', 'music'],
  ['music', 'music'],
  ['mail', 'mail'],
  ['gmail', 'mail'],
  ['calendar', 'calendar'],
  ['drive', 'cloud'],
  ['dropbox', 'cloud'],
  ['notion', 'doc'],
  ['docs', 'doc'],
  ['sheets', 'chart'],
  ['excel', 'chart'],
  ['shop', 'cart'],
  ['amazon', 'cart'],
  ['linkedin', 'briefcase'],
  ['jira', 'briefcase'],
  ['steam', 'gamepad'],
  ['bank', 'bank'],
];

const DEFAULT_GROUP = 'Sem grupo';
const VIEW_MODE_STORAGE_KEY = 'iris-links-view-mode';

let activeSortables: Array<InstanceType<typeof Sortable>> = [];
let shortcutsHandler: ((e: KeyboardEvent) => void) | null = null;
let searchInputEl: HTMLInputElement | null = null;
let currentSearchQuery = '';
let currentViewMode: 'grid' | 'list' =
  localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'list' ? 'list' : 'grid';

function applyLinksFilter(root: HTMLElement, rawQuery: string): void {
  const query = rawQuery.trim().toLowerCase();
  root.querySelectorAll<HTMLElement>('.link-card--add').forEach((tile) => {
    tile.classList.toggle('is-hidden', Boolean(query));
  });
  root.querySelectorAll<HTMLElement>('.link-card:not(.link-card--add)').forEach((card) => {
    const title = card.querySelector('.link-title')?.textContent?.toLowerCase() ?? '';
    const domain = card.querySelector('.link-domain')?.textContent?.toLowerCase() ?? '';
    const matches = !query || title.includes(query) || domain.includes(query);
    card.classList.toggle('is-hidden', !matches);
  });
  root.querySelectorAll<HTMLElement>('.links-group').forEach((group) => {
    const hasVisibleCard = group.querySelector('.link-card:not(.is-hidden)');
    group.classList.toggle('is-hidden', Boolean(query) && !hasVisibleCard);
  });
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function titleFromHostname(hostname: string): string {
  const base = hostname.split('.')[0] ?? hostname;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function suggestIcon(url: string): string {
  const hostname = hostnameOf(url).toLowerCase();
  const match = ICON_KEYWORDS.find(([keyword]) => hostname.includes(keyword));
  return match ? match[1] : 'web';
}

async function handleDeleteLink(link: QuickLink): Promise<void> {
  const confirmed = await openConfirmModal({
    title: 'Excluir link',
    message: `Excluir o link "${link.title}" (${link.url})?`,
    confirmText: 'Excluir link',
  });
  if (!confirmed) return;
  await linksState.deleteLink(link.id);
}

function buildLinkCard(link: QuickLink, shortcutIndex: number | null): HTMLElement {
  const card = document.createElement('div');
  card.className = 'link-card';
  card.dataset.linkId = link.id;
  card.title = `${link.title}\n${link.url}`;
  card.addEventListener('click', () => linksState.openLink(link.url));

  const main = document.createElement('div');
  main.className = 'link-card-main';

  const iconEl = document.createElement('div');
  iconEl.className = 'link-icon';
  renderIconContent(iconEl, link.icon);
  main.appendChild(iconEl);

  const info = document.createElement('div');
  info.className = 'link-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'link-title';
  titleEl.textContent = link.title;
  titleEl.title = link.title;
  info.appendChild(titleEl);

  const domainEl = document.createElement('div');
  domainEl.className = 'link-domain';
  const domainDot = document.createElement('span');
  domainDot.className = 'link-domain-dot';
  domainEl.appendChild(domainDot);
  const domainText = document.createElement('span');
  domainText.textContent = hostnameOf(link.url);
  domainEl.appendChild(domainText);
  info.appendChild(domainEl);

  main.appendChild(info);
  card.appendChild(main);

  const badgeArea = document.createElement('div');
  badgeArea.className = 'link-badge-area';

  if (shortcutIndex !== null) {
    const shortcut = document.createElement('span');
    shortcut.className = 'link-shortcut';
    shortcut.textContent = `⌘${shortcutIndex}`;
    badgeArea.appendChild(shortcut);
  }

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'link-action-btn';
  editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  editBtn.title = 'Editar';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void openLinkDialog(link);
  });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'link-action-btn link-action-btn--delete';
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  deleteBtn.title = 'Excluir';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleDeleteLink(link);
  });
  actions.appendChild(deleteBtn);

  badgeArea.appendChild(actions);
  card.appendChild(badgeArea);

  return card;
}

function buildAddTile(defaultGroup?: string): HTMLElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'link-card link-card--add';
  tile.addEventListener('click', () => void openLinkDialog(null, defaultGroup));

  const main = document.createElement('div');
  main.className = 'link-card-main';

  const iconEl = document.createElement('div');
  iconEl.className = 'link-icon';
  iconEl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  main.appendChild(iconEl);

  const info = document.createElement('div');
  info.className = 'link-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'link-title';
  titleEl.textContent = 'Novo link';
  info.appendChild(titleEl);

  const domainEl = document.createElement('div');
  domainEl.className = 'link-domain';
  domainEl.textContent = 'Adicionar atalho';
  info.appendChild(domainEl);

  main.appendChild(info);
  tile.appendChild(main);

  return tile;
}

// ---------- Icon picker popover ----------

let activeIconPopover: HTMLElement | null = null;
let activeIconPopoverCloser: ((e: MouseEvent) => void) | null = null;

function closeIconPopover(): void {
  activeIconPopover?.remove();
  activeIconPopover = null;
  if (activeIconPopoverCloser) {
    document.removeEventListener('mousedown', activeIconPopoverCloser);
    activeIconPopoverCloser = null;
  }
}

function openIconPicker(anchor: HTMLElement, currentIcon: string, onSelect: (iconId: string) => void): void {
  closeIconPopover();

  const popover = document.createElement('div');
  popover.className = 'icon-picker-popover';
  activeIconPopover = popover;

  const grid = document.createElement('div');
  grid.className = 'icon-picker-grid';
  ICON_LIBRARY.forEach((icon) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-picker-option';
    btn.classList.toggle('active', icon.id === currentIcon);
    btn.title = icon.label;
    btn.innerHTML = iconSvg(icon.path);
    btn.addEventListener('click', () => {
      onSelect(icon.id);
      closeIconPopover();
    });
    grid.appendChild(btn);
  });
  popover.appendChild(grid);

  const customRow = document.createElement('div');
  customRow.className = 'icon-picker-custom';
  const customLabel = document.createElement('span');
  customLabel.textContent = 'ou digite um emoji';
  customRow.appendChild(customLabel);
  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.maxLength = 4;
  customInput.placeholder = '🔥';
  customRow.appendChild(customInput);
  const customBtn = document.createElement('button');
  customBtn.type = 'button';
  customBtn.className = 'icon-picker-custom-btn';
  customBtn.textContent = 'Usar';
  customBtn.addEventListener('click', () => {
    if (!customInput.value.trim()) return;
    onSelect(customInput.value.trim());
    closeIconPopover();
  });
  customRow.appendChild(customBtn);
  popover.appendChild(customRow);

  anchor.appendChild(popover);

  activeIconPopoverCloser = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && e.target !== anchor) closeIconPopover();
  };
  setTimeout(() => {
    if (activeIconPopoverCloser) document.addEventListener('mousedown', activeIconPopoverCloser);
  }, 0);
}

// ---------- Compact create/edit dialog ----------

function openLinkDialog(link: QuickLink | null, defaultGroup?: string): Promise<void> {
  return new Promise((resolve) => {
    const existingGroups = Array.from(
      new Set((linksState.getCurrentState()?.links ?? []).map((l) => l.group || DEFAULT_GROUP)),
    );

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    function finish(): void {
      document.removeEventListener('keydown', onKeyDown);
      closeIconPopover();
      overlay.remove();
      resolve();
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') finish();
    }
    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish();
    });

    const modal = document.createElement('div');
    modal.className = 'modal link-dialog';

    const heading = document.createElement('h2');
    heading.textContent = link ? 'Editar link' : 'Novo link';
    modal.appendChild(heading);

    const urlLabel = document.createElement('label');
    urlLabel.className = 'modal-field';
    const urlSpan = document.createElement('span');
    urlSpan.textContent = 'Endereço';
    urlLabel.appendChild(urlSpan);
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://...';
    urlInput.value = link?.url ?? '';
    urlLabel.appendChild(urlInput);
    modal.appendChild(urlLabel);

    const hint = document.createElement('div');
    hint.className = 'link-dialog-hint';
    hint.textContent = 'Título e ícone preenchidos a partir do site.';
    modal.appendChild(hint);

    let manualTitle: string | null = link?.title ?? null;
    let manualIcon: string | null = link?.icon ?? null;

    const preview = document.createElement('div');
    preview.className = 'link-dialog-preview';
    modal.appendChild(preview);

    let editingTitle = false;

    function renderPreview(): void {
      preview.innerHTML = '';
      const url = urlInput.value.trim();
      if (!url) {
        preview.classList.add('is-empty');
        preview.textContent = 'Cole um endereço para ver a prévia.';
        return;
      }
      preview.classList.remove('is-empty');
      const hostname = hostnameOf(url);
      const icon = manualIcon ?? suggestIcon(url);
      const title = manualTitle ?? titleFromHostname(hostname);

      const iconEl = document.createElement('button');
      iconEl.type = 'button';
      iconEl.className = 'link-dialog-preview-icon';
      iconEl.title = 'Clique para escolher o ícone';
      renderIconContent(iconEl, icon);
      iconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openIconPicker(iconEl, icon, (newIcon) => {
          manualIcon = newIcon;
          renderPreview();
        });
      });
      preview.appendChild(iconEl);

      const info = document.createElement('div');
      info.className = 'link-dialog-preview-info';

      if (editingTitle) {
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = title;
        titleInput.className = 'link-dialog-title-input';
        titleInput.addEventListener('blur', () => {
          manualTitle = titleInput.value.trim() || null;
          editingTitle = false;
          renderPreview();
        });
        titleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') titleInput.blur();
        });
        info.appendChild(titleInput);
        setTimeout(() => titleInput.focus(), 0);
      } else {
        const titleEl = document.createElement('div');
        titleEl.className = 'link-dialog-preview-title';
        titleEl.textContent = title;
        info.appendChild(titleEl);
      }

      const domainEl = document.createElement('div');
      domainEl.className = 'link-dialog-preview-domain';
      domainEl.textContent = hostname;
      info.appendChild(domainEl);

      preview.appendChild(info);

      const editLink = document.createElement('button');
      editLink.type = 'button';
      editLink.className = 'link-dialog-edit-btn';
      editLink.textContent = 'Editar';
      editLink.addEventListener('click', () => {
        editingTitle = true;
        renderPreview();
      });
      preview.appendChild(editLink);
    }

    urlInput.addEventListener('input', renderPreview);
    renderPreview();

    const groupLabel = document.createElement('div');
    groupLabel.className = 'link-dialog-group-label';
    groupLabel.textContent = 'Grupo';
    modal.appendChild(groupLabel);

    const groupRow = document.createElement('div');
    groupRow.className = 'link-dialog-groups';
    let selectedGroup = link?.group || defaultGroup || existingGroups[0] || DEFAULT_GROUP;

    function renderGroups(): void {
      groupRow.innerHTML = '';
      existingGroups.forEach((group) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'link-dialog-group-chip';
        chip.classList.toggle('active', group === selectedGroup);
        chip.textContent = group;
        chip.addEventListener('click', () => {
          selectedGroup = group;
          renderGroups();
        });
        groupRow.appendChild(chip);
      });

      const addGroupBtn = document.createElement('button');
      addGroupBtn.type = 'button';
      addGroupBtn.className = 'link-dialog-group-chip link-dialog-group-chip--add';
      addGroupBtn.textContent = '+ novo';
      addGroupBtn.addEventListener('click', async () => {
        const name = await promptText('Novo grupo', 'Nome do grupo');
        if (!name || !name.trim()) return;
        if (!existingGroups.includes(name.trim())) existingGroups.push(name.trim());
        selectedGroup = name.trim();
        renderGroups();
      });
      groupRow.appendChild(addGroupBtn);
    }
    renderGroups();
    modal.appendChild(groupRow);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => finish());
    actions.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Salvar';
    saveBtn.addEventListener('click', async () => {
      const url = normalizeUrl(urlInput.value);
      if (!url) {
        urlInput.focus();
        return;
      }
      const hostname = hostnameOf(url);
      const title = manualTitle ?? titleFromHostname(hostname);
      const icon = manualIcon ?? suggestIcon(url);

      if (link) {
        await linksState.updateLink({ linkId: link.id, title, url, icon, group: selectedGroup });
      } else {
        await linksState.createLink({ title, url, icon, group: selectedGroup });
      }
      finish();
    });
    actions.appendChild(saveBtn);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    urlInput.focus();
  });
}

function handleImportFromBrowser(): void {
  window.alert('Importar do navegador ainda não está disponível nesta versão. Por enquanto, adicione seus links manualmente com "+ Novo link".');
}

function applyViewMode(root: HTMLElement, gridBtn: HTMLElement, listBtn: HTMLElement): void {
  root.classList.toggle('links-view--list', currentViewMode === 'list');
  root.classList.toggle('links-view--grid', currentViewMode === 'grid');
  gridBtn.classList.toggle('active', currentViewMode === 'grid');
  listBtn.classList.toggle('active', currentViewMode === 'list');
}

function attachShortcuts(): void {
  if (shortcutsHandler) return;
  shortcutsHandler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInputEl?.focus();
      searchInputEl?.select();
      return;
    }
    const digit = Number.parseInt(e.key, 10);
    if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
    const currentLinks = (linksState.getCurrentState()?.links ?? []).slice().sort((a, b) => a.order - b.order);
    const link = currentLinks[digit - 1];
    if (link) {
      e.preventDefault();
      linksState.openLink(link.url);
    }
  };
  document.addEventListener('keydown', shortcutsHandler);
}

export function render(container: HTMLElement, state: LinksFile): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'links-view';
  container.appendChild(root);

  const header = document.createElement('div');
  header.className = 'links-header';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'links-search';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'links-search-icon';
  searchIcon.innerHTML = iconSvg(SEARCH_ICON_PATH, '15');
  searchWrap.appendChild(searchIcon);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'links-search-input';
  searchInput.placeholder = 'Buscar por nome ou domínio';
  searchInput.value = currentSearchQuery;
  searchInput.addEventListener('input', () => {
    currentSearchQuery = searchInput.value;
    applyLinksFilter(root, currentSearchQuery);
  });
  searchWrap.appendChild(searchInput);
  searchInputEl = searchInput;

  const searchKbd = document.createElement('span');
  searchKbd.className = 'links-search-kbd';
  searchKbd.textContent = '⌘K';
  searchWrap.appendChild(searchKbd);

  header.appendChild(searchWrap);

  const headerActions = document.createElement('div');
  headerActions.className = 'links-header-actions';

  const viewToggle = document.createElement('div');
  viewToggle.className = 'links-view-toggle';
  const gridBtn = document.createElement('button');
  gridBtn.type = 'button';
  gridBtn.className = 'links-view-toggle-btn';
  gridBtn.textContent = 'Grade';
  const listBtn = document.createElement('button');
  listBtn.type = 'button';
  listBtn.className = 'links-view-toggle-btn';
  listBtn.textContent = 'Lista';
  gridBtn.addEventListener('click', () => {
    currentViewMode = 'grid';
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'grid');
    applyViewMode(root, gridBtn, listBtn);
  });
  listBtn.addEventListener('click', () => {
    currentViewMode = 'list';
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'list');
    applyViewMode(root, gridBtn, listBtn);
  });
  viewToggle.appendChild(gridBtn);
  viewToggle.appendChild(listBtn);
  headerActions.appendChild(viewToggle);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-secondary';
  importBtn.textContent = 'Importar';
  importBtn.addEventListener('click', handleImportFromBrowser);
  headerActions.appendChild(importBtn);

  const newBtn = document.createElement('button');
  newBtn.className = 'btn';
  newBtn.textContent = '+ Novo link';
  newBtn.addEventListener('click', () => void openLinkDialog(null));
  headerActions.appendChild(newBtn);

  header.appendChild(headerActions);
  root.appendChild(header);
  applyViewMode(root, gridBtn, listBtn);

  const sortedLinks = state.links.slice().sort((a, b) => a.order - b.order);
  attachShortcuts();

  const groups = new Map<string, QuickLink[]>();
  sortedLinks.forEach((link) => {
    const key = link.group || DEFAULT_GROUP;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(link);
  });

  if (groups.size === 0) groups.set(DEFAULT_GROUP, []);

  let shortcutCounter = 0;
  let paletteIndex = 0;

  groups.forEach((links, groupName) => {
    const section = document.createElement('div');
    section.className = 'links-group';
    section.style.setProperty(
      '--group-color',
      groupName === DEFAULT_GROUP ? DEFAULT_GROUP_COLOR : GROUP_PALETTE[paletteIndex++ % GROUP_PALETTE.length],
    );

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'links-group-header';
    const dot = document.createElement('span');
    dot.className = 'links-group-dot';
    sectionHeader.appendChild(dot);
    const label = document.createElement('span');
    label.className = 'links-group-label';
    label.textContent = groupName.toUpperCase();
    sectionHeader.appendChild(label);
    const count = document.createElement('span');
    count.className = 'links-group-count';
    count.textContent = String(links.length);
    sectionHeader.appendChild(count);
    const rule = document.createElement('span');
    rule.className = 'links-group-rule';
    sectionHeader.appendChild(rule);
    section.appendChild(sectionHeader);

    const grid = document.createElement('div');
    grid.className = 'links-grid';
    grid.dataset.group = groupName;

    links.forEach((link) => {
      shortcutCounter += 1;
      grid.appendChild(buildLinkCard(link, shortcutCounter <= 9 ? shortcutCounter : null));
    });

    grid.appendChild(buildAddTile(groupName));
    section.appendChild(grid);
    root.appendChild(section);
  });

  applyLinksFilter(root, currentSearchQuery);

  activeSortables.forEach((s) => s.destroy());
  activeSortables = [];
  root.querySelectorAll<HTMLElement>('.links-grid').forEach((grid) => {
    activeSortables.push(
      new Sortable(grid, {
        animation: 150,
        group: 'links',
        filter: '.link-card--add',
        draggable: '.link-card:not(.link-card--add)',
        ghostClass: 'sortable-ghost',
        onEnd: (evt: Sortable.SortableEvent) => {
          const targetGroup = evt.to.dataset.group ?? DEFAULT_GROUP;
          const movedLinkId = evt.item.dataset.linkId;
          if (movedLinkId && evt.to !== evt.from) {
            void linksState.updateLink({ linkId: movedLinkId, group: targetGroup === DEFAULT_GROUP ? '' : targetGroup });
          }
          const orderedLinkIds = Array.from(root.querySelectorAll<HTMLElement>('.link-card[data-link-id]')).map(
            (el) => el.dataset.linkId as string,
          );
          void linksState.reorderLinks(orderedLinkIds);
        },
      }),
    );
  });
}

export function destroy(): void {
  activeSortables.forEach((s) => s.destroy());
  activeSortables = [];
  if (shortcutsHandler) {
    document.removeEventListener('keydown', shortcutsHandler);
    shortcutsHandler = null;
  }
  searchInputEl = null;
}
