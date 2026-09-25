import type { TagPostagem } from '../../../shared/types/postagens.types.js';
import {
  OBJETIVOS_TRAFEGO,
  PLATAFORMAS_TRAFEGO,
  STATUS_CAMPANHA,
  TIPOS_SITE,
  calcularMetricas,
  somar,
  type Campanha,
  type ContaTrafego,
  type LinkCampanha,
  type Metricas,
  type ObjetivoTrafego,
  type PlataformaTrafego,
  type RegistroTrafego,
  type SiteTrafego,
  type StatusCampanha,
  type TipoSite,
  type TrafegoFile,
} from '../../../shared/types/trafego.types.js';
import { campo, erroInline, grade2, input, interruptor, select, textarea } from '../../ui/campos.js';
import { buildSecaoModal, mensagemDeErro, openAvisoModal, openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { abrirPainel, lembrarPosicao, lerPosicaoLembrada, type PainelHandle } from '../../ui/painel.js';
import {
  buildAviso,
  buildBotao,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildSelo,
  buildVazio,
  svg,
  type Tom,
} from '../../ui/pagina.js';
import { COR_SERIE, buildCartaoGrafico, buildColunas, esconderTooltip, formatarNumero } from '../postagens/postagens.graficos.js';
import { formatarData, hojeIso, somarDias } from '../postagens/postagens.ui.js';
import * as videosState from '../postagens/videos/videos.state.js';
import * as trafegoState from './trafego.state.js';

/**
 * Módulo Tráfego pago: painel de resultados, campanhas num quadro por status
 * (arrastável), sites/páginas de destino e contas (clientes).
 *
 * Os números vêm dos registros diários de cada campanha, digitados ou
 * importados da planilha exportada pela plataforma. CTR, CPC, CPA e ROAS são
 * sempre calculados na hora a partir das somas — nunca guardados.
 */

type Aba = 'painel' | 'campanhas' | 'sites' | 'contas';
type Periodo = '7' | '30' | '90' | 'mes' | 'tudo';

const ICONES = {
  trafego: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  campanha: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  site: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  conta: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  externo: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  editar: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  duplicar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  importar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  xis: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
} as const;

const TOM_STATUS: Record<StatusCampanha, Tom> = {
  planejamento: 'neutro',
  ativa: 'ok',
  pausada: 'atencao',
  encerrada: 'neutro',
};

let containerAtual: HTMLElement | null = null;
let aba: Aba = 'painel';
let periodo: Periodo = '30';
/** '' = todas as contas. */
let filtroConta = '';
let sortables: InstanceType<typeof Sortable>[] = [];

let painel: PainelHandle | null = null;
let timerSalvar: ReturnType<typeof setTimeout> | null = null;
let salvarPendente: (() => Promise<void>) | null = null;
let redesenharResultados: (() => void) | null = null;

// ---------- Ciclo de vida ----------

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  trafegoState.onStateChange(() => {
    redesenhar();
    redesenharResultados?.();
  });
  const catalogo = videosState.getCurrentState() ? Promise.resolve() : videosState.load().then(() => undefined);
  void Promise.all([trafegoState.load(), catalogo]).then(redesenhar).catch(falhou);
}

