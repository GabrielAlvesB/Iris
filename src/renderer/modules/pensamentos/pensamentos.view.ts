import {
  COR_POSTIT_PADRAO,
  CORES_POSTIT,
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  type Pensamento,
  type PensamentosFile,
  type PensamentosViewport,
} from '../../../shared/types/pensamentos.types.js';
import * as pensamentosState from './pensamentos.state.js';
import { haModalAberto, mensagemDeErro, openAvisoModal, openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildCabecalho, svg, tempoRelativo } from '../../ui/pagina.js';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
/** Movimento mínimo (px de tela) para um clique virar arraste — senão o duplo clique não sobrevive. */
const LIMIAR_ARRASTE = 3;

const ICONE_MODULO =
  '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>';
const ICON_PIN =
  '<path d="M12 17v5"/><path d="M9 10.76V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.76a2 2 0 0 0 .59 1.42l1.12 1.12A2 2 0 0 1 17 16H7a2 2 0 0 1-.71-2.7l1.12-1.12A2 2 0 0 0 9 10.76z"/>';
const ICON_EDIT = '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>';
const ICON_TRASH =
  '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';
const ICON_COR =
  '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.66 0-.43-.17-.82-.44-1.12-.27-.3-.43-.69-.43-1.12 0-.92.75-1.66 1.66-1.66H16c3.07 0 5.56-2.49 5.56-5.56C21.56 6.01 17.08 2 12 2z"/>';
const ICON_MAIS = '<path d="M12 5v14"/><path d="M5 12h14"/>';
const ICON_AJUSTAR = '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>';

type Arraste =
  | { tipo: 'pan'; inicioX: number; inicioY: number; origemX: number; origemY: number }
  | {
      tipo: 'mover' | 'redimensionar';
      id: string;
      inicioX: number;
      inicioY: number;
      origemX: number;
      origemY: number;
      origemLargura: number;
      origemAltura: number;
      largura: number;
      altura: number;
      x: number;
      y: number;
      moveu: boolean;
    };

// Estado de tela — vive no módulo, como nas outras views do app.
let estadoAtual: PensamentosFile | null = null;
let containerAtual: HTMLElement | null = null;
let viewport: PensamentosViewport = { x: 40, y: 40, zoom: 1 };
let viewportEl: HTMLElement | null = null;
let canvasEl: HTMLElement | null = null;
let zoomEl: HTMLElement | null = null;
let tagsBarraEl: HTMLElement | null = null;
let busca = '';
let tagAtiva: string | null = null;
let corNova = COR_POSTIT_PADRAO;
let editandoId: string | null = null;
let rascunho = '';
// Enquanto o DOM é trocado, o blur da textarea removida não pode ser lido como "terminei".
let redesenhando = false;
let arraste: Arraste | null = null;
let paletaAberta: HTMLElement | null = null;
let timerViewport: ReturnType<typeof setTimeout> | null = null;
let ouvintesGlobais: { tipo: string; fn: (e: Event) => void }[] = [];

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/**
 * Tinta legível sobre o papel: a cor é do usuário, então o contraste é
 * decidido pela luminância em vez de assumir papel claro.
 */
