import { CATEGORIAS, MODULOS, type CategoriaId, type ModuloId } from '../../shared/types/modulos.types.js';

/**
 * Sidebar gerada a partir do catálogo de módulos. Para um módulo novo aparecer,
 * basta a entrada em modulos.types.ts e um ícone aqui — o Record abaixo faz o
 * compilador cobrar o ícone que faltar.
 */

const ABRE = '<svg class="nav-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

const ICONE_DO_MODULO: Record<ModuloId, string> = {
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  postagens:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  relatorios:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  quadro:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  explorador:
    '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h7"/><path d="M9 11h5"/>',
  sheets: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  pensamentos:
    '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
  links:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  servidores:
    '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01"/><path d="M6 17h.01"/>',
  n8n: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 11 16.5 6.8"/><path d="M7.5 13l9 4.2"/>',
  github:
    '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  tutorial: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  ajustes:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

export const LARGURA_PADRAO = 216;
export const LARGURA_MINIMA = 160;
export const LARGURA_MAXIMA = 380;
export const LARGURA_COMPACTA = 60;
const LIMIAR_COMPACTAR = 120;

const CHAVE_RECOLHIDAS = 'iris.sidebar.recolhidas';
const CHAVE_LARGURA = 'iris.sidebar.largura';
const CHAVE_COMPACTO = 'iris.sidebar.compacto';

const ICONE_RECOLHER = '<path d="m15 18-6-6 6-6"/>';
const ICONE_EXPANDIR = '<path d="m9 18 6-6-6-6"/>';

// localStorage é só conveniência de tela: se falhar, todas as categorias abrem.
function lerRecolhidas(): Set<CategoriaId> {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_RECOLHIDAS) ?? '[]') as unknown;
    return new Set(Array.isArray(bruto) ? (bruto.filter((v) => typeof v === 'string') as CategoriaId[]) : []);
  } catch {
    return new Set();
  }
}

function gravarRecolhidas(recolhidas: Set<CategoriaId>): void {
  try {
    localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify([...recolhidas]));
  } catch {
    // Sem armazenamento, o estado só dura a sessão.
  }
}

function lerLargura(): number {
  try {
    const raw = Number(localStorage.getItem(CHAVE_LARGURA));
    if (Number.isFinite(raw) && raw >= LARGURA_MINIMA && raw <= LARGURA_MAXIMA) {
      return Math.round(raw);
    }
  } catch {
    // cai no padrão
  }
  return LARGURA_PADRAO;
}

function gravarLargura(valor: number): void {
  try {
    localStorage.setItem(CHAVE_LARGURA, String(Math.round(valor)));
  } catch {
    // Sem armazenamento, o estado só dura a sessão.
  }
}

function lerCompacto(): boolean {
  try {
    return localStorage.getItem(CHAVE_COMPACTO) === 'true';
  } catch {
    return false;
  }
}

function gravarCompacto(compacto: boolean): void {
  try {
    localStorage.setItem(CHAVE_COMPACTO, String(compacto));
  } catch {
    // Sem armazenamento, o estado só dura a sessão.
  }
}

const recolhidas = lerRecolhidas();
let larguraAtual = lerLargura();
let compactoAtual = lerCompacto();

let navEl: HTMLElement | null = null;
let sidebarEl: HTMLElement | null = null;
let toggleBtnEl: HTMLButtonElement | null = null;
let aoEscolher: (modulo: ModuloId) => void = () => undefined;
let atalhoTecladoRegistrado = false;

export interface EstadoSidebar {
  largura: number;
  compacto: boolean;
}

type ListenerSidebar = (estado: EstadoSidebar) => void;
const ouvintes: Set<ListenerSidebar> = new Set();

function notificarOuvintes(): void {
  const estado: EstadoSidebar = { largura: larguraAtual, compacto: compactoAtual };
  ouvintes.forEach((cb) => {
    try {
      cb(estado);
    } catch {
      // Proteção de ouvinte
    }
  });
}

