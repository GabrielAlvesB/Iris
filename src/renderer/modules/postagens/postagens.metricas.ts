import { PRIORIDADES } from '../../../shared/types/postagens.types.js';
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
import { buildBotao, buildIndicadores, buildSegmentado, buildSelo, buildVazio, svg, type Tom } from '../../ui/pagina.js';
import { abrirEscalas } from './postagens.escalas.js';
import {
  COR_SERIE,
  buildCartaoGrafico,
  buildColunas,
  buildLegenda,
  buildLinha,
  buildRanking,
  esconderTooltip,
  formatarNumero,
  type LinhaRanking,
} from './postagens.graficos.js';
import type { Fonte, Postagem } from './postagens.fonte.js';
import { ICONES_POSTAGEM, buildPrioridade, buildRedeBadge, buildTagChip, hojeIso, inicioDaSemana, somarDias, tituloExibido } from './postagens.ui.js';

/**
 * Aba Métricas: números da produção e do score (0–100 que o usuário traz da
 * planilha ou dá no painel), do tipo de postagem escolhido. Os filtros da
 * barra continuam valendo — as métricas são sempre sobre o que está filtrado.
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

let periodo: Periodo = '6';
/** Semana ou mês exibido quando o período é "Semana"/"Mês" (navegável com as setas). */
let referencia = hojeIso();
let base: Base = 'publicados';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
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

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Agrupamento do período: um balde por dia (Semana/Mês) ou por mês (o resto). */
interface Baldes {
  chaves: string[];
  rotulos: string[];
  chaveDe: (data: string) => string;
  unidade: 'dia' | 'mês';
}

function partesData(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a!, m!, d!];
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
  if (periodo === 'mes') {
    const [a, m] = partesData(referencia);
    return `${MESES_LONGOS[m - 1]} de ${a}`;
  }
  const inicio = inicioDaSemana(referencia, fonte.catalogo.preferencias.inicioDaSemana);
  const fim = somarDias(inicio, 6);
  const [, mi, di] = partesData(inicio);
  const [af, mf, df] = partesData(fim);
  return mi === mf ? `${di} – ${df} de ${MESES_LONGOS[mf - 1]} de ${af}` : `${di} de ${MESES_LONGOS[mi - 1]} – ${df} de ${MESES_LONGOS[mf - 1]} de ${af}`;
}

function moverJanela(sentido: number): void {
  if (periodo === 'semana') referencia = somarDias(referencia, sentido * 7);
  else {
    const [a, m] = partesData(referencia);
    const d = new Date(a, m - 1 + sentido, 1);
    referencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
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

// ---------- Blocos da tela ----------

function buildControles(fonte: Fonte, opcoes: MetricasOpcoes): HTMLElement {
  const barra = document.createElement('div');
  barra.className = 'rl-controles';
  barra.appendChild(
    buildSegmentado<Periodo>(
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
        opcoes.redesenhar();
      },
    ),
  );

  if (periodo === 'semana' || periodo === 'mes') {
    const nav = document.createElement('div');
    nav.className = 'rl-janela';
    const botao = (conteudo: string, titulo: string, aoClicar: () => void, icone = false): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vd-cal-nav-btn';
      b.title = titulo;
      b.setAttribute('aria-label', titulo);
      if (icone) b.innerHTML = svg(conteudo, 15, 2.2);
      else b.textContent = conteudo;
      b.addEventListener('click', () => {
        aoClicar();
        opcoes.redesenhar();
      });
      return b;
    };
    const unidade = periodo === 'semana' ? 'semana' : 'mês';
    const navBotoes = document.createElement('div');
    navBotoes.className = 'vd-cal-nav';
    navBotoes.append(
      botao('<path d="m15 18-6-6 6-6"/>', `${unidade === 'semana' ? 'Semana' : 'Mês'} anterior`, () => moverJanela(-1), true),
      botao(unidade === 'semana' ? 'Esta semana' : 'Este mês', `Voltar para ${unidade === 'semana' ? 'esta semana' : 'este mês'}`, () => (referencia = hojeIso())),
      botao('<path d="m9 18 6-6-6-6"/>', `Próxim${unidade === 'semana' ? 'a semana' : 'o mês'}`, () => moverJanela(1), true),
    );
    const titulo = document.createElement('strong');
    titulo.className = 'rl-janela-titulo';
    titulo.textContent = tituloDaJanela(fonte);
    nav.append(navBotoes, titulo);
    barra.appendChild(nav);
  }
  barra.appendChild(
    buildSegmentado<Base>(
      [
        { value: 'publicados', label: 'Publicados' },
        { value: 'todos', label: 'Todos com data' },
      ],
      base,
      (v) => {
        base = v;
        opcoes.redesenhar();
      },
    ),
  );
  const dica = document.createElement('span');
  dica.className = 'rl-dica';
  dica.textContent =
    base === 'publicados'
      ? 'Conta as postagens publicadas, pelo dia em que foram ao ar.'
      : 'Conta tudo que tem data (publicado, agendado ou em produção).';
  barra.appendChild(dica);
  const escalas = buildBotao('Escalas de score', {
    icone: '<path d="M3 3v18h18"/><path d="M7 15h3"/><path d="M7 11h7"/><path d="M7 7h11"/>',
    variante: 'secundario',
    titulo: 'Definir as faixas do score (de quanto a quanto é positivo, mediano…) e a escala de cada empresa',
  });
  escalas.classList.add('rl-botao-escalas');
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
  if (!linhas.length) {
    return Object.assign(document.createElement('p'), { className: 'rl-vazio', textContent: 'Nada no período.' });
  }
  return buildRanking(linhas, descricao);
}