function tintaPara(cor: string): string {
  const canal = (i: number): number => {
    const v = parseInt(cor.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return luminancia > 0.36 ? '#1f1d1a' : '#f7f7f8';
}

function aplicarTransformacao(): void {
  if (!canvasEl) return;
  canvasEl.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  if (viewportEl) {
    // O pontilhado do fundo acompanha o pan/zoom, senão o quadro parece deslizar sobre ele.
    const passo = 28 * viewport.zoom;
    viewportEl.style.backgroundSize = `${passo}px ${passo}px`;
    viewportEl.style.backgroundPosition = `${viewport.x}px ${viewport.y}px`;
  }
  if (zoomEl) zoomEl.textContent = `${Math.round(viewport.zoom * 100)}%`;
}

function agendarPersistirViewport(): void {
  if (timerViewport) clearTimeout(timerViewport);
  timerViewport = setTimeout(() => {
    timerViewport = null;
    void pensamentosState.setViewport(viewport).catch(() => undefined);
  }, 400);
}

function telaParaQuadro(clientX: number, clientY: number): { x: number; y: number } {
  const rect = viewportEl?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

function ajustarATela(): void {
  const lista = estadoAtual?.pensamentos ?? [];
  if (!viewportEl || lista.length === 0) return;
  const rect = viewportEl.getBoundingClientRect();
  const minX = Math.min(...lista.map((p) => p.x));
  const minY = Math.min(...lista.map((p) => p.y));
  const maxX = Math.max(...lista.map((p) => p.x + p.largura));
  const maxY = Math.max(...lista.map((p) => p.y + p.altura));
  const margem = 80;
  const largura = Math.max(maxX - minX, 1);
  const altura = Math.max(maxY - minY, 1);
  const zoom = limitar(Math.min((rect.width - margem) / largura, (rect.height - margem) / altura), MIN_ZOOM, 1.2);
  viewport = {
    zoom,
    x: rect.width / 2 - (minX + largura / 2) * zoom,
    y: rect.height / 2 - (minY + altura / 2) * zoom,
  };
  aplicarTransformacao();
  agendarPersistirViewport();
}

/** Centro da área visível, em cascata para post-its seguidos não caírem um sobre o outro. */
function posicaoNoCentro(): { x: number; y: number } {
  if (!viewportEl) return { x: 0, y: 0 };
  const rect = viewportEl.getBoundingClientRect();
  const cascata = ((estadoAtual?.pensamentos.length ?? 0) % 6) * 26;
  return {
    x: (rect.width / 2 - viewport.x) / viewport.zoom - POSTIT_LARGURA / 2 + cascata,
    y: (rect.height / 2 - viewport.y) / viewport.zoom - POSTIT_ALTURA / 2 + cascata,
  };
}

async function criarPostit(posicao: { x: number; y: number }): Promise<void> {
  try {
    const id = await pensamentosState.createPensamento({ cor: corNova, x: posicao.x, y: posicao.y });
    if (id) comecarEdicao(id, '');
  } catch (error) {
    await openAvisoModal('Não foi possível criar o post-it', mensagemDeErro(error), { erro: true });
  }
}

/** Grava o rascunho aberto sem redesenhar — para quando a tela vai mudar de qualquer jeito. */
function salvarRascunhoPendente(): void {
  const id = editandoId;
  editandoId = null;
  const texto = rascunho.trim();
  rascunho = '';
  const pensamento = estadoAtual?.pensamentos.find((p) => p.id === id);
  if (!id || !pensamento) return;
  const pedido = !texto && !pensamento.texto
    ? pensamentosState.deletePensamento(id)
    : texto !== pensamento.texto
      ? pensamentosState.updatePensamento({ pensamentoId: id, texto })
      : null;
  void pedido?.catch(() => undefined);
}

function comecarEdicao(id: string, texto: string): void {
  if (editandoId && editandoId !== id) salvarRascunhoPendente();
  editandoId = id;
  rascunho = texto;
  redesenhar();
}

async function terminarEdicao(): Promise<void> {
  const id = editandoId;
  if (!id) return;
  editandoId = null;
  const pensamento = estadoAtual?.pensamentos.find((p) => p.id === id);
  const texto = rascunho.trim();
  rascunho = '';

  try {
    if (!pensamento) return redesenhar();
    // Post-it criado e abandonado em branco não fica sujando o quadro.
    if (!texto && !pensamento.texto) return await pensamentosState.deletePensamento(id);
    if (texto !== pensamento.texto) return await pensamentosState.updatePensamento({ pensamentoId: id, texto });
    redesenhar();
  } catch (error) {
    await openAvisoModal('Não foi possível salvar', mensagemDeErro(error), { erro: true });
  }
}

async function excluir(pensamento: Pensamento): Promise<void> {
  if (pensamento.texto) {
    const previa = pensamento.texto.length > 60 ? `${pensamento.texto.slice(0, 60)}…` : pensamento.texto;
    const confirmado = await openConfirmModal({
      title: 'Excluir post-it',
      message: `"${previa}" será removido permanentemente.`,
      confirmText: 'Excluir',
    });
    if (!confirmado) return;
  }
  if (editandoId === pensamento.id) editandoId = null;
  await pensamentosState.deletePensamento(pensamento.id);
}

function fecharPaleta(): void {
  paletaAberta?.remove();
  paletaAberta = null;
}

/** Cores fixas + as personalizadas já usadas no quadro, para repetir uma cor sem redigitar. */
function coresDisponiveis(): string[] {
  const fixas: string[] = CORES_POSTIT.map((c) => c.cor);
  const usadas = (estadoAtual?.pensamentos ?? []).map((p) => p.cor).filter((cor) => !fixas.includes(cor));
  return [...fixas, ...Array.from(new Set(usadas)).slice(0, 7)];
}

function nomeDaCor(cor: string): string {
  return CORES_POSTIT.find((c) => c.cor === cor)?.nome ?? cor;
}

/**
 * Paleta flutuante. `aoPrevia` pinta enquanto o seletor nativo está aberto;
 * `aoEscolher` é o que grava.
 */
function abrirPaleta(ancora: HTMLElement, corAtual: string, aoEscolher: (cor: string) => void, aoPrevia?: (cor: string) => void): void {
  fecharPaleta();

  const paleta = document.createElement('div');
  paleta.className = 'postit-paleta';
  paleta.addEventListener('mousedown', (e) => e.stopPropagation());

  const grade = document.createElement('div');
  grade.className = 'postit-paleta-grade';
  coresDisponiveis().forEach((cor) => {
    const amostra = document.createElement('button');
    amostra.type = 'button';
    amostra.className = 'postit-amostra';
    if (cor === corAtual) amostra.classList.add('is-ativa');
    amostra.style.setProperty('--amostra', cor);
    amostra.title = nomeDaCor(cor);
    amostra.setAttribute('aria-label', nomeDaCor(cor));
    amostra.addEventListener('mousedown', (e) => e.preventDefault());
    amostra.addEventListener('click', () => {
      fecharPaleta();
      aoEscolher(cor);
    });
    grade.appendChild(amostra);
  });
  paleta.appendChild(grade);

  const outra = document.createElement('label');
  outra.className = 'postit-paleta-outra';
  const seletor = document.createElement('input');
  seletor.type = 'color';
  seletor.value = corAtual;
  seletor.addEventListener('input', () => aoPrevia?.(seletor.value));
  seletor.addEventListener('change', () => {
    fecharPaleta();
    aoEscolher(seletor.value.toLowerCase());
  });
  outra.appendChild(seletor);
  const rotulo = document.createElement('span');
  rotulo.textContent = 'Cor personalizada…';
  outra.appendChild(rotulo);
  paleta.appendChild(outra);

  document.body.appendChild(paleta);
  const r = ancora.getBoundingClientRect();
  const largura = paleta.offsetWidth;
  paleta.style.left = `${limitar(r.left, 8, window.innerWidth - largura - 8)}px`;
  const cabeAbaixo = r.bottom + 6 + paleta.offsetHeight < window.innerHeight;
  paleta.style.top = cabeAbaixo ? `${r.bottom + 6}px` : `${r.top - 6 - paleta.offsetHeight}px`;
  paletaAberta = paleta;
}

function pintar(el: HTMLElement, cor: string): void {
  el.style.setProperty('--postit-cor', cor);
  el.style.setProperty('--postit-tinta', tintaPara(cor));
}

/** Realça as #tags dentro do texto sem deixar passar HTML do usuário. */
function buildTexto(texto: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'postit-texto';

  if (!texto) {
    wrap.classList.add('is-vazio');
    wrap.textContent = 'Clique duas vezes para escrever';
    return wrap;
  }

  const regex = /#([\p{L}\p{N}_-]+)/gu;
  let ultimo = 0;
  for (const match of texto.matchAll(regex)) {
    const indice = match.index ?? 0;
    if (indice > ultimo) wrap.appendChild(document.createTextNode(texto.slice(ultimo, indice)));
    const tag = document.createElement('span');
    tag.className = 'postit-tag';
    tag.textContent = match[0];
    const nome = (match[1] ?? '').toLocaleLowerCase('pt-BR');
    tag.title = `Filtrar por #${nome}`;
    tag.addEventListener('click', () => alternarTag(nome));
    wrap.appendChild(tag);
    ultimo = indice + match[0].length;
  }
  if (ultimo < texto.length) wrap.appendChild(document.createTextNode(texto.slice(ultimo)));
  return wrap;
}

function buildAcao(titulo: string, icone: string, aoClicar: (btn: HTMLButtonElement) => void, extra = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `postit-acao ${extra}`.trim();
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
  btn.innerHTML = svg(icone, 13, 2);
  // Sem isto o mousedown tira o foco da textarea e encerra a edição antes do clique.
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    aoClicar(btn);
  });
  return btn;
}

function buildEditor(el: HTMLElement): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'postit-editor';
  textarea.value = rascunho;
  textarea.placeholder = 'Escreva… use #tags para organizar';
  textarea.addEventListener('input', () => {
    rascunho = textarea.value;
  });
  textarea.addEventListener('keydown', (e) => {
    // Esc e Ctrl+Enter terminam; o que foi escrito é salvo nos dois — post-it não tem "cancelar".
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      e.stopPropagation();
      textarea.blur();
    }
  });
  textarea.addEventListener('blur', (e) => {
    if (redesenhando || !el.isConnected || !containerAtual) return;
    // Foco indo para a paleta (seletor de cor nativo) não é "terminei de escrever".
    if (paletaAberta && e.relatedTarget instanceof Node && paletaAberta.contains(e.relatedTarget)) return;
    void terminarEdicao();
  });
  return textarea;
}

