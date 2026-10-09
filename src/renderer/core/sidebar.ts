import { CATEGORIAS, MODULOS, type CategoriaId, type ModuloId } from '../../shared/types/modulos.types.js';
import { empilharCamada } from '../ui/modal.js';
import { comAtalho, comboDe, onAtalhosMudaram, textoDoCombo } from './atalhos.js';
import { alternarTema, onTemaMudou, temaEfetivo } from './tema.js';
import { idIrPara } from './atalhos.catalogo.js';

/**
 * Barra lateral em duas partes: um trilho de ícones sempre visível e um
 * painel com os módulos de uma categoria, que abre ao lado sem empurrar a tela.
 * Fixado, o painel fica aberto com todas as categorias — o "modo lista".
 *
 * Tudo deriva do catálogo de módulos: categoria com um módulo só (Tráfego)
 * vira atalho direto no trilho, e uma categoria nova aparece sozinha. O
 * Record abaixo faz o compilador cobrar o ícone de um módulo novo.
 */

export const ICONE_DO_MODULO: Record<ModuloId, string> = {
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  contatos:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  leads:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'relatorios-leads':
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 18v-3"/><path d="M12 18v-6"/><path d="M16 18v-4"/>',
  'api-leads': '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2.5 4 5 5l1.5-1.5 2 1-1 2c-3.5 0-8.5-5-8.5-8.5l2-1 1 2z"/>',
  todo: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3 6 1 1 2-2"/><path d="m3 12 1 1 2-2"/><path d="m3 18 1 1 2-2"/>',
  ia: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  postagens:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  relatorios:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  roteiros:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M13 13h3"/><path d="M13 17h3"/>',
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
  trafego: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  tutorial: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  ajustes:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

const ICONE_DA_CATEGORIA: Record<CategoriaId, string> = {
  relacionamento: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2"/><path d="M15 12h2"/><path d="M7 16h4"/>',
  conteudo: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  arquivos: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  sistema: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
  trafego: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
};

const ICONE_BUSCA = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
const ICONE_FIXAR = '<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76a2 2 0 0 0 .55 1.38L17 13.6V16H7v-2.4l1.45-1.46A2 2 0 0 0 9 10.76z"/><path d="M8 2h8"/>';
const ICONE_RECOLHER = '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>';

const CHAVE_FIXADO = 'iris.sidebar.fixado';

function svg(path: string, tamanho = 20, traco = 1.8): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// localStorage é só conveniência de tela: se falhar, o painel começa flutuante.
function lerFixado(): boolean {
  try {
    return localStorage.getItem(CHAVE_FIXADO) === 'true';
  } catch {
    return false;
  }
}

function gravarFixado(valor: boolean): void {
  try {
    localStorage.setItem(CHAVE_FIXADO, String(valor));
  } catch {
    // Sem armazenamento, a escolha só dura a sessão.
  }
}

/** Categorias com mais de um módulo abrem painel; as de um só viram atalho direto. */
function modulosDa(categoria: CategoriaId): Array<(typeof MODULOS)[number]> {
  return MODULOS.filter((m) => m.posicao === categoria);
}

function categoriasComPainel(): Array<(typeof CATEGORIAS)[number]> {
  return CATEGORIAS.filter((c) => modulosDa(c.id).length > 1);
}

let sidebarEl: HTMLElement | null = null;
let painelEl: HTMLElement | null = null;
let aoEscolher: (modulo: ModuloId) => void = () => undefined;
let moduloAtivo: ModuloId | null = null;
let fixado = lerFixado();
let categoriaAberta: CategoriaId | null = null;
let soltarCamada: (() => void) | null = null;
const ouvintesFixado = new Set<(fixado: boolean) => void>();
/** Selos de contagem por módulo (leads não vistos em Contatos). */
const contagens = new Map<ModuloId, number>();

// ---------- Trilho ----------

function itemDoTrilho(icone: string, rotulo: string, aoClicar: (e: MouseEvent) => void, atalho?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'trilho-item';
  btn.dataset.dica = rotulo;
  if (atalho) btn.dataset.atalho = atalho;
  btn.setAttribute('aria-label', rotulo);
  btn.innerHTML = svg(icone);
  btn.addEventListener('click', aoClicar);
  return btn;
}

function itemDeModulo(id: ModuloId, rotulo: string): HTMLButtonElement {
  const btn = itemDoTrilho(ICONE_DO_MODULO[id], rotulo, () => escolher(id), idIrPara(id));
  btn.dataset.module = id;
  return btn;
}

/** O número vai num span (o ::before marca o ativo e o ::after é a dica) e também no nome acessível. */
function aplicarContagem(btn: HTMLElement, n: number, rotulo: string): void {
  btn.querySelector('.trilho-contagem')?.remove();
  const texto = n > 0 ? `${rotulo} — ${n} ${n === 1 ? 'lead novo' : 'leads novos'}` : rotulo;
  if (n > 0) {
    btn.dataset.contagem = String(n);
    const selo = document.createElement('span');
    selo.className = 'trilho-contagem';
    selo.setAttribute('aria-hidden', 'true');
    selo.textContent = n > 99 ? '99+' : String(n);
    btn.appendChild(selo);
  } else {
    delete btn.dataset.contagem;
  }
  // Os itens do painel têm o nome escrito; só os do trilho dependem do aria-label e da dica.
  if (btn.classList.contains('trilho-item')) {
    btn.setAttribute('aria-label', texto);
    btn.dataset.dica = texto;
  }
}

/** A tecla de cada item do trilho, na dica; redesenha quando o usuário troca um atalho. */
function desenharTeclas(): void {
  sidebarEl?.querySelectorAll<HTMLElement>('.trilho-item[data-atalho]').forEach((b) => {
    const combo = comboDe(b.dataset.atalho!);
    b.dataset.tecla = combo ? `  ·  ${textoDoCombo(combo)}` : '';
  });
}

function desenharContagens(): void {
  if (!sidebarEl) return;
  MODULOS.forEach((m) => {
    sidebarEl!.querySelectorAll<HTMLElement>(`[data-module="${m.id}"]`).forEach((b) => aplicarContagem(b, contagens.get(m.id) ?? 0, m.rotulo));
  });
  CATEGORIAS.forEach((c) => {
    const total = modulosDa(c.id).reduce((s, m) => s + (contagens.get(m.id) ?? 0), 0);
    sidebarEl!.querySelectorAll<HTMLElement>(`.trilho-item[data-categoria="${c.id}"]`).forEach((b) => aplicarContagem(b, total, c.rotulo));
  });
}

/** Leads não vistos em Contatos (core/leads.ts). Zero tira o selo. */
export function definirContagem(modulo: ModuloId, n: number): void {
  const valor = Math.max(0, n);
  if ((contagens.get(modulo) ?? 0) === valor) return;
  contagens.set(modulo, valor);
  desenharContagens();
}

function itemDeCategoria(id: CategoriaId, rotulo: string): HTMLButtonElement {
  const btn = itemDoTrilho(ICONE_DA_CATEGORIA[id], rotulo, (e) => {
    if (fixado) {
      rolarAteCategoria(id);
      return;
    }
    if (categoriaAberta === id) fecharPainel();
    // detail 0 = teclado: o foco entra no painel para seguir pelas setas/Tab.
    else abrirPainel(id, e.detail === 0);
  });
  btn.dataset.categoria = id;
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  return btn;
}

const ICONE_SOL =
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
const ICONE_LUA = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';

/** Sol/lua: mostra o tema para onde vai, e se redesenha quando o tema muda por qualquer caminho. */
function buildBotaoTema(): HTMLButtonElement {
  const btn = itemDoTrilho('', '', () => void alternarTema().catch(() => undefined), 'geral.tema');
  const desenhar = (tema: 'claro' | 'escuro'): void => {
    const rotulo = tema === 'escuro' ? 'Tema claro' : 'Tema escuro';
    btn.dataset.dica = rotulo;
    btn.setAttribute('aria-label', rotulo);
    btn.innerHTML = svg(tema === 'escuro' ? ICONE_SOL : ICONE_LUA);
  };
  desenhar(temaEfetivo());
  onTemaMudou(desenhar);
  return btn;
}

function buildTrilho(): HTMLElement {
  const trilho = document.createElement('div');
  trilho.className = 'trilho';

  const logo = document.createElement('div');
  logo.className = 'trilho-logo';
  logo.innerHTML = '<img src="./assets/icon-64.png" alt="" width="28" height="28" />';
  logo.title = 'Iris';
  trilho.appendChild(logo);

  const principal = document.createElement('div');
  principal.className = 'trilho-grupo';
  MODULOS.filter((m) => m.posicao === 'topo').forEach((m) => principal.appendChild(itemDeModulo(m.id, m.rotulo)));
  principal.appendChild(Object.assign(document.createElement('span'), { className: 'trilho-divisor' }));
  CATEGORIAS.forEach((c) => {
    const modulos = modulosDa(c.id);
    if (modulos.length > 1) principal.appendChild(itemDeCategoria(c.id, c.rotulo));
    else if (modulos[0]) principal.appendChild(itemDeModulo(modulos[0].id, modulos[0].rotulo));
  });
  trilho.appendChild(principal);

  trilho.appendChild(Object.assign(document.createElement('span'), { className: 'trilho-espaco' }));

  const rodape = document.createElement('div');
  rodape.className = 'trilho-grupo';
  rodape.appendChild(itemDoTrilho(ICONE_BUSCA, 'Ir para…', () => void abrirBuscaRapida(), 'geral.busca'));
  // O aviso de atualização (core/atualizacao.ts) entra aqui quando há versão nova.
  rodape.appendChild(Object.assign(document.createElement('div'), { className: 'trilho-aviso' }));
  rodape.appendChild(Object.assign(document.createElement('span'), { className: 'trilho-divisor' }));
  rodape.appendChild(buildBotaoTema());
  MODULOS.filter((m) => m.posicao === 'rodape').forEach((m) => rodape.appendChild(itemDeModulo(m.id, m.rotulo)));
  trilho.appendChild(rodape);
  return trilho;
}

// ---------- Painel ----------

function itemDoPainel(m: (typeof MODULOS)[number], comDescricao: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `sb-painel-item${m.id === moduloAtivo ? ' is-ativo' : ''}`;
  btn.dataset.module = m.id;
  const icone = document.createElement('span');
  icone.className = 'sb-painel-item-icone';
  icone.innerHTML = svg(ICONE_DO_MODULO[m.id], 17);
  const textos = document.createElement('span');
  textos.className = 'sb-painel-item-textos';
  textos.appendChild(Object.assign(document.createElement('span'), { className: 'sb-painel-item-nome', textContent: m.rotulo }));
  if (comDescricao) textos.appendChild(Object.assign(document.createElement('span'), { className: 'sb-painel-item-desc', textContent: m.descricao }));
  btn.append(icone, textos);
  btn.addEventListener('click', () => escolher(m.id));
  return btn;
}

function cabecalhoDoPainel(titulo: string): HTMLElement {
  const cab = document.createElement('header');
  cab.className = 'sb-painel-cab';
  cab.appendChild(Object.assign(document.createElement('span'), { className: 'sb-painel-titulo', textContent: titulo }));
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'sb-painel-fixar';
  const rotulo = comAtalho(fixado ? 'Soltar o painel' : 'Fixar o painel aberto', 'geral.fixar');
  botao.title = rotulo;
  botao.setAttribute('aria-label', rotulo);
  botao.innerHTML = svg(fixado ? ICONE_RECOLHER : ICONE_FIXAR, 15, 2);
  botao.addEventListener('click', () => definirFixado(!fixado));
  cab.appendChild(botao);
  return cab;
}

function desenharPainel(): void {
  if (!painelEl || !sidebarEl) return;
  const visivel = fixado || categoriaAberta !== null;
  sidebarEl.classList.toggle('is-fixado', fixado);
  sidebarEl.classList.toggle('is-painel-aberto', visivel);
  painelEl.hidden = !visivel;
  sidebarEl.querySelectorAll<HTMLElement>('.trilho-item[data-categoria]').forEach((b) => {
    b.setAttribute('aria-expanded', String(!fixado && b.dataset.categoria === categoriaAberta));
    b.classList.toggle('is-aberto', !fixado && b.dataset.categoria === categoriaAberta);
  });
  if (!visivel) {
    painelEl.replaceChildren();
    return;
  }

  if (fixado) {
    // Fixado: todas as categorias numa lista compacta, como um índice.
    painelEl.replaceChildren(cabecalhoDoPainel('Navegação'));
    const lista = document.createElement('div');
    lista.className = 'sb-painel-rolagem';
    categoriasComPainel().forEach((c) => {
      const grupo = document.createElement('section');
      grupo.className = 'sb-painel-grupo';
      grupo.dataset.categoria = c.id;
      grupo.appendChild(Object.assign(document.createElement('span'), { className: 'sb-painel-grupo-rotulo', textContent: c.rotulo }));
      modulosDa(c.id).forEach((m) => grupo.appendChild(itemDoPainel(m, false)));
      lista.appendChild(grupo);
    });
    painelEl.appendChild(lista);
    desenharContagens();
    return;
  }

  const categoria = CATEGORIAS.find((c) => c.id === categoriaAberta);
  if (!categoria) return;
  painelEl.replaceChildren(cabecalhoDoPainel(categoria.rotulo));
  const lista = document.createElement('div');
  lista.className = 'sb-painel-rolagem';
  modulosDa(categoria.id).forEach((m) => lista.appendChild(itemDoPainel(m, true)));
  painelEl.appendChild(lista);
  desenharContagens();
}

function aoClicarFora(e: PointerEvent): void {
  if (sidebarEl && !sidebarEl.contains(e.target as Node)) fecharPainel();
}

function abrirPainel(categoria: CategoriaId, focar = false): void {
  categoriaAberta = categoria;
  desenharPainel();
  if (!soltarCamada && painelEl) {
    // Na pilha de camadas: Esc fecha o painel antes de qualquer coisa por baixo.
    soltarCamada = empilharCamada(painelEl, fecharPainel);
    document.addEventListener('pointerdown', aoClicarFora, true);
  }
  if (focar) painelEl?.querySelector<HTMLElement>('.sb-painel-item')?.focus();
}

function fecharPainel(): void {
  if (categoriaAberta === null) return;
  const voltarFoco = categoriaAberta;
  categoriaAberta = null;
  soltarCamada?.();
  soltarCamada = null;
  document.removeEventListener('pointerdown', aoClicarFora, true);
  desenharPainel();
  // Quem estava no painel pelo teclado volta para o ícone da categoria.
  if (sidebarEl?.contains(document.activeElement) || document.activeElement === document.body) {
    sidebarEl?.querySelector<HTMLElement>(`.trilho-item[data-categoria="${voltarFoco}"]`)?.focus({ preventScroll: true });
  }
}

function rolarAteCategoria(categoria: CategoriaId): void {
  const grupo = painelEl?.querySelector<HTMLElement>(`.sb-painel-grupo[data-categoria="${categoria}"]`);
  if (!grupo) return;
  grupo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  grupo.classList.remove('is-destacado');
  void grupo.offsetWidth;
  grupo.classList.add('is-destacado');
}

function escolher(modulo: ModuloId): void {
  fecharPainel();
  aoEscolher(modulo);
}

// ---------- Fixado ----------

export function estaFixado(): boolean {
  return fixado;
}

export function definirFixado(valor: boolean): void {
  if (fixado === valor) return;
  fecharPainel();
  fixado = valor;
  gravarFixado(valor);
  desenharPainel();
  ouvintesFixado.forEach((cb) => cb(valor));
}

/** Para a opção de Ajustes acompanhar o botão do painel e o Ctrl+B. */
export function assinarFixado(cb: (fixado: boolean) => void): () => void {
  ouvintesFixado.add(cb);
  return () => ouvintesFixado.delete(cb);
}

// ---------- Busca rápida ----------

/** Carregada no primeiro uso: a paleta não pesa na abertura do app. Ctrl+P, pelos atalhos (atalhos.globais.ts). */
export async function abrirBuscaRapida(): Promise<void> {
  fecharPainel();
  const { abrirPaleta } = await import('./paleta.js');
  abrirPaleta();
}

// ---------- API ----------

export function montarSidebar(container: HTMLElement, escolherModulo: (modulo: ModuloId) => void): void {
  sidebarEl = container;
  aoEscolher = escolherModulo;
  painelEl = document.createElement('aside');
  painelEl.className = 'sb-painel';
  painelEl.setAttribute('aria-label', 'Módulos');
  container.replaceChildren(buildTrilho(), painelEl);
  desenharPainel();
  desenharTeclas();
  onAtalhosMudaram(() => {
    desenharTeclas();
    desenharPainel();
  });
}

export function marcarAtivo(modulo: ModuloId): void {
  moduloAtivo = modulo;
  if (!sidebarEl) return;
  const categoria = MODULOS.find((m) => m.id === modulo)?.posicao;
  sidebarEl.querySelectorAll<HTMLElement>('.trilho-item').forEach((b) => {
    const ativo = b.dataset.module === modulo || (b.dataset.categoria !== undefined && b.dataset.categoria === categoria);
    b.classList.toggle('is-ativo', ativo);
    if (ativo) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  sidebarEl.querySelectorAll<HTMLElement>('.sb-painel-item').forEach((b) => b.classList.toggle('is-ativo', b.dataset.module === modulo));
}