export function destroy(): void {
  void descarregar();
  painel?.fechar();
  destruirSortables();
  esconderTooltip();
  trafegoState.offStateChange();
  containerAtual = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function destruirSortables(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

function redesenhar(): void {
  const file = trafegoState.getCurrentState();
  if (!containerAtual || !file) return;
  render(containerAtual, file);
}

// ---------- Formatação ----------

function moeda(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function talvez(n: number | undefined, formatar: (v: number) => string): string {
  return n === undefined ? '—' : formatar(n);
}

function pct(n: number | undefined): string {
  return talvez(n, (v) => `${formatarNumero(v, 2)}%`);
}

function rotulo<T extends string>(lista: ReadonlyArray<{ id: T; rotulo: string }>, id: T): string {
  return lista.find((x) => x.id === id)?.rotulo ?? id;
}

function catalogoTags(): TagPostagem[] {
  return videosState.getCurrentState()?.tags ?? [];
}

function nomeConta(file: TrafegoFile, contaId?: string): string {
  return file.contas.find((c) => c.id === contaId)?.nome ?? 'Sem conta';
}

// ---------- Recortes ----------

function inicioDoPeriodo(): string | undefined {
  const hoje = hojeIso();
  switch (periodo) {
    case '7':
      return somarDias(hoje, -6);
    case '30':
      return somarDias(hoje, -29);
    case '90':
      return somarDias(hoje, -89);
    case 'mes':
      return `${hoje.slice(0, 7)}-01`;
    case 'tudo':
      return undefined;
  }
}

function noPeriodo(r: RegistroTrafego): boolean {
  const inicio = inicioDoPeriodo();
  return (!inicio || r.data >= inicio) && r.data <= hojeIso();
}

function campanhasFiltradas(file: TrafegoFile): Campanha[] {
  return file.campanhas.filter((c) => !filtroConta || c.contaId === filtroConta);
}

function metricasDe(registros: RegistroTrafego[]): Metricas {
  return calcularMetricas(somar(registros));
}

function descreverPeriodo(): string {
  switch (periodo) {
    case '7':
      return 'últimos 7 dias';
    case '30':
      return 'últimos 30 dias';
    case '90':
      return 'últimos 90 dias';
    case 'mes':
      return 'este mês';
    case 'tudo':
      return 'todo o histórico';
  }
}

// ---------- Tela ----------

function render(container: HTMLElement, file: TrafegoFile): void {
  destruirSortables();
  esconderTooltip();
  const tela = document.createElement('div');
  tela.className = 'pg-view tf-view';

  const novaCampanha = buildBotao('Nova campanha', { icone: ICONES.mais, variante: 'primario' });
  novaCampanha.addEventListener('click', () => abrirNovaCampanha(file));
  tela.appendChild(
    buildCabecalho({
      icone: ICONES.trafego,
      titulo: 'Tráfego pago',
      subtitulo: 'Campanhas, sites e resultados por conta — investimento, cliques, conversões e retorno',
      acoes: [novaCampanha],
    }),
  );

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  barra.appendChild(
    buildSegmentado<Aba>(
      [
        { value: 'painel', label: 'Painel' },
        { value: 'campanhas', label: 'Campanhas' },
        { value: 'sites', label: 'Sites' },
        { value: 'contas', label: 'Contas' },
      ],
      aba,
      (v) => {
        aba = v;
        redesenhar();
      },
    ),
  );
  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  barra.appendChild(espaco);
  if (file.contas.length && aba !== 'contas') {
    const conta = select(filtroConta, [{ value: '', label: 'Todas as contas' }, ...file.contas.map((c) => ({ value: c.id, label: c.nome }))]);
    conta.classList.add('tf-filtro-conta');
    conta.setAttribute('aria-label', 'Filtrar por conta');
    conta.addEventListener('change', () => {
      filtroConta = conta.value;
      redesenhar();
    });
    barra.appendChild(conta);
  }
  if (aba === 'painel' || aba === 'campanhas') {
    barra.appendChild(
      buildSegmentado<Periodo>(
        [
          { value: '7', label: '7 dias' },
          { value: '30', label: '30 dias' },
          { value: '90', label: '90 dias' },
          { value: 'mes', label: 'Este mês' },
          { value: 'tudo', label: 'Tudo' },
        ],
        periodo,
        (v) => {
          periodo = v;
          redesenhar();
        },
      ),
    );
  }
  tela.appendChild(barra);

  const rolagem = document.createElement('div');
  rolagem.className = 'pg-rolagem tf-rolagem';
  switch (aba) {
    case 'painel':
      rolagem.appendChild(buildPainel(file));
      break;
    case 'campanhas':
      rolagem.appendChild(buildQuadro(file));
      break;
    case 'sites':
      rolagem.appendChild(buildSites(file));
      break;
    case 'contas':
      rolagem.appendChild(buildContas(file));
      break;
  }
  tela.appendChild(rolagem);
  container.replaceChildren(tela);
}

// ---------- Painel ----------

function alertas(file: TrafegoFile): Array<{ texto: string; tom: Tom; campanha?: Campanha }> {
  const lista: Array<{ texto: string; tom: Tom; campanha?: Campanha }> = [];
  const hoje = hojeIso();
  campanhasFiltradas(file).forEach((c) => {
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
  file.contas
    .filter((conta) => !filtroConta || conta.id === filtroConta)
    .forEach((conta) => {
      if (!conta.orcamentoMensal) return;
      const gasto = somar(file.campanhas.filter((c) => c.contaId === conta.id).flatMap((c) => c.registros.filter((r) => r.data.startsWith(mes)))).investimento;
      if (gasto > conta.orcamentoMensal) {
        lista.push({ texto: `A conta ${conta.nome} gastou ${moeda(gasto)} este mês, acima da verba de ${moeda(conta.orcamentoMensal)}.`, tom: 'erro' });
      }
    });
  return lista;
}

/** Dias (ou meses, se o recorte passa de ~3 meses) com os totais de cada um. */
function serieTemporal(registros: RegistroTrafego[]): Array<{ rotulo: string; chave: string; investimento: number; conversoes: number; cliques: number }> {
  if (!registros.length) return [];
  const datas = registros.map((r) => r.data).sort();
  const primeiro = inicioDoPeriodo() ?? datas[0]!;
  const ultimo = hojeIso() < datas[datas.length - 1]! ? datas[datas.length - 1]! : hojeIso();
  const chaves: string[] = [];
  for (let d = primeiro; d <= ultimo && chaves.length < 400; d = somarDias(d, 1)) chaves.push(d);
  const porMes = chaves.length > 92;
  const grupos = new Map<string, { investimento: number; conversoes: number; cliques: number }>();
  (porMes ? [...new Set(chaves.map((d) => d.slice(0, 7)))] : chaves).forEach((k) => grupos.set(k, { investimento: 0, conversoes: 0, cliques: 0 }));
  registros.forEach((r) => {
    const g = grupos.get(porMes ? r.data.slice(0, 7) : r.data);
    if (!g) return;
    g.investimento += r.investimento;
    g.conversoes += r.conversoes;
    g.cliques += r.cliques;
  });
  return [...grupos].map(([chave, v]) => ({
    chave,
    rotulo: porMes ? `${chave.slice(5, 7)}/${chave.slice(2, 4)}` : `${chave.slice(8, 10)}/${chave.slice(5, 7)}`,
    ...v,
  }));
}

function buildPainel(file: TrafegoFile): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tf-painel';
  const campanhas = campanhasFiltradas(file);
  if (!file.campanhas.length) {
    const comecar = buildBotao('Criar a primeira campanha', { icone: ICONES.mais, variante: 'primario' });
    comecar.addEventListener('click', () => abrirNovaCampanha(file));
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

  const registros = campanhas.flatMap((c) => c.registros.filter(noPeriodo));
  const m = metricasDe(registros);
  const ativas = campanhas.filter((c) => c.status === 'ativa').length;
  wrap.appendChild(
    buildIndicadores([
      { rotulo: 'Investido', valor: moeda(m.investimento), detalhe: `${ativas} campanha${ativas === 1 ? '' : 's'} ativa${ativas === 1 ? '' : 's'}` },
      { rotulo: 'Cliques', valor: formatarNumero(m.cliques), detalhe: `CTR ${pct(m.ctr)} · CPC ${talvez(m.cpc, moeda)}` },
      { rotulo: 'Conversões', valor: formatarNumero(m.conversoes), detalhe: `CPA ${talvez(m.cpa, moeda)} · taxa ${pct(m.taxaConversao)}` },
      {
        rotulo: 'Receita',
        valor: moeda(m.receita),
        detalhe: m.roas === undefined ? 'ROAS —' : `ROAS ${formatarNumero(m.roas, 2)}×`,
        tom: m.roas === undefined ? 'neutro' : m.roas >= 1 ? 'ok' : 'erro',
      },
    ]),
  );

  const avisos = alertas(file);
  if (avisos.length) {
    const lista = document.createElement('div');
    lista.className = 'tf-alertas';
    avisos.slice(0, 6).forEach((a) => {
      let acao: HTMLElement | undefined;
      if (a.campanha) {
        const campanha = a.campanha;
        acao = buildBotao('Abrir', { variante: 'fantasma' });
        acao.addEventListener('click', () => abrirCampanha(campanha.id));
      }
      lista.appendChild(buildAviso(a.texto, a.tom, acao));
    });
    wrap.appendChild(lista);
  }

  const serie = serieTemporal(registros);
  if (serie.length) {
    const graficos = document.createElement('div');
    graficos.className = 'tf-graficos';
    const categorias = serie.map((s) => s.rotulo);
    graficos.append(
      buildCartaoGrafico(
        'Investimento',
        `Em reais, ${descreverPeriodo()}`,
        buildColunas(categorias, [{ nome: 'Investimento (R$)', cor: COR_SERIE[0], valores: serie.map((s) => s.investimento) }], 'Investimento por período', (n) => formatarNumero(n)),
        { colunas: ['Período', 'Investimento'], linhas: serie.map((s) => [s.rotulo, moeda(s.investimento)]) },
      ),
      buildCartaoGrafico(
        'Conversões',
        `Quantidade, ${descreverPeriodo()}`,
        buildColunas(categorias, [{ nome: 'Conversões', cor: COR_SERIE[0], valores: serie.map((s) => s.conversoes) }], 'Conversões por período', (n) => formatarNumero(n)),
        { colunas: ['Período', 'Conversões', 'Cliques'], linhas: serie.map((s) => [s.rotulo, formatarNumero(s.conversoes), formatarNumero(s.cliques)]) },
      ),
    );
    wrap.appendChild(graficos);
  } else {
    wrap.appendChild(buildAviso(`Nenhum resultado lançado em ${descreverPeriodo()}. Abra uma campanha para lançar os números do dia ou importar a planilha.`, 'neutro'));
  }

  // Tabela por campanha, da que mais investiu para a que menos.
  const linhas = campanhas
    .map((c) => ({ c, m: metricasDe(c.registros.filter(noPeriodo)) }))
    .sort((a, b) => b.m.investimento - a.m.investimento || a.c.nome.localeCompare(b.c.nome, 'pt-BR'));
  const secao = document.createElement('section');
  secao.className = 'tf-secao';
  secao.appendChild(Object.assign(document.createElement('h2'), { className: 'tf-secao-titulo', textContent: `Por campanha · ${descreverPeriodo()}` }));
  const tabelaWrap = document.createElement('div');
  tabelaWrap.className = 'tf-tabela-wrap';
  const tabela = document.createElement('table');
  tabela.className = 'tf-tabela';
  const cab = document.createElement('thead');
  const trc = document.createElement('tr');
  ['Campanha', 'Conta', 'Plataforma', 'Situação', 'Investido', 'Cliques', 'CTR', 'Conversões', 'CPA', 'ROAS'].forEach((t, i) => {
    const th = document.createElement('th');
    th.textContent = t;
    if (i >= 4) th.className = 'tf-num';
    trc.appendChild(th);
  });
  cab.appendChild(trc);
  const corpo = document.createElement('tbody');
  linhas.forEach(({ c, m: mc }) => {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    const td = (conteudo: string | HTMLElement, classe = ''): void => {
      const cel = document.createElement('td');
      if (classe) cel.className = classe;
      if (typeof conteudo === 'string') cel.textContent = conteudo;
      else cel.appendChild(conteudo);
      tr.appendChild(cel);
    };
    td(c.nome, 'tf-forte');
    td(nomeConta(file, c.contaId));
    td(rotulo(PLATAFORMAS_TRAFEGO, c.plataforma));
    td(buildSelo(rotulo(STATUS_CAMPANHA, c.status), TOM_STATUS[c.status]));
    td(moeda(mc.investimento), 'tf-num');
    td(formatarNumero(mc.cliques), 'tf-num');
    td(pct(mc.ctr), 'tf-num');
    td(formatarNumero(mc.conversoes), 'tf-num');
    td(talvez(mc.cpa, moeda), 'tf-num');
    td(talvez(mc.roas, (v) => `${formatarNumero(v, 2)}×`), 'tf-num');
    tr.addEventListener('click', () => abrirCampanha(c.id));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') abrirCampanha(c.id);
    });
    corpo.appendChild(tr);
  });
  tabela.append(cab, corpo);
  tabelaWrap.appendChild(tabela);
  secao.appendChild(tabelaWrap);
  wrap.appendChild(secao);
  return wrap;
}

// ---------- Quadro de campanhas ----------

function buildCartaoCampanha(file: TrafegoFile, c: Campanha): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = 'tf-cartao';
  cartao.dataset.campanhaId = c.id;
  cartao.tabIndex = 0;

  const topo = document.createElement('div');
  topo.className = 'tf-cartao-topo';
  const plataforma = document.createElement('span');
  plataforma.className = `tf-plataforma is-${c.plataforma}`;
  plataforma.textContent = rotulo(PLATAFORMAS_TRAFEGO, c.plataforma);
  const seq = document.createElement('span');
  seq.className = 'tf-seq';
  seq.textContent = `#${c.seq}`;
  topo.append(plataforma, seq);
  cartao.appendChild(topo);

  cartao.appendChild(Object.assign(document.createElement('h3'), { className: 'tf-cartao-titulo', textContent: c.nome }));
  const meta = document.createElement('p');
  meta.className = 'tf-cartao-meta';
  meta.textContent = [nomeConta(file, c.contaId), rotulo(OBJETIVOS_TRAFEGO, c.objetivo)].join(' · ');
  cartao.appendChild(meta);

  const m = metricasDe(c.registros.filter(noPeriodo));
  const numeros = document.createElement('dl');
  numeros.className = 'tf-cartao-numeros';
  const par = (dt: string, dd: string): void => {
    const d = document.createElement('div');
    d.append(Object.assign(document.createElement('dt'), { textContent: dt }), Object.assign(document.createElement('dd'), { textContent: dd }));
    numeros.appendChild(d);
  };
  par('Investido', moeda(m.investimento));
  par('Conv.', formatarNumero(m.conversoes));
  par(m.roas !== undefined ? 'ROAS' : 'CPA', m.roas !== undefined ? `${formatarNumero(m.roas, 2)}×` : talvez(m.cpa, moeda));
  cartao.appendChild(numeros);

  if (c.orcamentoTotal) {
    const gasto = somar(c.registros).investimento;
    const barra = document.createElement('div');
    barra.className = 'tf-orcamento';
    barra.title = `${moeda(gasto)} de ${moeda(c.orcamentoTotal)} do orçamento total`;
    const preenchido = document.createElement('span');
    preenchido.style.width = `${Math.min(100, (gasto / c.orcamentoTotal) * 100)}%`;
    preenchido.classList.toggle('is-estourado', gasto > c.orcamentoTotal);
    barra.appendChild(preenchido);
    cartao.appendChild(barra);
  }

  cartao.addEventListener('click', () => abrirCampanha(c.id));
  cartao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrirCampanha(c.id);
  });
  return cartao;
}

