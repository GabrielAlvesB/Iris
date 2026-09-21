import type { Pensamento, PensamentosFile, PromocaoTipo } from '../../../shared/types/pensamentos.types';
import * as pensamentosState from './pensamentos.state.js';
import * as kanbanState from '../kanban/kanban.state.js';
import * as quadroState from '../quadro/quadro.state.js';
import { openConfirmModal, openFormModal } from '../../ui/modal.js';

type Periodo = 'tudo' | 'hoje' | '7' | '30';

const PERIODOS: Array<{ value: Periodo; label: string }> = [
  { value: 'tudo', label: 'Tudo' },
  { value: 'hoje', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
];

const ROTULO_PROMOCAO: Record<PromocaoTipo, string> = {
  kanban: 'Virou card',
  quadro: 'Virou bloco',
};

// Estado de tela — vive no módulo, como nas outras views do app.
let currentSearchQuery = '';
let currentPeriodo: Periodo = 'tudo';
let activeTag: string | null = null;
let editingId: string | null = null;
let composerDraft = '';
let focusComposerAfterRender = false;
let shortcutsHandler: ((e: KeyboardEvent) => void) | null = null;
let searchInputEl: HTMLInputElement | null = null;

function icon(path: string, size = 15): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const ICON_PIN = '<path d="M12 17v5"/><path d="M9 10.76V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.76a2 2 0 0 0 .59 1.42l1.12 1.12A2 2 0 0 1 17 16H7a2 2 0 0 1-.71-2.7l1.12-1.12A2 2 0 0 0 9 10.76z"/>';
const ICON_EDIT = '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>';
const ICON_PROMOVER = '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>';
const ICON_TRASH = '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';

/** Chave YYYY-MM-DD no fuso local, para agrupar por dia sem escorregar de data. */
function chaveDoDia(iso: string): string {
  const data = new Date(iso);
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function rotuloDoDia(chave: string): string {
  const hoje = chaveDoDia(new Date().toISOString());
  if (chave === hoje) return 'Hoje';

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  if (chave === chaveDoDia(ontem.toISOString())) return 'Ontem';

  const [ano, mes, dia] = chave.split('-').map(Number);
  const data = new Date(ano ?? 0, (mes ?? 1) - 1, dia ?? 1);
  const formatado = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return formatado.charAt(0).toLocaleUpperCase('pt-BR') + formatado.slice(1);
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dentroDoPeriodo(pensamento: Pensamento): boolean {
  if (currentPeriodo === 'tudo') return true;

  const criadoEm = new Date(pensamento.createdAt);
  if (currentPeriodo === 'hoje') {
    return chaveDoDia(pensamento.createdAt) === chaveDoDia(new Date().toISOString());
  }

  const dias = currentPeriodo === '7' ? 7 : 30;
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  return criadoEm >= limite;
}

function filtrar(pensamentos: Pensamento[]): Pensamento[] {
  const busca = currentSearchQuery.trim().toLocaleLowerCase('pt-BR');

  return pensamentos.filter((pensamento) => {
    if (!dentroDoPeriodo(pensamento)) return false;
    if (activeTag && !pensamento.tags.includes(activeTag)) return false;
    if (busca && !pensamento.texto.toLocaleLowerCase('pt-BR').includes(busca)) return false;
    return true;
  });
}

/** Todas as tags em uso, da mais frequente para a menos. */
function tagsEmUso(pensamentos: Pensamento[]): string[] {
  const contagem = new Map<string, number>();
  pensamentos.forEach((pensamento) => {
    pensamento.tags.forEach((tag) => contagem.set(tag, (contagem.get(tag) ?? 0) + 1));
  });
  return Array.from(contagem.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([tag]) => tag);
}

/** Realça as #tags dentro do texto sem deixar passar HTML do usuário. */
function buildTextoComTags(texto: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pensamento-texto';

  const regex = /#([\p{L}\p{N}_-]+)/gu;
  let ultimoIndice = 0;
  let match = regex.exec(texto);

  while (match !== null) {
    if (match.index > ultimoIndice) {
      wrap.appendChild(document.createTextNode(texto.slice(ultimoIndice, match.index)));
    }
    const tagEl = document.createElement('span');
    tagEl.className = 'pensamento-tag-inline';
    tagEl.textContent = match[0];
    wrap.appendChild(tagEl);
    ultimoIndice = match.index + match[0].length;
    match = regex.exec(texto);
  }

  if (ultimoIndice < texto.length) {
    wrap.appendChild(document.createTextNode(texto.slice(ultimoIndice)));
  }
  return wrap;
}

function buildAcaoBtn(titulo: string, svg: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `btn-icon pensamento-acao ${extraClass}`.trim();
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
  btn.innerHTML = icon(svg);
  btn.addEventListener('click', onClick);
  return btn;
}

function buildEditor(pensamento: Pensamento, rerender: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pensamento-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'pensamento-editor-input';
  textarea.value = pensamento.texto;
  wrap.appendChild(textarea);

  const acoes = document.createElement('div');
  acoes.className = 'pensamento-editor-acoes';

  const cancelar = document.createElement('button');
  cancelar.className = 'btn btn-secondary';
  cancelar.textContent = 'Cancelar';
  cancelar.addEventListener('click', () => {
    editingId = null;
    rerender();
  });

  const salvar = document.createElement('button');
  salvar.className = 'btn';
  salvar.textContent = 'Salvar';
  salvar.addEventListener('click', () => {
    const texto = textarea.value.trim();
    if (!texto) return;
    editingId = null;
    void pensamentosState.updatePensamento({ pensamentoId: pensamento.id, texto });
  });

  acoes.appendChild(cancelar);
  acoes.appendChild(salvar);
  wrap.appendChild(acoes);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      editingId = null;
      rerender();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      salvar.click();
    }
  });

  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, 0);

  return wrap;
}

