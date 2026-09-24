/**
 * Gráficos em SVG feitos à mão (a CSP não permite libs de fora). Seguem as
 * regras de visualização do projeto: um eixo só, barras finas com ponta
 * arredondada e base reta, linha de 2px, grade em linha fina, legenda quando há
 * duas séries, texto sempre na cor de texto (nunca na cor da série), tooltip
 * ao passar o mouse e uma tabela com os mesmos números.
 *
 * Cores validadas contra a superfície escura (#14161c) com o validador da
 * skill de dataviz: série 1 azul, série 2 laranja; faixas ordenadas numa rampa
 * de um tom de azul.
 */

export const COR_SERIE = ['#3987e5', '#d95926'] as const;
export const RAMPA_ORDINAL = ['#184f95', '#256abf', '#3987e5', '#86b6ef'] as const;

const NS = 'http://www.w3.org/2000/svg';
const LARGURA = 600;

function el<K extends keyof SVGElementTagNameMap>(tag: K, atributos: Record<string, string | number>): SVGElementTagNameMap[K] {
  const no = document.createElementNS(NS, tag);
  Object.entries(atributos).forEach(([k, v]) => no.setAttribute(k, String(v)));
  return no;
}

/**
 * Com muitas categorias (os 30 dias de um mês), rotular todas embola o eixo:
 * mostra no máximo ~12, sempre incluindo a primeira e a última. O tooltip e a
 * tabela continuam com todas.
 */
function mostrarRotuloEixo(i: number, total: number): boolean {
  if (total <= 12) return true;
  const passo = Math.ceil(total / 10);
  return i === 0 || i === total - 1 || (i % passo === 0 && total - 1 - i >= passo / 2);
}

export function formatarNumero(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// ---------- Tooltip único, reaproveitado por todos os gráficos ----------

let tooltip: HTMLElement | null = null;

function mostrarTooltip(texto: string, x: number, y: number): void {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'gf-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
  }
  tooltip.textContent = texto;
  tooltip.hidden = false;
  const largura = tooltip.offsetWidth;
  tooltip.style.left = `${Math.min(window.innerWidth - largura - 8, x + 14)}px`;
  tooltip.style.top = `${y + 14}px`;
}

export function esconderTooltip(): void {
  if (tooltip) tooltip.hidden = true;
}

/** Liga tooltip + destaque a um alvo (a área de clique é maior que a marca). */
function comTooltip(alvo: SVGElement, texto: string, marca: SVGElement = alvo): void {
  alvo.addEventListener('mousemove', (e) => mostrarTooltip(texto, (e as MouseEvent).clientX, (e as MouseEvent).clientY));
  alvo.addEventListener('mouseenter', () => marca.classList.add('is-destaque'));
  alvo.addEventListener('mouseleave', () => {
    marca.classList.remove('is-destaque');
    esconderTooltip();
  });
  alvo.setAttribute('aria-label', texto);
}

// ---------- Cartão de gráfico (título + alternância Gráfico/Tabela) ----------

export interface TabelaDados {
  colunas: string[];
  linhas: Array<Array<string>>;
}

export function buildCartaoGrafico(
  titulo: string,
  subtitulo: string,
  grafico: HTMLElement | SVGElement,
  tabela: TabelaDados,
  extra?: HTMLElement,
): HTMLElement {
  const cartao = document.createElement('section');
  cartao.className = 'gf-cartao';
  const cab = document.createElement('header');
  cab.className = 'gf-cartao-cab';
  const textos = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = subtitulo;
  textos.append(h, p);
  cab.appendChild(textos);

  const alternar = document.createElement('button');
  alternar.type = 'button';
  alternar.className = 'gf-alternar';
  alternar.textContent = 'Tabela';
  alternar.setAttribute('aria-pressed', 'false');
  cab.appendChild(alternar);
  cartao.appendChild(cab);
  if (extra) cartao.appendChild(extra);

  const corpoGrafico = document.createElement('div');
  corpoGrafico.className = 'gf-corpo';
  corpoGrafico.appendChild(grafico);
  const corpoTabela = document.createElement('div');
  corpoTabela.className = 'gf-corpo gf-tabela-wrap';
  corpoTabela.hidden = true;
  corpoTabela.appendChild(buildTabela(tabela));
  cartao.append(corpoGrafico, corpoTabela);

  alternar.addEventListener('click', () => {
    const tabelaVisivel = corpoTabela.hidden;
    corpoTabela.hidden = !tabelaVisivel;
    corpoGrafico.hidden = tabelaVisivel;
    alternar.textContent = tabelaVisivel ? 'Gráfico' : 'Tabela';
    alternar.setAttribute('aria-pressed', String(tabelaVisivel));
  });
  return cartao;
}

