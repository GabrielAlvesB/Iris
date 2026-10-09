import { FASES_POSTAGEM, PRIORIDADES } from '../../../shared/types/postagens.types.js';
import {
  COR_POR_SENTIDO,
  SENTIDOS_FAIXA,
  descreverEscala,
  escalaDaPostagem,
  escalaDoRecorte,
  faixaDaEscala,
  intervaloDaFaixa,
  metaDaEscala,
  type EscalaScore,
  type SentidoFaixa,
} from '../../../shared/types/score.types.js';
import { buildBotao, buildSegmentado, buildSelo, buildVazio, svg, type Tom } from '../../ui/pagina.js';
import { abrirEscalas } from './postagens.escalas.js';
import {
  COR_SERIE,
  buildCartaoGrafico,
  buildColunas,
  buildLegenda,
  buildLinha,
  buildMiniLinha,
  buildRanking,
  esconderTooltip,
  formatarNumero,
  type LinhaRanking,
} from './postagens.graficos.js';
import type { Fonte, Postagem } from './postagens.fonte.js';
import { DIAS_CURTOS, MESES_CURTOS, buildNavegadorPeriodo, partesData, somarMeses, tituloDaSemana, tituloDoMes } from './postagens.periodo.js';
import { ICONES_POSTAGEM, atrasado, buildPrioridade, buildRedeBadge, buildTagChip, hojeIso, inicioDaSemana, somarDias, tituloExibido } from './postagens.ui.js';

/**
 * Aba Métricas: números da produção e do score (0–100 que o usuário traz da
 * planilha ou dá no painel), do tipo de postagem escolhido. Os filtros da
 * barra continuam valendo — as métricas são sempre sobre o que está filtrado.
 *
 * A tela é lida de cima para baixo como um relatório: resumo do período,
 * produção, qualidade, onde funciona melhor, destaques e, no fim, a
 * conferência (que é tarefa, não leitura). Prefixo de CSS `mt-` — o `rl-`
 * antigo era dividido com Relatórios de leads e o leads.css sobrescrevia a grade.
 *
 * (Não confundir com o módulo Relatórios, que monta documentos de análise.)
 */

type Periodo = 'semana' | 'mes' | '3' | '6' | '12' | 'ano' | 'tudo';
type Base = 'publicados' | 'todos';

export interface MetricasOpcoes {
  visivel: (item: Postagem) => boolean;
  abrir: (videoId: string) => void;
  falhou: (erro: unknown) => void;
  redesenhar: () => void;
}

const CHAVE_PREFS = 'iris.postagens.metricas';
const PERIODOS: readonly Periodo[] = ['semana', 'mes', '3', '6', '12', 'ano', 'tudo'];

/** Período e base voltam como estavam (conveniência da tela; nada disso é dado). */
function lerPrefs(): { periodo: Periodo; base: Base } {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFS) ?? '{}') as { periodo?: unknown; base?: unknown };
    return {
      periodo: PERIODOS.includes(p.periodo as Periodo) ? (p.periodo as Periodo) : '6',
      base: p.base === 'todos' ? 'todos' : 'publicados',
    };
  } catch {
    return { periodo: '6', base: 'publicados' };
  }
}

function gravarPrefs(): void {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify({ periodo, base }));
  } catch {
    // Sem localStorage a tela só não lembra a escolha.
  }
}

const prefsIniciais = lerPrefs();
let periodo: Periodo = prefsIniciais.periodo;
/** Semana ou mês exibido quando o período é "Semana"/"Mês" (navegável com as setas). */
let referencia = hojeIso();
let base: Base = prefsIniciais.base;

const MAX_MESES_TUDO = 24;

// ---------- Cálculos puros ----------

/**
 * Data que conta para as métricas. Publicado: a data agendada (o dia em que
 * foi ao ar); `publicadoEm` só quando não há data, porque ele marca a mudança
 * de etapa — num lote importado já publicado, seria o dia da importação.
 * Exportada porque o bloco de métricas dos Relatórios conta pela mesma regra.
 */
export function dataParaMetricas(video: Pick<Postagem, 'status' | 'dataAgendada' | 'publicadoEm'>, base: Base): string | undefined {
  if (base === 'publicados') {
    if (video.status !== 'publicado') return undefined;
    return video.dataAgendada ?? video.publicadoEm?.slice(0, 10);
  }
  if (video.status === 'arquivado') return undefined;
  return video.dataAgendada ?? (video.status === 'publicado' ? video.publicadoEm?.slice(0, 10) : undefined);
}

function chaveMes(data: string): string {
  return data.slice(0, 7);
}

function rotuloMes(chave: string, comAno: boolean): string {
  const [a, m] = chave.split('-').map(Number);
  return `${MESES_CURTOS[m! - 1]}${comAno ? `/${String(a).slice(2)}` : ''}`;
}