function buildCard(pensamento: Pensamento, rerender: () => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'pensamento-card';
  if (pensamento.fixado) card.classList.add('pensamento-card--fixado');

  const topo = document.createElement('header');
  topo.className = 'pensamento-topo';

  const hora = document.createElement('span');
  hora.className = 'pensamento-hora';
  hora.textContent = horaDe(pensamento.createdAt);
  topo.appendChild(hora);

  if (pensamento.promovidoPara) {
    const selo = document.createElement('span');
    selo.className = 'pensamento-selo';
    selo.textContent = ROTULO_PROMOCAO[pensamento.promovidoPara.tipo];
    topo.appendChild(selo);
  }

  const acoes = document.createElement('div');
  acoes.className = 'pensamento-acoes';
  acoes.appendChild(
    buildAcaoBtn(
      pensamento.fixado ? 'Desafixar' : 'Fixar',
      ICON_PIN,
      () => void pensamentosState.togglePin(pensamento.id),
      pensamento.fixado ? 'is-ativo' : '',
    ),
  );
  acoes.appendChild(
    buildAcaoBtn('Editar', ICON_EDIT, () => {
      editingId = pensamento.id;
      rerender();
    }),
  );
  acoes.appendChild(buildAcaoBtn('Promover', ICON_PROMOVER, () => void promover(pensamento)));
  acoes.appendChild(
    buildAcaoBtn('Excluir', ICON_TRASH, () => void excluir(pensamento), 'pensamento-acao--danger'),
  );
  topo.appendChild(acoes);

  card.appendChild(topo);

  if (editingId === pensamento.id) {
    card.appendChild(buildEditor(pensamento, rerender));
    return card;
  }

  card.appendChild(buildTextoComTags(pensamento.texto));

  if (pensamento.tags.length > 0) {
    const chips = document.createElement('div');
    chips.className = 'pensamento-chips';
    pensamento.tags.forEach((tag) => {
      const chip = document.createElement('button');
      chip.className = 'pensamento-chip';
      if (activeTag === tag) chip.classList.add('is-ativo');
      chip.textContent = `#${tag}`;
      chip.addEventListener('click', () => {
        activeTag = activeTag === tag ? null : tag;
        rerender();
      });
      chips.appendChild(chip);
    });
    card.appendChild(chips);
  }

  return card;
}