function buildPostit(pensamento: Pensamento): HTMLElement {
  const el = document.createElement('article');
  el.className = 'postit';
  el.dataset.id = pensamento.id;
  if (pensamento.fixado) el.classList.add('is-fixado');
  el.style.left = `${pensamento.x}px`;
  el.style.top = `${pensamento.y}px`;
  el.style.width = `${pensamento.largura}px`;
  el.style.height = `${pensamento.altura}px`;
  el.style.zIndex = String(pensamento.ordem);
  pintar(el, pensamento.cor);

  const barra = document.createElement('header');
  barra.className = 'postit-barra';

  const quando = document.createElement('span');
  quando.className = 'postit-quando';
  quando.textContent = tempoRelativo(pensamento.createdAt);
  quando.title = new Date(pensamento.createdAt).toLocaleString('pt-BR');
  barra.appendChild(quando);

  const acoes = document.createElement('div');
  acoes.className = 'postit-acoes';
  acoes.appendChild(
    buildAcao('Mudar cor', ICON_COR, (btn) =>
      abrirPaleta(
        btn,
        pensamento.cor,
        (cor) => {
          if (cor === pensamento.cor) return;
          void pensamentosState.updatePensamento({ pensamentoId: pensamento.id, cor });
        },
        (cor) => pintar(el, cor),
      ),
    ),
  );
  if (editandoId !== pensamento.id) {
    acoes.appendChild(buildAcao('Editar', ICON_EDIT, () => comecarEdicao(pensamento.id, pensamento.texto)));
  }
  acoes.appendChild(
    buildAcao(
      pensamento.fixado ? 'Soltar (voltar a arrastar)' : 'Fixar no lugar',
      ICON_PIN,
      () => void pensamentosState.togglePin(pensamento.id),
      pensamento.fixado ? 'is-ativo' : '',
    ),
  );
  acoes.appendChild(buildAcao('Excluir', ICON_TRASH, () => void excluir(pensamento), 'is-perigo'));
  barra.appendChild(acoes);
  el.appendChild(barra);

  if (editandoId === pensamento.id) {
    el.classList.add('is-editando');
    el.appendChild(buildEditor(el));
  } else {
    el.appendChild(buildTexto(pensamento.texto));
  }

  if (!pensamento.fixado) {
    const alca = document.createElement('div');
    alca.className = 'postit-alca';
    alca.title = 'Redimensionar';
    alca.addEventListener('mousedown', (e) => iniciarArraste(e, pensamento, 'redimensionar'));
    el.appendChild(alca);
  }

  el.addEventListener('mousedown', (e) => {
    const alvo = e.target as HTMLElement;
    if (alvo.closest('.postit-editor, .postit-acao, .postit-alca')) return;
    e.stopPropagation();
    // O preventDefault do arraste seguraria o foco na edição de outro post-it; solta aqui.
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo.classList.contains('postit-editor') && !el.contains(ativo)) ativo.blur();
    if (!pensamento.fixado) iniciarArraste(e, pensamento, 'mover');
  });

  el.addEventListener('dblclick', (e) => {
    if ((e.target as HTMLElement).closest('.postit-editor, .postit-acao')) return;
    e.stopPropagation();
    comecarEdicao(pensamento.id, pensamento.texto);
  });

  return el;
}

