import { STATUS_CAMPANHA, PLATAFORMAS_TRAFEGO, somar, type Campanha, type Metricas, type PlataformaTrafego, type TrafegoFile } from '../../../shared/types/trafego.types.js';
import { buildBotao, buildSelo, buildVazio, svg, type Tom } from '../../ui/pagina.js';
import { COR_SERIE, buildCartaoGrafico, buildColunas, buildRanking, formatarNumero } from '../postagens/postagens.graficos.js';
import { formatarData, hojeIso, somarDias } from '../postagens/postagens.ui.js';
import {
  ICONES,
  SIGLA_PLATAFORMA,
  TOM_STATUS,
  descreverAnterior,
  descreverPeriodo,
  intervaloAnterior,
  intervaloDo,
  metricasDe,
  moeda,
  moedaCurta,
  nomeConta,
  pct,
  registrosNo,
  rotulo,
  serieTemporal,
  talvez,
  vezes,
  type Periodo,
} from './trafego.comum.js';

/**
 * Painel do Tráfego: os quatro números do período com a variação contra o período
 * anterior, a campanha que mais rendeu, o que pede atenção, a evolução no tempo,
 * as plataformas e a tabela por campanha. Tudo calculado na hora dos registros.
 */

export interface CtxPainel {
  file: TrafegoFile;
  campanhas: Campanha[];
  periodo: Periodo;
  /** '' = todas. */
  filtroConta: string;
  abrirCampanha(id: string): void;
  novaCampanha(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** O selo colorido da plataforma (cor da marca, no CSS). */
export function buildPlataforma(id: PlataformaTrafego, completo = false): HTMLElement {
  const chip = el('span', `tf-plataforma is-${id}`, completo ? rotulo(PLATAFORMAS_TRAFEGO, id) : SIGLA_PLATAFORMA[id]);
  chip.title = rotulo(PLATAFORMAS_TRAFEGO, id);
  return chip;
}

// ---------- Números do período ----------

type Sentido = 'subir' | 'descer' | 'neutro';

/** Variação em % (undefined sem base para comparar). */
function variacao(atual: number, anterior: number | undefined): number | undefined {
  if (anterior === undefined || anterior === 0) return undefined;
  return ((atual - anterior) / anterior) * 100;
}

function buildVariacao(v: number | undefined, sentido: Sentido, contra: string): HTMLElement {
  if (v === undefined || !Number.isFinite(v)) {
    const vazio = el('span', 'tf-var is-neutro', 'sem comparação');
    vazio.title = contra ? `Sem dados em ${contra}` : 'O período "Tudo" não tem anterior';
    return vazio;
  }
  const subiu = v > 0.05;
  const desceu = v < -0.05;
  const bom = sentido === 'neutro' ? null : sentido === 'subir' ? subiu : desceu;
  const ruim = sentido === 'neutro' ? null : sentido === 'subir' ? desceu : subiu;
  const tom = bom ? 'ok' : ruim ? 'erro' : 'neutro';
  const chip = el('span', `tf-var is-${tom}`);
  const seta = subiu ? '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>' : desceu ? '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>' : '<path d="M5 12h14"/>';
  chip.innerHTML = svg(seta, 11, 2.6);
  chip.appendChild(el('span', undefined, `${v > 0 ? '+' : ''}${formatarNumero(v, Math.abs(v) < 10 ? 1 : 0)}%`));
  chip.title = `Comparado com ${contra}`;
  return chip;
}

const NS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  return e;
}

/** Tendência em área, do zero ao maior valor do período (só a forma; o número está ao lado). */
function buildTendencia(valores: number[], descricao: string): SVGSVGElement {
  const [L, A] = [200, 48];
  const svgEl = s('svg', { viewBox: `0 0 ${L} ${A}`, class: 'tf-tendencia', role: 'img', 'aria-label': descricao, preserveAspectRatio: 'none' });
  if (valores.length < 2) return svgEl;
  const maior = Math.max(...valores, 0) || 1;
  const x = (i: number): number => (i / (valores.length - 1)) * L;
  const y = (v: number): number => A - 3 - (v / maior) * (A - 8);
  const linha = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  svgEl.append(s('path', { d: `${linha} L${L},${A} L0,${A} Z`, class: 'tf-tendencia-area' }), s('path', { d: linha, class: 'tf-tendencia-linha', 'vector-effect': 'non-scaling-stroke' }));
  return svgEl;
}

interface Kpi {
  rotulo: string;
  valor: string;
  detalhe: string;
  variacao: number | undefined;
  sentido: Sentido;
  serie: number[];
  destaque?: boolean;
}

function buildKpis(kpis: Kpi[], contra: string): HTMLElement {
  const grade = el('div', 'tf-kpis');
  kpis.forEach((k) => {
    const card = el('section', `tf-kpi${k.destaque ? ' is-destaque' : ''}`);
    const topo = el('div', 'tf-kpi-topo');
    topo.append(el('span', 'tf-kpi-rotulo', k.rotulo), buildVariacao(k.variacao, k.sentido, contra));
    card.append(topo, el('strong', 'tf-kpi-valor', k.valor), el('span', 'tf-kpi-detalhe', k.detalhe), buildTendencia(k.serie, `Tendência de ${k.rotulo.toLowerCase()} no período`));
    grade.appendChild(card);
  });
  return grade;
}

// ---------- Destaque e alertas ----------

function melhorCampanha(campanhas: Array<{ c: Campanha; m: Metricas }>): { c: Campanha; m: Metricas; porque: string } | null {
  const comGasto = campanhas.filter((x) => x.m.investimento > 0);
  if (!comGasto.length) return null;
  const comReceita = comGasto.filter((x) => x.m.receita > 0 && x.m.roas !== undefined);
  if (comReceita.length) {
    const m = [...comReceita].sort((a, b) => b.m.roas! - a.m.roas!)[0]!;
    return { ...m, porque: `Maior retorno: cada R$ 1 investido voltou ${moeda(m.m.roas!)}` };
  }
  const comConversao = comGasto.filter((x) => x.m.conversoes > 0);
  if (comConversao.length) {
    const m = [...comConversao].sort((a, b) => (a.m.cpa ?? Infinity) - (b.m.cpa ?? Infinity))[0]!;
    return { ...m, porque: `Menor custo por conversão: ${talvez(m.m.cpa, moeda)}` };
  }
  return null;
}

function buildDestaque(ctx: CtxPainel, melhor: NonNullable<ReturnType<typeof melhorCampanha>>): HTMLElement {
  const card = el('section', 'tf-destaque');
  const cab = el('div', 'tf-destaque-cab');
  const icone = el('span', 'tf-destaque-icone');
  icone.innerHTML = svg(ICONES.trofeu, 18, 1.9);
  cab.append(icone, el('span', 'tf-destaque-titulo', `Destaque · ${descreverPeriodo(ctx.periodo)}`));
  card.appendChild(cab);
  const nome = el('h3', 'tf-destaque-nome', melhor.c.nome);
  const meta = el('div', 'tf-destaque-meta');
  meta.append(buildPlataforma(melhor.c.plataforma), el('span', undefined, nomeConta(ctx.file, melhor.c.contaId)));
  card.append(nome, meta, el('p', 'tf-destaque-porque', melhor.porque));
  const nums = el('dl', 'tf-destaque-nums');
  const par = (dt: string, dd: string): void => {
    const d = el('div');
    d.append(el('dt', undefined, dt), el('dd', undefined, dd));
    nums.appendChild(d);
  };
  par('Investido', moedaCurta(melhor.m.investimento));
  par('Conversões', formatarNumero(melhor.m.conversoes));
  par(melhor.m.roas !== undefined && melhor.m.receita > 0 ? 'ROAS' : 'CPA', melhor.m.roas !== undefined && melhor.m.receita > 0 ? vezes(melhor.m.roas) : talvez(melhor.m.cpa, moeda));
  card.appendChild(nums);
  const abrir = buildBotao('Abrir campanha', { variante: 'secundario' });
  abrir.addEventListener('click', () => ctx.abrirCampanha(melhor.c.id));
  card.appendChild(abrir);
  return card;
}

interface Alerta {
  texto: string;
  tom: Tom;
  campanha?: Campanha;
}

function alertas(ctx: CtxPainel): Alerta[] {
  const lista: Alerta[] = [];
  const hoje = hojeIso();
  ctx.campanhas.forEach((c) => {
    if (c.status === 'ativa') {
      const ultimo = c.registros[c.registros.length - 1]?.data;
      if (!ultimo || ultimo < somarDias(hoje, -3)) {
        lista.push({
          texto: `"${c.nome}" está ativa e ${ultimo ? `o último resultado lançado é de ${formatarData(ultimo)}` : 'ainda não tem resultado lançado'}.`,
          tom: 'atencao',
          campanha: c,
        });
      }
      if (c.fim && c.fim < hoje) lista.push({ texto: `"${c.nome}" passou da data de fim (${formatarData(c.fim)}) e continua ativa.`, tom: 'atencao', campanha: c });
    }
    if (c.orcamentoTotal) {
      const gasto = somar(c.registros).investimento;
      if (gasto > c.orcamentoTotal) {
        lista.push({ texto: `"${c.nome}" gastou ${moeda(gasto)} — acima do orçamento total de ${moeda(c.orcamentoTotal)}.`, tom: 'erro', campanha: c });
      }
    }
  });
  const mes = hoje.slice(0, 7);
  ctx.file.contas
    .filter((conta) => !ctx.filtroConta || conta.id === ctx.filtroConta)
    .forEach((conta) => {
      if (!conta.orcamentoMensal) return;
      const gasto = somar(ctx.file.campanhas.filter((c) => c.contaId === conta.id).flatMap((c) => c.registros.filter((r) => r.data.startsWith(mes)))).investimento;
      if (gasto > conta.orcamentoMensal) {
        lista.push({ texto: `A conta ${conta.nome} gastou ${moeda(gasto)} este mês, acima da verba de ${moeda(conta.orcamentoMensal)}.`, tom: 'erro' });
      }
    });
  // Estouro de verba primeiro.
  return lista.sort((a, b) => (a.tom === 'erro' ? 0 : 1) - (b.tom === 'erro' ? 0 : 1));
}

const MAX_ALERTAS = 5;

function buildAlertas(ctx: CtxPainel, lista: Alerta[]): HTMLElement {
  const card = el('section', 'tf-avisos');
  const cab = el('div', 'tf-avisos-cab');
  const icone = el('span', `tf-avisos-icone${lista.length ? ' is-ativo' : ''}`);
  icone.innerHTML = svg(lista.length ? ICONES.sino : '<polyline points="20 6 9 17 4 12"/>', 16, 2);
  cab.append(icone, el('h3', undefined, lista.length ? 'Pede atenção' : 'Tudo em dia'));
  if (lista.length) cab.appendChild(el('span', 'tf-avisos-n', String(lista.length)));
  card.appendChild(cab);
  if (!lista.length) {
    card.appendChild(el('p', 'tf-avisos-ok', 'Nenhuma campanha ativa sem resultado recente, nada acima do orçamento.'));
    return card;
  }
  const ul = el('ul', 'tf-avisos-lista');
  lista.slice(0, MAX_ALERTAS).forEach((a) => {
    const li = el('li', `tf-aviso is-${a.tom}`);
    li.appendChild(el('span', 'tf-aviso-ponto'));
    li.appendChild(el('span', 'tf-aviso-texto', a.texto));
    if (a.campanha) {
      const campanha = a.campanha;
      const abrir = el('button', 'tf-aviso-abrir', 'Abrir');
      abrir.type = 'button';
      abrir.addEventListener('click', () => ctx.abrirCampanha(campanha.id));
      li.appendChild(abrir);
    }
    ul.appendChild(li);
  });
  card.appendChild(ul);
  if (lista.length > MAX_ALERTAS) {
    card.appendChild(el('p', 'tf-avisos-mais', `E mais ${lista.length - MAX_ALERTAS} ${lista.length - MAX_ALERTAS === 1 ? 'aviso' : 'avisos'} — veja as campanhas na aba Campanhas.`));
  }
  return card;
}

// ---------- Plataformas e ranking ----------

function buildPlataformas(campanhas: Array<{ c: Campanha; m: Metricas }>): HTMLElement | null {
  const totais = PLATAFORMAS_TRAFEGO.map((p) => {
    const m = campanhas.filter((x) => x.c.plataforma === p.id).reduce<{ investimento: number; conversoes: number; receita: number }>(
      (t, x) => ({ investimento: t.investimento + x.m.investimento, conversoes: t.conversoes + x.m.conversoes, receita: t.receita + x.m.receita }),
      { investimento: 0, conversoes: 0, receita: 0 },
    );
    return { id: p.id, ...m };
  }).filter((p) => p.investimento > 0);
  if (!totais.length) return null;
  const total = totais.reduce((t, p) => t + p.investimento, 0);
  totais.sort((a, b) => b.investimento - a.investimento);
  return buildCartaoGrafico(
    'Por plataforma',
    'Parte do investimento e o que cada uma trouxe',
    buildRanking(
      totais.map((p) => ({
        rotulo: buildPlataforma(p.id, true),
        valor: (p.investimento / total) * 100,
        textoValor: moedaCurta(p.investimento),
        detalhe: p.receita > 0 ? `ROAS ${vezes(p.receita / p.investimento)}` : `${formatarNumero(p.conversoes)} conv.`,
      })),
      'Investimento por plataforma',
    ),
    null,
  );
}

function buildRankingCampanhas(ctx: CtxPainel, campanhas: Array<{ c: Campanha; m: Metricas }>): HTMLElement | null {
  const comConversao = campanhas.filter((x) => x.m.conversoes > 0).sort((a, b) => b.m.conversoes - a.m.conversoes).slice(0, 6);
  if (!comConversao.length) return null;
  const maior = comConversao[0]!.m.conversoes;
  return buildCartaoGrafico(
    'Campanhas que mais converteram',
    `Conversões em ${descreverPeriodo(ctx.periodo)}`,
    buildRanking(
      comConversao.map(({ c, m }) => {
        const r = el('span', 'tf-rank-nome');
        r.title = c.nome;
        r.append(buildPlataforma(c.plataforma), el('span', undefined, c.nome));
        return {
          rotulo: r,
          valor: (m.conversoes / maior) * 100,
          textoValor: formatarNumero(m.conversoes),
          detalhe: `CPA ${talvez(m.cpa, moeda)}`,
          aoClicar: () => ctx.abrirCampanha(c.id),
        };
      }),
      'Campanhas por conversões',
    ),
    null,
  );
}

// ---------- Tabela ----------

function buildTabela(ctx: CtxPainel, linhas: Array<{ c: Campanha; m: Metricas }>): HTMLElement {
  const secao = el('section', 'tf-secao');
  const cab = el('div', 'tf-secao-cab');
  cab.append(el('h2', 'tf-secao-titulo', 'Por campanha'), el('span', 'tf-secao-sub', descreverPeriodo(ctx.periodo)));
  secao.appendChild(cab);
  if (!linhas.length) {
    secao.appendChild(el('p', 'tf-nota', 'Nenhuma campanha nesta conta.'));
    return secao;
  }
  const maior = Math.max(...linhas.map((l) => l.m.investimento), 1);
  const tabelaWrap = el('div', 'tf-tabela-wrap');
  const tabela = el('table', 'tf-tabela');
  const thead = el('thead');
  const trc = el('tr');
  ['Campanha', 'Situação', 'Investido', 'Cliques', 'CTR', 'Conversões', 'CPA', 'ROAS'].forEach((t, i) => {
    const th = el('th', i >= 2 ? 'tf-num' : undefined, t);
    trc.appendChild(th);
  });
  thead.appendChild(trc);
  const corpo = el('tbody');
  linhas.forEach(({ c, m }) => {
    const tr = el('tr');
    tr.tabIndex = 0;
    const td = (conteudo: string | HTMLElement, classe = ''): HTMLTableCellElement => {
      const cel = el('td', classe || undefined);
      if (typeof conteudo === 'string') cel.textContent = conteudo;
      else cel.appendChild(conteudo);
      tr.appendChild(cel);
      return cel;
    };
    const nome = el('div', 'tf-tabela-nome');
    const linha1 = el('span', 'tf-forte', c.nome);
    const linha2 = el('span', 'tf-tabela-meta');
    linha2.append(buildPlataforma(c.plataforma), el('span', undefined, nomeConta(ctx.file, c.contaId)));
    nome.append(linha1, linha2);
    td(nome);
    td(buildSelo(rotulo(STATUS_CAMPANHA, c.status), TOM_STATUS[c.status]));
    const inv = el('div', 'tf-inv');
    const barra = el('span', 'tf-inv-barra');
    barra.style.width = `${(m.investimento / maior) * 100}%`;
    inv.append(el('span', undefined, moeda(m.investimento)), barra);
    td(inv, 'tf-num');
    td(formatarNumero(m.cliques), 'tf-num');
    td(pct(m.ctr), 'tf-num');
    td(formatarNumero(m.conversoes), 'tf-num');
    td(talvez(m.cpa, moeda), 'tf-num');
    const roas = td(vezes(m.roas), 'tf-num tf-roas');
    if (m.roas !== undefined && m.receita > 0) roas.classList.add(m.roas >= 1 ? 'is-bom' : 'is-ruim');
    tr.addEventListener('click', () => ctx.abrirCampanha(c.id));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ctx.abrirCampanha(c.id);
    });
    corpo.appendChild(tr);
  });
  tabela.append(thead, corpo);
  tabelaWrap.appendChild(tabela);
  secao.appendChild(tabelaWrap);
  return secao;
}