function buildTabela(dados: TabelaDados): HTMLElement {
  const tabela = document.createElement('table');
  tabela.className = 'gf-tabela';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  dados.colunas.forEach((c) => tr.appendChild(Object.assign(document.createElement('th'), { textContent: c })));
  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  dados.linhas.forEach((linha) => {
    const r = document.createElement('tr');
    linha.forEach((v) => r.appendChild(Object.assign(document.createElement('td'), { textContent: v })));
    tbody.appendChild(r);
  });
  tabela.append(thead, tbody);
  return tabela;
}

export function buildLegenda(series: Array<{ nome: string; cor: string }>): HTMLElement {
  const legenda = document.createElement('div');
  legenda.className = 'gf-legenda';
  series.forEach((s) => {
    const item = document.createElement('span');
    const chave = document.createElement('i');
    chave.style.background = s.cor;
    item.append(chave, s.nome);
    legenda.appendChild(item);
  });
  return legenda;
}

// ---------- Escala e grade ----------

/** Máximo "redondo" para o eixo: 1, 2, 5 × 10^n. */
function tetoRedondo(maximo: number): number {
  if (maximo <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= maximo) ?? 10;
  return passo * potencia;
}

function grade(svg: SVGSVGElement, esquerda: number, topo: number, largura: number, altura: number, teto: number, formatar: (n: number) => string): void {
  for (let i = 0; i <= 4; i++) {
    const valor = (teto / 4) * i;
    const y = topo + altura - (altura * i) / 4;
    svg.appendChild(el('line', { x1: esquerda, x2: esquerda + largura, y1: y, y2: y, class: i === 0 ? 'gf-base' : 'gf-grade' }));
    const rotulo = el('text', { x: esquerda - 8, y: y + 4, class: 'gf-eixo', 'text-anchor': 'end' });
    rotulo.textContent = formatar(valor);
    svg.appendChild(rotulo);
  }
}

/** Retângulo com os cantos de cima arredondados (4px) e base reta. */
function pathBarra(x: number, y: number, largura: number, altura: number, raio = 4): string {
  if (altura <= 0) return '';
  const r = Math.min(raio, altura, largura / 2);
  return `M${x},${y + altura}V${y + r}Q${x},${y} ${x + r},${y}H${x + largura - r}Q${x + largura},${y} ${x + largura},${y + r}V${y + altura}Z`;
}

// ---------- Colunas (verticais), simples ou empilhadas ----------

export interface SerieColunas {
  nome: string;
  cor: string;
  valores: number[];
}

