import {
  FORMAS_DE_CAIXA,
  HEX_CANVAS_CLARO,
  LARGURA_TRACO,
  NOTA_CANVAS,
  TAMANHO_FONTE,
  type CorCanvas,
  type FormaCanvas,
} from '../../../shared/types/canvas.types.js';

/**
 * O desenho de cada forma, em SVG. A mesma função serve a tela (cores pelos
 * tokens do canvas.css, que mudam com o tema) e a exportação (cores fixas para
 * fundo branco) — o que se vê é o que sai no PNG.
 */

export const NS = 'http://www.w3.org/2000/svg';
export const FONTE = "'Space Grotesk', 'Segoe UI', sans-serif";
export const ALTURA_LINHA = 1.3;
/** Respiro entre o texto e a borda da forma. */
export const RESPIRO = 12;

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  return e;
}

export type Pintor = (cor: CorCanvas) => string;

/** Tela: variável CSS (troca com o tema). */
export const PINTOR_TELA: Pintor = (cor) => `var(--cv-${cor})`;
/** Exportação: hex fixo, para fundo branco. */
export const PINTOR_EXPORTAR: Pintor = (cor) => HEX_CANVAS_CLARO[cor];

// ---------- Texto ----------

let medidor: CanvasRenderingContext2D | null = null;

/** Quebra o texto em linhas que cabem na largura (palavra por palavra, como o navegador faria). */
export function quebrarLinhas(texto: string, largura: number, fonte: number): string[] {
  medidor ??= document.createElement('canvas').getContext('2d');
  if (!medidor) return texto.split('\n');
  medidor.font = `500 ${fonte}px ${FONTE}`;
  const linhas: string[] = [];
  for (const paragrafo of texto.split('\n')) {
    const palavras = paragrafo.split(/(\s+)/);
    let atual = '';
    for (const p of palavras) {
      const tentativa = atual + p;
      if (atual && medidor.measureText(tentativa.trimEnd()).width > largura) {
        linhas.push(atual.trimEnd());
        atual = p.trimStart();
        // Palavra maior que a linha: corta no caractere.
        while (medidor.measureText(atual).width > largura && atual.length > 1) {
          let n = atual.length - 1;
          while (n > 1 && medidor.measureText(atual.slice(0, n)).width > largura) n--;
          linhas.push(atual.slice(0, n));
          atual = atual.slice(n);
        }
      } else {
        atual = tentativa;
      }
    }
    linhas.push(atual.trimEnd());
  }
  return linhas;
}

/** Altura que um texto ocupa numa largura (para o "texto" crescer com o que se digita). */
export function alturaDoTexto(texto: string, largura: number, fonte: number): number {
  const n = Math.max(1, quebrarLinhas(texto || ' ', largura, fonte).length);
  return Math.ceil(n * fonte * ALTURA_LINHA + RESPIRO);
}

function desenharTexto(g: SVGGElement, f: FormaCanvas, cor: string, alinharTopo: boolean): void {
  const texto = f.texto ?? '';
  if (!texto.trim()) return;
  const fonte = TAMANHO_FONTE[f.estilo.tamanhoTexto];
  const larguraUtil = Math.max(10, f.w - RESPIRO * 2 * (f.tipo === 'losango' || f.tipo === 'triangulo' ? 1.6 : 1));
  const linhas = quebrarLinhas(texto, larguraUtil, fonte);
  const alturaBloco = linhas.length * fonte * ALTURA_LINHA;
  const centroX = f.w / 2;
  const topo = alinharTopo ? RESPIRO / 2 : (f.tipo === 'triangulo' ? f.h * 0.6 : f.h / 2) - alturaBloco / 2;
  const t = s('text', {
    x: f.tipo === 'texto' ? RESPIRO / 2 : centroX,
    'text-anchor': f.tipo === 'texto' ? 'start' : 'middle',
    'font-size': fonte,
    'font-weight': 500,
    class: 'cv-texto',
  });
  t.style.fill = cor;
  t.style.fontFamily = FONTE;
  linhas.forEach((linha, i) => {
    const tspan = s('tspan', { x: f.tipo === 'texto' ? RESPIRO / 2 : centroX, y: topo + fonte * (i + 0.85) * ALTURA_LINHA - fonte * 0.12 });
    tspan.textContent = linha || ' ';
    t.appendChild(tspan);
  });
  g.appendChild(t);
}