// ---------- Painel ----------

export function buildPainel(ctx: CtxPainel): HTMLElement {
  const wrap = el('div', 'tf-painel');
  if (!ctx.file.campanhas.length) {
    const comecar = buildBotao('Criar a primeira campanha', { icone: ICONES.mais, variante: 'primario' });
    comecar.addEventListener('click', ctx.novaCampanha);
    wrap.appendChild(
      buildVazio(
        ICONES.trafego,
        'Nenhuma campanha ainda',
        'Cadastre as contas (clientes), os sites que recebem o tráfego e as campanhas. Lance os resultados de cada dia — ou importe a planilha exportada pelo Meta Ads, Google Ads… — e o painel calcula CTR, CPC, CPA e ROAS.',
        comecar,
      ),
    );
    return wrap;
  }

  const intervalo = intervaloDo(ctx.periodo);
  const anterior = intervaloAnterior(ctx.periodo);
  const registros = registrosNo(ctx.campanhas, intervalo);
  const m = metricasDe(registros);
  const regAnt = anterior ? registrosNo(ctx.campanhas, anterior) : [];
  const mAnt = anterior && regAnt.length ? metricasDe(regAnt) : undefined;
  const serie = serieTemporal(registros, intervalo);
  const contra = descreverAnterior(ctx.periodo);

  wrap.appendChild(
    buildKpis(
      [
        {
          rotulo: 'Investido',
          valor: moedaCurta(m.investimento),
          detalhe: `${ctx.campanhas.filter((c) => c.status === 'ativa').length} ativas · CPM ${talvez(m.cpm, moeda)}`,
          variacao: variacao(m.investimento, mAnt?.investimento),
          sentido: 'neutro',
          serie: serie.map((p) => p.investimento),
        },
        {
          rotulo: 'Cliques',
          valor: formatarNumero(m.cliques),
          detalhe: `CTR ${pct(m.ctr)} · CPC ${talvez(m.cpc, moeda)}`,
          variacao: variacao(m.cliques, mAnt?.cliques),
          sentido: 'subir',
          serie: serie.map((p) => p.cliques),
        },
        {
          rotulo: 'Conversões',
          valor: formatarNumero(m.conversoes),
          detalhe: `CPA ${talvez(m.cpa, moeda)} · taxa ${pct(m.taxaConversao)}`,
          variacao: variacao(m.conversoes, mAnt?.conversoes),
          sentido: 'subir',
          serie: serie.map((p) => p.conversoes),
        },
        {
          rotulo: 'Receita',
          valor: moedaCurta(m.receita),
          detalhe: `ROAS ${vezes(m.roas)}`,
          variacao: variacao(m.receita, mAnt?.receita),
          sentido: 'subir',
          serie: serie.map((p) => p.receita),
          destaque: true,
        },
      ],
      contra,
    ),
  );

  const porCampanha = ctx.campanhas
    .map((c) => ({ c, m: metricasDe(c.registros.filter((r) => (!intervalo.inicio || r.data >= intervalo.inicio) && r.data <= intervalo.fim)) }))
    .sort((a, b) => b.m.investimento - a.m.investimento || a.c.nome.localeCompare(b.c.nome, 'pt-BR'));

  const melhor = melhorCampanha(porCampanha);
  const linha = el('div', `tf-duas${melhor ? '' : ' is-uma'}`);
  if (melhor) linha.appendChild(buildDestaque(ctx, melhor));
  linha.appendChild(buildAlertas(ctx, alertas(ctx)));
  wrap.appendChild(linha);

  if (serie.length) {
    const graficos = el('div', 'tf-graficos');
    const categorias = serie.map((p) => p.rotulo);
    graficos.append(
      buildCartaoGrafico(
        'Investimento',
        `Em reais, ${descreverPeriodo(ctx.periodo)}`,
        buildColunas(categorias, [{ nome: 'Investimento (R$)', cor: COR_SERIE[0], valores: serie.map((p) => p.investimento) }], 'Investimento por período', (n) => formatarNumero(n)),
        { colunas: ['Período', 'Investimento'], linhas: serie.map((p) => [p.rotulo, moeda(p.investimento)]) },
      ),
      buildCartaoGrafico(
        'Conversões',
        `Quantidade, ${descreverPeriodo(ctx.periodo)}`,
        buildColunas(categorias, [{ nome: 'Conversões', cor: COR_SERIE[1], valores: serie.map((p) => p.conversoes) }], 'Conversões por período', (n) => formatarNumero(n)),
        { colunas: ['Período', 'Conversões', 'Cliques'], linhas: serie.map((p) => [p.rotulo, formatarNumero(p.conversoes), formatarNumero(p.cliques)]) },
      ),
    );
    wrap.appendChild(graficos);

    const plataformas = buildPlataformas(porCampanha);
    const ranking = buildRankingCampanhas(ctx, porCampanha);
    if (plataformas || ranking) {
      const extra = el('div', 'tf-graficos');
      if (plataformas) extra.appendChild(plataformas);
      if (ranking) extra.appendChild(ranking);
      wrap.appendChild(extra);
    }
  } else {
    const vazio = el('div', 'tf-sem-dados');
    vazio.innerHTML = svg(ICONES.trafego, 20, 1.8);
    vazio.appendChild(el('p', undefined, `Nenhum resultado lançado em ${descreverPeriodo(ctx.periodo)}. Abra uma campanha para lançar os números do dia ou importar a planilha.`));
    wrap.appendChild(vazio);
  }

  wrap.appendChild(buildTabela(ctx, porCampanha));
  return wrap;
}
