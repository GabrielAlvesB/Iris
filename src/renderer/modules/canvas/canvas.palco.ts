import {
  FORMAS_DE_CAIXA,
  LARGURA_TRACO,
  MAX_FORMAS,
  MAX_PONTOS_DESENHO,
  TAMANHO_FONTE,
  ZOOM_MAX,
  ZOOM_MIN,
  caixaDosPontos,
  type EstiloForma,
  type FormaCanvas,
  type QuadroCanvas,
  type TipoForma,
  type ViewportCanvas,
} from '../../../shared/types/canvas.types.js';
import { ALTURA_LINHA, PINTOR_EXPORTAR, PINTOR_TELA, RESPIRO, alturaDoTexto, s, svgDaForma, temTexto, type Pintor } from './canvas.formas.js';

/**
 * O palco do Canvas: um SVG com o mundo (formas) dentro de um <g> transformado
 * por pan/zoom, e uma camada de seleção por cima. Os gestos usam pointer events
 * com captura (caneta e toque funcionam; o traço não se perde fora da janela).
 *
 * O quadro vive aqui enquanto a tela está aberta: cada gesto edita a cópia local
 * e, na pausa, `aoSalvar` manda o quadro inteiro para o main.
 */

export type Ferramenta = 'selecionar' | 'mao' | 'desenho' | 'borracha' | 'seta' | 'linha' | 'retangulo' | 'elipse' | 'losango' | 'triangulo' | 'texto' | 'nota';

/** Estas continuam escolhidas depois de usar; as outras voltam para "Selecionar" (como no tldraw). */
const FERRAMENTAS_FIXAS: Ferramenta[] = ['mao', 'desenho', 'borracha'];
const LIMIAR_ARRASTE = 3;
const PASSOS_DESFAZER = 100;
const ESPERA_SALVAR = 600;
const ESPERA_VIEWPORT = 800;
const MARCA_COPIA = 'iris-canvas:';

type Ponto = [number, number];

export interface OpcoesPalco {
  quadro: QuadroCanvas;
  estilo: EstiloForma;
  aoSalvar(quadro: QuadroCanvas): void;
  aoViewport(viewport: ViewportCanvas): void;
  aoMudarSelecao(formas: FormaCanvas[]): void;
  aoMudarFerramenta(f: Ferramenta): void;
  aoMudarVista(zoom: number): void;
  aoMudarHistorico(podeDesfazer: boolean, podeRefazer: boolean): void;
}

export interface Palco {
  el: HTMLElement;
  ferramenta(): Ferramenta;
  usarFerramenta(f: Ferramenta): void;
  /** Muda o estilo da seleção (e o das próximas formas). */
  aplicarEstilo(parcial: Partial<EstiloForma>): void;
  alternarPonta(qual: 'inicio' | 'fim'): void;
  desfazer(): void;
  refazer(): void;
  zoomRelativo(fator: number): void;
  zoomPara(zoom: number): void;
  ajustar(): void;
  apagarSelecao(): void;
  duplicarSelecao(): void;
  ordem(para: 'frente' | 'tras' | 'topo' | 'fundo'): void;
  /** SVG (texto) ou PNG (data URL) da seleção — ou do quadro, sem seleção. */
  exportar(formato: 'svg' | 'png'): Promise<string | null>;
  temSelecao(): boolean;
  focarForma(id: string): boolean;
  descarregar(): void;
  destruir(): void;
}

function uid(): string {
  return crypto.randomUUID();
}

function agora(): string {
  return new Date().toISOString();
}

function clonar<T>(v: T): T {
  return structuredClone(v);
}

