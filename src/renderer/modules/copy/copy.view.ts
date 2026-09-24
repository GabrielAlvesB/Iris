import type { CopyFile, CopySnippet } from '../../../shared/types/copy.types';
import * as copyState from './copy.state.js';
import { promptText, openConfirmModal, openCustomModal, buildSecaoModal } from '../../ui/modal.js';
import { campo, erroInline, input, textarea } from '../../ui/campos.js';
import { buildBotao } from '../../ui/pagina.js';

const DEFAULT_GROUP = 'Sem grupo';
const VARIABLES = ['nome', 'data', 'empresa'];

let searchQuery = '';
let shortcutsHandler: ((e: KeyboardEvent) => void) | null = null;

function extractVariables(text: string): string[] {
  const matches = text.match(/\{(\w+)\}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
}

async function resolveCopyText(snippet: CopySnippet): Promise<string | null> {
  const vars = extractVariables(snippet.text);
  let result = snippet.text;
  for (const varName of vars) {
    const value = await promptText('Preencher variável', `Valor para {${varName}}`, '');
    if (value === null) return null;
    result = result.split(`{${varName}}`).join(value);
  }
  return result;
}

function flashCopied(btn: HTMLElement): void {
  const original = btn.textContent;
  btn.textContent = 'Copiado ✓';
  btn.classList.add('copy-card-btn--done');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copy-card-btn--done');
  }, 1200);
}

async function handleCopy(snippet: CopySnippet, btn: HTMLElement): Promise<void> {
  const finalText = await resolveCopyText(snippet);
  if (finalText === null) return;
  copyState.copyToClipboard(finalText);
  flashCopied(btn);
}

async function handleDelete(snippet: CopySnippet): Promise<void> {
  const confirmed = await openConfirmModal({
    title: 'Excluir texto',
    message: `Excluir o texto "${snippet.title}"? Essa ação não pode ser desfeita.`,
    confirmText: 'Excluir',
  });
  if (!confirmed) return;
  await copyState.deleteSnippet(snippet.id);
}