// ---------- Traços ----------

function tracejado(f: FormaCanvas): string | null {
  const w = LARGURA_TRACO[f.estilo.traco];
  if (f.estilo.tracejado === 'tracejado') return `${w * 3} ${w * 2.2}`;
  if (f.estilo.tracejado === 'pontilhado') return `0.1 ${w * 2.2}`;
  return null;
}

function aplicarTraco(el: SVGElement, f: FormaCanvas, pintor: Pintor): void {
  el.style.stroke = pintor(f.estilo.cor);
  el.style.strokeWidth = String(LARGURA_TRACO[f.estilo.traco]);
  el.style.strokeLinecap = 'round';
  el.style.strokeLinejoin = 'round';
  const d = tracejado(f);
  if (d) el.style.strokeDasharray = d;
}

function aplicarPreenchimento(el: SVGElement, f: FormaCanvas, pintor: Pintor): void {
  if (f.estilo.preenchimento === 'nenhum') {
    // Transparente, mas "pintado": o clique no meio da forma ainda a acerta.
    el.style.fill = 'transparent';
    return;
  }
  el.style.fill = pintor(f.estilo.cor);
  el.style.fillOpacity = f.estilo.preenchimento === 'suave' ? '0.16' : '1';
}

/** Contorno de uma forma de caixa (no sistema local: 0,0 a w,h). */
function contorno(f: FormaCanvas): SVGElement {
  switch (f.tipo) {
    case 'elipse':
      return s('ellipse', { cx: f.w / 2, cy: f.h / 2, rx: f.w / 2, ry: f.h / 2 });
    case 'losango':
      return s('polygon', { points: `${f.w / 2},0 ${f.w},${f.h / 2} ${f.w / 2},${f.h} 0,${f.h / 2}` });
    case 'triangulo':
      return s('polygon', { points: `${f.w / 2},0 ${f.w},${f.h} 0,${f.h}` });
    default:
      return s('rect', { x: 0, y: 0, width: f.w, height: f.h, rx: Math.min(12, f.w / 6, f.h / 6) });
  }
}

/** Curva suave pelos pontos médios (quadráticas) — o traço à mão sem quinas. */
export function caminhoSuave(pontos: Array<[number, number]>): string {
  if (pontos.length === 0) return '';
  if (pontos.length === 1) {
    const [x, y] = pontos[0]!;
    return `M${x},${y} L${x + 0.01},${y + 0.01}`;
  }
  if (pontos.length === 2) return `M${pontos[0]![0]},${pontos[0]![1]} L${pontos[1]![0]},${pontos[1]![1]}`;
  let d = `M${pontos[0]![0].toFixed(2)},${pontos[0]![1].toFixed(2)}`;
  for (let i = 1; i < pontos.length - 1; i++) {
    const [x, y] = pontos[i]!;
    const [nx, ny] = pontos[i + 1]!;
    d += ` Q${x.toFixed(2)},${y.toFixed(2)} ${((x + nx) / 2).toFixed(2)},${((y + ny) / 2).toFixed(2)}`;
  }
  const ultimo = pontos[pontos.length - 1]!;
  return `${d} L${ultimo[0].toFixed(2)},${ultimo[1].toFixed(2)}`;
}

/** Ponta de seta (dois riscos) em `fim`, vindo de `de`. */
function ponta(de: [number, number], fim: [number, number], tamanho: number): string {
  const ang = Math.atan2(fim[1] - de[1], fim[0] - de[0]);
  const a1 = ang + Math.PI - 0.5;
  const a2 = ang + Math.PI + 0.5;
  return `M${fim[0] + Math.cos(a1) * tamanho},${fim[1] + Math.sin(a1) * tamanho} L${fim[0]},${fim[1]} L${fim[0] + Math.cos(a2) * tamanho},${fim[1] + Math.sin(a2) * tamanho}`;
}