function iniciarArraste(e: MouseEvent, pensamento: Pensamento, tipo: 'mover' | 'redimensionar'): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  arraste = {
    tipo,
    id: pensamento.id,
    inicioX: e.clientX,
    inicioY: e.clientY,
    origemX: pensamento.x,
    origemY: pensamento.y,
    origemLargura: pensamento.largura,
    origemAltura: pensamento.altura,
    x: pensamento.x,
    y: pensamento.y,
    largura: pensamento.largura,
    altura: pensamento.altura,
    moveu: false,
  };
}

function elementoDo(id: string): HTMLElement | null {
  return canvasEl?.querySelector<HTMLElement>(`.postit[data-id="${CSS.escape(id)}"]`) ?? null;
}

function aoMoverMouse(e: Event): void {
  const m = e as MouseEvent;
  if (!arraste) return;

  if (arraste.tipo === 'pan') {
    viewport = { ...viewport, x: arraste.origemX + (m.clientX - arraste.inicioX), y: arraste.origemY + (m.clientY - arraste.inicioY) };
    aplicarTransformacao();
    return;
  }

  const dxTela = m.clientX - arraste.inicioX;
  const dyTela = m.clientY - arraste.inicioY;
  if (!arraste.moveu && Math.hypot(dxTela, dyTela) < LIMIAR_ARRASTE) return;

  const el = elementoDo(arraste.id);
  if (!el) return;
  if (!arraste.moveu) {
    arraste.moveu = true;
    el.classList.add('is-arrastando');
    // Traz para cima já durante o arraste; a ordem definitiva vem do main no soltar.
    const topo = Math.max(0, ...(estadoAtual?.pensamentos ?? []).map((p) => p.ordem)) + 1;
    el.style.zIndex = String(topo);
  }

  const dx = dxTela / viewport.zoom;
  const dy = dyTela / viewport.zoom;
  if (arraste.tipo === 'mover') {
    arraste.x = arraste.origemX + dx;
    arraste.y = arraste.origemY + dy;
    el.style.left = `${arraste.x}px`;
    el.style.top = `${arraste.y}px`;
  } else {
    arraste.largura = limitar(arraste.origemLargura + dx, 140, 900);
    arraste.altura = limitar(arraste.origemAltura + dy, 110, 900);
    el.style.width = `${arraste.largura}px`;
    el.style.height = `${arraste.altura}px`;
  }
}

