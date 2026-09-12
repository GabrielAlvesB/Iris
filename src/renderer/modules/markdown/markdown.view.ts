import type { MarkdownConfig, MarkdownFileMeta } from '../../../shared/types/markdown.types';
import * as markdownState from './markdown.state.js';
import * as kanbanState from '../kanban/kanban.state.js';
import { renderMarkdownToHtml } from './markdown.render.js';
import { promptText } from '../../ui/modal.js';

type ViewMode = 'escrever' | 'dividido' | 'ler';

let containerRef: HTMLElement | null = null;
let selectedPath: string | null = null;
let workingContent = '';
let savedContent = '';
let viewMode: ViewMode = 'dividido';
let searchQuery = '';

function isDirty(): boolean {
  return selectedPath !== null && workingContent !== savedContent;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

function cursorLineCol(textarea: HTMLTextAreaElement): { line: number; col: number } {
  const upToCursor = textarea.value.slice(0, textarea.selectionStart ?? 0);
  const lines = upToCursor.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function groupLabel(file: MarkdownFileMeta): string {
  if (file.source === 'iris') return 'NO IRIS';
  if (!file.folder) return '/';
  const looksAbsolute = /^[a-zA-Z]:[\\/]/.test(file.folder) || file.folder.startsWith('/') || file.folder.startsWith('\\');
  return looksAbsolute ? file.folder.split(/[\\/]/).join('/') : `/${file.folder}`;
}

function matchesSearch(file: MarkdownFileMeta, query: string): boolean {
  if (!query) return true;
  return file.name.toLowerCase().includes(query.toLowerCase());
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `editado há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `editado há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 7) return `${days} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

async function ensureSafeToLeave(): Promise<boolean> {
  if (!isDirty()) return true;
  return window.confirm('Você tem alterações não salvas neste arquivo. Descartar e continuar?');
}

async function handleSelectFile(path: string): Promise<void> {
  if (path === selectedPath) return;
  if (!(await ensureSafeToLeave())) return;
  const content = await markdownState.readFile(path);
  selectedPath = path;
  workingContent = content;
  savedContent = content;
  renderAll();
}

async function handleNewFile(): Promise<void> {
  const name = await promptText('Novo arquivo', 'Nome do arquivo markdown');
  if (!name || !name.trim()) return;
  const config = markdownState.getConfig();
  const target = config?.linkedFolder ? 'linked' : 'iris';
  const meta = await markdownState.createFile({ name: name.trim(), target });
  await handleSelectFile(meta.path);
}

async function handleSave(): Promise<void> {
  if (!selectedPath) return;
  await markdownState.writeFile({ path: selectedPath, content: workingContent });
  savedContent = workingContent;
  renderAll();
}

async function handleChooseFolder(): Promise<void> {
  await markdownState.chooseFolder();
  renderAll();
}

async function handleOpenFile(): Promise<void> {
  const result = await markdownState.openFile();
  if (result.canceled || !result.path) return;
  await handleSelectFile(result.path);
}

async function handleExportPdf(): Promise<void> {
  if (!selectedPath) return;
  const html = renderMarkdownToHtml(workingContent);
  const name = selectedPath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? 'documento';
  const result = await markdownState.exportPdf({ html, suggestedName: name });
  if (!result.canceled) {
    window.alert(`PDF exportado para: ${result.filePath}`);
  }
}

function insertAtCursor(textarea: HTMLTextAreaElement, before: string, after = '', placeholder = ''): void {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end) || placeholder;
  const newValue = textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
  textarea.value = newValue;
  textarea.focus();
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = start + before.length + selected.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertLinePrefix(textarea: HTMLTextAreaElement, prefix: string): void {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
  const affected = textarea.value.slice(lineStart, end);
  const prefixed = affected
    .split('\n')
    .map((l) => (l.startsWith(prefix) ? l : prefix + l))
    .join('\n');
  textarea.value = textarea.value.slice(0, lineStart) + prefixed + textarea.value.slice(end);
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function buildToolbar(getTextarea: () => HTMLTextAreaElement | null): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-toolbar';

  const buttons: Array<[string, string, () => void]> = [
    ['H1', 'Título', () => insertLinePrefix(getTextarea()!, '# ')],
    ['B', 'Negrito', () => insertAtCursor(getTextarea()!, '**', '**', 'texto')],
    ['i', 'Itálico', () => insertAtCursor(getTextarea()!, '_', '_', 'texto')],
    ['lista', 'Lista', () => insertLinePrefix(getTextarea()!, '- ')],
    ['link', 'Link', () => insertAtCursor(getTextarea()!, '[', '](https://)', 'texto')],
    ['código', 'Código', () => insertAtCursor(getTextarea()!, '`', '`', 'código')],
    ['tabela', 'Tabela', () => insertAtCursor(getTextarea()!, '\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n| valor | valor |\n', '', '')],
  ];

  buttons.forEach(([label, title, action]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'markdown-toolbar-btn';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => {
      const textarea = getTextarea();
      if (textarea) action();
    });
    toolbar.appendChild(btn);
  });

  const spacer = document.createElement('span');
  spacer.className = 'markdown-toolbar-spacer';
  toolbar.appendChild(spacer);

  const pureLabel = document.createElement('span');
  pureLabel.className = 'markdown-toolbar-hint';
  pureLabel.textContent = 'markdown puro';
  toolbar.appendChild(pureLabel);

  return toolbar;
}

async function buildLinkedCardControl(): Promise<HTMLElement> {
  const wrap = document.createElement('div');
  wrap.className = 'markdown-linked-card';

  const label = document.createElement('span');
  label.textContent = 'Ligar este arquivo a um card:';
  wrap.appendChild(label);

  await kanbanState.loadBoard();
  const board = kanbanState.getCurrentBoard();
  const cards = board?.cards ?? [];
  const config = markdownState.getConfig();
  const currentFile = config?.files.find((f) => f.path === selectedPath);

  const select = document.createElement('select');
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— nenhum —';
  select.appendChild(noneOpt);
  cards.forEach((card) => {
    const opt = document.createElement('option');
    opt.value = card.id;
    opt.textContent = card.title;
    if (card.id === currentFile?.linkedCardId) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    if (!selectedPath) return;
    void markdownState.linkFileToCard({ path: selectedPath, cardId: select.value || null });
  });
  wrap.appendChild(select);

  return wrap;
}

function buildSidebar(config: MarkdownConfig): HTMLElement {
  const sidebar = document.createElement('div');
  sidebar.className = 'markdown-sidebar';

  const header = document.createElement('div');
  header.className = 'markdown-sidebar-header';
  const title = document.createElement('h1');
  title.textContent = 'Markdown';
  header.appendChild(title);
  const headerActions = document.createElement('div');
  headerActions.className = 'markdown-sidebar-header-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'btn btn-secondary';
  openBtn.textContent = 'Abrir';
  openBtn.title = 'Abrir um arquivo .md existente';
  openBtn.addEventListener('click', () => void handleOpenFile());
  headerActions.appendChild(openBtn);

  const newBtn = document.createElement('button');
  newBtn.className = 'btn';
  newBtn.textContent = 'Novo';
  newBtn.addEventListener('click', () => void handleNewFile());
  headerActions.appendChild(newBtn);

  header.appendChild(headerActions);
  sidebar.appendChild(header);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'markdown-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Buscar nos arquivos';
  searchInput.value = searchQuery;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderAll();
  });
  searchWrap.appendChild(searchInput);
  sidebar.appendChild(searchWrap);

  const list = document.createElement('div');
  list.className = 'markdown-file-list';

  const filtered = config.files.filter((f) => matchesSearch(f, searchQuery));
  const groups = new Map<string, MarkdownFileMeta[]>();
  filtered.forEach((f) => {
    const key = groupLabel(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'markdown-empty-list';
    empty.textContent = config.files.length === 0 ? 'Nenhum arquivo ainda.' : 'Nenhum arquivo encontrado.';
    list.appendChild(empty);
  }

  groups.forEach((files, label) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'markdown-file-group';
    const groupHeader = document.createElement('div');
    groupHeader.className = 'markdown-file-group-header';
    groupHeader.textContent = `${label} · ${files.length}`;
    groupEl.appendChild(groupHeader);

    files.forEach((file) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'markdown-file-item';
      item.classList.toggle('active', file.path === selectedPath);

      const nameEl = document.createElement('div');
      nameEl.className = 'markdown-file-name';
      nameEl.textContent = file.name.replace(/\.md$/, '');
      item.appendChild(nameEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'markdown-file-meta';
      metaEl.textContent = formatRelativeTime(file.mtime);
      item.appendChild(metaEl);

      item.addEventListener('click', () => void handleSelectFile(file.path));
      groupEl.appendChild(item);
    });

    list.appendChild(groupEl);
  });

  sidebar.appendChild(list);

  const footer = document.createElement('div');
  footer.className = 'markdown-sidebar-footer';
  const chooseBtn = document.createElement('button');
  chooseBtn.className = 'btn btn-secondary';
  chooseBtn.textContent = 'Abrir outra pasta...';
  chooseBtn.addEventListener('click', () => void handleChooseFolder());
  footer.appendChild(chooseBtn);

  const privacyNote = document.createElement('p');
  privacyNote.className = 'markdown-privacy-note';
  privacyNote.textContent =
    'Os arquivos continuam na sua máquina. O Iris só lê e grava no mesmo lugar.';
  footer.appendChild(privacyNote);

  sidebar.appendChild(footer);

  return sidebar;
}

function buildEmptyMain(): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'markdown-main-empty';
  empty.innerHTML =
    '<strong>Nenhum arquivo aberto</strong><span>Selecione um arquivo à esquerda, ligue uma pasta ou crie um novo com "Novo".</span>';
  return empty;
}

function buildMain(config: MarkdownConfig): HTMLElement {
  if (!selectedPath) return buildEmptyMain();

  const file = config.files.find((f) => f.path === selectedPath);
  const main = document.createElement('div');
  main.className = 'markdown-main';

  const header = document.createElement('div');
  header.className = 'markdown-main-header';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'markdown-main-name-wrap';
  const nameEl = document.createElement('div');
  nameEl.className = 'markdown-main-name';
  nameEl.textContent = file?.name ?? selectedPath.split(/[\\/]/).pop() ?? '';
  nameWrap.appendChild(nameEl);
  const pathEl = document.createElement('div');
  pathEl.className = 'markdown-main-path';
  pathEl.textContent = file?.source === 'iris' ? 'notas do Iris' : file ? groupLabel(file) : '';
  nameWrap.appendChild(pathEl);
  header.appendChild(nameWrap);

  const modeTabs = document.createElement('div');
  modeTabs.className = 'markdown-mode-tabs';
  (['escrever', 'dividido', 'ler'] as ViewMode[]).forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'markdown-mode-tab';
    btn.classList.toggle('active', viewMode === mode);
    btn.textContent = mode === 'escrever' ? 'Escrever' : mode === 'dividido' ? 'Dividido' : 'Ler';
    btn.addEventListener('click', () => {
      viewMode = mode;
      renderAll();
    });
    modeTabs.appendChild(btn);
  });
  header.appendChild(modeTabs);

  const headerActions = document.createElement('div');
  headerActions.className = 'markdown-main-header-actions';

  const dirtyBadge = document.createElement('span');
  dirtyBadge.className = 'markdown-dirty-badge';
  dirtyBadge.hidden = !isDirty();
  dirtyBadge.textContent = 'alterações não salvas';
  headerActions.appendChild(dirtyBadge);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-secondary';
  exportBtn.textContent = 'Exportar PDF';
  exportBtn.addEventListener('click', () => void handleExportPdf());
  headerActions.appendChild(exportBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Salvar';
  saveBtn.addEventListener('click', () => void handleSave());
  headerActions.appendChild(saveBtn);

  header.appendChild(headerActions);
  main.appendChild(header);

  let textareaRef: HTMLTextAreaElement | null = null;
  if (viewMode !== 'ler') {
    main.appendChild(buildToolbar(() => textareaRef));
  }

  const body = document.createElement('div');
  body.className = `markdown-body markdown-body--${viewMode}`;

  let previewEl: HTMLElement | null = null;

  if (viewMode !== 'ler') {
    const editorPane = document.createElement('div');
    editorPane.className = 'markdown-editor-pane';

    const textarea = document.createElement('textarea');
    textarea.className = 'markdown-textarea';
    textarea.value = workingContent;
    textarea.spellcheck = false;
    editorPane.appendChild(textarea);
    textareaRef = textarea;

    main.appendChild(body);
    body.appendChild(editorPane);

    if (viewMode === 'dividido') {
      const preview = document.createElement('div');
      preview.className = 'markdown-preview-pane';
      preview.innerHTML = renderMarkdownToHtml(workingContent);
      body.appendChild(preview);
      previewEl = preview;

      textarea.addEventListener('scroll', () => {
        const ratio = textarea.scrollTop / Math.max(1, textarea.scrollHeight - textarea.clientHeight);
        preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
      });
    }

    const footer = document.createElement('div');
    footer.className = 'markdown-footer';

    const statsEl = document.createElement('span');
    statsEl.className = 'markdown-footer-stats';
    footer.appendChild(statsEl);

    function updateStats(): void {
      const { line, col } = cursorLineCol(textarea);
      const words = wordCount(textarea.value);
      const minutes = Math.max(1, Math.round(words / 200));
      statsEl.textContent = `Ln ${line}, col ${col} · ${words} palavras · ~${minutes} min de leitura · UTF-8 · LF`;
    }

    textarea.addEventListener('input', () => {
      workingContent = textarea.value;
      dirtyBadge.hidden = !isDirty();
      if (previewEl) previewEl.innerHTML = renderMarkdownToHtml(workingContent);
      updateStats();
    });
    textarea.addEventListener('keyup', updateStats);
    textarea.addEventListener('click', updateStats);
    updateStats();

    void buildLinkedCardControl().then((el) => footer.appendChild(el));
    main.appendChild(footer);

    setTimeout(() => textarea.focus(), 0);
  } else {
    main.appendChild(body);
    const preview = document.createElement('div');
    preview.className = 'markdown-preview-pane markdown-preview-pane--full';
    preview.innerHTML = renderMarkdownToHtml(workingContent);
    body.appendChild(preview);
  }

  return main;
}

function renderAll(): void {
  if (!containerRef) return;
  const config = markdownState.getConfig();
  if (!config) return;

  containerRef.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'markdown-shell';
  shell.appendChild(buildSidebar(config));
  shell.appendChild(buildMain(config));
  containerRef.appendChild(shell);
}

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

export function render(container: HTMLElement, config: MarkdownConfig): void {
  containerRef = container;
  void config;
  renderAll();

  if (!keydownHandler) {
    keydownHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && selectedPath) {
        e.preventDefault();
        void handleSave();
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }
}

export function destroy(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  containerRef = null;
}