export function buildColunas(
  categorias: string[],
  series: SerieColunas[],
  descricao: string,
  rotuloValor: (n: number) => string,
  /** Uma cor por categoria (faixas ordenadas); só com uma série. */
  coresCategoria?: readonly string[],
): SVGSVGElement {
  const altura = 230;
  const [esq, dir, topo, base] = [36, 8, 18, 30];
  const areaL = LARGURA - esq - dir;
  const areaA = altura - topo - base;
  const totais = categorias.map((_, i) => series.reduce((s, serie) => s + (serie.valores[i] ?? 0), 0));
  // Contagem: o eixo precisa de marcas inteiras (4 divisões), senão com poucos
  // vídeos aparece "0, 0, 1, 1, 1".
  const maior = Math.max(...totais, 1);
  const teto = maior <= 20 ? Math.max(4, Math.ceil(maior / 4) * 4) : tetoRedondo(maior);
  const svg = el('svg', { viewBox: `0 0 ${LARGURA} ${altura}`, class: 'gf-svg', role: 'img', 'aria-label': descricao });
  grade(svg, esq, topo, areaL, areaA, teto, (n) => formatarNumero(n));

  const banda = areaL / Math.max(categorias.length, 1);
  const largura = Math.min(24, banda * 0.62);
  categorias.forEach((categoria, i) => {
    const x = esq + banda * i + (banda - largura) / 2;
    let acumulado = 0;
    series.forEach((serie, s) => {
      const valor = serie.valores[i] ?? 0;
      if (valor <= 0) return;
      const h = (valor / teto) * areaA;
      const y = topo + areaA - ((acumulado + valor) / teto) * areaA;
      // 2px de superfície entre segmentos empilhados; só o de cima é arredondado.
      const ehTopo = series.slice(s + 1).every((o) => (o.valores[i] ?? 0) <= 0);
      const altSeg = Math.max(0, h - (acumulado > 0 ? 2 : 0));
      const d = ehTopo ? pathBarra(x, y, largura, altSeg) : `M${x},${y}h${largura}v${altSeg}h${-largura}Z`;
      const barra = el('path', { d, fill: coresCategoria?.[i] ?? serie.cor, class: 'gf-marca' });
      svg.appendChild(barra);
      acumulado += valor;
    });
    // Rótulo no topo da coluna: o total do mês.
    if (totais[i]! > 0 && (categorias.length <= 16 || totais[i] === Math.max(...totais))) {
      const t = el('text', { x: x + largura / 2, y: topo + areaA - (totais[i]! / teto) * areaA - 6, class: 'gf-valor', 'text-anchor': 'middle' });
      t.textContent = rotuloValor(totais[i]!);
      svg.appendChild(t);
    }
    if (mostrarRotuloEixo(i, categorias.length)) {
      const eixo = el('text', { x: x + largura / 2, y: altura - 10, class: 'gf-eixo', 'text-anchor': 'middle' });
      eixo.textContent = categoria;
      svg.appendChild(eixo);
    }

    // Alvo de hover do tamanho da banda inteira.
    const alvo = el('rect', { x: esq + banda * i, y: topo, width: banda, height: areaA, class: 'gf-alvo' });
    const partes = series.map((s) => `${s.nome}: ${formatarNumero(s.valores[i] ?? 0)}`);
    comTooltip(alvo, `${categoria} — ${series.length > 1 ? `${partes.join(' · ')} · total ${formatarNumero(totais[i]!)}` : partes[0]}`);
    svg.appendChild(alvo);
  });
  return svg;
}

// ---------- Linha (0–100) com referência ----------