function mesesDoPeriodo(datas: string[]): string[] {
  const hoje = hojeIso();
  const [ha, hm] = hoje.split('-').map(Number) as [number, number];
  const voltar = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(ha, hm - 1 - (n - 1 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  if (periodo === '3' || periodo === '6' || periodo === '12') return voltar(Number(periodo));
  if (periodo === 'ano') return voltar(hm);
  // "Tudo": do primeiro ao último mês com postagem (no máximo os 24 mais recentes).
  if (!datas.length) return voltar(1);
  const ordenadas = [...datas].sort();
  const [ia, im] = ordenadas[0]!.split('-').map(Number) as [number, number];
  const [fa, fm] = ordenadas[ordenadas.length - 1]!.split('-').map(Number) as [number, number];
  const total = (fa - ia) * 12 + (fm - im) + 1;
  const meses = Array.from({ length: total }, (_, i) => {
    const d = new Date(ia, im - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  return meses.slice(-MAX_MESES_TUDO);
}

/** Agrupamento do período: um balde por dia (Semana/Mês) ou por mês (o resto). */
interface Baldes {
  chaves: string[];
  rotulos: string[];
  chaveDe: (data: string) => string;
  unidade: 'dia' | 'mês';
}

function baldesDoPeriodo(fonte: Fonte, datas: string[]): Baldes {
  if (periodo === 'semana' || periodo === 'mes') {
    let dias: string[];
    if (periodo === 'semana') {
      const inicio = inicioDaSemana(referencia, fonte.catalogo.preferencias.inicioDaSemana);
      dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
    } else {
      const [a, m] = partesData(referencia);
      const total = new Date(a, m, 0).getDate();
      dias = Array.from({ length: total }, (_, i) => `${a}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    }
    return {
      chaves: dias,
      rotulos: dias.map((dia) => {
        const [a, m, d] = partesData(dia);
        return periodo === 'semana' ? `${DIAS_CURTOS[new Date(a, m - 1, d).getDay()]} ${d}` : `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
      }),
      chaveDe: (data) => data,
      unidade: 'dia',
    };
  }
  const meses = mesesDoPeriodo(datas);
  const comAno = new Set(meses.map((m) => m.slice(0, 4))).size > 1;
  return { chaves: meses, rotulos: meses.map((m) => rotuloMes(m, comAno)), chaveDe: chaveMes, unidade: 'mês' };
}

/** "21 – 27 de setembro de 2026" ou "setembro de 2026". */
function tituloDaJanela(fonte: Fonte): string {
  return periodo === 'mes' ? tituloDoMes(referencia) : tituloDaSemana(referencia, fonte.catalogo.preferencias.inicioDaSemana);
}

function moverJanela(sentido: number): void {
  referencia = periodo === 'semana' ? somarDias(referencia, sentido * 7) : somarMeses(referencia, sentido);
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function scores(videos: Postagem[]): number[] {
  return videos.map((v) => v.score).filter((s): s is number => typeof s === 'number');
}

const TOM_DO_SENTIDO: Record<SentidoFaixa, Tom> = { positivo: 'ok', mediano: 'atencao', negativo: 'erro' };

function tomDaFaixa(escala: EscalaScore, score: number): Tom {
  return TOM_DO_SENTIDO[faixaDaEscala(escala, score).sentido];
}

/** Média de um grupo lida pela escala do próprio grupo (a da empresa, se é uma só). */
function escalaDoGrupo(fonte: Fonte, videos: Postagem[]): EscalaScore {
  return escalaDoRecorte(fonte.catalogo, videos).escala;
}

function escalaDe(fonte: Fonte, v: Postagem): EscalaScore {
  return escalaDaPostagem(fonte.catalogo, v.tagIds);
}

// ---------- Peças da tela ----------

function elemento<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto !== undefined) no.textContent = texto;
  return no;
}

/** Seção da página: título curto, a pergunta que ela responde e os cartões em N colunas. */
function buildSecao(titulo: string, pergunta: string, cartoes: HTMLElement[], colunas = cartoes.length): HTMLElement {
  const secao = elemento('section', 'mt-secao');
  const cab = elemento('header', 'mt-secao-cab');
  cab.append(elemento('h2', undefined, titulo), elemento('p', undefined, pergunta));
  const grade = elemento('div', 'mt-grade');
  grade.style.setProperty('--colunas', String(Math.max(1, colunas)));
  grade.append(...cartoes);
  secao.append(cab, grade);
  return secao;
}

function buildControles(fonte: Fonte, opcoes: MetricasOpcoes): HTMLElement {
  const barra = elemento('div', 'mt-controles');
  const periodoSeg = buildSegmentado<Periodo>(
    [
      { value: 'semana', label: 'Semana' },
      { value: 'mes', label: 'Mês' },
      { value: '3', label: '3 meses' },
      { value: '6', label: '6 meses' },
      { value: '12', label: '12 meses' },
      { value: 'ano', label: 'Este ano' },
      { value: 'tudo', label: 'Tudo' },
    ],
    periodo,
    (v) => {
      periodo = v;
      // Ao entrar em Semana/Mês, começa no período atual.
      if (v === 'semana' || v === 'mes') referencia = hojeIso();
      gravarPrefs();
      opcoes.redesenhar();
    },
  );
  barra.appendChild(periodoSeg);

  if (periodo === 'semana' || periodo === 'mes') {
    const semana = periodo === 'semana';
    const hoje = hojeIso();
    const primeiro = fonte.catalogo.preferencias.inicioDaSemana;
    const mudar = (acao: () => void): (() => void) => () => {
      acao();
      opcoes.redesenhar();
    };
    barra.appendChild(
      buildNavegadorPeriodo({
        titulo: tituloDaJanela(fonte),
        unidade: semana ? 'semana' : 'mês',
        rotuloAtual: semana ? 'Esta semana' : 'Este mês',
        noAtual: semana ? inicioDaSemana(referencia, primeiro) === inicioDaSemana(hoje, primeiro) : referencia.slice(0, 7) === hoje.slice(0, 7),
        anterior: mudar(() => moverJanela(-1)),
        atual: mudar(() => (referencia = hoje)),
        proximo: mudar(() => moverJanela(1)),
      }),
    );
  }

  const baseSeg = buildSegmentado<Base>(
    [
      { value: 'publicados', label: 'Publicados' },
      { value: 'todos', label: 'Todos com data' },
    ],
    base,
    (v) => {
      base = v;
      gravarPrefs();
      opcoes.redesenhar();
    },
  );
  baseSeg.title =
    base === 'publicados'
      ? 'Conta as postagens publicadas, pelo dia em que foram ao ar.'
      : 'Conta tudo que tem data: publicado, agendado ou em produção.';
  baseSeg.classList.add('mt-base');
  barra.appendChild(baseSeg);

  const escalas = buildBotao('Escalas', {
    icone: '<path d="M3 3v18h18"/><path d="M7 15h3"/><path d="M7 11h7"/><path d="M7 7h11"/>',
    variante: 'fantasma',
    titulo: 'Definir as faixas do score (de quanto a quanto é positivo, mediano…) e a escala de cada empresa',
  });
  escalas.classList.add('mt-escalas');
  escalas.addEventListener('click', () => abrirEscalas(opcoes.redesenhar));
  barra.appendChild(escalas);
  return barra;
}

function buildRankingPor<T>(
  fonte: Fonte,
  grupos: Array<{ chave: T; rotulo: HTMLElement; videos: Postagem[] }>,
  descricao: string,
): HTMLElement {
  const linhas: LinhaRanking[] = grupos
    .filter((g) => g.videos.length > 0)
    .map((g) => {
      const s = scores(g.videos);
      const m = media(s);
      return {
        rotulo: g.rotulo,
        valor: m,
        cor: m === null ? undefined : faixaDaEscala(escalaDoGrupo(fonte, g.videos), m).cor,
        detalhe: `${g.videos.length} postage${g.videos.length > 1 ? 'ns' : 'm'}${s.length < g.videos.length ? ` · ${g.videos.length - s.length} sem score` : ''}`,
      };
    })
    .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1));
  if (!linhas.length) return elemento('p', 'mt-vazio', 'Nada no período.');
  return buildRanking(linhas, descricao);
}

function rotuloTexto(texto: string): HTMLElement {
  return elemento('span', 'mt-rotulo-texto', texto);
}

function buildListaVideos(fonte: Fonte, videos: Postagem[], opcoes: MetricasOpcoes): HTMLElement {
  return buildRanking(
    videos.map((v) => ({
      rotulo: rotuloTexto(tituloExibido(fonte.catalogo, v)),
      valor: v.score ?? null,
      cor: v.score === undefined ? undefined : faixaDaEscala(escalaDe(fonte, v), v.score).cor,
      detalhe: [
        v.dataAgendada ? v.dataAgendada.split('-').reverse().slice(0, 2).join('/') : '—',
        ...(v.score === undefined ? [] : [faixaDaEscala(escalaDe(fonte, v), v.score).rotulo]),
      ].join(' · '),
      aoClicar: () => opcoes.abrir(v.id),
    })),
    'Postagens por score',
  );
}

// ---------- Resumo ----------

interface DadosResumo {
  notaFinal: number | null;
  escala: EscalaScore;
  mediasMes: Array<number | null>;
  total: number;
  comScore: number;
  porUnidade: number;
  unidade: 'dia' | 'mês';
  melhor: { rotulo: string; valor: number } | null;
}

/** A nota do período em destaque, com a forma da evolução; três números de apoio ao lado. */
function buildResumo(fonte: Fonte, d: DadosResumo): HTMLElement {
  const resumo = elemento('section', 'mt-resumo');

  const destaque = elemento('div', 'mt-destaque');
  destaque.appendChild(elemento('span', 'mt-rotulo', 'Nota final do período'));
  const linha = elemento('div', 'mt-destaque-linha');
  const numero = elemento('strong', 'mt-destaque-numero', d.notaFinal === null ? '—' : formatarNumero(d.notaFinal, 1));
  linha.appendChild(numero);
  if (d.mediasMes.filter((v) => v !== null).length >= 2) {
    const mini = buildMiniLinha(d.mediasMes, `Evolução do score médio por ${d.unidade}`, d.notaFinal === null ? undefined : faixaDaEscala(d.escala, d.notaFinal).cor);
    linha.appendChild(mini);
  }
  destaque.appendChild(linha);
  const rodape = elemento('div', 'mt-destaque-rodape');
  if (d.notaFinal === null) rodape.appendChild(elemento('span', undefined, 'Nenhuma postagem do período tem score ainda.'));
  else {
    rodape.appendChild(buildSelo(faixaDaEscala(d.escala, d.notaFinal).rotulo, tomDaFaixa(d.escala, d.notaFinal)));
    rodape.appendChild(elemento('span', undefined, `escala ${d.escala.nome}`));
  }
  destaque.appendChild(rodape);

  const apoio = elemento('dl', 'mt-apoio');
  const item = (rotulo: string, valor: string, detalhe: string, alerta = false): void => {
    const bloco = elemento('div', `mt-apoio-item${alerta ? ' is-alerta' : ''}`);
    bloco.append(elemento('dt', undefined, rotulo), elemento('dd', 'mt-apoio-valor', valor), elemento('dd', 'mt-apoio-detalhe', detalhe));
    apoio.appendChild(bloco);
  };
  const plural = fonte.tipo === 'imagem' ? 'as' : 'os';
  item(
    base === 'publicados' ? `${fonte.rotulo} publicad${plural}` : `${fonte.rotulo} com data`,
    formatarNumero(d.total),
    `${formatarNumero(d.porUnidade, 1)} por ${d.unidade}`,
  );
  item('Com score', `${d.comScore} de ${d.total}`, d.comScore === d.total ? 'todos preenchidos' : `${d.total - d.comScore} sem score — veja a conferência no fim`, d.comScore < d.total);
  item(`Melhor ${d.unidade}`, d.melhor ? d.melhor.rotulo : '—', d.melhor ? `média ${formatarNumero(d.melhor.valor, 1)}` : 'sem scores');

  resumo.append(destaque, apoio);
  return resumo;
}

// ---------- Pipeline agora ----------

/**
 * Quantas postagens estão em cada etapa agora — os números que ficavam numa
 * faixa no topo da pipeline. É o retrato do momento: o período não vale aqui,
 * os filtros da barra (tag, rede, prioridade) valem.
 */
function buildPipelineAgora(fonte: Fonte, opcoes: MetricasOpcoes): HTMLElement {
  const ativos = fonte.itens.filter((v) => v.status !== 'arquivado' && opcoes.visivel(v));
  const contagem = new Map<string, number>();
  ativos.forEach((v) => contagem.set(v.status, (contagem.get(v.status) ?? 0) + 1));
  const maior = Math.max(1, ...contagem.values());

  const corpo = elemento('div', 'mt-pipeline');
  FASES_POSTAGEM.forEach((fase) => {
    const etapas = fonte.etapas.filter((e) => e.fase === fase.id);
    if (!etapas.length) return;
    const grupo = elemento('div', `mt-pipeline-fase is-fase-${fase.id}`);
    const total = etapas.reduce((t, e) => t + (contagem.get(e.id) ?? 0), 0);
    const cab = elemento('div', 'mt-pipeline-cab');
    cab.append(elemento('span', undefined, fase.rotulo), elemento('span', 'mt-pipeline-total', String(total)));
    grupo.appendChild(cab);
    grupo.appendChild(
      buildRanking(
        etapas.map((e) => {
          const n = contagem.get(e.id) ?? 0;
          return {
            rotulo: rotuloTexto(e.rotulo),
            valor: n ? (n / maior) * 100 : null,
            textoValor: String(n),
            cor: `var(--vd-fase-${fase.id})`,
            detalhe: '',
          };
        }),
        `Postagens em ${fase.rotulo}`,
        '0',
      ),
    );
    corpo.appendChild(grupo);
  });

  const vencidas = ativos.filter((v) => atrasado(v)).length;
  const nota = elemento('div', 'mt-pipeline-nota');
  nota.appendChild(
    vencidas
      ? buildSelo(`${vencidas} com data vencida sem publicar`, 'erro')
      : buildSelo('Nenhuma data vencida', 'ok'),
  );
  corpo.appendChild(nota);

  return buildCartaoGrafico('Pipeline agora', `Onde estão as ${ativos.length} postagens não arquivadas, hoje — não depende do período`, corpo, {
    colunas: ['Fase', 'Etapa', 'Postagens'],
    linhas: fonte.etapas
      .filter((e) => e.fase !== 'fora')
      .map((e) => [FASES_POSTAGEM.find((f) => f.id === e.fase)?.rotulo ?? '', e.rotulo, String(contagem.get(e.id) ?? 0)]),
  });
}

// ---------- Conferência ----------

/** Médias gerais, cobertura e preenchimento rápido de quem está sem score. Recolhível: é tarefa, não leitura. */
function buildConferencia(fonte: Fonte, noPeriodo: Postagem[], opcoes: MetricasOpcoes): HTMLElement {
  const ativos = fonte.itens.filter((v) => v.status !== 'arquivado' && opcoes.visivel(v));
  const publicados = ativos.filter((v) => v.status === 'publicado');
  const semScore = ativos.filter((v) => v.score === undefined);

  const secao = elemento('details', 'mt-conferencia');
  secao.open = semScore.length > 0;
  const resumo = elemento('summary', 'mt-conferencia-resumo');
  const textos = elemento('div');
  textos.append(elemento('h2', undefined, 'Conferência dos scores'), elemento('p', undefined, 'Todas as postagens têm score? Qual é a média de cada recorte?'));
  resumo.append(
    textos,
    semScore.length ? buildSelo(`${semScore.length} sem score`, 'atencao') : buildSelo('Todas com score', 'ok'),
  );
  secao.appendChild(resumo);

  const corpo = elemento('div', 'mt-conferencia-corpo');
  const medias = elemento('div', 'mt-medias');
  const blocoMedia = (rotulo: string, videos: Postagem[]): void => {
    const s = scores(videos);
    const m = media(s);
    const bloco = elemento('div', 'mt-media');
    bloco.append(elemento('span', 'mt-rotulo', rotulo), elemento('strong', undefined, m === null ? '—' : formatarNumero(m, 1)));
    if (m !== null) {
      const escala = escalaDoGrupo(fonte, videos);
      bloco.appendChild(buildSelo(faixaDaEscala(escala, m).rotulo, tomDaFaixa(escala, m)));
    }
    const cobertura = videos.length ? s.length / videos.length : 0;
    const trilho = elemento('div', 'mt-cobertura');
    trilho.title = `${s.length} de ${videos.length} com score`;
    const barra = elemento('i');
    barra.style.width = `${Math.round(cobertura * 100)}%`;
    barra.classList.toggle('is-completo', cobertura === 1 && videos.length > 0);
    trilho.appendChild(barra);
    bloco.append(trilho, elemento('span', 'mt-media-detalhe', `${s.length} de ${videos.length} com score`));
    medias.appendChild(bloco);
  };
  blocoMedia('Período selecionado', noPeriodo);
  blocoMedia('Todos os publicados', publicados);
  blocoMedia('Todas as postagens', ativos);
  corpo.appendChild(medias);

  if (semScore.length) {
    corpo.appendChild(elemento('p', 'mt-nota', 'Sem score — preencha aqui mesmo (0 a 100); Enter salva.'));
    const lista = elemento('div', 'mt-sem-lista');
    semScore.slice(0, 30).forEach((v) => {
      const linha = elemento('div', 'mt-sem-linha');
      const titulo = elemento('button', 'mt-sem-nome', tituloExibido(fonte.catalogo, v));
      titulo.type = 'button';
      titulo.title = 'Abrir a postagem';
      titulo.addEventListener('click', () => opcoes.abrir(v.id));
      const campo = elemento('input', 'md-input mt-sem-campo');
      campo.type = 'number';
      campo.min = '0';
      campo.max = '100';
      campo.step = '0.1';
      campo.placeholder = '0–100';
      campo.setAttribute('aria-label', `Score de ${v.titulo}`);
      const salvar = (): void => {
        const n = Number(campo.value.replace(',', '.'));
        if (campo.value === '' || Number.isNaN(n) || n < 0 || n > 100) {
          campo.classList.add('is-invalido');
          return;
        }
        campo.disabled = true;
        void fonte.definirScore(v.id, n).catch(opcoes.falhou);
      };
      campo.addEventListener('keydown', (e) => {
        campo.classList.remove('is-invalido');
        if (e.key === 'Enter') salvar();
      });
      campo.addEventListener('change', salvar);
      linha.append(titulo, campo);
      lista.appendChild(linha);
    });
    if (semScore.length > 30) lista.appendChild(elemento('p', 'mt-nota', `e mais ${semScore.length - 30}…`));
    corpo.appendChild(lista);
  }
  secao.appendChild(corpo);
  return secao;
}

// ---------- Montagem ----------

export function buildMetricas(fonte: Fonte, opcoes: MetricasOpcoes): HTMLElement {
  esconderTooltip();
  const tela = elemento('div', 'mt-tela');
  tela.appendChild(buildControles(fonte, opcoes));

  const comData = fonte.itens
    .filter((v) => opcoes.visivel(v))
    .map((v) => ({ v, data: dataParaMetricas(v, base) }))
    .filter((x): x is { v: Postagem; data: string } => Boolean(x.data));
  const baldes = baldesDoPeriodo(fonte, comData.map((x) => x.data));
  const meses = baldes.chaves;
  const unidade = baldes.unidade;
  const noPeriodo = comData.filter((x) => meses.includes(baldes.chaveDe(x.data)));
  const videosPeriodo = noPeriodo.map((x) => x.v);
  const porMes = new Map(meses.map((m) => [m, [] as Postagem[]]));
  noPeriodo.forEach((x) => porMes.get(baldes.chaveDe(x.data))?.push(x.v));
  const rotulos = baldes.rotulos;

  if (!videosPeriodo.length) {
    tela.appendChild(
      buildVazio(
        ICONES_POSTAGEM.calendario,
        base === 'publicados' ? 'Nenhuma postagem publicada no período' : 'Nenhuma postagem com data no período',
        periodo === 'semana' || periodo === 'mes'
          ? `Nada em ${tituloDaJanela(fonte)}. Use as setas para ver ${periodo === 'semana' ? 'outra semana' : 'outro mês'}, ou mude para "Todos com data".`
          : 'Troque o período acima, mude para "Todos com data" ou limpe os filtros da barra.',
      ),
    );
    tela.appendChild(buildSecao('Produção', 'O que está em andamento agora', [buildPipelineAgora(fonte, opcoes)]));
    tela.appendChild(buildConferencia(fonte, videosPeriodo, opcoes));
    return tela;
  }

  // Régua das médias: a escala das empresas do recorte, se for uma só.
  const { escala, misturada } = escalaDoRecorte(fonte.catalogo, videosPeriodo);
  const meta = metaDaEscala(escala);
  if (misturada) tela.appendChild(buildAvisoMistura(escala));

  // 1. Resumo
  const s = scores(videosPeriodo);
  const notaFinal = media(s);
  const mediasMes = meses.map((m) => media(scores(porMes.get(m) ?? [])));
  const melhor = mediasMes.reduce<{ i: number; v: number } | null>((acc, v, i) => (v !== null && (!acc || v > acc.v) ? { i, v } : acc), null);
  tela.appendChild(
    buildResumo(fonte, {
      notaFinal,
      escala,
      mediasMes,
      total: videosPeriodo.length,
      comScore: s.length,
      porUnidade: videosPeriodo.length / meses.length,
      unidade,
      melhor: melhor ? { rotulo: rotulos[melhor.i]!, valor: melhor.v } : null,
    }),
  );

  // 2. Produção: quanto saiu por mês e onde está o resto agora.
  const publicadosMes = meses.map((m) => (porMes.get(m) ?? []).filter((v) => v.status === 'publicado').length);
  const outrosMes = meses.map((m) => (porMes.get(m) ?? []).filter((v) => v.status !== 'publicado').length);
  const series =
    base === 'publicados'
      ? [{ nome: 'Publicados', cor: COR_SERIE[0], valores: publicadosMes }]
      : [
          { nome: 'Publicados', cor: COR_SERIE[0], valores: publicadosMes },
          { nome: 'Programados', cor: COR_SERIE[1], valores: outrosMes },
        ];
  const porPeriodo = buildCartaoGrafico(
    `${fonte.rotulo} por ${unidade}`,
    base === 'publicados' ? `Quantos foram ao ar em cada ${unidade}` : `Publicados e ainda programados, por ${unidade}`,
    buildColunas(rotulos, series, `${fonte.rotulo} por ${unidade}`, (n) => formatarNumero(n)),
    {
      colunas: [unidade === 'dia' ? 'Dia' : 'Mês', ...series.map((x) => x.nome), ...(series.length > 1 ? ['Total'] : [])],
      linhas: meses.map((_, i) => [
        rotulos[i]!,
        ...series.map((x) => formatarNumero(x.valores[i] ?? 0)),
        ...(series.length > 1 ? [formatarNumero(series.reduce((t, x) => t + (x.valores[i] ?? 0), 0))] : []),
      ]),
    },
    series.length > 1 ? buildLegenda(series) : undefined,
  );
  tela.appendChild(buildSecao('Produção', 'Quanto saiu no período e o que está em andamento agora', [porPeriodo, buildPipelineAgora(fonte, opcoes)]));

  // 3. Qualidade: a linha do score e como ele se distribui nas faixas.
  const linhaScore = buildCartaoGrafico(
    `Score médio por ${unidade}`,
    [
      notaFinal === null ? 'Ainda sem scores no período' : `Tracejado cinza = nota final (${formatarNumero(notaFinal, 1)})`,
      meta === undefined ? `a escala ${escala.nome} não tem faixa positiva` : `verde = meta ${meta.toLocaleString('pt-BR')}`,
    ].join(' · '),
    buildLinha(
      rotulos,
      mediasMes,
      [
        ...(meta === undefined ? [] : [{ valor: meta, rotulo: `meta ${meta.toLocaleString('pt-BR')}`, classe: 'is-meta' }]),
        ...(notaFinal === null ? [] : [{ valor: notaFinal, rotulo: 'média' }]),
      ],
      `Score médio por ${unidade}`,
    ),
    {
      colunas: [unidade === 'dia' ? 'Dia' : 'Mês', 'Score médio', 'Com score'],
      linhas: meses.map((m, i) => [rotulos[i]!, mediasMes[i] === null ? '—' : formatarNumero(mediasMes[i]!, 1), String(scores(porMes.get(m) ?? []).length)]),
    },
  );

  // Uma escala só: as faixas dela. Escalas misturadas não têm faixas em comum —
  // conta pelo sentido (positivo, mediano, negativo), cada postagem pela faixa da própria escala.
  const comScoreNoPeriodo = videosPeriodo.filter((v) => v.score !== undefined);
  const distribuicao = misturada
    ? SENTIDOS_FAIXA.map((sentido) => ({
        rotulo: sentido.rotulo,
        cor: COR_POR_SENTIDO[sentido.id],
        total: comScoreNoPeriodo.filter((v) => faixaDaEscala(escalaDe(fonte, v), v.score!).sentido === sentido.id).length,
      })).filter((d, i) => d.total > 0 || i !== 1)
    : escala.faixas.map((f, i) => ({
        rotulo: `${f.rotulo} ${intervaloDaFaixa(escala, i)}`,
        cor: f.cor,
        total: s.filter((n) => faixaDaEscala(escala, n).id === f.id).length,
      }));
  const pct = (n: number): string => `${s.length ? Math.round((n / s.length) * 100) : 0}%`;
  const distribuicaoCartao = buildCartaoGrafico(
    'Distribuição dos scores',
    misturada ? 'Por sentido da faixa — cada postagem pela escala da sua empresa' : `Quantas caíram em cada faixa da escala ${escala.nome}`,
    buildColunas(
      distribuicao.map((d) => d.rotulo),
      [{ nome: fonte.rotulo, cor: COR_SERIE[0], valores: distribuicao.map((d) => d.total) }],
      'Distribuição dos scores por faixa',
      (n) => `${n} · ${pct(n)}`,
      distribuicao.map((d) => d.cor),
    ),
    {
      colunas: [misturada ? 'Sentido' : 'Faixa', fonte.rotulo, '%'],
      linhas: distribuicao.map((d) => [d.rotulo, String(d.total), pct(d.total)]),
    },
  );
  tela.appendChild(buildSecao('Qualidade', 'Como o score andou e em que faixas as postagens caíram', [linhaScore, distribuicaoCartao]));

  // 4. Onde funciona melhor: tags, redes e prioridades.
  const tags = [
    ...fonte.catalogo.tags.map((t) => ({ chave: t.id, rotulo: buildTagChip(t, { compacto: true }), videos: videosPeriodo.filter((v) => v.tagIds.includes(t.id)) })),
    { chave: '', rotulo: rotuloTexto('Sem tag'), videos: videosPeriodo.filter((v) => v.tagIds.length === 0) },
  ];
  const prioridades = [
    ...PRIORIDADES.map((p) => ({ chave: p.id, rotulo: buildPrioridade(p.id), videos: videosPeriodo.filter((v) => v.prioridade === p.id) })),
    { chave: '', rotulo: rotuloTexto('Sem prioridade'), videos: videosPeriodo.filter((v) => !v.prioridade) },
  ];
  const redes = fonte.catalogo.redes.map((r) => ({ chave: r.id, rotulo: buildRedeBadge(r, { comNome: true }), videos: videosPeriodo.filter((v) => v.redeIds.includes(r.id)) }));
  const altas = videosPeriodo.filter((v) => v.prioridade === 'alta').length;
  tela.appendChild(
    buildSecao('Onde funciona melhor', 'Score médio por empresa e tag, rede e prioridade — do maior ao menor', [
      buildCartaoGrafico('Empresas e tags', 'Score médio e quantidade', buildRankingPor(fonte, tags, 'Score por tag'), null),
      buildCartaoGrafico('Redes', 'Score médio e quantidade', buildRankingPor(fonte, redes, 'Score por rede'), null),
      buildCartaoGrafico(
        'Prioridades',
        `${Math.round((altas / videosPeriodo.length) * 100)}% do período em prioridade alta`,
        buildRankingPor(fonte, prioridades, 'Score por prioridade'),
        null,
      ),
    ]),
  );

  // 5. Destaques: pelo sentido da faixa em que cada postagem caiu, na escala da
  // empresa dela. Antes eram só "os maiores" e "os menores": um 88 aparecia
  // como ponto fraco num mês bom.
  const comScore = [...comScoreNoPeriodo].sort((a, b) => b.score! - a.score!);
  const doSentido = (sentido: SentidoFaixa): Postagem[] => comScore.filter((v) => faixaDaEscala(escalaDe(fonte, v), v.score!).sentido === sentido);
  const positivos = doSentido('positivo');
  const medianos = doSentido('mediano');
  const negativos = doSentido('negativo').reverse();
  // "Pontos de atenção" só existe quando alguma escala do recorte tem faixa mediana.
  const temMediano = comScore.some((v) => escalaDe(fonte, v).faixas.some((f) => f.sentido === 'mediano')) || medianos.length > 0;
  const contagem = (n: number): string => `${n} postage${n === 1 ? 'm' : 'ns'}`;
  const faixasDoSentido = (sentido: SentidoFaixa): string => {
    if (misturada) return 'pela escala da empresa de cada postagem';
    const nomes = escala.faixas.map((f, i) => ({ f, i })).filter((x) => x.f.sentido === sentido);
    return nomes.length ? nomes.map((x) => `${x.f.rotulo} (${intervaloDaFaixa(escala, x.i)})`).join(', ') : 'nenhuma faixa com esse sentido';
  };
  const pontos: Array<{ titulo: string; lista: Postagem[]; sub: string; vazio: string }> = [
    {
      titulo: 'Pontos positivos',
      lista: positivos,
      sub: `${faixasDoSentido('positivo')} · ${contagem(positivos.length)}${positivos.length > 10 ? ', os 10 maiores' : ''}`,
      vazio: 'nenhuma em faixa positiva',
    },
    ...(temMediano
      ? [
          {
            titulo: 'Pontos de atenção',
            lista: medianos,
            sub: `${faixasDoSentido('mediano')} · ${contagem(medianos.length)}${medianos.length > 10 ? ', as 10 maiores' : ''}`,
            vazio: 'nenhuma em faixa mediana',
          },
        ]
      : []),
    {
      titulo: 'Pontos negativos',
      lista: negativos,
      sub: `${faixasDoSentido('negativo')} · ${contagem(negativos.length)}${negativos.length > 10 ? ', as 10 menores' : ''} — da menor para a maior`,
      vazio: 'nenhuma em faixa negativa',
    },
  ];
  // Só as listas com postagens viram cartão; as vazias viram uma linha de
  // texto embaixo — esticadas ao lado de uma lista de 10, eram caixas enormes sem nada.
  const cheios = pontos.filter((p) => p.lista.length);
  const vazios = pontos.filter((p) => !p.lista.length);
  if (cheios.length || vazios.length) {
    const secao = buildSecao(
      'Destaques',
      'As postagens de cada lado da escala — clique para abrir',
      cheios.map((p) => buildCartaoGrafico(p.titulo, p.sub, buildListaVideos(fonte, p.lista.slice(0, 10), opcoes), null)),
    );
    if (!cheios.length) secao.querySelector('.mt-grade')?.remove();
    if (vazios.length) {
      secao.appendChild(elemento('p', 'mt-nota', `${vazios.map((p) => p.titulo).join(' e ')}: ${vazios.map((p) => p.vazio).join('; ')} no período.`));
    }
    tela.appendChild(secao);
  }

  // 6. Conferência, no fim.
  tela.appendChild(buildConferencia(fonte, videosPeriodo, opcoes));

  const rodape = elemento('p', 'mt-rodape');
  rodape.innerHTML = svg(ICONES_POSTAGEM.historico, 12, 2);
  rodape.append(
    misturada
      ? `Escalas misturadas: cada postagem é classificada pela escala da sua empresa; as médias, pela escala padrão (${escala.nome}: ${descreverEscala(escala)}). Postagens arquivadas não entram.`
      : `Escala ${escala.nome}: ${descreverEscala(escala)}. Postagens arquivadas não entram.`,
  );
  tela.appendChild(rodape);
  return tela;
}

/** Recorte com empresas de escalas diferentes: a média não tem uma régua só. */
function buildAvisoMistura(padrao: EscalaScore): HTMLElement {
  const aviso = elemento('div', 'mt-aviso-escala');
  aviso.setAttribute('role', 'note');
  aviso.appendChild(buildSelo('Escalas misturadas', 'atencao'));
  aviso.append(
    `Este recorte tem empresas com escalas de score diferentes. Cada postagem continua com a faixa da sua empresa, mas as médias são lidas pela escala padrão (${padrao.nome}). Para ver pela escala de uma empresa, filtre por ela em "Todas as tags".`,
  );
  return aviso;
}