async function excluir(pensamento: Pensamento): Promise<void> {
  const previa = pensamento.texto.length > 60 ? `${pensamento.texto.slice(0, 60)}…` : pensamento.texto;
  const confirmado = await openConfirmModal({
    title: 'Excluir pensamento',
    message: `"${previa}" será removido permanentemente.`,
    confirmText: 'Excluir',
  });
  if (confirmado) await pensamentosState.deletePensamento(pensamento.id);
}

/** Primeira linha do pensamento, usada como título no destino da promoção. */
function tituloDe(texto: string): string {
  const primeiraLinha = texto.split('\n')[0]?.trim() ?? '';
  const limpo = primeiraLinha.replace(/#[\p{L}\p{N}_-]+/gu, '').trim() || primeiraLinha;
  return limpo.length > 80 ? `${limpo.slice(0, 80)}…` : limpo || 'Pensamento';
}

async function promover(pensamento: Pensamento): Promise<void> {
  const escolha = await openFormModal(
    'Promover pensamento',
    [
      {
        name: 'destino',
        label: 'Transformar em',
        type: 'select',
        defaultValue: 'kanban',
        options: [
          { value: 'kanban', label: 'Card do Kanban' },
          { value: 'quadro', label: 'Bloco do Quadro' },
        ],
      },
    ],
    'Promover',
  );
  if (!escolha) return;

  const destino = escolha.destino as PromocaoTipo;
  const titulo = tituloDe(pensamento.texto);

  try {
    if (destino === 'kanban') {
      await kanbanState.loadBoard();
      const board = kanbanState.getCurrentBoard();
      const coluna = [...(board?.columns ?? [])].sort((a, b) => a.order - b.order)[0];
      if (!coluna) {
        throw new Error('Crie ao menos uma coluna no Kanban antes de promover.');
      }
      const criado = await kanbanState.createCardAndReturn({
        columnId: coluna.id,
        title: titulo,
        description: pensamento.texto,
        tags: pensamento.tags,
      });
      await pensamentosState.marcarPromovido({ pensamentoId: pensamento.id, tipo: 'kanban', refId: criado?.id ?? '' });
      return;
    }

    if (destino === 'quadro') {
      await quadroState.loadState();
      const antes = new Set((quadroState.getCurrentState()?.blocks ?? []).map((b) => b.id));
      // Distribui em grade para não empilhar tudo no mesmo ponto do canvas.
      const x = 80 + (antes.size % 5) * 260;
      const y = 80 + Math.floor(antes.size / 5) * 190;
      await quadroState.createBlock({ type: 'nota', title: titulo, content: pensamento.texto, x, y });
      const novo = (quadroState.getCurrentState()?.blocks ?? []).find((b) => !antes.has(b.id));
      await pensamentosState.marcarPromovido({ pensamentoId: pensamento.id, tipo: 'quadro', refId: novo?.id ?? '' });
      return;
    }
  } catch (error) {
    await openConfirmModal({
      title: 'Não foi possível promover',
      message: error instanceof Error ? error.message : String(error),
      confirmText: 'Entendi',
      cancelText: 'Fechar',
      danger: false,
    });
  }
}

function buildHeader(state: PensamentosFile, rerender: () => void): HTMLElement {
  const header = document.createElement('header');
  header.className = 'pensamentos-header';

  const titulo = document.createElement('h1');
  titulo.className = 'pensamentos-titulo';
  titulo.textContent = 'Pensamentos';
  header.appendChild(titulo);

  const contagem = document.createElement('span');
  contagem.className = 'pensamentos-contagem';
  const total = state.pensamentos.length;
  contagem.textContent = total === 1 ? '1 registro' : `${total} registros`;
  header.appendChild(contagem);

  const espaco = document.createElement('div');
  espaco.className = 'pensamentos-header-espaco';
  header.appendChild(espaco);

  const buscaWrap = document.createElement('div');
  buscaWrap.className = 'pensamentos-busca-wrap';

  const busca = document.createElement('input');
  busca.type = 'search';
  busca.className = 'pensamentos-busca';
  busca.placeholder = 'Buscar nos pensamentos…';
  busca.value = currentSearchQuery;
  busca.addEventListener('input', () => {
    currentSearchQuery = busca.value;
    rerender();
  });
  searchInputEl = busca;
  buscaWrap.appendChild(busca);

  const atalho = document.createElement('kbd');
  atalho.className = 'pensamentos-busca-kbd';
  atalho.textContent = 'Ctrl K';
  buscaWrap.appendChild(atalho);

  header.appendChild(buscaWrap);

  const periodos = document.createElement('div');
  periodos.className = 'pensamentos-periodos';
  PERIODOS.forEach((periodo) => {
    const btn = document.createElement('button');
    btn.className = 'pensamentos-periodo';
    if (currentPeriodo === periodo.value) btn.classList.add('is-ativo');
    btn.textContent = periodo.label;
    btn.addEventListener('click', () => {
      currentPeriodo = periodo.value;
      rerender();
    });
    periodos.appendChild(btn);
  });
  header.appendChild(periodos);

  return header;
}

function buildBarraDeTags(state: PensamentosFile, rerender: () => void): HTMLElement | null {
  const tags = tagsEmUso(state.pensamentos);
  if (tags.length === 0) return null;

  const barra = document.createElement('div');
  barra.className = 'pensamentos-tags-barra';

  tags.slice(0, 18).forEach((tag) => {
    const chip = document.createElement('button');
    chip.className = 'pensamento-chip';
    if (activeTag === tag) chip.classList.add('is-ativo');
    chip.textContent = `#${tag}`;
    chip.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      rerender();
    });
    barra.appendChild(chip);
  });

  if (activeTag) {
    const limpar = document.createElement('button');
    limpar.className = 'pensamentos-limpar-filtro';
    limpar.textContent = 'limpar filtro';
    limpar.addEventListener('click', () => {
      activeTag = null;
      rerender();
    });
    barra.appendChild(limpar);
  }

  return barra;
}