function aoSoltarMouse(): void {
  const atual = arraste;
  arraste = null;
  if (!atual) return;

  if (atual.tipo === 'pan') {
    viewportEl?.classList.remove('is-panning');
    agendarPersistirViewport();
    return;
  }
  if (!atual.moveu) return;

  void pensamentosState
    .moverPensamento({
      pensamentoId: atual.id,
      x: Math.round(atual.x),
      y: Math.round(atual.y),
      ...(atual.tipo === 'redimensionar' ? { largura: Math.round(atual.largura), altura: Math.round(atual.altura) } : {}),
    })
    .catch((error: unknown) => openAvisoModal('Não foi possível mover', mensagemDeErro(error), { erro: true }));
}

function aoPressionarGlobal(e: Event): void {
  if (paletaAberta && !paletaAberta.contains(e.target as Node)) fecharPaleta();
}

function estaDigitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  return Boolean(el?.closest('input, textarea, select, [contenteditable="true"]'));
}

function aoTeclar(e: Event): void {
  const k = e as KeyboardEvent;
  if (k.key === 'Escape' && paletaAberta) {
    fecharPaleta();
    return;
  }
  if (haModalAberto()) return;
  if ((k.ctrlKey || k.metaKey) && k.key.toLowerCase() === 'k') {
    k.preventDefault();
    const input = containerAtual?.querySelector<HTMLInputElement>('.pg-busca input');
    input?.focus();
    input?.select();
    return;
  }
  if (estaDigitando(k.target) || k.ctrlKey || k.metaKey || k.altKey) return;
  if (k.key.toLowerCase() === 'n') {
    k.preventDefault();
    void criarPostit(posicaoNoCentro());
  }
}

function ligarOuvintesGlobais(): void {
  if (ouvintesGlobais.length > 0) return;
  ouvintesGlobais = [
    { tipo: 'mousemove', fn: aoMoverMouse },
    { tipo: 'mouseup', fn: aoSoltarMouse },
    { tipo: 'mousedown', fn: aoPressionarGlobal },
    { tipo: 'keydown', fn: aoTeclar },
  ];
  ouvintesGlobais.forEach(({ tipo, fn }) => window.addEventListener(tipo, fn));
}