export function assinarSidebar(cb: ListenerSidebar): () => void {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

export function obterEstadoSidebar(): EstadoSidebar {
  return { largura: larguraAtual, compacto: compactoAtual };
}

export function definirLargura(largura: number, salvar = true): void {
  const clamp = Math.max(LARGURA_MINIMA, Math.min(LARGURA_MAXIMA, Math.round(largura)));
  larguraAtual = clamp;
  if (salvar) gravarLargura(clamp);
  atualizarDOMSidebar();
  notificarOuvintes();
}

export function definirModoCompacto(compacto: boolean, salvar = true): void {
  if (compactoAtual === compacto) return;
  compactoAtual = compacto;
  if (salvar) gravarCompacto(compacto);
  atualizarDOMSidebar();
  notificarOuvintes();
}

export function alternarModoCompacto(): void {
  definirModoCompacto(!compactoAtual);
}

function atualizarDOMSidebar(): void {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle('is-compact', compactoAtual);
  sidebarEl.style.setProperty('--sidebar-largura', `${larguraAtual}px`);
  sidebarEl.style.width = compactoAtual ? `${LARGURA_COMPACTA}px` : `${larguraAtual}px`;

  if (toggleBtnEl) {
    toggleBtnEl.innerHTML = `<svg class="sidebar-toggle-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
      compactoAtual ? ICONE_EXPANDIR : ICONE_RECOLHER
    }</svg>`;
    const rotuloAcao = compactoAtual ? 'Expandir menu lateral (Ctrl+B)' : 'Recolher menu lateral (Ctrl+B)';
    toggleBtnEl.title = rotuloAcao;
    toggleBtnEl.setAttribute('aria-label', rotuloAcao);
  }
}

function buildItem(id: ModuloId, rotulo: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-item';
  btn.dataset.module = id;
  btn.title = rotulo;
  btn.innerHTML = `${ABRE}${ICONE_DO_MODULO[id]}</svg>`;
  const label = document.createElement('span');
  label.className = 'nav-label';
  label.textContent = rotulo;
  btn.appendChild(label);
  btn.addEventListener('click', () => aoEscolher(id));
  return btn;
}

function buildGrupoSolto(posicao: 'topo' | 'rodape'): HTMLElement {
  const grupo = document.createElement('div');
  grupo.className = `nav-items nav-grupo-${posicao}`;
  MODULOS.filter((m) => m.posicao === posicao).forEach((m) => grupo.appendChild(buildItem(m.id, m.rotulo)));
  return grupo;
}

function buildCategoria(id: CategoriaId, rotulo: string): HTMLElement {
  const modulos = MODULOS.filter((m) => m.posicao === id);
  const secao = document.createElement('section');
  secao.className = 'nav-categoria';
  secao.dataset.categoria = id;
  secao.classList.toggle('is-recolhida', recolhidas.has(id));

  const cabecalho = document.createElement('button');
  cabecalho.type = 'button';
  cabecalho.className = 'nav-categoria-cabecalho';
  cabecalho.setAttribute('aria-expanded', String(!recolhidas.has(id)));
  cabecalho.innerHTML =
    '<svg class="nav-categoria-seta" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  const texto = document.createElement('span');
  texto.className = 'nav-categoria-rotulo';
  texto.textContent = rotulo;
  const contador = document.createElement('span');
  contador.className = 'nav-categoria-contador';
  contador.textContent = String(modulos.length);
  cabecalho.append(texto, contador);
  cabecalho.addEventListener('click', () => alternarCategoria(secao, id));

  const corpo = document.createElement('div');
  corpo.className = 'nav-categoria-corpo';
  const itens = document.createElement('div');
  itens.className = 'nav-items';
  modulos.forEach((m) => itens.appendChild(buildItem(m.id, m.rotulo)));
  corpo.appendChild(itens);

  secao.append(cabecalho, corpo);
  return secao;
}

function alternarCategoria(secao: HTMLElement, id: CategoriaId): void {
  const recolher = !recolhidas.has(id);
  if (recolher) recolhidas.add(id);
  else recolhidas.delete(id);
  secao.classList.toggle('is-recolhida', recolher);
  secao.querySelector('.nav-categoria-cabecalho')?.setAttribute('aria-expanded', String(!recolher));
  gravarRecolhidas(recolhidas);
}

function onResizerPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || !sidebarEl) return;
  const resizerEl = e.currentTarget as HTMLElement;
  e.preventDefault();

  try {
    resizerEl.setPointerCapture(e.pointerId);
  } catch {
    // ignorar se captura de ponteiro não for suportada
  }

  document.body.classList.add('is-resizing-sidebar');
  sidebarEl.classList.add('is-dragging');

  const startX = e.clientX;
  const startWidth = sidebarEl.getBoundingClientRect().width;

  const onPointerMove = (ev: PointerEvent): void => {
    const deltaX = ev.clientX - startX;
    const rawWidth = startWidth + deltaX;

    if (rawWidth < LIMIAR_COMPACTAR) {
      if (!compactoAtual) {
        compactoAtual = true;
        atualizarDOMSidebar();
        notificarOuvintes();
      }
    } else {
      if (compactoAtual) {
        compactoAtual = false;
      }
      const clamped = Math.max(LARGURA_MINIMA, Math.min(LARGURA_MAXIMA, Math.round(rawWidth)));
      larguraAtual = clamped;
      sidebarEl?.style.setProperty('--sidebar-largura', `${clamped}px`);
      if (sidebarEl) sidebarEl.style.width = `${clamped}px`;
      sidebarEl?.classList.remove('is-compact');
      if (toggleBtnEl) {
        toggleBtnEl.innerHTML = `<svg class="sidebar-toggle-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONE_RECOLHER}</svg>`;
        toggleBtnEl.title = 'Recolher menu lateral (Ctrl+B)';
        toggleBtnEl.setAttribute('aria-label', 'Recolher menu lateral (Ctrl+B)');
      }
      notificarOuvintes();
    }
  };

  const onPointerUp = (ev: PointerEvent): void => {
    try {
      resizerEl.releasePointerCapture(ev.pointerId);
    } catch {
      // ignorar
    }
    document.body.classList.remove('is-resizing-sidebar');
    sidebarEl?.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    gravarLargura(larguraAtual);
    gravarCompacto(compactoAtual);
    atualizarDOMSidebar();
    notificarOuvintes();
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function configurarControlesSidebar(): void {
  if (!sidebarEl) return;

  toggleBtnEl = sidebarEl.querySelector<HTMLButtonElement>('#sidebar-toggle');
  if (toggleBtnEl && !toggleBtnEl.dataset.initialized) {
    toggleBtnEl.dataset.initialized = 'true';
    toggleBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      alternarModoCompacto();
    });
  }

  const logoEl = sidebarEl.querySelector<HTMLElement>('.sidebar-logo');
  if (logoEl && !logoEl.dataset.initialized) {
    logoEl.dataset.initialized = 'true';
    logoEl.addEventListener('click', () => {
      if (compactoAtual) {
        definirModoCompacto(false);
      }
    });
  }

  let resizerEl = sidebarEl.querySelector<HTMLElement>('#sidebar-resizer');
  if (!resizerEl) {
    resizerEl = document.createElement('div');
    resizerEl.id = 'sidebar-resizer';
    resizerEl.className = 'sidebar-resizer';
    resizerEl.title = 'Arraste para redimensionar (duplo clique para restaurar)';
    sidebarEl.appendChild(resizerEl);
  }

  if (resizerEl && !resizerEl.dataset.initialized) {
    resizerEl.dataset.initialized = 'true';
    resizerEl.addEventListener('pointerdown', onResizerPointerDown);
    resizerEl.addEventListener('dblclick', () => {
      definirLargura(LARGURA_PADRAO);
      definirModoCompacto(false);
    });
  }

  if (!atalhoTecladoRegistrado) {
    atalhoTecladoRegistrado = true;
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const active = document.activeElement;
        const isInput =
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            (active as HTMLElement).isContentEditable);
        if (!isInput) {
          e.preventDefault();
          alternarModoCompacto();
        }
      }
    });
  }
}