function buildStream(state: PensamentosFile, rerender: () => void): HTMLElement {
  const stream = document.createElement('div');
  stream.className = 'pensamentos-stream';

  const visiveis = filtrar(state.pensamentos);

  if (visiveis.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'pensamentos-vazio';
    vazio.textContent =
      state.pensamentos.length === 0
        ? 'Nenhum pensamento ainda. Escreva o primeiro aí embaixo.'
        : 'Nada encontrado com esses filtros.';
    stream.appendChild(vazio);
    return stream;
  }

  const fixados = visiveis.filter((p) => p.fixado);
  if (fixados.length > 0) {
    const secao = document.createElement('section');
    secao.className = 'pensamentos-dia pensamentos-dia--fixados';

    const label = document.createElement('div');
    label.className = 'pensamentos-dia-label';
    label.textContent = 'Fixados';
    secao.appendChild(label);

    fixados.forEach((pensamento) => secao.appendChild(buildCard(pensamento, rerender)));
    stream.appendChild(secao);
  }

  const porDia = new Map<string, Pensamento[]>();
  visiveis
    .filter((p) => !p.fixado)
    .forEach((pensamento) => {
      const chave = chaveDoDia(pensamento.createdAt);
      const grupo = porDia.get(chave);
      if (grupo) {
        grupo.push(pensamento);
      } else {
        porDia.set(chave, [pensamento]);
      }
    });

  porDia.forEach((pensamentos, chave) => {
    const secao = document.createElement('section');
    secao.className = 'pensamentos-dia';

    const label = document.createElement('div');
    label.className = 'pensamentos-dia-label';
    label.textContent = rotuloDoDia(chave);
    secao.appendChild(label);

    pensamentos.forEach((pensamento) => secao.appendChild(buildCard(pensamento, rerender)));
    stream.appendChild(secao);
  });

  return stream;
}