export function buildLinha(
  categorias: string[],
  valores: Array<number | null>,
  referencia: { valor: number; rotulo: string } | null,
  descricao: string,
): SVGSVGElement {
  const altura = 230;
  const [esq, dir, topo, base] = [36, 44, 18, 30];
  const areaL = LARGURA - esq - dir;
  const areaA = altura - topo - base;
  const svg = el('svg', { viewBox: `0 0 ${LARGURA} ${altura}`, class: 'gf-svg', role: 'img', 'aria-label': descricao });
  grade(svg, esq, topo, areaL, areaA, 100, (n) => formatarNumero(n));

  const passo = categorias.length > 1 ? areaL / (categorias.length - 1) : 0;
  const x = (i: number): number => (categorias.length > 1 ? esq + passo * i : esq + areaL / 2);
  const y = (v: number): number => topo + areaA - (v / 100) * areaA;

  if (referencia) {
    const ry = y(referencia.valor);
    svg.appendChild(el('line', { x1: esq, x2: esq + areaL, y1: ry, y2: ry, class: 'gf-referencia' }));
    const rt = el('text', { x: esq + areaL + 4, y: ry + 4, class: 'gf-eixo' });
    rt.textContent = referencia.rotulo;
    svg.appendChild(rt);
  }

  // A linha quebra nos meses sem score, em vez de inventar uma ligação.
  let d = '';
  valores.forEach((v, i) => {
    if (v === null) return;
    d += `${d && valores[i - 1] !== null && i > 0 ? 'L' : 'M'}${x(i)},${y(v)}`;
  });
  if (d) svg.appendChild(el('path', { d, class: 'gf-linha', stroke: COR_SERIE[0] }));

  const validos = valores.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const maior = validos.reduce<{ v: number; i: number } | null>((m, p) => (!m || p.v > m.v ? p : m), null);
  const ultimo = validos[validos.length - 1];
  categorias.forEach((categoria, i) => {
    if (mostrarRotuloEixo(i, categorias.length)) {
      const eixo = el('text', { x: x(i), y: altura - 10, class: 'gf-eixo', 'text-anchor': 'middle' });
      eixo.textContent = categoria;
      svg.appendChild(eixo);
    }
    const v = valores[i];
    if (v === null || v === undefined) return;
    const ponto = el('circle', { cx: x(i), cy: y(v), r: 4.5, fill: COR_SERIE[0], class: 'gf-ponto' });
    svg.appendChild(ponto);
    // Rótulo só no maior valor e no último — nunca em todos os pontos.
    if ((maior && maior.i === i) || (ultimo && ultimo.i === i)) {
      const t = el('text', { x: x(i), y: y(v) - 10, class: 'gf-valor', 'text-anchor': 'middle' });
      t.textContent = formatarNumero(v, 1);
      svg.appendChild(t);
    }
    const alvo = el('circle', { cx: x(i), cy: y(v), r: 14, class: 'gf-alvo' });
    comTooltip(alvo, `${categoria} — score médio ${formatarNumero(v, 1)}`, ponto);
    svg.appendChild(alvo);
  });
  return svg;
}

// ---------- Barras horizontais (linhas de ranking) ----------

export interface LinhaRanking {
  rotulo: HTMLElement;
  /** 0–100 */
  valor: number | null;
  /** Texto à direita (ex.: "12 vídeos"). */
  detalhe: string;
  aoClicar?: () => void;
}

/**
 * Ranking em HTML (não SVG): o rótulo pode ser um chip de tag ou logo de rede,
 * e o texto não escala com a largura do cartão.
 */
export function buildRanking(linhas: LinhaRanking[], descricao: string, semValor = 'sem score'): HTMLElement {
  const lista = document.createElement('div');
  lista.className = 'gf-ranking';
  lista.setAttribute('role', 'list');
  lista.setAttribute('aria-label', descricao);
  linhas.forEach((l) => {
    const linha = document.createElement(l.aoClicar ? 'button' : 'div');
    linha.className = 'gf-ranking-linha';
    linha.setAttribute('role', 'listitem');
    if (l.aoClicar) {
      (linha as HTMLButtonElement).type = 'button';
      linha.addEventListener('click', l.aoClicar);
    }
    const rotulo = document.createElement('div');
    rotulo.className = 'gf-ranking-rotulo';
    rotulo.appendChild(l.rotulo);
    const trilho = document.createElement('div');
    trilho.className = 'gf-ranking-trilho';
    if (l.valor !== null) {
      const barra = document.createElement('i');
      barra.style.width = `${Math.max(1.5, l.valor)}%`;
      trilho.appendChild(barra);
    }
    const valor = document.createElement('span');
    valor.className = 'gf-ranking-valor';
    valor.textContent = l.valor === null ? semValor : formatarNumero(l.valor, 1);
    const detalhe = document.createElement('span');
    detalhe.className = 'gf-ranking-detalhe';
    detalhe.textContent = l.detalhe;
    linha.append(rotulo, trilho, valor, detalhe);
    lista.appendChild(linha);
  });
  return lista;
}