function limitar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function rotacionar([x, y]: Ponto, graus: number, [cx, cy]: Ponto = [0, 0]): Ponto {
  if (!graus) return [x, y];
  const r = (graus * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

function distSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? limitar(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

function uniao(caixas: Caixa[]): Caixa | null {
  if (!caixas.length) return null;
  const x = Math.min(...caixas.map((c) => c.x));
  const y = Math.min(...caixas.map((c) => c.y));
  const x2 = Math.max(...caixas.map((c) => c.x + c.w));
  const y2 = Math.max(...caixas.map((c) => c.y + c.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

function cruza(a: Caixa, b: Caixa): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

type Operacao =
  | { tipo: 'pan'; inicio: Ponto; vp: ViewportCanvas }
  | { tipo: 'mover'; inicio: Ponto; originais: Map<string, FormaCanvas>; moveu: boolean }
  | { tipo: 'marquee'; inicio: Ponto; atual: Ponto; base: Set<string> }
  | { tipo: 'redimensionar'; hx: number; hy: number; originais: Map<string, FormaCanvas>; caixa: Caixa }
  | { tipo: 'girar'; id: string; centro: Ponto; ang0: number; rot0: number }
  | { tipo: 'ponta'; id: string; qual: 0 | 1 }
  | { tipo: 'desenhar'; forma: FormaCanvas; abs: Ponto[] }
  | { tipo: 'criar'; forma: FormaCanvas; inicio: Ponto }
  | { tipo: 'apagar'; ids: Set<string> };

export function criarPalco(opcoes: OpcoesPalco): Palco {
  const quadro = clonar(opcoes.quadro);
  let estilo: EstiloForma = { ...opcoes.estilo };
  let ferramenta: Ferramenta = 'selecionar';
  let selecao = new Set<string>();
  let op: Operacao | null = null;
  let antes: string | null = null;
  let inicioTela: Ponto | null = null;
  let espaco = false;
  let editando: { id: string; area: HTMLTextAreaElement; antes: string } | null = null;
  const passado: string[] = [];
  const futuro: string[] = [];
  let timerSalvar: number | null = null;
  let timerViewport: number | null = null;
  let quadroPendente = false;
  let rafDesenho: number | null = null;

  // ---------- DOM ----------

  const el = document.createElement('div');
  el.className = 'cv-palco';
  el.tabIndex = 0;
  el.setAttribute('aria-label', `Quadro ${quadro.nome}`);
  const svgEl = s('svg', { class: 'cv-svg' });
  const mundo = s('g', { class: 'cv-mundo' });
  const camadaFormas = s('g', { class: 'cv-formas' });
  const camadaSelecao = s('g', { class: 'cv-selecao' });
  mundo.append(camadaFormas, camadaSelecao);
  svgEl.appendChild(mundo);
  el.appendChild(svgEl);

  // ---------- Coordenadas ----------

  const vp = (): ViewportCanvas => quadro.viewport;

  function paraMundo(clienteX: number, clienteY: number): Ponto {
    const r = el.getBoundingClientRect();
    return [(clienteX - r.left - vp().x) / vp().zoom, (clienteY - r.top - vp().y) / vp().zoom];
  }

  function paraTela([x, y]: Ponto): Ponto {
    return [x * vp().zoom + vp().x, y * vp().zoom + vp().y];
  }

  function aplicarVista(): void {
    const { x, y, zoom } = vp();
    mundo.setAttribute('transform', `translate(${x} ${y}) scale(${zoom})`);
    const passo = 24 * zoom;
    el.style.backgroundSize = `${passo}px ${passo}px`;
    el.style.backgroundPosition = `${x}px ${y}px`;
    el.style.setProperty('--cv-zoom', String(zoom));
    opcoes.aoMudarVista(zoom);
    if (editando) posicionarEditor();
  }

  function mudouVista(): void {
    aplicarVista();
    desenharSelecao();
    if (timerViewport) clearTimeout(timerViewport);
    timerViewport = window.setTimeout(() => {
      timerViewport = null;
      // Com quadro a salvar, o viewport vai junto nele.
      if (!quadroPendente) opcoes.aoViewport({ ...vp() });
    }, ESPERA_VIEWPORT);
  }

  // ---------- Geometria das formas ----------

  const mapa = (): Map<string, FormaCanvas> => new Map(quadro.formas.map((f) => [f.id, f]));

  function centro(f: FormaCanvas): Ponto {
    return [f.x + f.w / 2, f.y + f.h / 2];
  }

  /** Onde a reta do centro até `alvo` sai da forma (retângulo ou elipse), com uma folga. */
  function borda(f: FormaCanvas, alvo: Ponto): Ponto {
    const c = centro(f);
    const dx = alvo[0] - c[0];
    const dy = alvo[1] - c[1];
    const d = Math.hypot(dx, dy);
    if (d < 1) return c;
    const hw = f.w / 2;
    const hh = f.h / 2;
    const t = f.tipo === 'elipse' ? 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2) : Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    const folga = 8;
    return [c[0] + dx * t + (dx / d) * folga, c[1] + dy * t + (dy / d) * folga];
  }

  function pontasDe(f: FormaCanvas, m = mapa()): [Ponto, Ponto] {
    let [a, b] = f.pontos as [Ponto, Ponto];
    const fa = f.ligacoes?.inicio ? m.get(f.ligacoes.inicio) : undefined;
    const fb = f.ligacoes?.fim ? m.get(f.ligacoes.fim) : undefined;
    const alvoA = fa ? centro(fa) : a;
    const alvoB = fb ? centro(fb) : b;
    if (fa) a = borda(fa, alvoB);
    if (fb) b = borda(fb, alvoA);
    return [a, b];
  }

  function caixaDe(f: FormaCanvas, m = mapa()): Caixa {
    if (f.tipo === 'linha' || f.tipo === 'seta') return caixaDosPontos(pontasDe(f, m));
    if (!f.rotacao) return { x: f.x, y: f.y, w: f.w, h: f.h };
    const c = centro(f);
    const cantos: Ponto[] = [
      [f.x, f.y],
      [f.x + f.w, f.y],
      [f.x + f.w, f.y + f.h],
      [f.x, f.y + f.h],
    ].map((p) => rotacionar(p as Ponto, f.rotacao, c));
    return caixaDosPontos(cantos);
  }

  function acerta(f: FormaCanvas, p: Ponto, m: Map<string, FormaCanvas>): boolean {
    const tol = 8 / vp().zoom;
    if (f.tipo === 'linha' || f.tipo === 'seta') {
      const [a, b] = pontasDe(f, m);
      return distSegmento(p, a, b) <= tol + LARGURA_TRACO[f.estilo.traco];
    }
    if (f.tipo === 'desenho') {
      const c = caixaDe(f, m);
      if (p[0] < c.x - tol || p[0] > c.x + c.w + tol || p[1] < c.y - tol || p[1] > c.y + c.h + tol) return false;
      const pts = f.pontos ?? [];
      for (let i = 0; i < pts.length; i++) {
        const a: Ponto = [f.x + pts[i]![0], f.y + pts[i]![1]];
        const b: Ponto = i + 1 < pts.length ? [f.x + pts[i + 1]![0], f.y + pts[i + 1]![1]] : a;
        if (distSegmento(p, a, b) <= tol + LARGURA_TRACO[f.estilo.traco]) return true;
      }
      return false;
    }
    const [lx, ly] = rotacionar(p, -f.rotacao, centro(f));
    return lx >= f.x - tol / 2 && lx <= f.x + f.w + tol / 2 && ly >= f.y - tol / 2 && ly <= f.y + f.h + tol / 2;
  }

  function formaEm(p: Ponto, filtro?: (f: FormaCanvas) => boolean): FormaCanvas | null {
    const m = mapa();
    for (let i = quadro.formas.length - 1; i >= 0; i--) {
      const f = quadro.formas[i]!;
      if (filtro && !filtro(f)) continue;
      if (acerta(f, p, m)) return f;
    }
    return null;
  }

  // ---------- Desenho ----------

  function desenharFormas(): void {
    const m = mapa();
    const pintor: Pintor = PINTOR_TELA;
    const nos: SVGGElement[] = [];
    quadro.formas.forEach((f) => {
      const visivel = editando?.id === f.id ? { ...f, texto: '' } : f;
      const g = svgDaForma(visivel, pintor, f.tipo === 'linha' || f.tipo === 'seta' ? pontasDe(f, m) : undefined);
      if (op?.tipo === 'apagar' && op.ids.has(f.id)) g.classList.add('is-apagando');
      nos.push(g);
    });
    if (op?.tipo === 'desenhar' || op?.tipo === 'criar') {
      const f = op.forma;
      nos.push(svgDaForma(f, pintor, f.tipo === 'linha' || f.tipo === 'seta' ? (f.pontos as [Ponto, Ponto]) : undefined));
    }
    camadaFormas.replaceChildren(...nos);
    desenharSelecao();
  }

  function agendarDesenho(): void {
    if (rafDesenho !== null) return;
    rafDesenho = requestAnimationFrame(() => {
      rafDesenho = null;
      desenharFormas();
    });
  }

  function selecionadas(): FormaCanvas[] {
    return quadro.formas.filter((f) => selecao.has(f.id));
  }

  function alca(x: number, y: number, classe: string, dados: Record<string, string>): SVGElement {
    const t = 9 / vp().zoom;
    const r = s('rect', { x: x - t / 2, y: y - t / 2, width: t, height: t, rx: 2 / vp().zoom, class: `cv-alca ${classe}` });
    Object.entries(dados).forEach(([k, v]) => r.setAttribute(`data-${k}`, v));
    return r;
  }

  function desenharSelecao(): void {
    const nos: SVGElement[] = [];
    const z = vp().zoom;
    const m = mapa();
    const sel = selecionadas();

    if (op?.tipo === 'marquee') {
      const c = caixaDosPontos([op.inicio, op.atual]);
      nos.push(s('rect', { x: c.x, y: c.y, width: c.w, height: c.h, class: 'cv-marquee', 'stroke-width': 1 / z }));
    }

    if (sel.length && !(op?.tipo === 'mover' && op.moveu) && !editando) {
      const unica = sel.length === 1 ? sel[0]! : null;
      if (unica && (unica.tipo === 'linha' || unica.tipo === 'seta')) {
        const [a, b] = pontasDe(unica, m);
        nos.push(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'cv-sel-linha', 'stroke-width': 1 / z }));
        [a, b].forEach((p, i) => {
          const c = s('circle', { cx: p[0], cy: p[1], r: 6 / z, class: 'cv-alca is-ponta', 'stroke-width': 1.5 / z });
          c.setAttribute('data-ponta', String(i));
          nos.push(c);
        });
      } else if (unica && unica.rotacao) {
        // Forma girada: moldura girada junto, alças no próprio contorno.
        const g = s('g', { transform: `rotate(${unica.rotacao} ${unica.x + unica.w / 2} ${unica.y + unica.h / 2})` });
        g.appendChild(s('rect', { x: unica.x, y: unica.y, width: unica.w, height: unica.h, class: 'cv-sel-caixa', 'stroke-width': 1 / z }));
        alcasDaCaixa({ x: unica.x, y: unica.y, w: unica.w, h: unica.h }, true).forEach((n) => g.appendChild(n));
        nos.push(g);
      } else {
        sel.forEach((f) => {
          if (sel.length > 1) {
            const c = caixaDe(f, m);
            nos.push(s('rect', { x: c.x, y: c.y, width: c.w, height: c.h, class: 'cv-sel-item', 'stroke-width': 1 / z }));
          }
        });
        const c = uniao(sel.map((f) => caixaDe(f, m)))!;
        nos.push(s('rect', { x: c.x, y: c.y, width: c.w, height: c.h, class: 'cv-sel-caixa', 'stroke-width': 1 / z }));
        alcasDaCaixa(c, Boolean(unica && unica.tipo !== 'desenho')).forEach((n) => nos.push(n));
      }
    }
    camadaSelecao.replaceChildren(...nos);
  }

  function alcasDaCaixa(c: Caixa, comGiro: boolean): SVGElement[] {
    const z = vp().zoom;
    const nos: SVGElement[] = [];
    if (comGiro) {
      const gx = c.x + c.w / 2;
      const gy = c.y - 26 / z;
      nos.push(s('line', { x1: gx, y1: c.y, x2: gx, y2: gy, class: 'cv-sel-haste', 'stroke-width': 1 / z }));
      const giro = s('circle', { cx: gx, cy: gy, r: 6 / z, class: 'cv-alca is-giro', 'stroke-width': 1.5 / z });
      giro.setAttribute('data-giro', '1');
      nos.push(giro);
    }
    // Em tela pequena, só os cantos: as alças do meio se amontoariam.
    const pequena = c.w * z < 40 || c.h * z < 40;
    for (const hy of [-1, 0, 1]) {
      for (const hx of [-1, 0, 1]) {
        if (!hx && !hy) continue;
        if (pequena && (!hx || !hy)) continue;
        const x = c.x + ((hx + 1) / 2) * c.w;
        const y = c.y + ((hy + 1) / 2) * c.h;
        nos.push(alca(x, y, `h${hx}${hy}`.replace(/-/g, 'm'), { hx: String(hx), hy: String(hy) }));
      }
    }
    return nos;
  }

  function avisarSelecao(): void {
    opcoes.aoMudarSelecao(selecionadas());
  }

  function selecionar(ids: Iterable<string>): void {
    selecao = new Set(ids);
    desenharSelecao();
    avisarSelecao();
  }

  // ---------- Desfazer e salvar ----------

  const foto = (): string => JSON.stringify(quadro.formas);

  function avisarHistorico(): void {
    opcoes.aoMudarHistorico(passado.length > 0, futuro.length > 0);
  }

  /** Fecha uma alteração: guarda o "antes" para desfazer e agenda o salvamento. */
  function registrar(fotoAntes: string): void {
    if (fotoAntes === foto()) return;
    passado.push(fotoAntes);
    if (passado.length > PASSOS_DESFAZER) passado.shift();
    futuro.length = 0;
    avisarHistorico();
    agendarSalvar();
  }

  function agendarSalvar(): void {
    quadroPendente = true;
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = window.setTimeout(salvarAgora, ESPERA_SALVAR);
  }

  function salvarAgora(): void {
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = null;
    if (!quadroPendente) return;
    quadroPendente = false;
    opcoes.aoSalvar(clonar(quadro));
  }

  function restaurar(json: string): void {
    quadro.formas = JSON.parse(json) as FormaCanvas[];
    const existem = new Set(quadro.formas.map((f) => f.id));
    selecao = new Set([...selecao].filter((id) => existem.has(id)));
    desenharFormas();
    avisarSelecao();
    avisarHistorico();
    agendarSalvar();
  }

  // ---------- Criar formas ----------

  function novaForma(tipo: TipoForma, x: number, y: number, w: number, h: number): FormaCanvas {
    return {
      id: uid(),
      tipo,
      x,
      y,
      w: Math.max(1, w),
      h: Math.max(1, h),
      rotacao: 0,
      estilo: { ...estilo },
      updatedAt: agora(),
    };
  }

  function adicionar(f: FormaCanvas): boolean {
    if (quadro.formas.length >= MAX_FORMAS) return false;
    quadro.formas.push(f);
    return true;
  }

  // ---------- Texto ----------

  function caixaDoEditor(f: FormaCanvas): { x: number; y: number; w: number; h: number } {
    const [tx, ty] = paraTela([f.x, f.y]);
    return { x: tx, y: ty, w: f.w * vp().zoom, h: f.h * vp().zoom };
  }

  function posicionarEditor(): void {
    if (!editando) return;
    const f = quadro.formas.find((x) => x.id === editando!.id);
    if (!f) return;
    const c = caixaDoEditor(f);
    const a = editando.area;
    const z = vp().zoom;
    const fonte = TAMANHO_FONTE[f.estilo.tamanhoTexto] * z;
    a.style.left = `${c.x}px`;
    a.style.top = `${c.y}px`;
    a.style.width = `${c.w}px`;
    a.style.fontSize = `${fonte}px`;
    a.style.lineHeight = String(ALTURA_LINHA);
    a.style.transform = f.rotacao ? `rotate(${f.rotacao}deg)` : '';
    a.style.transformOrigin = `${c.w / 2}px ${c.h / 2}px`;
    a.style.padding = f.tipo === 'texto' ? `${(RESPIRO / 2) * z}px ${(RESPIRO / 2) * z}px` : `0 ${RESPIRO * z}px`;
    a.style.textAlign = f.tipo === 'texto' ? 'left' : 'center';
    a.classList.toggle('is-nota', f.tipo === 'nota');
    // Centralizado na vertical (menos o texto solto, que cresce para baixo).
    a.style.height = 'auto';
    const alturaConteudo = a.scrollHeight;
    if (f.tipo === 'texto') {
      a.style.height = `${c.h}px`;
    } else {
      const h = Math.min(c.h, Math.max(fonte * ALTURA_LINHA, alturaConteudo));
      a.style.height = `${h}px`;
      a.style.top = `${c.y + (c.h - h) / 2}px`;
    }
  }

  function editarTexto(id: string): void {
    const f = quadro.formas.find((x) => x.id === id);
    if (!f || !temTexto(f)) return;
    terminarTexto();
    const area = document.createElement('textarea');
    area.className = 'cv-editor';
    area.value = f.texto ?? '';
    area.spellcheck = true;
    area.setAttribute('aria-label', 'Texto da forma');
    editando = { id, area, antes: foto() };
    selecao = new Set([id]);
    el.appendChild(area);
    area.style.color = f.tipo === 'nota' ? '#1d1d1f' : PINTOR_TELA(f.estilo.cor);
    if (f.tipo !== 'nota' && f.estilo.preenchimento === 'solido') area.style.color = f.estilo.cor === 'amarelo' ? '#1d1d1f' : '#ffffff';
    area.addEventListener('input', () => {
      f.texto = area.value;
      if (f.tipo === 'texto') f.h = alturaDoTexto(area.value, f.w - RESPIRO, TAMANHO_FONTE[f.estilo.tamanhoTexto]);
      f.updatedAt = agora();
      posicionarEditor();
      agendarDesenho();
    });
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        terminarTexto();
        el.focus({ preventScroll: true });
      }
    });
    area.addEventListener('blur', () => terminarTexto());
    desenharFormas();
    posicionarEditor();
    area.focus();
    area.select();
  }

  /**
   * Abre o editor no tique seguinte: o mousedown que vem depois deste pointerdown
   * põe o foco no palco e tiraria o foco do editor recém-aberto (o texto se perdia).
   */
  function editarDepois(id: string, fotoAntes: string): void {
    window.setTimeout(() => {
      editarTexto(id);
      if (editando) editando.antes = fotoAntes;
    }, 0);
  }

  function terminarTexto(): void {
    if (!editando) return;
    const { id, area, antes: fotoAntes } = editando;
    editando = null;
    area.remove();
    const f = quadro.formas.find((x) => x.id === id);
    if (f && f.tipo === 'texto' && !(f.texto ?? '').trim()) {
      quadro.formas = quadro.formas.filter((x) => x.id !== id);
      selecao.delete(id);
    }
    desenharFormas();
    avisarSelecao();
    registrar(fotoAntes);
  }

  // ---------- Gestos ----------

  function alvoDaAlca(t: EventTarget | null): { hx: number; hy: number } | 'giro' | { ponta: 0 | 1 } | null {
    if (!(t instanceof SVGElement) || !t.classList.contains('cv-alca')) return null;
    if (t.dataset.giro) return 'giro';
    if (t.dataset.ponta) return { ponta: t.dataset.ponta === '1' ? 1 : 0 };
    return { hx: Number(t.dataset.hx), hy: Number(t.dataset.hy) };
  }

  function aoApertar(e: PointerEvent): void {
    if (editando && e.target !== editando.area) terminarTexto();
    if (e.target instanceof HTMLTextAreaElement) return;
    el.focus({ preventScroll: true });
    if (e.button === 2) return;
    const p = paraMundo(e.clientX, e.clientY);
    inicioTela = [e.clientX, e.clientY];
    el.setPointerCapture(e.pointerId);

    if (e.button === 1 || espaco || ferramenta === 'mao') {
      op = { tipo: 'pan', inicio: [e.clientX, e.clientY], vp: { ...vp() } };
      el.classList.add('is-arrastando');
      return;
    }

    switch (ferramenta) {
      case 'selecionar': {
        const a = alvoDaAlca(e.target);
        const sel = selecionadas();
        if (a === 'giro' && sel.length === 1) {
          const f = sel[0]!;
          const c = centro(f);
          antes = foto();
          op = { tipo: 'girar', id: f.id, centro: c, ang0: Math.atan2(p[1] - c[1], p[0] - c[0]), rot0: f.rotacao };
          return;
        }
        if (a && typeof a === 'object' && 'ponta' in a && sel.length === 1) {
          antes = foto();
          op = { tipo: 'ponta', id: sel[0]!.id, qual: a.ponta };
          return;
        }
        if (a && typeof a === 'object' && 'hx' in a && sel.length) {
          antes = foto();
          const m = mapa();
          op = { tipo: 'redimensionar', hx: a.hx, hy: a.hy, originais: new Map(sel.map((f) => [f.id, clonar(f)])), caixa: uniao(sel.map((f) => caixaDe(f, m)))! };
          return;
        }
        const f = formaEm(p);
        if (f) {
          if (e.shiftKey) {
            if (selecao.has(f.id)) selecao.delete(f.id);
            else selecao.add(f.id);
            selecionar(selecao);
          } else if (!selecao.has(f.id)) {
            selecionar([f.id]);
          }
          antes = foto();
          op = { tipo: 'mover', inicio: p, originais: new Map(selecionadas().map((x) => [x.id, clonar(x)])), moveu: false };
        } else {
          op = { tipo: 'marquee', inicio: p, atual: p, base: e.shiftKey ? new Set(selecao) : new Set() };
          if (!e.shiftKey) selecionar([]);
        }
        return;
      }
      case 'desenho': {
        const forma = novaForma('desenho', p[0], p[1], 1, 1);
        forma.estilo.preenchimento = 'nenhum';
        op = { tipo: 'desenhar', forma, abs: [p] };
        antes = foto();
        return;
      }
      case 'borracha': {
        antes = foto();
        const ids = new Set<string>();
        const f = formaEm(p);
        if (f) ids.add(f.id);
        op = { tipo: 'apagar', ids };
        desenharFormas();
        return;
      }
      case 'texto': {
        antes = foto();
        const fonte = TAMANHO_FONTE[estilo.tamanhoTexto];
        const f = novaForma('texto', p[0], p[1] - fonte * 0.8, 280, alturaDoTexto('', 280 - RESPIRO, fonte));
        if (!adicionar(f)) return;
        usarFerramenta('selecionar');
        const fotoAntes = antes;
        antes = null;
        op = null;
        desenharFormas();
        editarDepois(f.id, fotoAntes);
        return;
      }
      case 'nota': {
        antes = foto();
        const f = novaForma('nota', p[0] - 100, p[1] - 100, 200, 200);
        if (!adicionar(f)) return;
        usarFerramenta('selecionar');
        const fotoAntes = antes;
        antes = null;
        op = null;
        desenharFormas();
        editarDepois(f.id, fotoAntes);
        return;
      }
      case 'linha':
      case 'seta': {
        antes = foto();
        const forma = novaForma(ferramenta, p[0], p[1], 1, 1);
        forma.pontos = [p, p];
        if (ferramenta === 'seta') {
          forma.pontaFim = true;
          forma.pontaInicio = false;
        }
        const alvo = formaEm(p, (x) => FORMAS_DE_CAIXA.includes(x.tipo));
        if (alvo) forma.ligacoes = { inicio: alvo.id };
        op = { tipo: 'criar', forma, inicio: p };
        return;
      }
      default: {
        antes = foto();
        op = { tipo: 'criar', forma: novaForma(ferramenta as TipoForma, p[0], p[1], 1, 1), inicio: p };
      }
    }
  }

  function aoMover(e: PointerEvent): void {
    if (!op) {
      // Cursor de mãozinha sobre uma forma, cruz no vazio.
      if (ferramenta === 'selecionar' && e.target instanceof SVGElement && !e.target.classList.contains('cv-alca')) {
        el.classList.toggle('is-sobre-forma', Boolean(formaEm(paraMundo(e.clientX, e.clientY))));
      }
      return;
    }
    const p = paraMundo(e.clientX, e.clientY);
    const longe = inicioTela ? Math.hypot(e.clientX - inicioTela[0], e.clientY - inicioTela[1]) > LIMIAR_ARRASTE : true;

    switch (op.tipo) {
      case 'pan': {
        quadro.viewport = { ...op.vp, x: op.vp.x + e.clientX - op.inicio[0], y: op.vp.y + e.clientY - op.inicio[1] };
        mudouVista();
        return;
      }
      case 'mover': {
        if (!longe && !op.moveu) return;
        op.moveu = true;
        let dx = p[0] - op.inicio[0];
        let dy = p[1] - op.inicio[1];
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const movidos = new Set(op.originais.keys());
        quadro.formas.forEach((f) => {
          const o = op && op.tipo === 'mover' ? op.originais.get(f.id) : undefined;
          if (!o) return;
          f.x = o.x + dx;
          f.y = o.y + dy;
          if (o.pontos && (f.tipo === 'linha' || f.tipo === 'seta')) {
            f.pontos = o.pontos.map(([x, y]) => [x + dx, y + dy]);
            // Ponta presa a uma forma que não está indo junto se solta.
            if (o.ligacoes) {
              const lig = { ...o.ligacoes };
              if (lig.inicio && !movidos.has(lig.inicio)) delete lig.inicio;
              if (lig.fim && !movidos.has(lig.fim)) delete lig.fim;
              f.ligacoes = lig.inicio || lig.fim ? lig : undefined;
              if (!f.ligacoes) delete f.ligacoes;
            }
          }
          f.updatedAt = agora();
        });
        agendarDesenho();
        return;
      }
      case 'marquee': {
        op.atual = p;
        const c = caixaDosPontos([op.inicio, op.atual]);
        const m = mapa();
        const dentro = quadro.formas.filter((f) => cruza(c, caixaDe(f, m))).map((f) => f.id);
        selecao = new Set([...op.base, ...dentro]);
        desenharSelecao();
        return;
      }
      case 'redimensionar': {
        redimensionar(op, p, e.shiftKey);
        agendarDesenho();
        return;
      }
      case 'girar': {
        const f = quadro.formas.find((x) => x.id === (op as { id: string }).id);
        if (!f) return;
        let rot = op.rot0 + ((Math.atan2(p[1] - op.centro[1], p[0] - op.centro[0]) - op.ang0) * 180) / Math.PI;
        if (e.shiftKey) rot = Math.round(rot / 15) * 15;
        f.rotacao = ((rot % 360) + 360) % 360;
        f.updatedAt = agora();
        agendarDesenho();
        return;
      }
      case 'ponta': {
        const f = quadro.formas.find((x) => x.id === (op as { id: string }).id);
        if (!f?.pontos) return;
        const qual = op.qual;
        const alvo = formaEm(p, (x) => FORMAS_DE_CAIXA.includes(x.tipo) && x.id !== f.id);
        f.pontos[qual] = p;
        const lig = { ...(f.ligacoes ?? {}) };
        if (alvo) lig[qual === 0 ? 'inicio' : 'fim'] = alvo.id;
        else delete lig[qual === 0 ? 'inicio' : 'fim'];
        if (lig.inicio || lig.fim) f.ligacoes = lig;
        else delete f.ligacoes;
        Object.assign(f, caixaDosPontos(f.pontos));
        f.updatedAt = agora();
        el.classList.toggle('is-ligando', Boolean(alvo));
        agendarDesenho();
        return;
      }
      case 'desenhar': {
        const ultimo = op.abs[op.abs.length - 1]!;
        if (Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) * vp().zoom < 1.5) return;
        if (op.abs.length >= MAX_PONTOS_DESENHO) return;
        op.abs.push(p);
        const c = caixaDosPontos(op.abs);
        Object.assign(op.forma, c);
        op.forma.pontos = op.abs.map(([x, y]) => [x - c.x, y - c.y]);
        agendarDesenho();
        return;
      }
      case 'apagar': {
        const f = formaEm(p);
        if (f && !op.ids.has(f.id)) {
          op.ids.add(f.id);
          agendarDesenho();
        }
        return;
      }
      case 'criar': {
        const f = op.forma;
        if (f.tipo === 'linha' || f.tipo === 'seta') {
          let fim = p;
          if (e.shiftKey) {
            // Ângulos de 15 em 15 graus.
            const ang = Math.round(Math.atan2(p[1] - op.inicio[1], p[0] - op.inicio[0]) / (Math.PI / 12)) * (Math.PI / 12);
            const d = Math.hypot(p[0] - op.inicio[0], p[1] - op.inicio[1]);
            fim = [op.inicio[0] + Math.cos(ang) * d, op.inicio[1] + Math.sin(ang) * d];
          }
          f.pontos = [op.inicio, fim];
          const alvo = formaEm(fim, (x) => FORMAS_DE_CAIXA.includes(x.tipo) && x.id !== f.ligacoes?.inicio);
          const lig = { ...(f.ligacoes ?? {}) };
          if (alvo) lig.fim = alvo.id;
          else delete lig.fim;
          f.ligacoes = lig.inicio || lig.fim ? lig : undefined;
          if (!f.ligacoes) delete f.ligacoes;
          el.classList.toggle('is-ligando', Boolean(alvo));
          Object.assign(f, caixaDosPontos(f.pontos));
        } else {
          let w = p[0] - op.inicio[0];
          let h = p[1] - op.inicio[1];
          if (e.shiftKey) {
            const lado = Math.max(Math.abs(w), Math.abs(h));
            w = Math.sign(w || 1) * lado;
            h = Math.sign(h || 1) * lado;
          }
          f.x = Math.min(op.inicio[0], op.inicio[0] + w);
          f.y = Math.min(op.inicio[1], op.inicio[1] + h);
          f.w = Math.max(1, Math.abs(w));
          f.h = Math.max(1, Math.abs(h));
        }
        agendarDesenho();
      }
    }
  }

  function redimensionar(o: Extract<Operacao, { tipo: 'redimensionar' }>, p: Ponto, proporcional: boolean): void {
    const MIN = 8;
    const ids = [...o.originais.keys()];
    // Uma forma girada: as contas no sistema dela (a alça oposta fica parada).
    if (ids.length === 1) {
      const orig = o.originais.get(ids[0]!)!;
      const f = quadro.formas.find((x) => x.id === orig.id);
      if (f && orig.rotacao && f.tipo !== 'linha' && f.tipo !== 'seta') {
        const c: Ponto = [orig.x + orig.w / 2, orig.y + orig.h / 2];
        const ancoraLocal: Ponto = [(-o.hx * orig.w) / 2, (-o.hy * orig.h) / 2];
        const ancora = rotacionar([c[0] + ancoraLocal[0], c[1] + ancoraLocal[1]], orig.rotacao, c);
        const d = rotacionar([p[0] - ancora[0], p[1] - ancora[1]], -orig.rotacao);
        let w = o.hx ? Math.max(MIN, o.hx * d[0]) : orig.w;
        let h = o.hy ? Math.max(MIN, o.hy * d[1]) : orig.h;
        if (proporcional && o.hx && o.hy) {
          const k = Math.max(w / orig.w, h / orig.h);
          w = orig.w * k;
          h = orig.h * k;
        }
        // O centro novo fica a meia caixa da âncora, na direção da alça (girada junto).
        const meio = rotacionar([(o.hx * w) / 2, (o.hy * h) / 2], orig.rotacao);
        const centroFinal: Ponto = [ancora[0] + meio[0], ancora[1] + meio[1]];
        f.w = w;
        f.h = h;
        f.x = centroFinal[0] - w / 2;
        f.y = centroFinal[1] - h / 2;
        if (f.tipo === 'texto') f.h = Math.max(f.h, alturaDoTexto(f.texto ?? '', f.w - RESPIRO, TAMANHO_FONTE[f.estilo.tamanhoTexto]));
        f.updatedAt = agora();
        return;
      }
    }
    const c = o.caixa;
    const x1 = o.hx === -1 ? p[0] : c.x;
    const x2 = o.hx === 1 ? p[0] : c.x + c.w;
    const y1 = o.hy === -1 ? p[1] : c.y;
    const y2 = o.hy === 1 ? p[1] : c.y + c.h;
    let sx = o.hx ? Math.max(MIN, x2 - x1) / Math.max(1, c.w) : 1;
    let sy = o.hy ? Math.max(MIN, y2 - y1) / Math.max(1, c.h) : 1;
    if (proporcional && o.hx && o.hy) {
      const k = Math.max(sx, sy);
      sx = k;
      sy = k;
    }
    // A borda oposta à alça fica parada.
    const bx = o.hx === -1 ? c.x + c.w : c.x;
    const by = o.hy === -1 ? c.y + c.h : c.y;
    const nx = (x: number): number => bx + (x - bx) * sx;
    const ny = (y: number): number => by + (y - by) * sy;
    quadro.formas.forEach((f) => {
      const orig = o.originais.get(f.id);
      if (!orig) return;
      if (orig.pontos && (f.tipo === 'linha' || f.tipo === 'seta')) {
        f.pontos = orig.pontos.map(([x, y]) => [nx(x), ny(y)]);
        Object.assign(f, caixaDosPontos(f.pontos));
      } else {
        const ax = nx(orig.x);
        const ay = ny(orig.y);
        const bx2 = nx(orig.x + orig.w);
        const by2 = ny(orig.y + orig.h);
        f.x = Math.min(ax, bx2);
        f.y = Math.min(ay, by2);
        f.w = Math.max(1, Math.abs(bx2 - ax));
        f.h = Math.max(1, Math.abs(by2 - ay));
        if (f.tipo === 'desenho' && orig.pontos) {
          f.pontos = orig.pontos.map(([x, y]) => [x * (f.w / orig.w), y * (f.h / orig.h)]);
        }
        if (f.tipo === 'texto') f.h = Math.max(f.h, alturaDoTexto(f.texto ?? '', f.w - RESPIRO, TAMANHO_FONTE[f.estilo.tamanhoTexto]));
      }
      f.updatedAt = agora();
    });
  }

  function aoSoltar(e: PointerEvent): void {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.classList.remove('is-arrastando', 'is-ligando');
    const atual = op;
    op = null;
    inicioTela = null;
    if (!atual) return;
    const fotoAntes = antes;
    antes = null;

    switch (atual.tipo) {
      case 'pan':
        return;
      case 'marquee':
        desenharSelecao();
        avisarSelecao();
        return;
      case 'desenhar': {
        if (atual.forma.pontos && atual.forma.pontos.length) adicionar(atual.forma);
        break;
      }
      case 'apagar': {
        if (atual.ids.size) {
          quadro.formas = quadro.formas.filter((f) => !atual.ids.has(f.id));
          limparLigacoes(atual.ids);
          selecao = new Set([...selecao].filter((id) => !atual.ids.has(id)));
        }
        break;
      }
      case 'criar': {
        const f = atual.forma;
        const pequena = f.tipo === 'linha' || f.tipo === 'seta' ? Math.hypot(f.w, f.h) * vp().zoom < 6 : f.w * vp().zoom < 6 && f.h * vp().zoom < 6;
        if (pequena) {
          // Clique sem arrastar: a forma nasce num tamanho padrão.
          if (f.tipo === 'linha' || f.tipo === 'seta') {
            f.pontos = [atual.inicio, [atual.inicio[0] + 160, atual.inicio[1]]];
            Object.assign(f, caixaDosPontos(f.pontos));
            delete f.ligacoes;
          } else {
            f.w = 160;
            f.h = f.tipo === 'elipse' || f.tipo === 'losango' ? 120 : 100;
            f.x = atual.inicio[0] - f.w / 2;
            f.y = atual.inicio[1] - f.h / 2;
          }
        }
        if (adicionar(f)) {
          selecao = new Set([f.id]);
          if (!FERRAMENTAS_FIXAS.includes(ferramenta)) usarFerramenta('selecionar');
        }
        break;
      }
      case 'mover':
        if (!atual.moveu) {
          desenharSelecao();
          return;
        }
        break;
      default:
        break;
    }
    desenharFormas();
    avisarSelecao();
    if (fotoAntes) registrar(fotoAntes);
  }

  /** Setas presas a formas que sumiram ficam soltas no lugar onde estavam. */
  function limparLigacoes(removidos: Set<string>): void {
    quadro.formas.forEach((f) => {
      if (!f.ligacoes) return;
      if (f.ligacoes.inicio && removidos.has(f.ligacoes.inicio)) delete f.ligacoes.inicio;
      if (f.ligacoes.fim && removidos.has(f.ligacoes.fim)) delete f.ligacoes.fim;
      if (!f.ligacoes.inicio && !f.ligacoes.fim) delete f.ligacoes;
    });
  }

  /** Antes de apagar uma forma, as setas presas a ela guardam o ponto atual (não pulam). */
  function fixarPontasLigadas(ids: Set<string>): void {
    const m = mapa();
    quadro.formas.forEach((f) => {
      if (!f.ligacoes || !f.pontos) return;
      if ((f.ligacoes.inicio && ids.has(f.ligacoes.inicio)) || (f.ligacoes.fim && ids.has(f.ligacoes.fim))) {
        f.pontos = pontasDe(f, m);
      }
    });
  }

  function aoDuploClique(e: MouseEvent): void {
    if (ferramenta !== 'selecionar') return;
    const p = paraMundo(e.clientX, e.clientY);
    const f = formaEm(p);
    if (f && temTexto(f)) {
      editarTexto(f.id);
      return;
    }
    if (!f) {
      const fotoAntes = foto();
      const fonte = TAMANHO_FONTE[estilo.tamanhoTexto];
      const novo = novaForma('texto', p[0], p[1] - fonte * 0.8, 280, alturaDoTexto('', 280 - RESPIRO, fonte));
      if (!adicionar(novo)) return;
      desenharFormas();
      editarTexto(novo.id);
      if (editando) editando.antes = fotoAntes;
    }
  }

  function aoRoda(e: WheelEvent): void {
    if (editando && e.target === editando.area) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    // Shift + roda (ou trackpad na horizontal) anda para os lados; o resto é zoom no cursor.
    if (e.shiftKey && !e.ctrlKey) {
      quadro.viewport = { ...vp(), x: vp().x - (e.deltaY || e.deltaX), y: vp().y };
      mudouVista();
      return;
    }
    const fator = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomEm(vp().zoom * fator, mx, my);
  }

  function zoomEm(zoom: number, mx: number, my: number): void {
    const z = limitar(zoom, ZOOM_MIN, ZOOM_MAX);
    const wx = (mx - vp().x) / vp().zoom;
    const wy = (my - vp().y) / vp().zoom;
    quadro.viewport = { x: mx - wx * z, y: my - wy * z, zoom: z };
    mudouVista();
  }

  // ---------- Teclado do palco ----------

  function aoTeclar(e: KeyboardEvent): void {
    if (e.target instanceof HTMLTextAreaElement) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const tecla = e.key.toLowerCase();
    if (e.key === ' ' && !espaco) {
      espaco = true;
      el.classList.add('is-mao');
      e.preventDefault();
      return;
    }
    if (ctrl && tecla === 'z') {
      e.preventDefault();
      if (e.shiftKey) refazer();
      else desfazer();
      return;
    }
    if (ctrl && tecla === 'y') {
      e.preventDefault();
      refazer();
      return;
    }
    if (ctrl && tecla === 'a') {
      e.preventDefault();
      selecionar(quadro.formas.map((f) => f.id));
      return;
    }
    if (ctrl && tecla === 'd') {
      e.preventDefault();
      duplicarSelecao();
      return;
    }
    if (ctrl && (tecla === 'c' || tecla === 'x')) {
      if (!selecao.size) return;
      e.preventDefault();
      copiar();
      if (tecla === 'x') apagarSelecao();
      return;
    }
    if (ctrl && tecla === 'v') {
      e.preventDefault();
      void colar();
      return;
    }
    if (ctrl) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!selecao.size) return;
      e.preventDefault();
      apagarSelecao();
      return;
    }
    if (e.key === 'Escape') {
      if (selecao.size) {
        e.preventDefault();
        selecionar([]);
      } else if (ferramenta !== 'selecionar') {
        e.preventDefault();
        usarFerramenta('selecionar');
      }
      return;
    }
    if (e.key === 'Enter' && selecao.size === 1) {
      const f = selecionadas()[0]!;
      if (temTexto(f)) {
        e.preventDefault();
        editarTexto(f.id);
      }
      return;
    }
    if (e.key === ']' || e.key === '}') {
      e.preventDefault();
      ordem(e.shiftKey || e.key === '}' ? 'topo' : 'frente');
      return;
    }
    if (e.key === '[' || e.key === '{') {
      e.preventDefault();
      ordem(e.shiftKey || e.key === '{' ? 'fundo' : 'tras');
      return;
    }
    const passos: Record<string, Ponto> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const passo = passos[e.key];
    if (passo && selecao.size) {
      e.preventDefault();
      const k = e.shiftKey ? 10 : 1;
      const fotoAntes = foto();
      selecionadas().forEach((f) => {
        f.x += passo[0] * k;
        f.y += passo[1] * k;
        if (f.pontos && (f.tipo === 'linha' || f.tipo === 'seta')) {
          f.pontos = f.pontos.map(([x, y]) => [x + passo[0] * k, y + passo[1] * k]);
          delete f.ligacoes;
        }
        f.updatedAt = agora();
      });
      desenharFormas();
      registrar(fotoAntes);
    }
  }

  function aoSoltarTecla(e: KeyboardEvent): void {
    if (e.key === ' ') {
      espaco = false;
      el.classList.remove('is-mao');
    }
  }

  // ---------- Copiar, colar, duplicar ----------

  function copiaComIdsNovos(formas: FormaCanvas[], desloc: number): FormaCanvas[] {
    const novos = new Map(formas.map((f) => [f.id, uid()]));
    return formas.map((f) => {
      const c = clonar(f);
      c.id = novos.get(f.id)!;
      c.x += desloc;
      c.y += desloc;
      c.updatedAt = agora();
      if (c.pontos && (c.tipo === 'linha' || c.tipo === 'seta')) c.pontos = c.pontos.map(([x, y]) => [x + desloc, y + desloc]);
      if (c.ligacoes) {
        // Ligação só continua se a forma ligada foi copiada junto.
        const inicio = c.ligacoes.inicio ? novos.get(c.ligacoes.inicio) : undefined;
        const fim = c.ligacoes.fim ? novos.get(c.ligacoes.fim) : undefined;
        if (inicio || fim) c.ligacoes = { ...(inicio ? { inicio } : {}), ...(fim ? { fim } : {}) };
        else delete c.ligacoes;
      }
      return c;
    });
  }

  function inserir(formas: FormaCanvas[]): void {
    const fotoAntes = foto();
    const cabem = formas.slice(0, Math.max(0, MAX_FORMAS - quadro.formas.length));
    quadro.formas.push(...cabem);
    selecao = new Set(cabem.map((f) => f.id));
    desenharFormas();
    avisarSelecao();
    registrar(fotoAntes);
  }

  function copiar(): void {
    const m = mapa();
    // As setas guardam o ponto de agora: coladas sem a forma ligada, ficam no lugar certo.
    const formas = selecionadas().map((f) => (f.ligacoes ? { ...clonar(f), pontos: pontasDe(f, m) } : clonar(f)));
    window.irisAPI.system.copyToClipboard(MARCA_COPIA + JSON.stringify(formas));
  }

  async function colar(): Promise<void> {
    let texto = '';
    try {
      texto = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!texto) return;
    if (texto.startsWith(MARCA_COPIA)) {
      try {
        const formas = JSON.parse(texto.slice(MARCA_COPIA.length)) as FormaCanvas[];
        if (Array.isArray(formas) && formas.length) inserir(copiaComIdsNovos(formas.filter((f) => f && typeof f.id === 'string'), 24));
      } catch {
        // texto com a marca mas quebrado: ignora
      }
      return;
    }
    // Texto comum vira um texto no meio da tela.
    const r = el.getBoundingClientRect();
    const [cx, cy] = paraMundo(r.left + r.width / 2, r.top + r.height / 2);
    const fonte = TAMANHO_FONTE[estilo.tamanhoTexto];
    const w = 360;
    const conteudo = texto.slice(0, 20_000);
    const f = novaForma('texto', cx - w / 2, cy, w, alturaDoTexto(conteudo, w - RESPIRO, fonte));
    f.texto = conteudo;
    inserir([f]);
  }

  function duplicarSelecao(): void {
    if (!selecao.size) return;
    inserir(copiaComIdsNovos(selecionadas(), 24));
  }

  function apagarSelecao(): void {
    if (!selecao.size) return;
    const fotoAntes = foto();
    const ids = new Set(selecao);
    fixarPontasLigadas(ids);
    quadro.formas = quadro.formas.filter((f) => !ids.has(f.id));
    limparLigacoes(ids);
    selecao.clear();
    desenharFormas();
    avisarSelecao();
    registrar(fotoAntes);
  }

  function ordem(para: 'frente' | 'tras' | 'topo' | 'fundo'): void {
    if (!selecao.size) return;
    const fotoAntes = foto();
    const lista = quadro.formas;
    if (para === 'topo') quadro.formas = [...lista.filter((f) => !selecao.has(f.id)), ...lista.filter((f) => selecao.has(f.id))];
    else if (para === 'fundo') quadro.formas = [...lista.filter((f) => selecao.has(f.id)), ...lista.filter((f) => !selecao.has(f.id))];
    else if (para === 'frente') {
      for (let i = lista.length - 2; i >= 0; i--) {
        if (selecao.has(lista[i]!.id) && !selecao.has(lista[i + 1]!.id)) [lista[i], lista[i + 1]] = [lista[i + 1]!, lista[i]!];
      }
    } else {
      for (let i = 1; i < lista.length; i++) {
        if (selecao.has(lista[i]!.id) && !selecao.has(lista[i - 1]!.id)) [lista[i], lista[i - 1]] = [lista[i - 1]!, lista[i]!];
      }
    }
    desenharFormas();
    registrar(fotoAntes);
  }

  // ---------- Vista ----------

  function ajustar(): void {
    const r = el.getBoundingClientRect();
    const c = uniao(quadro.formas.map((f) => caixaDe(f)));
    if (!c || r.width === 0) {
      quadro.viewport = { x: r.width / 2, y: r.height / 2, zoom: 1 };
      mudouVista();
      return;
    }
    const margem = 60;
    const z = limitar(Math.min((r.width - margem * 2) / Math.max(c.w, 1), (r.height - margem * 2) / Math.max(c.h, 1), 1.5), ZOOM_MIN, ZOOM_MAX);
    quadro.viewport = { zoom: z, x: r.width / 2 - (c.x + c.w / 2) * z, y: r.height / 2 - (c.y + c.h / 2) * z };
    mudouVista();
  }

  // ---------- Exportar ----------

  function montarSvg(formas: FormaCanvas[], pintor: Pintor): { svg: string; w: number; h: number } | null {
    const m = mapa();
    const c = uniao(formas.map((f) => caixaDe(f, m)));
    if (!c) return null;
    const pad = 32;
    const w = Math.ceil(c.w + pad * 2);
    const h = Math.ceil(c.h + pad * 2);
    const raiz = s('svg', { xmlns: 'http://www.w3.org/2000/svg', width: w, height: h, viewBox: `${c.x - pad} ${c.y - pad} ${w} ${h}` });
    raiz.appendChild(s('rect', { x: c.x - pad, y: c.y - pad, width: w, height: h, fill: '#ffffff' }));
    formas.forEach((f) => {
      const g = svgDaForma(f, pintor, f.tipo === 'linha' || f.tipo === 'seta' ? pontasDe(f, m) : undefined);
      // Fora da tela, sem o CSS do app: as áreas de clique invisíveis não podem pintar nada.
      g.querySelectorAll('.cv-alvo-linha, .cv-alvo-caixa').forEach((n) => n.remove());
      g.querySelectorAll('.cv-nota-sombra').forEach((n) => n.setAttribute('fill', 'rgba(0,0,0,0.12)'));
      raiz.appendChild(g);
    });
    return { svg: new XMLSerializer().serializeToString(raiz), w, h };
  }

  async function exportar(formato: 'svg' | 'png'): Promise<string | null> {
    const formas = selecao.size ? quadro.formas.filter((f) => selecao.has(f.id)) : quadro.formas;
    const montado = montarSvg(formas, PINTOR_EXPORTAR);
    if (!montado) return null;
    if (formato === 'svg') return montado.svg;
    // data: (a CSP não deixa blob:); sem foreignObject o canvas não fica "sujo" e o toDataURL funciona.
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(montado.svg)}`;
    await img.decode();
    const escala = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(16000, montado.w * escala);
    canvas.height = Math.min(16000, montado.h * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  // ---------- API ----------

  function usarFerramenta(f: Ferramenta): void {
    terminarTexto();
    ferramenta = f;
    el.dataset.ferramenta = f;
    if (f !== 'selecionar') selecionar([]);
    opcoes.aoMudarFerramenta(f);
  }

  function aplicarEstilo(parcial: Partial<EstiloForma>): void {
    estilo = { ...estilo, ...parcial };
    if (!selecao.size) return;
    const fotoAntes = foto();
    selecionadas().forEach((f) => {
      f.estilo = { ...f.estilo, ...parcial };
      if (f.tipo === 'texto' && parcial.tamanhoTexto) f.h = alturaDoTexto(f.texto ?? '', f.w - RESPIRO, TAMANHO_FONTE[f.estilo.tamanhoTexto]);
      f.updatedAt = agora();
    });
    desenharFormas();
    avisarSelecao();
    registrar(fotoAntes);
  }

  function alternarPonta(qual: 'inicio' | 'fim'): void {
    const setas = selecionadas().filter((f) => f.tipo === 'seta');
    if (!setas.length) return;
    const fotoAntes = foto();
    setas.forEach((f) => {
      if (qual === 'inicio') f.pontaInicio = !f.pontaInicio;
      else f.pontaFim = f.pontaFim === false;
      f.updatedAt = agora();
    });
    desenharFormas();
    avisarSelecao();
    registrar(fotoAntes);
  }

  function desfazer(): void {
    terminarTexto();
    const anterior = passado.pop();
    if (anterior === undefined) return;
    futuro.push(foto());
    restaurar(anterior);
  }

  function refazer(): void {
    const proximo = futuro.pop();
    if (proximo === undefined) return;
    passado.push(foto());
    restaurar(proximo);
  }

  function focarForma(id: string): boolean {
    const f = quadro.formas.find((x) => x.id === id);
    if (!f) return false;
    const r = el.getBoundingClientRect();
    const c = caixaDe(f);
    const z = Math.max(vp().zoom, 1);
    quadro.viewport = { zoom: z, x: r.width / 2 - (c.x + c.w / 2) * z, y: r.height / 2 - (c.y + c.h / 2) * z };
    mudouVista();
    selecionar([id]);
    return true;
  }

  const observador = new ResizeObserver(() => desenharSelecao());
  observador.observe(el);

  el.addEventListener('pointerdown', aoApertar);
  el.addEventListener('pointermove', aoMover);
  el.addEventListener('pointerup', aoSoltar);
  el.addEventListener('pointercancel', aoSoltar);
  el.addEventListener('dblclick', aoDuploClique);
  el.addEventListener('wheel', aoRoda, { passive: false });
  el.addEventListener('keydown', aoTeclar);
  el.addEventListener('keyup', aoSoltarTecla);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('blur', () => {
    espaco = false;
    el.classList.remove('is-mao');
  });

  el.dataset.ferramenta = ferramenta;
  aplicarVista();
  desenharFormas();
  avisarHistorico();

  return {
    el,
    ferramenta: () => ferramenta,
    usarFerramenta,
    aplicarEstilo,
    alternarPonta,
    desfazer,
    refazer,
    zoomRelativo: (fator) => {
      const r = el.getBoundingClientRect();
      zoomEm(vp().zoom * fator, r.width / 2, r.height / 2);
    },
    zoomPara: (zoom) => {
      const r = el.getBoundingClientRect();
      zoomEm(zoom, r.width / 2, r.height / 2);
    },
    ajustar,
    apagarSelecao,
    duplicarSelecao,
    ordem,
    exportar,
    temSelecao: () => selecao.size > 0,
    focarForma,
    descarregar: () => {
      terminarTexto();
      salvarAgora();
    },
    destruir: () => {
      terminarTexto();
      salvarAgora();
      if (timerViewport) {
        clearTimeout(timerViewport);
        opcoes.aoViewport({ ...vp() });
      }
      if (rafDesenho !== null) cancelAnimationFrame(rafDesenho);
      observador.disconnect();
      el.remove();
    },
  };
}