function buildQuadro(file: TrafegoFile): HTMLElement {
  const quadro = document.createElement('div');
  quadro.className = 'tf-quadro';
  const campanhas = campanhasFiltradas(file);
  STATUS_CAMPANHA.forEach((s) => {
    const coluna = document.createElement('section');
    coluna.className = `tf-coluna is-${s.id}`;
    const doStatus = campanhas.filter((c) => c.status === s.id).sort((a, b) => a.ordem - b.ordem);
    const cab = document.createElement('header');
    cab.className = 'tf-coluna-cab';
    cab.appendChild(buildSelo(s.rotulo, TOM_STATUS[s.id]));
    cab.appendChild(Object.assign(document.createElement('span'), { className: 'tf-coluna-n', textContent: String(doStatus.length) }));
    coluna.appendChild(cab);
    const lista = document.createElement('div');
    lista.className = 'tf-coluna-lista';
    lista.dataset.status = s.id;
    doStatus.forEach((c) => lista.appendChild(buildCartaoCampanha(file, c)));
    coluna.appendChild(lista);
    quadro.appendChild(coluna);

    sortables.push(
      new Sortable(lista, {
        group: 'tf-campanhas',
        animation: 150,
        ghostClass: 'sortable-ghost',
        draggable: '.tf-cartao',
        onEnd: (evt) => {
          const campanhaId = evt.item.dataset.campanhaId;
          const status = evt.to.dataset.status as StatusCampanha | undefined;
          const indice = evt.newDraggableIndex ?? evt.newIndex;
          if (!campanhaId || !status || indice === undefined) return;
          void trafegoState.moverCampanha({ campanhaId, status, indice }).catch(falhou);
        },
      }),
    );
  });
  return quadro;
}