// ---------- Uma forma ----------

/**
 * Monta o <g> de uma forma. `pontas` são os extremos já resolvidos de linha/seta
 * (com as ligações aplicadas) — quem desenha sabe onde as outras formas estão.
 */
export function svgDaForma(f: FormaCanvas, pintor: Pintor, pontas?: [[number, number], [number, number]]): SVGGElement {
  const g = s('g', { 'data-id': f.id, class: `cv-forma is-${f.tipo}` });

  if (f.tipo === 'linha' || f.tipo === 'seta') {
    const [a, b] = pontas ?? (f.pontos as [[number, number], [number, number]]);
    const traco = s('path', { d: `M${a[0]},${a[1]} L${b[0]},${b[1]}`, fill: 'none' });
    aplicarTraco(traco, f, pintor);
    // Área de clique mais larga que o traço.
    const alvo = s('path', { d: `M${a[0]},${a[1]} L${b[0]},${b[1]}`, class: 'cv-alvo-linha' });
    g.append(alvo, traco);
    if (f.tipo === 'seta') {
      const tam = 10 + LARGURA_TRACO[f.estilo.traco] * 2.2;
      const pontasD = [f.pontaFim !== false ? ponta(a, b, tam) : '', f.pontaInicio ? ponta(b, a, tam) : ''].join(' ').trim();
      if (pontasD) {
        const p = s('path', { d: pontasD, fill: 'none' });
        aplicarTraco(p, f, pintor);
        p.style.strokeDasharray = '';
        g.appendChild(p);
      }
    }
    return g;
  }

  g.setAttribute('transform', `translate(${f.x} ${f.y})${f.rotacao ? ` rotate(${f.rotacao} ${f.w / 2} ${f.h / 2})` : ''}`);

  if (f.tipo === 'desenho') {
    const caminho = s('path', { d: caminhoSuave(f.pontos ?? []), fill: 'none' });
    aplicarTraco(caminho, f, pintor);
    caminho.style.strokeDasharray = '';
    const alvo = s('path', { d: caminhoSuave(f.pontos ?? []), class: 'cv-alvo-linha' });
    g.append(alvo, caminho);
    return g;
  }

  if (f.tipo === 'nota') {
    const sombra = s('rect', { x: 2, y: 5, width: f.w, height: f.h, rx: 6, class: 'cv-nota-sombra' });
    const papel = s('rect', { x: 0, y: 0, width: f.w, height: f.h, rx: 6 });
    papel.style.fill = NOTA_CANVAS[f.estilo.cor];
    g.append(sombra, papel);
    desenharTexto(g, f, '#1d1d1f', false);
    return g;
  }

  if (f.tipo === 'texto') {
    // Área de clique invisível do tamanho da caixa.
    g.appendChild(s('rect', { x: 0, y: 0, width: f.w, height: f.h, class: 'cv-alvo-caixa' }));
    desenharTexto(g, f, pintor(f.estilo.cor), true);
    return g;
  }

  const forma = contorno(f);
  aplicarPreenchimento(forma, f, pintor);
  aplicarTraco(forma, f, pintor);
  g.appendChild(forma);
  // Texto sobre preenchimento sólido: branco (a cor sólida é sempre média/escura na paleta).
  const corTexto = f.estilo.preenchimento === 'solido' ? (f.estilo.cor === 'amarelo' ? '#1d1d1f' : '#ffffff') : pintor(f.estilo.cor === 'cinza' ? 'tinta' : f.estilo.cor);
  desenharTexto(g, f, corTexto, false);
  return g;
}

export function temTexto(f: FormaCanvas): boolean {
  return FORMAS_DE_CAIXA.includes(f.tipo);
}