function casaComFiltro(pensamento: Pensamento): boolean {
  if (tagAtiva && !pensamento.tags.includes(tagAtiva)) return false;
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  if (termo && !pensamento.texto.toLocaleLowerCase('pt-BR').includes(termo)) return false;
  return true;
}

/**
 * Filtrar apaga o que não casa em vez de esconder: no quadro, a posição de
 * cada post-it é parte do significado, e sumir com eles desorientaria.
 */
function aplicarFiltro(): void {
  const filtrando = Boolean(tagAtiva || busca.trim());
  (estadoAtual?.pensamentos ?? []).forEach((p) => {
    elementoDo(p.id)?.classList.toggle('is-apagado', filtrando && !casaComFiltro(p));
  });
  renderTags();
}

function alternarTag(tag: string): void {
  tagAtiva = tagAtiva === tag ? null : tag;
  aplicarFiltro();
}

/** Todas as tags em uso, da mais frequente para a menos. */
function tagsEmUso(pensamentos: Pensamento[]): string[] {
  const contagem = new Map<string, number>();
  pensamentos.forEach((p) => p.tags.forEach((tag) => contagem.set(tag, (contagem.get(tag) ?? 0) + 1)));
  return Array.from(contagem.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([tag]) => tag);
}

function renderTags(): void {
  if (!tagsBarraEl) return;
  tagsBarraEl.innerHTML = '';
  const tags = tagsEmUso(estadoAtual?.pensamentos ?? []);
  tagsBarraEl.hidden = tags.length === 0;

  tags.slice(0, 18).forEach((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pensamentos-chip';
    if (tagAtiva === tag) chip.classList.add('is-ativo');
    chip.setAttribute('aria-pressed', String(tagAtiva === tag));
    chip.textContent = `#${tag}`;
    chip.addEventListener('click', () => alternarTag(tag));
    tagsBarraEl?.appendChild(chip);
  });

  if (tagAtiva) {
    const limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.className = 'pensamentos-limpar';
    limpar.textContent = 'limpar filtro';
    limpar.addEventListener('click', () => alternarTag(tagAtiva ?? ''));
    tagsBarraEl.appendChild(limpar);
  }
}

function buildSeletorCorNova(): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = 'pensamentos-novo';

  const novo = buildBotao('Novo post-it', { icone: ICON_MAIS, variante: 'primario', titulo: 'Novo post-it (N)' });
  novo.addEventListener('click', () => void criarPostit(posicaoNoCentro()));

  const cor = document.createElement('button');
  cor.type = 'button';
  cor.className = 'pensamentos-cor-nova';
  cor.title = `Cor do próximo post-it: ${nomeDaCor(corNova)}`;
  cor.setAttribute('aria-label', cor.title);
  cor.style.setProperty('--amostra', corNova);
  cor.addEventListener('mousedown', (e) => e.stopPropagation());
  cor.addEventListener('click', () =>
    abrirPaleta(cor, corNova, (escolhida) => {
      corNova = escolhida;
      cor.style.setProperty('--amostra', escolhida);
      cor.title = `Cor do próximo post-it: ${nomeDaCor(escolhida)}`;
      cor.setAttribute('aria-label', cor.title);
    }),
  );

  grupo.appendChild(cor);
  grupo.appendChild(novo);
  return grupo;
}

function redesenhar(): void {
  if (containerAtual && estadoAtual) render(containerAtual, estadoAtual);
}