// ---------- Sites ----------

function buildSites(file: TrafegoFile): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tf-lista-wrap';
  const topo = document.createElement('div');
  topo.className = 'tf-lista-topo';
  const novo = buildBotao('Novo site', { icone: ICONES.mais, variante: 'secundario' });
  novo.addEventListener('click', () => abrirSite(file, null));
  topo.appendChild(novo);
  wrap.appendChild(topo);

  const sites = file.sites.filter((s) => !filtroConta || s.contaId === filtroConta);
  if (!sites.length) {
    wrap.appendChild(
      buildVazio(ICONES.site, 'Nenhum site cadastrado', 'Cadastre os sites, landing pages e publicações que recebem o tráfego das campanhas — com o que cada página deve fazer e se tem pixel e analytics.'),
    );
    return wrap;
  }
  const grade = document.createElement('div');
  grade.className = 'tf-grade';
  sites.forEach((s) => {
    const cartao = document.createElement('article');
    cartao.className = 'tf-item';
    const cab = document.createElement('div');
    cab.className = 'tf-item-cab';
    cab.appendChild(Object.assign(document.createElement('span'), { className: 'tf-item-tipo', textContent: rotulo(TIPOS_SITE, s.tipo) }));
    cab.appendChild(acoesItem(() => abrirSite(file, s), () => void excluirSite(s)));
    cartao.appendChild(cab);
    cartao.appendChild(Object.assign(document.createElement('h3'), { className: 'tf-item-titulo', textContent: s.nome }));
    if (s.url) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'tf-url';
      link.title = `Abrir ${s.url} no navegador`;
      link.innerHTML = svg(ICONES.externo, 12, 2);
      link.append(s.url.replace(/^https?:\/\//, ''));
      link.addEventListener('click', () => window.irisAPI.system.openExternalLink(s.url));
      cartao.appendChild(link);
    }
    if (s.objetivo.trim()) cartao.appendChild(Object.assign(document.createElement('p'), { className: 'tf-item-texto', textContent: s.objetivo }));
    const selos = document.createElement('div');
    selos.className = 'tf-selos';
    selos.append(buildSelo(s.pixel ? 'Pixel instalado' : 'Sem pixel', s.pixel ? 'ok' : 'atencao'), buildSelo(s.analytics ? 'Analytics' : 'Sem analytics', s.analytics ? 'ok' : 'neutro'));
    cartao.appendChild(selos);
    const usam = file.campanhas.filter((c) => c.siteId === s.id);
    cartao.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'tf-item-rodape',
        textContent: [nomeConta(file, s.contaId), usam.length ? `${usam.length} campanha${usam.length === 1 ? '' : 's'}` : 'nenhuma campanha'].join(' · '),
      }),
    );
    grade.appendChild(cartao);
  });
  wrap.appendChild(grade);
  return wrap;
}

function acoesItem(aoEditar: () => void, aoExcluir: () => void): HTMLElement {
  const acoes = document.createElement('span');
  acoes.className = 'tf-item-acoes';
  const editar = buildBotao('', { icone: ICONES.editar, variante: 'fantasma', titulo: 'Editar' });
  editar.addEventListener('click', aoEditar);
  const excluir = buildBotao('', { icone: ICONES.lixeira, variante: 'fantasma', titulo: 'Excluir' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', aoExcluir);
  acoes.append(editar, excluir);
  return acoes;
}

async function excluirSite(s: SiteTrafego): Promise<void> {
  const ok = await openConfirmModal({ title: 'Excluir site', message: `"${s.nome}" sai da lista. As campanhas que apontavam para ele ficam sem site.` });
  if (ok) await trafegoState.excluirSite(s.id).catch(falhou);
}

function abrirSite(file: TrafegoFile, site: SiteTrafego | null): void {
  let tipo: TipoSite = site?.tipo ?? 'landing';
  let pixel = site?.pixel ?? false;
  let analytics = site?.analytics ?? false;
  void openCustomModal(
    site ? 'Editar site' : 'Novo site',
    ({ corpo, rodape, fechar }) => {
      const nome = input('text', site?.nome ?? '', 'Ex.: Landing do curso de Python');
      const endereco = input('url', site?.url ?? '', 'https://…');
      const tipoSel = select(tipo, TIPOS_SITE.map((t) => ({ value: t.id, label: t.rotulo })));
      tipoSel.addEventListener('change', () => (tipo = tipoSel.value as TipoSite));
      const conta = select(site?.contaId ?? filtroConta, [{ value: '', label: 'Sem conta' }, ...file.contas.map((c) => ({ value: c.id, label: c.nome }))]);
      const objetivo = textarea(site?.objetivo ?? '', 'O que o visitante deve fazer: comprar, deixar o e-mail, chamar no WhatsApp…', 2);
      const obs = textarea(site?.observacoes ?? '', 'Observações (opcional)', 2);
      corpo.append(
        campo('Nome', nome),
        campo('Endereço', endereco),
        grade2(campo('Tipo', tipoSel), campo('Conta', conta)),
        campo('Objetivo da página', objetivo),
        interruptor('Pixel instalado', 'Meta Pixel, tag do Google Ads ou equivalente', pixel, (v) => (pixel = v)),
        interruptor('Analytics', 'Google Analytics ou outra ferramenta de medição', analytics, (v) => (analytics = v)),
        campo('Observações', obs),
      );
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        void trafegoState
          .salvarSite({
            id: site?.id,
            nome: nome.value,
            url: endereco.value,
            tipo,
            contaId: conta.value || undefined,
            objetivo: objetivo.value,
            pixel,
            analytics,
            observacoes: obs.value,
          })
          .then(fechar)
          .catch((e) => erroInline(corpo, e));
      });
      rodape.append(cancelar, salvar);
      nome.focus();
    },
    { largura: 560, icone: ICONES.site, subtitulo: 'Um site, landing page ou publicação que recebe o tráfego.' },
  );
}