function matchesSearch(snippet: CopySnippet, query: string): boolean {
  if (!query) return true;
  const haystack = `${snippet.title} ${snippet.text}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function buildSnippetCard(snippet: CopySnippet, shortcutIndex: number | null): HTMLElement {
  const card = document.createElement('div');
  card.className = 'copy-card';
  card.dataset.snippetId = snippet.id;

  const header = document.createElement('div');
  header.className = 'copy-card-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'copy-card-title';
  titleEl.textContent = snippet.title;
  header.appendChild(titleEl);

  if (shortcutIndex !== null) {
    const shortcut = document.createElement('span');
    shortcut.className = 'copy-card-shortcut';
    shortcut.textContent = `⌘${shortcutIndex}`;
    header.appendChild(shortcut);
  }
  card.appendChild(header);

  const textEl = document.createElement('div');
  textEl.className = 'copy-card-text';
  textEl.textContent = snippet.text;
  card.appendChild(textEl);

  const actions = document.createElement('div');
  actions.className = 'copy-card-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn copy-card-btn';
  copyBtn.textContent = 'Copiar';
  copyBtn.addEventListener('click', () => void handleCopy(snippet, copyBtn));
  actions.appendChild(copyBtn);

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-icon copy-card-edit';
  editBtn.textContent = '✏️';
  editBtn.title = 'Editar';
  editBtn.addEventListener('click', () => void openSnippetDialog(snippet));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon copy-card-delete';
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Excluir';
  deleteBtn.addEventListener('click', () => void handleDelete(snippet));
  actions.appendChild(deleteBtn);

  card.appendChild(actions);

  return card;
}

// ---------- Create/edit dialog ----------

function openSnippetDialog(snippet: CopySnippet | null): Promise<void> {
  const existingGroups = Array.from(
    new Set((copyState.getCurrentState()?.snippets ?? []).map((s) => s.group || DEFAULT_GROUP)),
  );

  return openCustomModal(
    snippet ? 'Editar texto' : 'Novo texto',
    ({ corpo, rodape, fechar }) => {
      const nameInput = input('text', snippet?.title ?? '', 'Ex.: Boas-vindas ao cliente');
      nameInput.classList.add('is-grande');
      corpo.appendChild(campo('Nome (só você vê)', nameInput));

      const conteudo = buildSecaoModal('Texto', 'Use variáveis para preencher na hora de copiar.');
      const textArea = textarea(snippet?.text ?? '', 'O texto que vai para a área de transferência', 6);
      conteudo.conteudo.appendChild(textArea);

      const varsRow = document.createElement('div');
      varsRow.className = 'md-pilulas copy-dialog-variables';
      VARIABLES.forEach((varName) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'md-pilula copy-dialog-var-btn';
        btn.textContent = `{${varName}}`;
        btn.addEventListener('click', () => {
          const start = textArea.selectionStart ?? textArea.value.length;
          const end = textArea.selectionEnd ?? textArea.value.length;
          const insert = `{${varName}}`;
          textArea.value = textArea.value.slice(0, start) + insert + textArea.value.slice(end);
          textArea.focus();
          textArea.selectionStart = textArea.selectionEnd = start + insert.length;
          renderPreview();
        });
        varsRow.appendChild(btn);
      });
      conteudo.conteudo.appendChild(campo('Inserir variável', varsRow));
      corpo.appendChild(conteudo.secao);

      const grupo = buildSecaoModal('Grupo');
      const groupRow = document.createElement('div');
      groupRow.className = 'md-pilulas';
      let selectedGroup = snippet?.group || existingGroups[0] || DEFAULT_GROUP;

      function renderGroups(): void {
        groupRow.innerHTML = '';
        existingGroups.forEach((group) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'md-pilula';
          chip.classList.toggle('is-ativa', group === selectedGroup);
          chip.setAttribute('aria-pressed', String(group === selectedGroup));
          chip.textContent = group;
          chip.addEventListener('click', () => {
            selectedGroup = group;
            renderGroups();
          });
          groupRow.appendChild(chip);
        });
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'md-pilula copy-dialog-group-chip--add';
        addBtn.textContent = '+ novo';
        addBtn.addEventListener('click', async () => {
          const name = await promptText('Novo grupo', 'Nome do grupo');
          if (!name || !name.trim()) return;
          if (!existingGroups.includes(name.trim())) existingGroups.push(name.trim());
          selectedGroup = name.trim();
          renderGroups();
        });
        groupRow.appendChild(addBtn);
      }
      renderGroups();
      grupo.conteudo.appendChild(groupRow);
      corpo.appendChild(grupo.secao);

      const preview = document.createElement('div');
      preview.className = 'copy-dialog-preview';
      const previewLabel = document.createElement('div');
      previewLabel.className = 'md-rotulo';
      previewLabel.textContent = 'Prévia do que será copiado';
      preview.appendChild(previewLabel);
      const previewText = document.createElement('div');
      previewText.className = 'copy-dialog-preview-text';
      preview.appendChild(previewText);
      const previewHint = document.createElement('div');
      previewHint.className = 'copy-dialog-preview-hint';
      preview.appendChild(previewHint);

      function renderPreview(): void {
        previewText.textContent = textArea.value || '—';
        const vars = extractVariables(textArea.value);
        previewHint.textContent =
          vars.length > 0 ? `Ao copiar, o Iris pergunta o valor de ${vars.map((v) => `{${v}}`).join(', ')}.` : '';
      }
      textArea.addEventListener('input', renderPreview);
      renderPreview();
      corpo.appendChild(preview);

      const cancelBtn = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelBtn.addEventListener('click', fechar);
      const saveBtn = buildBotao('Salvar texto', { variante: 'primario' });
      saveBtn.addEventListener('click', async () => {
        if (!nameInput.value.trim() || !textArea.value.trim()) {
          (nameInput.value.trim() ? textArea : nameInput).focus();
          erroInline(corpo, nameInput.value.trim() ? 'Escreva o texto.' : 'Dê um nome ao texto.');
          return;
        }
        try {
          if (snippet) {
            await copyState.updateSnippet({
              snippetId: snippet.id,
              title: nameInput.value.trim(),
              text: textArea.value,
              group: selectedGroup,
            });
          } else {
            await copyState.createSnippet({ title: nameInput.value.trim(), text: textArea.value, group: selectedGroup });
          }
          fechar();
        } catch (erro) {
          erroInline(corpo, erro);
        }
      });
      rodape.append(cancelBtn, saveBtn);
      nameInput.focus();
    },
    {
      largura: 560,
      icone: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      subtitulo: 'Textos prontos para copiar com um clique ou Ctrl+1…9.',
    },
  );
}

async function handleImportTxt(): Promise<void> {
  const result = await copyState.importTxt();
  if (result.canceled || !result.content) return;
  await copyState.createSnippet({ title: result.fileName ?? 'Importado', text: result.content });
}

function attachShortcuts(): void {
  if (shortcutsHandler) return;
  shortcutsHandler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const digit = Number.parseInt(e.key, 10);
    if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
    const visible = (copyState.getCurrentState()?.snippets ?? [])
      .filter((s) => matchesSearch(s, searchQuery))
      .slice()
      .sort((a, b) => a.order - b.order);
    const snippet = visible[digit - 1];
    if (snippet) {
      e.preventDefault();
      void resolveCopyText(snippet).then((text) => {
        if (text !== null) copyState.copyToClipboard(text);
      });
    }
  };
  document.addEventListener('keydown', shortcutsHandler);
}

export function render(container: HTMLElement, state: CopyFile): void {
  container.innerHTML = '';
  attachShortcuts();

  const root = document.createElement('div');
  root.className = 'copy-view';
  container.appendChild(root);

  const header = document.createElement('div');
  header.className = 'copy-header';

  const titleWrap = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'copy-eyebrow';
  eyebrow.textContent = 'Biblioteca';
  titleWrap.appendChild(eyebrow);
  const title = document.createElement('h1');
  title.textContent = 'Textos';
  titleWrap.appendChild(title);
  header.appendChild(titleWrap);

  const headerActions = document.createElement('div');
  headerActions.className = 'copy-header-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-secondary';
  importBtn.textContent = 'Importar .txt';
  importBtn.addEventListener('click', () => void handleImportTxt());
  headerActions.appendChild(importBtn);

  const newBtn = document.createElement('button');
  newBtn.className = 'btn';
  newBtn.textContent = 'Novo texto';
  newBtn.addEventListener('click', () => void openSnippetDialog(null));
  headerActions.appendChild(newBtn);

  header.appendChild(headerActions);
  root.appendChild(header);

  const toolbar = document.createElement('div');
  toolbar.className = 'copy-toolbar';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Filtrar por palavra ou tag...';
  searchInput.value = searchQuery;
  toolbar.appendChild(searchInput);
  const countEl = document.createElement('span');
  countEl.className = 'copy-count';
  toolbar.appendChild(countEl);
  root.appendChild(toolbar);

  const listHost = document.createElement('div');
  root.appendChild(listHost);

  function renderList(): void {
    listHost.innerHTML = '';
    const filtered = state.snippets.filter((s) => matchesSearch(s, searchQuery));
    countEl.textContent = `${filtered.length} texto(s)`;

    if (state.snippets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'copy-empty';
      empty.textContent = 'Nenhum texto ainda. Crie um com "Novo texto".';
      listHost.appendChild(empty);
      return;
    }
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'copy-empty';
      empty.textContent = 'Nenhum texto encontrado para essa busca.';
      listHost.appendChild(empty);
      return;
    }

    const groups = new Map<string, CopySnippet[]>();
    filtered
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((s) => {
        const key = s.group || DEFAULT_GROUP;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
      });

    let shortcutCounter = 0;
    groups.forEach((snippets, groupName) => {
      const section = document.createElement('div');
      section.className = 'copy-group';
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'copy-group-header';
      sectionHeader.textContent = groupName.toUpperCase();
      section.appendChild(sectionHeader);

      const grid = document.createElement('div');
      grid.className = 'copy-grid';
      snippets.forEach((s) => {
        shortcutCounter += 1;
        grid.appendChild(buildSnippetCard(s, shortcutCounter <= 9 ? shortcutCounter : null));
      });
      section.appendChild(grid);
      listHost.appendChild(section);
    });
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  renderList();
}

export function destroy(): void {
  if (shortcutsHandler) {
    document.removeEventListener('keydown', shortcutsHandler);
    shortcutsHandler = null;
  }
}
