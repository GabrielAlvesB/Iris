import type { LinksFile, QuickLink } from '../../../shared/types/links.types';
import * as linksState from './links.state.js';

const ICON_KEYWORDS: Array<[string, string]> = [
  ['instagram', '📷'],
  ['facebook', '📘'],
  ['twitter', '🐦'],
  ['x.com', '🐦'],
  ['github', '🐙'],
  ['chatgpt', '💬'],
  ['openai', '💬'],
  ['claude', '✨'],
  ['anthropic', '✨'],
  ['youtube', '🎥'],
  ['spotify', '🎵'],
  ['music', '🎵'],
  ['mail', '📧'],
  ['gmail', '📧'],
  ['calendar', '📅'],
  ['drive', '📁'],
  ['dropbox', '📁'],
  ['notion', '📝'],
  ['docs', '📝'],
  ['sheets', '📊'],
  ['excel', '📊'],
  ['shop', '🛒'],
  ['amazon', '🛒'],
  ['linkedin', '💼'],
  ['jira', '💼'],
  ['steam', '🎮'],
  ['bank', '💰'],
];

const DEFAULT_GROUP = 'Sem grupo';

let activeSortables: Array<InstanceType<typeof Sortable>> = [];
let shortcutsHandler: ((e: KeyboardEvent) => void) | null = null;

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
  return match ? match[1] : '🌐';
}

async function handleDeleteLink(link: QuickLink): Promise<void> {
  if (!window.confirm(`Excluir o link "${link.title}"?`)) return;
  await linksState.deleteLink(link.id);
}

function buildLinkCard(link: QuickLink, shortcutIndex: number | null): HTMLElement {
  const card = document.createElement('div');
  card.className = 'link-card';
  card.dataset.linkId = link.id;
  card.title = link.url;
  card.addEventListener('click', () => linksState.openLink(link.url));

  const actions = document.createElement('div');
  actions.className = 'link-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-icon';
  editBtn.textContent = '✏️';
  editBtn.title = 'Editar';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void openLinkDialog(link);
  });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Excluir';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    void handleDeleteLink(link);
  });
  actions.appendChild(deleteBtn);

  card.appendChild(actions);

  if (shortcutIndex !== null) {
    const shortcut = document.createElement('span');
    shortcut.className = 'link-shortcut';
    shortcut.textContent = `⌘${shortcutIndex}`;
    card.appendChild(shortcut);
  }

  const iconEl = document.createElement('div');
  iconEl.className = 'link-icon';
  iconEl.textContent = link.icon;
  card.appendChild(iconEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'link-title';
  titleEl.textContent = link.title;
  card.appendChild(titleEl);

  const domainEl = document.createElement('div');
  domainEl.className = 'link-domain';
  domainEl.textContent = hostnameOf(link.url);
  card.appendChild(domainEl);

  return card;
}

function buildAddTile(defaultGroup?: string): HTMLElement {
  const tile = document.createElement('button');
  tile.className = 'link-card link-card--add';
  tile.addEventListener('click', () => void openLinkDialog(null, defaultGroup));

  const iconEl = document.createElement('div');
  iconEl.className = 'link-icon';
  iconEl.textContent = '+';
  tile.appendChild(iconEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'link-title';
  titleEl.textContent = 'Novo link';
  tile.appendChild(titleEl);

  return tile;
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

      const iconEl = document.createElement('div');
      iconEl.className = 'link-dialog-preview-icon';
      iconEl.textContent = icon;
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
      addGroupBtn.addEventListener('click', () => {
        const name = window.prompt('Nome do novo grupo:');
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

function attachShortcuts(): void {
  if (shortcutsHandler) return;
  shortcutsHandler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
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

  const titleWrap = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Links rápidos';
  titleWrap.appendChild(title);
  const hint = document.createElement('span');
  hint.className = 'links-hint';
  hint.textContent = 'Clique para abrir · ⌘1-9 para abrir · arraste para reordenar';
  titleWrap.appendChild(hint);
  header.appendChild(titleWrap);

  const headerActions = document.createElement('div');
  headerActions.className = 'links-header-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-secondary';
  importBtn.textContent = 'Importar do navegador';
  importBtn.addEventListener('click', handleImportFromBrowser);
  headerActions.appendChild(importBtn);

  const newBtn = document.createElement('button');
  newBtn.className = 'btn';
  newBtn.textContent = '+ Novo link';
  newBtn.addEventListener('click', () => void openLinkDialog(null));
  headerActions.appendChild(newBtn);

  header.appendChild(headerActions);
  root.appendChild(header);

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

  groups.forEach((links, groupName) => {
    const section = document.createElement('div');
    section.className = 'links-group';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'links-group-header';
    sectionHeader.textContent = `${groupName.toUpperCase()} · ${links.length}`;
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
        onEnd: (evt) => {
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
}