// ---------- Contas ----------

function buildContas(file: TrafegoFile): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tf-lista-wrap';
  const topo = document.createElement('div');
  topo.className = 'tf-lista-topo';
  const nova = buildBotao('Nova conta', { icone: ICONES.mais, variante: 'secundario' });
  nova.addEventListener('click', () => abrirConta(null));
  topo.appendChild(nova);
  wrap.appendChild(topo);

  if (!file.contas.length) {
    wrap.appendChild(buildVazio(ICONES.conta, 'Nenhuma conta ainda', 'Uma conta é um cliente ou empresa que você atende. Ligue às mesmas tags de Postagens e Relatórios e defina a verba do mês.'));
    return wrap;
  }
  const mes = hojeIso().slice(0, 7);
  const grade = document.createElement('div');
  grade.className = 'tf-grade';
  file.contas.forEach((conta) => {
    const campanhas = file.campanhas.filter((c) => c.contaId === conta.id);
    const gastoMes = somar(campanhas.flatMap((c) => c.registros.filter((r) => r.data.startsWith(mes)))).investimento;
    const cartao = document.createElement('article');
    cartao.className = 'tf-item';
    const cab = document.createElement('div');
    cab.className = 'tf-item-cab';
    cab.appendChild(Object.assign(document.createElement('span'), { className: 'tf-item-tipo', textContent: `${campanhas.filter((c) => c.status === 'ativa').length} ativa(s) de ${campanhas.length}` }));
    cab.appendChild(
      acoesItem(
        () => abrirConta(conta),
        () =>
          void openConfirmModal({ title: 'Excluir conta', message: `"${conta.nome}" sai da lista. Campanhas e sites dela ficam sem conta — nada é apagado.` }).then(
            (ok) => {
              if (ok) void trafegoState.excluirConta(conta.id).catch(falhou);
            },
          ),
      ),
    );
    cartao.appendChild(cab);
    cartao.appendChild(Object.assign(document.createElement('h3'), { className: 'tf-item-titulo', textContent: conta.nome }));
    const tags = conta.tagIds.map((id) => catalogoTags().find((t) => t.id === id)).filter((t): t is TagPostagem => Boolean(t));
    if (tags.length) {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'tf-tags';
      tags.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'tf-tag';
        chip.style.setProperty('--cor-tag', t.cor);
        chip.textContent = t.nome;
        tagsEl.appendChild(chip);
      });
      cartao.appendChild(tagsEl);
    }
    const verba = document.createElement('div');
    verba.className = 'tf-verba';
    const texto = document.createElement('p');
    texto.textContent = conta.orcamentoMensal ? `${moeda(gastoMes)} de ${moeda(conta.orcamentoMensal)} este mês` : `${moeda(gastoMes)} investidos este mês`;
    verba.appendChild(texto);
    if (conta.orcamentoMensal) {
      const barra = document.createElement('div');
      barra.className = 'tf-orcamento';
      const preenchido = document.createElement('span');
      preenchido.style.width = `${Math.min(100, (gastoMes / conta.orcamentoMensal) * 100)}%`;
      preenchido.classList.toggle('is-estourado', gastoMes > conta.orcamentoMensal);
      barra.appendChild(preenchido);
      verba.appendChild(barra);
    }
    cartao.appendChild(verba);
    if (conta.observacoes.trim()) cartao.appendChild(Object.assign(document.createElement('p'), { className: 'tf-item-texto', textContent: conta.observacoes }));
    grade.appendChild(cartao);
  });
  wrap.appendChild(grade);
  return wrap;
}

function numeroDoCampo(el: HTMLInputElement): number | undefined {
  const n = Number(el.value.replace(',', '.'));
  return el.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
}

function abrirConta(conta: ContaTrafego | null): void {
  let tagIds = [...(conta?.tagIds ?? [])];
  void openCustomModal(
    conta ? 'Editar conta' : 'Nova conta',
    ({ corpo, rodape, fechar }) => {
      const nome = input('text', conta?.nome ?? '', 'Ex.: Hora de Codar');
      const verba = input('number', conta?.orcamentoMensal ? String(conta.orcamentoMensal) : '', 'Ex.: 3000');
      verba.step = '0.01';
      verba.min = '0';
      const obs = textarea(conta?.observacoes ?? '', 'Contato, combinados, acesso às contas de anúncio…', 3);
      corpo.append(campo('Nome', nome), campo('Verba mensal (R$)', verba, 'Opcional. O painel avisa quando o mês passar dela.'));
      if (catalogoTags().length) {
        const tagsWrap = document.createElement('div');
        const desenhar = (): void => {
          const grupo = document.createElement('div');
          grupo.className = 'md-pilulas';
          catalogoTags().forEach((t) => {
            const ativo = tagIds.includes(t.id);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'md-pilula';
            b.classList.toggle('is-ativa', ativo);
            b.setAttribute('aria-pressed', String(ativo));
            b.textContent = t.nome;
            b.addEventListener('click', () => {
              tagIds = ativo ? tagIds.filter((id) => id !== t.id) : [...tagIds, t.id];
              desenhar();
            });
            grupo.appendChild(b);
          });
          tagsWrap.replaceChildren(grupo);
        };
        desenhar();
        corpo.appendChild(campo('Tags da empresa', tagsWrap, 'As mesmas de Postagens, Relatórios e Roteiros.'));
      }
      corpo.appendChild(campo('Observações', obs));
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar', { variante: 'primario' });
      salvar.addEventListener('click', () => {
        void trafegoState
          .salvarConta({ id: conta?.id, nome: nome.value, tagIds, orcamentoMensal: numeroDoCampo(verba), observacoes: obs.value })
          .then(fechar)
          .catch((e) => erroInline(corpo, e));
      });
      rodape.append(cancelar, salvar);
      nome.focus();
    },
    { largura: 540, icone: ICONES.conta, subtitulo: 'Um cliente ou empresa que você atende.' },
  );
}

// ---------- Nova campanha ----------