function buildComposer(state: PensamentosFile): HTMLElement {
  const composer = document.createElement('div');
  composer.className = 'pensamentos-composer';

  const textarea = document.createElement('textarea');
  textarea.className = 'pensamentos-composer-input';
  textarea.placeholder = 'O que você está pensando?  Use #tags para organizar.';
  textarea.rows = 1;
  textarea.value = composerDraft;

  function ajustarAltura(): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }

  async function salvar(): Promise<void> {
    const texto = textarea.value.trim();
    if (!texto) return;
    composerDraft = '';
    focusComposerAfterRender = true;
    await pensamentosState.createPensamento({ texto });
  }

  textarea.addEventListener('input', () => {
    composerDraft = textarea.value;
    ajustarAltura();
    renderSugestoes();
  });

  // Enter salva; Shift+Enter quebra linha. Capturar aqui (e não no document)
  // mantém o atalho preso ao composer.
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void salvar();
    }
  });

  composer.appendChild(textarea);

  const sugestoes = document.createElement('div');
  sugestoes.className = 'pensamentos-sugestoes';
  composer.appendChild(sugestoes);

  const todasAsTags = tagsEmUso(state.pensamentos);

  /** Autocomplete de #tag: completa a partir das tags já usadas. */
  function renderSugestoes(): void {
    sugestoes.innerHTML = '';
    const cursor = textarea.selectionStart ?? textarea.value.length;
    const antes = textarea.value.slice(0, cursor);
    const parcial = /#([\p{L}\p{N}_-]*)$/u.exec(antes);
    if (!parcial) return;

    const termo = (parcial[1] ?? '').toLocaleLowerCase('pt-BR');
    const candidatas = todasAsTags.filter((tag) => tag.startsWith(termo) && tag !== termo).slice(0, 6);
    if (candidatas.length === 0) return;

    candidatas.forEach((tag) => {
      const btn = document.createElement('button');
      btn.className = 'pensamentos-sugestao';
      btn.textContent = `#${tag}`;
      btn.addEventListener('click', () => {
        const inicio = cursor - (parcial[0]?.length ?? 0);
        textarea.value = `${textarea.value.slice(0, inicio)}#${tag} ${textarea.value.slice(cursor)}`;
        composerDraft = textarea.value;
        textarea.focus();
        const pos = inicio + tag.length + 2;
        textarea.setSelectionRange(pos, pos);
        ajustarAltura();
        renderSugestoes();
      });
      sugestoes.appendChild(btn);
    });
  }

  const rodape = document.createElement('div');
  rodape.className = 'pensamentos-composer-rodape';

  const dica = document.createElement('span');
  dica.className = 'pensamentos-dica';
  dica.textContent = 'Enter salva · Shift+Enter quebra linha';
  rodape.appendChild(dica);

  const salvarBtn = document.createElement('button');
  salvarBtn.className = 'btn';
  salvarBtn.textContent = 'Salvar';
  salvarBtn.addEventListener('click', () => void salvar());
  rodape.appendChild(salvarBtn);

  composer.appendChild(rodape);

  setTimeout(() => {
    ajustarAltura();
    if (focusComposerAfterRender) {
      focusComposerAfterRender = false;
      textarea.focus();
    }
  }, 0);

  return composer;
}

export function render(container: HTMLElement, state: PensamentosFile): void {
  container.innerHTML = '';

  const rerender = (): void => render(container, state);

  const view = document.createElement('div');
  view.className = 'pensamentos-view';

  view.appendChild(buildHeader(state, rerender));

  const barraTags = buildBarraDeTags(state, rerender);
  if (barraTags) view.appendChild(barraTags);

  view.appendChild(buildStream(state, rerender));
  view.appendChild(buildComposer(state));

  container.appendChild(view);

  if (!shortcutsHandler) {
    shortcutsHandler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputEl?.focus();
        searchInputEl?.select();
      }
    };
    document.addEventListener('keydown', shortcutsHandler);
  }
}

export function destroy(): void {
  if (shortcutsHandler) {
    document.removeEventListener('keydown', shortcutsHandler);
    shortcutsHandler = null;
  }
  searchInputEl = null;
  editingId = null;
  activeTag = null;
  currentSearchQuery = '';
  currentPeriodo = 'tudo';
}
