import { PRIORIDADES } from '../../../shared/types/postagens.types.js';
import { FAIXAS_SCORE, faixaDoScore } from '../../../shared/types/videos.conversao.js';
import { buildIndicadores, buildSegmentado, buildSelo, buildVazio, svg, type Tom } from '../../ui/pagina.js';
import {
  COR_SERIE,
  RAMPA_ORDINAL,
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
import { ICONES_POSTAGEM, buildPrioridade, buildRedeBadge, buildTagChip, hojeIso, somarDias, tituloExibido } from './postagens.ui.js';

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

function inicioDaSemana(iso: string, primeiro: 0 | 1): string {
  const [a, m, d] = partesData(iso);
  const recuo = (new Date(a, m - 1, d).getDay() - primeiro + 7) % 7;
  return somarDias(iso, -recuo);
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

function tomDaFaixa(score: number): Tom {
  return faixaDoScore(score).tom as Tom;
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
  return barra;
}

function buildRankingPor<T>(
  grupos: Array<{ chave: T; rotulo: HTMLElement; videos: Postagem[] }>,
  descricao: string,
): HTMLElement {
  const linhas: LinhaRanking[] = grupos
    .filter((g) => g.videos.length > 0)
    .map((g) => {
      const s = scores(g.videos);
      return {
        rotulo: g.rotulo,
        valor: media(s),
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

function buildListaVideos(fonte: Fonte, videos: Postagem[], opcoes: MetricasOpcoes): HTMLElement {
  if (!videos.length) return Object.assign(document.createElement('p'), { className: 'rl-vazio', textContent: 'Nenhuma postagem com score no período.' });
  return buildRanking(
    videos.map((v) => ({
      rotulo: rotuloTexto(tituloExibido(fonte.catalogo, v)),
      valor: v.score ?? null,
      detalhe: v.dataAgendada ? v.dataAgendada.split('-').reverse().slice(0, 2).join('/') : '—',
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
    if (m !== null) bloco.appendChild(buildSelo(faixaDoScore(m).rotulo, tomDaFaixa(m)));
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
        detalhe: notaFinal === null ? 'sem scores no período' : faixaDoScore(notaFinal).rotulo,
        tom: notaFinal === null ? 'neutro' : tomDaFaixa(notaFinal),
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
      notaFinal === null ? 'Ainda sem scores no período' : `Linha tracejada = nota final do período (${formatarNumero(notaFinal, 1)})`,
      buildLinha(rotulos, mediasMes, notaFinal === null ? null : { valor: notaFinal, rotulo: 'média' }, `Score médio por ${unidade}`),
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

  // 3. Distribuição por faixa
  const contagemFaixa = FAIXAS_SCORE.map((f) => s.filter((n) => n >= f.min && n <= f.max).length);
  const rotulosFaixa = FAIXAS_SCORE.map((f) => `${f.rotulo} ${f.min}–${Math.floor(f.max)}`);
  grade.appendChild(
    buildCartaoGrafico(
      'Distribuição dos scores',
      'Quais faixas de score mais foram publicadas',
      buildColunas(
        rotulosFaixa,
        [{ nome: fonte.rotulo, cor: RAMPA_ORDINAL[2], valores: contagemFaixa }],
        'Distribuição dos scores por faixa',
        (n) => `${n} · ${s.length ? Math.round((n / s.length) * 100) : 0}%`,
        RAMPA_ORDINAL,
      ),
      {
        colunas: ['Faixa', fonte.rotulo, '%'],
        linhas: FAIXAS_SCORE.map((_f, i) => [
          rotulosFaixa[i]!,
          String(contagemFaixa[i]),
          `${s.length ? Math.round((contagemFaixa[i]! / s.length) * 100) : 0}%`,
        ]),
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
  grade.appendChild(cartaoRanking('Tags', 'Score médio e quantidade por tag, do maior score ao menor', buildRankingPor(tags, 'Score por tag')));

  const prioridades = [
    ...PRIORIDADES.map((p) => ({ chave: p.id, rotulo: buildPrioridade(p.id), videos: videosPeriodo.filter((v) => v.prioridade === p.id) })),
    { chave: '', rotulo: rotuloTexto('Sem prioridade'), videos: videosPeriodo.filter((v) => !v.prioridade) },
  ];
  const redes = fonte.catalogo.redes.map((r) => ({ chave: r.id, rotulo: buildRedeBadge(r, { comNome: true }), videos: videosPeriodo.filter((v) => v.redeIds.includes(r.id)) }));
  const duplo = document.createElement('div');
  duplo.className = 'rl-duplo';
  duplo.append(
    Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: 'Prioridades' }),
    buildRankingPor(prioridades, 'Score por prioridade'),
    Object.assign(document.createElement('span'), { className: 'md-rotulo', textContent: 'Redes' }),
    buildRankingPor(redes, 'Score por rede'),
  );
  grade.appendChild(cartaoRanking('Prioridades e redes', 'Score médio e quantidade', duplo));

  // 6. Maiores e menores scores
  const comScore = videosPeriodo.filter((v) => v.score !== undefined).sort((a, b) => b.score! - a.score!);
  grade.appendChild(cartaoRanking('Maiores scores', 'Top 10 do período — clique para abrir', buildListaVideos(fonte, comScore.slice(0, 10), opcoes)));
  grade.appendChild(
    cartaoRanking('Menores scores', 'Os 5 que mais puxam a média para baixo', buildListaVideos(fonte, comScore.slice(-5).reverse(), opcoes)),
  );

  tela.appendChild(grade);

  const rodape = document.createElement('p');
  rodape.className = 'rl-rodape';
  rodape.innerHTML = svg(ICONES_POSTAGEM.historico, 12, 2);
  rodape.append(`Faixas: ${FAIXAS_SCORE.map((f) => `${f.rotulo} ${f.min}–${Math.floor(f.max)}`).join(' · ')}. Postagens arquivadas não entram.`);
  tela.appendChild(rodape);
  return tela;
}