function abrirNovaCampanha(file: TrafegoFile): void {
  void openCustomModal(
    'Nova campanha',
    ({ corpo, rodape, fechar }) => {
      const nome = input('text', '', 'Ex.: Black Friday — remarketing');
      nome.classList.add('is-grande');
      const conta = select(filtroConta, [{ value: '', label: 'Sem conta' }, ...file.contas.map((c) => ({ value: c.id, label: c.nome }))]);
      const plataforma = select('meta', PLATAFORMAS_TRAFEGO.map((p) => ({ value: p.id, label: p.rotulo })));
      const objetivo = select('conversao', OBJETIVOS_TRAFEGO.map((o) => ({ value: o.id, label: o.rotulo })));
      corpo.append(campo('Nome', nome), campo('Conta', conta), grade2(campo('Plataforma', plataforma), campo('Objetivo', objetivo)));
      const criar = async (): Promise<void> => {
        if (!nome.value.trim()) {
          nome.focus();
          erroInline(corpo, 'Dê um nome à campanha.');
          return;
        }
        try {
          const id = await trafegoState.criarCampanha({
            nome: nome.value,
            contaId: conta.value || undefined,
            plataforma: plataforma.value as PlataformaTrafego,
            objetivo: objetivo.value as ObjetivoTrafego,
          });
          fechar();
          if (id) abrirCampanha(id);
        } catch (erro) {
          erroInline(corpo, erro);
        }
      };
      nome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void criar();
      });
      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const criarBtn = buildBotao('Criar campanha', { icone: ICONES.mais, variante: 'primario' });
      criarBtn.addEventListener('click', () => void criar());
      rodape.append(cancelar, criarBtn);
      nome.focus();
    },
    { largura: 540, icone: ICONES.campanha, subtitulo: 'Nasce em Planejamento. Datas, orçamento, público e resultados vêm depois.' },
  );
}

// ---------- Painel da campanha ----------

async function descarregar(): Promise<void> {
  if (!timerSalvar) return;
  clearTimeout(timerSalvar);
  timerSalvar = null;
  const salvar = salvarPendente;
  salvarPendente = null;
  if (!salvar) return;
  try {
    await salvar();
    painel?.marcarSalvo();
  } catch (erro) {
    painel?.marcarErro(erro);
  }
}