function rotuloTexto(texto: string): HTMLElement {
  return Object.assign(document.createElement('span'), { className: 'rl-rotulo-texto', textContent: texto });
}

function buildListaVideos(fonte: Fonte, videos: Postagem[], opcoes: MetricasOpcoes, vazio = 'Nenhuma postagem com score no período.'): HTMLElement {
  if (!videos.length) return Object.assign(document.createElement('p'), { className: 'rl-vazio', textContent: vazio });
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

/** Conferência: médias gerais, cobertura e preenchimento rápido de quem está sem score. */
function buildConferencia(fonte: Fonte, noPeriodo: Postagem[], opcoes: MetricasOpcoes): HTMLElement {
  const ativos = fonte.itens.filter((v) => v.status !== 'arquivado' && opcoes.visivel(v));
  const publicados = ativos.filter((v) => v.status === 'publicado');
  const semScore = ativos.filter((v) => v.score === undefined);

  const secao = document.createElement('section');
  secao.className = 'gf-cartao rl-conferencia';
  const cab = document.createElement('header');
  cab.className = 'gf-cartao-cab';
  const textos = document.createElement('div');
  textos.append(
    Object.assign(document.createElement('h3'), { textContent: 'Conferência dos scores' }),
    Object.assign(document.createElement('p'), { textContent: 'Todas as postagens têm score? Qual é a média de cada recorte?' }),
  );
  cab.appendChild(textos);
  secao.appendChild(cab);

  const medias = document.createElement('div');
  medias.className = 'rl-medias';
  const blocoMedia = (rotulo: string, videos: Postagem[]): void => {
    const s = scores(videos);
    const m = media(s);
    const bloco = document.createElement('div');
    bloco.className = 'rl-media';
    bloco.append(
      Object.assign(document.createElement('span'), { className: 'rl-media-rotulo', textContent: rotulo }),
      Object.assign(document.createElement('strong'), { textContent: m === null ? '—' : formatarNumero(m, 1) }),
    );
    if (m !== null) {
      const escala = escalaDoGrupo(fonte, videos);
      bloco.appendChild(buildSelo(faixaDaEscala(escala, m).rotulo, tomDaFaixa(escala, m)));
    }
    const cobertura = videos.length ? s.length / videos.length : 0;
    const trilho = document.createElement('div');
    trilho.className = 'rl-cobertura';
    trilho.title = `${s.length} de ${videos.length} com score`;
    const barra = document.createElement('i');
    barra.style.width = `${Math.round(cobertura * 100)}%`;
    barra.classList.toggle('is-completo', cobertura === 1 && videos.length > 0);
    trilho.appendChild(barra);
    bloco.append(trilho, Object.assign(document.createElement('span'), { className: 'rl-media-detalhe', textContent: `${s.length} de ${videos.length} com score` }));
    medias.appendChild(bloco);
  };
  blocoMedia('Período selecionado', noPeriodo);
  blocoMedia('Todos os publicados', publicados);
  blocoMedia('Todas as postagens', ativos);
  secao.appendChild(medias);

  const tituloSem = document.createElement('div');
  tituloSem.className = 'rl-sem-titulo';
  tituloSem.append(
    semScore.length
      ? buildSelo(`${semScore.length} postage${semScore.length > 1 ? 'ns' : 'm'} sem score`, 'atencao')
      : buildSelo('Todas as postagens têm score', 'ok'),
  );
  if (semScore.length) {
    tituloSem.appendChild(Object.assign(document.createElement('span'), { className: 'rl-dica', textContent: 'Preencha aqui mesmo — Enter salva.' }));
  }
  secao.appendChild(tituloSem);

  if (semScore.length) {
    const lista = document.createElement('div');
    lista.className = 'rl-sem-lista';
    semScore.slice(0, 30).forEach((v) => {
      const linha = document.createElement('div');
      linha.className = 'rl-sem-linha';
      const titulo = document.createElement('button');
      titulo.type = 'button';
      titulo.className = 'rl-sem-nome';
      titulo.textContent = tituloExibido(fonte.catalogo, v);
      titulo.title = 'Abrir a postagem';
      titulo.addEventListener('click', () => opcoes.abrir(v.id));
      const campo = document.createElement('input');
      campo.type = 'number';
      campo.min = '0';
      campo.max = '100';
      campo.step = '0.1';
      campo.placeholder = '0–100';
      campo.className = 'md-input rl-sem-campo';
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
    if (semScore.length > 30) {
      lista.appendChild(Object.assign(document.createElement('p'), { className: 'rl-dica', textContent: `e mais ${semScore.length - 30}…` }));
    }
    secao.appendChild(lista);
  }
  return secao;
}

// ---------- Montagem ----------

export function buildMetricas(fonte: Fonte, opcoes: MetricasOpcoes): HTMLElement {
  esconderTooltip();
  const tela = document.createElement('div');
  tela.className = 'rl-tela';
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
    tela.appendChild(buildConferencia(fonte, videosPeriodo, opcoes));
    return tela;
  }

  // Régua das médias: a escala das empresas do recorte, se for uma só.
  const { escala, misturada } = escalaDoRecorte(fonte.catalogo, videosPeriodo);
  const meta = metaDaEscala(escala);
  if (misturada) tela.appendChild(buildAvisoMistura(escala));

  // Indicadores
  const s = scores(videosPeriodo);
  const notaFinal = media(s);
  const mediasMes = meses.map((m) => media(scores(porMes.get(m) ?? [])));
  const melhor = mediasMes.reduce<{ i: number; v: number } | null>((acc, v, i) => (v !== null && (!acc || v > acc.v) ? { i, v } : acc), null);
  const altas = videosPeriodo.filter((v) => v.prioridade === 'alta').length;
  tela.appendChild(
    buildIndicadores([
      {
        rotulo: 'Nota final',
        valor: notaFinal === null ? '—' : formatarNumero(notaFinal, 1),
        detalhe: notaFinal === null ? 'sem scores no período' : `${faixaDaEscala(escala, notaFinal).rotulo} · escala ${escala.nome}`,
        tom: notaFinal === null ? 'neutro' : tomDaFaixa(escala, notaFinal),
      },
      {
        rotulo: base === 'publicados' ? `${fonte.rotulo} publicad${fonte.tipo === 'imagem' ? 'as' : 'os'}` : `${fonte.rotulo} com data`,
        valor: formatarNumero(videosPeriodo.length),
        detalhe: `${formatarNumero(videosPeriodo.length / meses.length, 1)} por ${unidade}`,
      },
      {
        rotulo: 'Com score',
        valor: `${s.length}/${videosPeriodo.length}`,
        detalhe: s.length === videosPeriodo.length ? 'todos preenchidos' : `${videosPeriodo.length - s.length} sem score`,
        tom: s.length === videosPeriodo.length ? 'ok' : 'atencao',
      },
      {
        rotulo: `Melhor ${unidade}`,
        valor: melhor ? rotulos[melhor.i]! : '—',
        detalhe: melhor ? `média ${formatarNumero(melhor.v, 1)}` : 'sem scores',
      },
      {
        rotulo: 'Prioridade alta',
        valor: `${Math.round((altas / videosPeriodo.length) * 100)}%`,
        detalhe: `${altas} de ${videosPeriodo.length}`,
      },
    ]),
  );

  const grade = document.createElement('div');
  grade.className = 'rl-grade';

  // 1. Postagens por mês
  const publicadosMes = meses.map((m) => (porMes.get(m) ?? []).filter((v) => v.status === 'publicado').length);
  const outrosMes = meses.map((m) => (porMes.get(m) ?? []).filter((v) => v.status !== 'publicado').length);
  const series =
    base === 'publicados'
      ? [{ nome: 'Publicados', cor: COR_SERIE[0], valores: publicadosMes }]
      : [
          { nome: 'Publicados', cor: COR_SERIE[0], valores: publicadosMes },
          { nome: 'Programados', cor: COR_SERIE[1], valores: outrosMes },
        ];
  grade.appendChild(
    buildCartaoGrafico(
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
    ),
  );

  // 2. Score médio por mês
  grade.appendChild(
    buildCartaoGrafico(
      `Score médio por ${unidade}`,
      [
        notaFinal === null ? 'Ainda sem scores no período' : `Tracejado cinza = nota final do período (${formatarNumero(notaFinal, 1)})`,
        meta === undefined ? `a escala ${escala.nome} não tem faixa positiva` : `verde = meta ${meta.toLocaleString('pt-BR')} (escala ${escala.nome})`,
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
        linhas: meses.map((m, i) => [
          rotulos[i]!,
          mediasMes[i] === null ? '—' : formatarNumero(mediasMes[i]!, 1),
          String(scores(porMes.get(m) ?? []).length),
        ]),
      },
    ),
  );

  // 3. Distribuição por faixa. Uma escala só: as faixas dela. Escalas
  // misturadas não têm faixas em comum — conta pelo sentido (positivo,
  // mediano, negativo), cada postagem pela faixa da própria escala.
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
  grade.appendChild(
    buildCartaoGrafico(
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
    ),
  );

  // 4. Conferência (balanceamento)
  grade.appendChild(buildConferencia(fonte, videosPeriodo, opcoes));

  // 5. Tags, prioridades, redes
  const cartaoRanking = (titulo: string, subtitulo: string, conteudo: HTMLElement): HTMLElement => {
    const cartao = document.createElement('section');
    cartao.className = 'gf-cartao';
    const cab = document.createElement('header');
    cab.className = 'gf-cartao-cab';
    const t = document.createElement('div');
    t.append(Object.assign(document.createElement('h3'), { textContent: titulo }), Object.assign(document.createElement('p'), { textContent: subtitulo }));
    cab.appendChild(t);
    cartao.append(cab, conteudo);
    return cartao;
  };

  const tags = [
    ...fonte.catalogo.tags.map((t) => ({ chave: t.id, rotulo: buildTagChip(t, { compacto: true }), videos: videosPeriodo.filter((v) => v.tagIds.includes(t.id)) })),
    { chave: '', rotulo: rotuloTexto('Sem tag'), videos: videosPeriodo.filter((v) => v.tagIds.length === 0) },
  ];
  const prioridades = [
    ...PRIORIDADES.map((p) => ({ chave: p.id, rotulo: buildPrioridade(p.id), videos: videosPeriodo.filter((v) => v.prioridade === p.id) })),
    { chave: '', rotulo: rotuloTexto('Sem prioridade'), videos: videosPeriodo.filter((v) => !v.prioridade) },
  ];
  const redes = fonte.catalogo.redes.map((r) => ({ chave: r.id, rotulo: buildRedeBadge(r, { comNome: true }), videos: videosPeriodo.filter((v) => v.redeIds.includes(r.id)) }));
  // Tags e prioridades (listas curtas) empilhadas ao lado de redes (a mais
  // comprida): as duas colunas fecham perto da mesma altura, sem buraco.
  grade.append(
    buildPilha([
      cartaoRanking('Tags', 'Score médio e quantidade, do maior score ao menor', buildRankingPor(fonte, tags, 'Score por tag')),
      cartaoRanking('Prioridades', 'Score médio e quantidade', buildRankingPor(fonte, prioridades, 'Score por prioridade')),
    ]),
    cartaoRanking('Redes', 'Score médio e quantidade', buildRankingPor(fonte, redes, 'Score por rede')),
  );

  // 6. Pontos positivos, de atenção e negativos: pelo sentido da faixa em que
  // cada postagem caiu, na escala da empresa dela. Antes eram só "os maiores" e
  // "os menores": um 88 aparecia como ponto fraco num mês bom.
  const comScore = [...comScoreNoPeriodo].sort((a, b) => b.score! - a.score!);
  const doSentido = (sentido: SentidoFaixa): Postagem[] => comScore.filter((v) => faixaDaEscala(escalaDe(fonte, v), v.score!).sentido === sentido);
  const positivos = doSentido('positivo');
  const medianos = doSentido('mediano');
  const negativos = doSentido('negativo').reverse();
  // "Pontos de atenção" só existe quando alguma escala do recorte tem faixa mediana.
  const temMediano = comScore.some((v) => escalaDe(fonte, v).faixas.some((f) => f.sentido === 'mediano')) || medianos.length > 0;
  const contagem = (n: number): string => `${n} postage${n === 1 ? 'm' : 'ns'}`;
  const faixasDoSentido = (sentido: SentidoFaixa): string => {
    if (misturada) return 'Pela escala da empresa de cada postagem';
    const nomes = escala.faixas.map((f, i) => ({ f, i })).filter((x) => x.f.sentido === sentido);
    return nomes.length ? nomes.map((x) => `${x.f.rotulo} (${intervaloDaFaixa(escala, x.i)})`).join(', ') : 'Nenhuma faixa com esse sentido na escala';
  };
  const pontos = [
    {
      vazio: !positivos.length,
      cartao: cartaoRanking(
        'Pontos positivos',
        `${faixasDoSentido('positivo')} · ${contagem(positivos.length)}${positivos.length > 10 ? ', os 10 maiores' : ''} — clique para abrir`,
        buildListaVideos(fonte, positivos.slice(0, 10), opcoes, 'Nenhuma postagem em faixa positiva no período.'),
      ),
    },
    ...(temMediano
      ? [
          {
            vazio: !medianos.length,
            cartao: cartaoRanking(
              'Pontos de atenção',
              `${faixasDoSentido('mediano')} · ${contagem(medianos.length)}${medianos.length > 10 ? ', os 10 maiores' : ''}`,
              buildListaVideos(fonte, medianos.slice(0, 10), opcoes, 'Nenhuma postagem em faixa mediana no período.'),
            ),
          },
        ]
      : []),
    {
      vazio: !negativos.length,
      cartao: cartaoRanking(
        'Pontos negativos',
        `${faixasDoSentido('negativo')} · ${contagem(negativos.length)}${negativos.length > 10 ? ', os 10 menores' : ''} — do menor para o maior`,
        buildListaVideos(fonte, negativos.slice(0, 10), opcoes, 'Nenhuma postagem em faixa negativa no período.'),
      ),
    },
  ];
  // Cada lista com postagens ganha uma coluna; as vazias ("Nenhuma postagem…")
  // vão juntas numa coluna só — esticadas ao lado de uma lista de 10, viravam
  // caixas enormes sem nada dentro.
  const cheios = pontos.filter((p) => !p.vazio).map((p) => p.cartao);
  const vazios = pontos.filter((p) => p.vazio).map((p) => p.cartao);
  const colunasPontos = [...cheios, ...(vazios.length ? [buildPilha(vazios, false)] : [])];
  grade.appendChild(buildLinhaCartoes(colunasPontos));

  tela.appendChild(grade);

  const rodape = document.createElement('p');
  rodape.className = 'rl-rodape';
  rodape.innerHTML = svg(ICONES_POSTAGEM.historico, 12, 2);
  rodape.append(
    misturada
      ? `Escalas misturadas: cada postagem é classificada pela escala da sua empresa; as médias, pela escala padrão (${escala.nome}: ${descreverEscala(escala)}). Postagens arquivadas não entram.`
      : `Escala ${escala.nome}: ${descreverEscala(escala)}. Postagens arquivadas não entram.`,
  );
  tela.appendChild(rodape);
  return tela;
}

/**
 * Cartões um embaixo do outro numa célula da grade. `preencher`: o último
 * cresce até a altura da coluna vizinha; sem ele, ficam no tamanho do conteúdo.
 */
function buildPilha(cartoes: HTMLElement[], preencher = true): HTMLElement {
  const pilha = document.createElement('div');
  pilha.className = `rl-pilha${preencher ? ' is-preencher' : ''}`;
  pilha.append(...cartoes);
  return pilha;
}

/** Linha da grade com a largura toda e N cartões iguais lado a lado. */
function buildLinhaCartoes(cartoes: HTMLElement[]): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'rl-linha';
  linha.style.setProperty('--colunas', String(cartoes.length));
  linha.append(...cartoes);
  return linha;
}

/** Recorte com empresas de escalas diferentes: a média não tem uma régua só. */
function buildAvisoMistura(padrao: EscalaScore): HTMLElement {
  const aviso = document.createElement('div');
  aviso.className = 'rl-aviso-escala';
  aviso.setAttribute('role', 'note');
  aviso.appendChild(buildSelo('Escalas misturadas', 'atencao'));
  aviso.append(
    `Este recorte tem empresas com escalas de score diferentes. Cada postagem continua com a faixa da sua empresa, mas as médias são lidas pela escala padrão (${padrao.nome}). Para ver pela escala de uma empresa, filtre por ela em "Todas as tags".`,
  );
  return aviso;
}