export function render(container: HTMLElement, state: PensamentosFile): void {
  ligarOuvintesGlobais();

  // Primeira montagem (ou volta ao módulo): assume o enquadramento salvo.
  // Depois disso, a tela é a dona do viewport — o arquivo só o recebe.
  if (containerAtual !== container || !viewportEl) viewport = { ...state.viewport };
  containerAtual = container;
  estadoAtual = state;
  fecharPaleta();

  redesenhando = true;
  container.innerHTML = '';
  redesenhando = false;

  const view = document.createElement('div');
  view.className = 'pensamentos-view';

  const total = state.pensamentos.length;
  zoomEl = document.createElement('span');
  zoomEl.className = 'pensamentos-zoom';

  const ajustar = buildBotao('', { icone: ICON_AJUSTAR, titulo: 'Ajustar à tela' });
  ajustar.addEventListener('click', () => ajustarATela());

  const buscaEl = buildBusca(busca, 'Buscar nos post-its…  Ctrl K', (valor) => {
    busca = valor;
    aplicarFiltro();
  });

  view.appendChild(
    buildCabecalho({
      icone: ICONE_MODULO,
      titulo: 'Pensamentos',
      subtitulo:
        total === 0
          ? 'Um quadro de post-its. Clique duas vezes no quadro para criar um.'
          : `${total === 1 ? '1 post-it' : `${total} post-its`} · duplo clique no quadro cria, no post-it edita`,
      acoes: [buscaEl, zoomEl, ajustar, buildSeletorCorNova()],
    }),
  );

  tagsBarraEl = document.createElement('div');
  tagsBarraEl.className = 'pensamentos-tags';
  view.appendChild(tagsBarraEl);

  viewportEl = document.createElement('div');
  viewportEl.className = 'pensamentos-quadro';

  canvasEl = document.createElement('div');
  canvasEl.className = 'pensamentos-canvas';
  state.pensamentos.forEach((p) => canvasEl?.appendChild(buildPostit(p)));
  viewportEl.appendChild(canvasEl);

  if (total === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'pensamentos-vazio';
    vazio.innerHTML = svg(ICONE_MODULO, 28, 1.5);
    const texto = document.createElement('p');
    texto.textContent = 'Nenhum post-it ainda. Clique duas vezes em qualquer lugar do quadro ou aperte N.';
    vazio.appendChild(texto);
    viewportEl.appendChild(vazio);
  }

  viewportEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.postit')) return;
    // Clicar no quadro vazio encerra a edição (pelo blur) e começa a arrastar a vista.
    arraste = { tipo: 'pan', inicioX: e.clientX, inicioY: e.clientY, origemX: viewport.x, origemY: viewport.y };
    viewportEl?.classList.add('is-panning');
  });

  viewportEl.addEventListener('dblclick', (e) => {
    if ((e.target as HTMLElement).closest('.postit')) return;
    const ponto = telaParaQuadro(e.clientX, e.clientY);
    void criarPostit({ x: ponto.x - POSTIT_LARGURA / 2, y: ponto.y - 24 });
  });

  viewportEl.addEventListener(
    'wheel',
    (e) => {
      // Rolar dentro de um post-it com texto longo rola o texto, não dá zoom.
      const rolavel = (e.target as HTMLElement).closest<HTMLElement>('.postit-texto, .postit-editor');
      if (rolavel && rolavel.scrollHeight > rolavel.clientHeight) return;
      e.preventDefault();
      if (!viewportEl) return;
      const rect = viewportEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const lx = (mx - viewport.x) / viewport.zoom;
      const ly = (my - viewport.y) / viewport.zoom;
      const zoom = limitar(viewport.zoom * (e.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM);
      viewport = { zoom, x: mx - lx * zoom, y: my - ly * zoom };
      aplicarTransformacao();
      agendarPersistirViewport();
    },
    { passive: false },
  );

  view.appendChild(viewportEl);
  container.appendChild(view);

  aplicarTransformacao();
  aplicarFiltro();

  if (editandoId) {
    const textarea = elementoDo(editandoId)?.querySelector<HTMLTextAreaElement>('.postit-editor');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    } else {
      editandoId = null;
    }
  }
}

export function destroy(): void {
  if (timerViewport) {
    // Não perder o último enquadramento só porque o usuário saiu rápido do módulo.
    clearTimeout(timerViewport);
    timerViewport = null;
    void pensamentosState.setViewport(viewport).catch(() => undefined);
  }
  ouvintesGlobais.forEach(({ tipo, fn }) => window.removeEventListener(tipo, fn));
  ouvintesGlobais = [];
  fecharPaleta();

  // Sair do módulo no meio da escrita salva o que foi escrito.
  if (editandoId) salvarRascunhoPendente();

  estadoAtual = null;
  containerAtual = null;
  viewportEl = null;
  canvasEl = null;
  zoomEl = null;
  tagsBarraEl = null;
  arraste = null;
  busca = '';
  tagAtiva = null;
}