function abrirCampanha(campanhaId: string): void {
  const file = trafegoState.getCurrentState();
  const original = file?.campanhas.find((c) => c.id === campanhaId);
  if (!file || !original) return;
  void descarregar();
  painel?.fechar();
  const c: Campanha = structuredClone(original);

  const handle = abrirPainel({
    icone: ICONES.campanha,
    rotulo: `Campanha #${c.seq}`,
    ariaLabel: `Campanha ${c.nome}`,
    posicao: lerPosicaoLembrada('trafego', 'centro'),
    aoMudarPosicao: (pos) => lembrarPosicao('trafego', pos),
    aoFechar: () => {
      if (painel !== handle) return;
      void descarregar().then(() => {
        painel = null;
        redesenharResultados = null;
        redesenhar();
      });
    },
  });
  painel = handle;
  handle.painel.classList.add('tf-painel-campanha');

  // Campos de texto e de configuração: um salvamento na pausa, sem redesenhar.
  const agendar = (): void => {
    handle.marcarSalvando();
    salvarPendente = () =>
      trafegoState.atualizarSilencioso({
        campanhaId: c.id,
        nome: c.nome,
        contaId: c.contaId,
        siteId: c.siteId,
        plataforma: c.plataforma,
        objetivo: c.objetivo,
        inicio: c.inicio,
        fim: c.fim,
        orcamentoDiario: c.orcamentoDiario,
        orcamentoTotal: c.orcamentoTotal,
        publico: c.publico,
        criativos: c.criativos,
        anotacoes: c.anotacoes,
        links: c.links,
      });
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => void descarregar(), 600);
  };

  const desenharEstado = (): void => handle.estado.replaceChildren(buildSelo(rotulo(STATUS_CAMPANHA, c.status), TOM_STATUS[c.status]));
  desenharEstado();

  // Nome
  const nome = document.createElement('textarea');
  nome.className = 'tf-nome';
  nome.rows = 1;
  nome.value = c.nome;
  nome.placeholder = 'Nome da campanha';
  nome.setAttribute('aria-label', 'Nome da campanha');
  const ajustar = (): void => {
    nome.style.height = 'auto';
    nome.style.height = `${nome.scrollHeight}px`;
  };
  nome.addEventListener('input', () => {
    c.nome = nome.value;
    ajustar();
    agendar();
  });
  nome.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });
  requestAnimationFrame(ajustar);
  handle.corpo.insertBefore(nome, handle.grade);

  // Situação: mover no quadro (vai para o fim da coluna).
  const situacao = document.createElement('div');
  situacao.className = 'md-pilulas tf-situacao';
  const desenharSituacao = (): void => {
    situacao.replaceChildren();
    STATUS_CAMPANHA.forEach((s) => {
      const ativo = c.status === s.id;
      const b = document.createElement('button');
      b.type = 'button';
      // Prefixo próprio: o status 'ativa' viraria 'is-ativa', a classe de pílula marcada.
      b.className = `md-pilula tf-status st-${s.id}`;
      b.classList.toggle('is-ativa', ativo);
      b.setAttribute('aria-pressed', String(ativo));
      b.textContent = s.rotulo;
      b.addEventListener('click', () => {
        if (ativo) return;
        const noDestino = (trafegoState.getCurrentState()?.campanhas ?? []).filter((x) => x.status === s.id).length;
        c.status = s.id;
        desenharSituacao();
        desenharEstado();
        void descarregar()
          .then(() => trafegoState.moverCampanha({ campanhaId: c.id, status: s.id, indice: noDestino }))
          .catch(falhou);
      });
      situacao.appendChild(b);
    });
  };
  desenharSituacao();

  // Configuração
  const config = buildSecaoModal('Configuração');
  const conta = select(c.contaId ?? '', [{ value: '', label: 'Sem conta' }, ...file.contas.map((x) => ({ value: x.id, label: x.nome }))]);
  conta.addEventListener('change', () => {
    c.contaId = conta.value || undefined;
    agendar();
  });
  const site = select(c.siteId ?? '', [{ value: '', label: 'Sem site' }, ...file.sites.map((x) => ({ value: x.id, label: x.nome }))]);
  site.addEventListener('change', () => {
    c.siteId = site.value || undefined;
    agendar();
  });
  const plataforma = select(c.plataforma, PLATAFORMAS_TRAFEGO.map((p) => ({ value: p.id, label: p.rotulo })));
  plataforma.addEventListener('change', () => {
    c.plataforma = plataforma.value as PlataformaTrafego;
    agendar();
  });
  const objetivo = select(c.objetivo, OBJETIVOS_TRAFEGO.map((o) => ({ value: o.id, label: o.rotulo })));
  objetivo.addEventListener('change', () => {
    c.objetivo = objetivo.value as ObjetivoTrafego;
    agendar();
  });
  const inicio = input('date', c.inicio ?? '');
  inicio.addEventListener('change', () => {
    c.inicio = inicio.value || undefined;
    agendar();
  });
  const fim = input('date', c.fim ?? '');
  fim.addEventListener('change', () => {
    c.fim = fim.value || undefined;
    agendar();
  });
  const diario = input('number', c.orcamentoDiario ? String(c.orcamentoDiario) : '', 'R$ por dia');
  diario.step = '0.01';
  diario.min = '0';
  diario.addEventListener('input', () => {
    c.orcamentoDiario = numeroDoCampo(diario);
    agendar();
  });
  const total = input('number', c.orcamentoTotal ? String(c.orcamentoTotal) : '', 'R$ no total');
  total.step = '0.01';
  total.min = '0';
  total.addEventListener('input', () => {
    c.orcamentoTotal = numeroDoCampo(total);
    agendar();
  });
  config.conteudo.append(
    campo('Situação', situacao),
    grade2(campo('Conta', conta), campo('Site de destino', site)),
    grade2(campo('Plataforma', plataforma), campo('Objetivo', objetivo)),
    grade2(campo('Início', inicio), campo('Fim', fim)),
    grade2(campo('Orçamento diário (R$)', diario), campo('Orçamento total (R$)', total)),
  );

  // Resultados: redesenhado a partir do arquivo a cada lançamento.
  const resultados = buildSecaoModal('Resultados', 'Um registro por dia. Importar a planilha da plataforma substitui os dias que ela trouxer.');
  resultados.secao.classList.add('tf-resultados');
  redesenharResultados = (): void => {
    const atual = trafegoState.getCurrentState()?.campanhas.find((x) => x.id === c.id);
    if (!atual) return;
    c.registros = atual.registros;
    // Lançar um dia redesenha a tabela; o foco volta para o mesmo campo (Tab entre células não se perde).
    const ativo = document.activeElement as HTMLElement | null;
    const alvo = ativo && resultados.conteudo.contains(ativo) ? { reg: ativo.dataset.reg, campo: ativo.dataset.campo } : null;
    resultados.conteudo.replaceChildren(buildResultados(c));
    if (alvo?.reg && alvo.campo) {
      resultados.conteudo.querySelector<HTMLElement>(`[data-reg="${alvo.reg}"][data-campo="${alvo.campo}"]`)?.focus();
    }
  };
  redesenharResultados();

  // Público, criativos, links, anotações
  const estrategia = buildSecaoModal('Público e criativos');
  const areaLigada = (valor: string, placeholder: string, linhas: number, aoMudar: (v: string) => void): HTMLTextAreaElement => {
    const area = textarea(valor, placeholder, linhas);
    area.addEventListener('input', () => {
      aoMudar(area.value);
      agendar();
    });
    return area;
  };
  estrategia.conteudo.append(
    campo('Público', areaLigada(c.publico, 'Idade, interesses, localização, públicos semelhantes, remarketing…', 3, (v) => (c.publico = v))),
    campo('Criativos', areaLigada(c.criativos, 'Anúncios no ar, variações de texto e imagem, o que está performando…', 3, (v) => (c.criativos = v))),
  );

  const links = buildSecaoModal('Links', 'Anúncios, pastas de criativos, UTMs, painéis.');
  const desenharLinks = (): void => {
    links.conteudo.replaceChildren();
    const lista = document.createElement('div');
    lista.className = 'tf-links';
    c.links.forEach((l, i) => lista.appendChild(buildLinhaLink(l, () => agendar(), () => {
      c.links.splice(i, 1);
      agendar();
      desenharLinks();
    })));
    links.conteudo.appendChild(lista);
    const novo = buildBotao('Adicionar link', { icone: ICONES.mais, variante: 'secundario' });
    novo.classList.add('is-mini');
    novo.addEventListener('click', () => {
      c.links.push({ id: crypto.randomUUID(), rotulo: '', url: '' });
      desenharLinks();
      links.conteudo.querySelector<HTMLInputElement>('.tf-link:last-child input')?.focus();
    });
    links.conteudo.appendChild(novo);
  };
  desenharLinks();

  const notas = buildSecaoModal('Anotações');
  notas.conteudo.appendChild(areaLigada(c.anotacoes, 'Testes feitos, aprendizados, próximos passos…', 4, (v) => (c.anotacoes = v)));

  handle.grade.append(config.secao, resultados.secao, estrategia.secao, links.secao, notas.secao);

  // Rodapé
  const excluir = buildBotao('Excluir', { icone: ICONES.lixeira, variante: 'fantasma' });
  excluir.classList.add('is-perigo');
  excluir.addEventListener('click', () => {
    void openConfirmModal({ title: 'Excluir campanha', message: `"${c.nome}" e todos os resultados lançados nela serão apagados.` }).then((ok) => {
      if (!ok) return;
      if (timerSalvar) clearTimeout(timerSalvar);
      timerSalvar = null;
      salvarPendente = null;
      painel = null;
      redesenharResultados = null;
      handle.fechar();
      void trafegoState.excluirCampanha(c.id).catch(falhou);
    });
  });
  const duplicar = buildBotao('Duplicar', { icone: ICONES.duplicar, variante: 'fantasma', titulo: 'Nova campanha com a mesma configuração, sem os resultados' });
  duplicar.addEventListener('click', () => {
    void descarregar()
      .then(() => trafegoState.duplicarCampanha(c.id))
      .catch(falhou);
  });
  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  const pronto = buildBotao('Pronto', { variante: 'primario' });
  pronto.addEventListener('click', () => handle.fechar());
  handle.rodape.append(excluir, duplicar, espaco, pronto);
}