export function montarSidebar(container: HTMLElement, escolher: (modulo: ModuloId) => void): void {
  navEl = container;
  aoEscolher = escolher;
  sidebarEl = container.closest<HTMLElement>('#sidebar') ?? document.getElementById('sidebar');

  container.innerHTML = '';
  // Só o miolo rola: em janela baixa, Tutorial e Ajustes continuam à vista.
  const rolagem = document.createElement('div');
  rolagem.className = 'nav-rolagem';
  rolagem.appendChild(buildGrupoSolto('topo'));
  CATEGORIAS.forEach((c) => rolagem.appendChild(buildCategoria(c.id, c.rotulo)));
  container.appendChild(rolagem);
  container.appendChild(buildGrupoSolto('rodape'));

  configurarControlesSidebar();
  atualizarDOMSidebar();
}

export function marcarAtivo(modulo: ModuloId): void {
  if (!navEl) return;
  navEl.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.getAttribute('data-module') === modulo));

  // O módulo ativo nunca fica escondido: abrir por atalho ou pelo módulo inicial
  // dentro de uma categoria recolhida a expande só nesta sessão, sem gravar.
  const categoria = MODULOS.find((m) => m.id === modulo)?.posicao;
  const secao = navEl.querySelector<HTMLElement>(`.nav-categoria[data-categoria="${categoria}"]`);
  if (secao?.classList.contains('is-recolhida')) {
    recolhidas.delete(categoria as CategoriaId);
    secao.classList.remove('is-recolhida');
    secao.querySelector('.nav-categoria-cabecalho')?.setAttribute('aria-expanded', 'true');
  }
}