function buildLinhaLink(l: LinkCampanha, aoMudar: () => void, aoRemover: () => void): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'tf-link';
  const nome = input('text', l.rotulo, 'Nome (ex.: Pasta de criativos)');
  nome.addEventListener('input', () => {
    l.rotulo = nome.value;
    aoMudar();
  });
  const endereco = input('url', l.url, 'https://…');
  endereco.addEventListener('input', () => {
    l.url = endereco.value;
    aoMudar();
  });
  const abrir = buildBotao('', { icone: ICONES.externo, variante: 'fantasma', titulo: 'Abrir no navegador' });
  abrir.classList.add('is-mini');
  abrir.addEventListener('click', () => {
    const url = /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`;
    if (l.url.trim()) window.irisAPI.system.openExternalLink(url);
  });
  const remover = buildBotao('', { icone: ICONES.xis, variante: 'fantasma', titulo: 'Remover link' });
  remover.classList.add('is-mini', 'is-perigo');
  remover.addEventListener('click', aoRemover);
  linha.append(nome, endereco, abrir, remover);
  return linha;
}

const CAMPOS_REGISTRO: Array<{ chave: keyof Omit<RegistroTrafego, 'id' | 'data'>; rotulo: string; passo: string }> = [
  { chave: 'investimento', rotulo: 'Investido (R$)', passo: '0.01' },
  { chave: 'impressoes', rotulo: 'Impressões', passo: '1' },
  { chave: 'cliques', rotulo: 'Cliques', passo: '1' },
  { chave: 'conversoes', rotulo: 'Conversões', passo: '1' },
  { chave: 'receita', rotulo: 'Receita (R$)', passo: '0.01' },
];

function buildResultados(c: Campanha): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tf-resultados-corpo';

  const m = metricasDe(c.registros);
  const resumo = document.createElement('dl');
  resumo.className = 'tf-resumo';
  const par = (dt: string, dd: string): void => {
    const d = document.createElement('div');
    d.append(Object.assign(document.createElement('dt'), { textContent: dt }), Object.assign(document.createElement('dd'), { textContent: dd }));
    resumo.appendChild(d);
  };
  par('Investido', moeda(m.investimento));
  par('Impressões', formatarNumero(m.impressoes));
  par('Cliques', formatarNumero(m.cliques));
  par('CTR', pct(m.ctr));
  par('CPC', talvez(m.cpc, moeda));
  par('CPM', talvez(m.cpm, moeda));
  par('Conversões', formatarNumero(m.conversoes));
  par('CPA', talvez(m.cpa, moeda));
  par('Receita', moeda(m.receita));
  par('ROAS', talvez(m.roas, (v) => `${formatarNumero(v, 2)}×`));
  wrap.appendChild(resumo);

  const acoes = document.createElement('div');
  acoes.className = 'tf-resultados-acoes';
  const importar = buildBotao('Importar planilha', { icone: ICONES.importar, variante: 'secundario', titulo: 'CSV ou Excel exportado do Meta Ads, Google Ads, TikTok…' });
  importar.classList.add('is-mini');
  importar.addEventListener('click', () => {
    void descarregar()
      .then(() => trafegoState.importarRegistros(c.id))
      .then((r) => {
        if (r.importados === null) return;
        const detalhes = [
          `${r.importados} dia${r.importados === 1 ? '' : 's'} importado${r.importados === 1 ? '' : 's'}.`,
          r.ignorados ? `${r.ignorados} linha(s) sem data válida ficaram de fora.` : '',
          r.colunasLidas.length ? `\nColunas lidas:\n${r.colunasLidas.join('\n')}` : '',
        ].filter(Boolean);
        return openAvisoModal('Planilha importada', detalhes.join(' '));
      })
      .catch(falhou);
  });
  acoes.appendChild(importar);
  wrap.appendChild(acoes);

  // Linha para lançar um dia novo (hoje, por padrão).
  const tabelaWrap = document.createElement('div');
  tabelaWrap.className = 'tf-tabela-wrap';
  const tabela = document.createElement('table');
  tabela.className = 'tf-tabela tf-registros';
  const cab = document.createElement('thead');
  const tr = document.createElement('tr');
  ['Dia', ...CAMPOS_REGISTRO.map((x) => x.rotulo), ''].forEach((t, i) => {
    const th = document.createElement('th');
    th.textContent = t;
    if (i > 0) th.className = 'tf-num';
    tr.appendChild(th);
  });
  cab.appendChild(tr);
  const corpo = document.createElement('tbody');

  const linhaEditavel = (r: RegistroTrafego | null): HTMLTableRowElement => {
    const linha = document.createElement('tr');
    linha.classList.toggle('is-novo', !r);
    const base: RegistroTrafego = r ? { ...r } : { id: '', data: hojeIso(), investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0 };
    const salvar = (): void => {
      if (!base.data) return;
      void trafegoState
        .salvarRegistro({ campanhaId: c.id, registro: { ...base, id: r ? base.id : undefined } })
        .catch(falhou);
    };
    const tdData = document.createElement('td');
    const dia = input('date', base.data);
    dia.setAttribute('aria-label', 'Dia');
    dia.dataset.reg = r ? r.id : 'novo';
    dia.dataset.campo = 'data';
    dia.addEventListener('change', () => {
      base.data = dia.value;
      if (r) salvar();
    });
    tdData.appendChild(dia);
    linha.appendChild(tdData);
    CAMPOS_REGISTRO.forEach((campoReg) => {
      const td = document.createElement('td');
      td.className = 'tf-num';
      const valor = input('number', r ? String(base[campoReg.chave]) : '', '0');
      valor.step = campoReg.passo;
      valor.min = '0';
      valor.setAttribute('aria-label', campoReg.rotulo);
      valor.dataset.reg = r ? r.id : 'novo';
      valor.dataset.campo = campoReg.chave;
      valor.addEventListener('change', () => {
        const n = Number(valor.value.replace(',', '.'));
        base[campoReg.chave] = Number.isFinite(n) && n >= 0 ? n : 0;
        if (r) salvar();
      });
      td.appendChild(valor);
      linha.appendChild(td);
    });
    const tdAcao = document.createElement('td');
    if (r) {
      const remover = buildBotao('', { icone: ICONES.xis, variante: 'fantasma', titulo: 'Remover este dia' });
      remover.classList.add('is-mini', 'is-perigo');
      remover.addEventListener('click', () => void trafegoState.removerRegistro({ campanhaId: c.id, registroId: r.id }).catch(falhou));
      tdAcao.appendChild(remover);
    } else {
      const lancar = buildBotao('Lançar', { icone: ICONES.mais, variante: 'primario' });
      lancar.classList.add('is-mini');
      lancar.title = 'Grava o dia (substitui, se ele já existir)';
      lancar.addEventListener('click', salvar);
      tdAcao.appendChild(lancar);
    }
    linha.appendChild(tdAcao);
    return linha;
  };

  corpo.appendChild(linhaEditavel(null));
  // Mais recente em cima: é o que se confere todo dia.
  c.registros
    .slice()
    .reverse()
    .forEach((r) => corpo.appendChild(linhaEditavel(r)));
  tabela.append(cab, corpo);
  tabelaWrap.appendChild(tabela);
  wrap.appendChild(tabelaWrap);
  if (!c.registros.length) {
    wrap.appendChild(Object.assign(document.createElement('p'), { className: 'md-dica', textContent: 'Nenhum dia lançado ainda. Preencha a primeira linha e clique em Lançar, ou importe a planilha.' }));
  }
  return wrap;
}
