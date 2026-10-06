import { FASES_POSTAGEM, PRIORIDADES, TIPOS_POSTAGEM, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import { VIDEO_STATUS } from '../../../shared/types/videos.types.js';
import { IMAGEM_STATUS } from '../../../shared/types/imagens.types.js';
import {
  PARTES_METRICAS,
  type BlocoComparativo,
  type ResultadoProducao,
  type BlocoMetricas,
  type FiltroMetricas,
  type LinhaMetrica,
  type PostagemMetrica,
  type Relatorio,
  type ResultadoMetricas,
} from '../../../shared/types/relatorios.types.js';
import { ESCALA_LEGADA, escalaDasEmpresas, escalaDoRecorte, faixaDaEscala, type EscalaScore, type SentidoFaixa } from '../../../shared/types/score.types.js';
import type { Catalogo, Postagem } from '../postagens/postagens.fonte.js';
import { dataParaMetricas } from '../postagens/postagens.metricas.js';
import { formatarData, hojeIso, somarDias } from '../postagens/postagens.ui.js';
import * as imagensState from '../postagens/imagens/imagens.state.js';
import * as videosState from '../postagens/videos/videos.state.js';

/**
 * Cálculo do bloco de métricas dos Relatórios. Conta pela mesma regra da aba
 * Métricas de Postagens (`dataParaMetricas`), para os dois nunca divergirem:
 * publicado conta no dia em que foi ao ar; arquivado não entra.
 *
 * O resultado é uma fotografia: vai gravado no relatório com a data do
 * cálculo, e só muda quando o usuário mexe no filtro ou pede para recalcular.
 */

const MAX_MESES = 36;
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function catalogoAtual(): Catalogo | null {
  return videosState.getCurrentState() ?? null;
}

function itensDoTipo(tipo: TipoPostagem): Postagem[] {
  switch (tipo) {
    case 'video':
      return videosState.getCurrentState()?.videos ?? [];
    case 'imagem':
      return imagensState.getCurrentState()?.imagens ?? [];
  }
}

/**
 * Filtro inicial: o período do relatório (ou o mês corrente) e as tags da
 * empresa do relatório — o relatório de uma empresa já nasce contando só ela.
 */
export function filtroPadrao(rel: Pick<Relatorio, 'periodoInicio' | 'periodoFim' | 'tagIds'>): FiltroMetricas {
  const base = { tipos: [], base: 'publicados' as const, redeIds: [], tagIds: [...rel.tagIds], prioridades: [] };
  if (rel.periodoInicio || rel.periodoFim) return { ...base, inicio: rel.periodoInicio, fim: rel.periodoFim };
  // O mês de hoje pelo relógio local (toISOString daria o mês seguinte na última noite do mês).
  return { ...base, ...intervaloDoMes(hojeIso().slice(0, 7)) };
}

export function novoBlocoMetricas(rel: Pick<Relatorio, 'periodoInicio' | 'periodoFim' | 'tagIds'>): BlocoMetricas {
  const bloco: BlocoMetricas = {
    id: crypto.randomUUID(),
    tipo: 'metricas',
    titulo: 'Métricas do período',
    filtro: filtroPadrao(rel),
    partes: PARTES_METRICAS.map((p) => p.id),
    resultado: null,
    introducao: '',
    comentario: '',
  };
  bloco.resultado = calcularMetricas(bloco.filtro);
  return bloco;
}

/** "2026-09" → primeiro e último dia daquele mês. */
export function intervaloDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const ultimo = new Date(a, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/** O intervalo é exatamente um mês de calendário? Devolve "YYYY-MM" ou null. */
export function mesExato(filtro: Pick<FiltroMetricas, 'inicio' | 'fim'>): string | null {
  if (!filtro.inicio || !filtro.fim) return null;
  const mes = filtro.inicio.slice(0, 7);
  const intervalo = intervaloDoMes(mes);
  return filtro.inicio === intervalo.inicio && filtro.fim === intervalo.fim ? mes : null;
}

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return `${MESES_LONGOS[m - 1]} de ${a}`;
}

/** "setembro de 2026 (01/09/2026 a 30/09/2026)", "01/09/2026 a 15/10/2026", "Todo o histórico". */
export function descreverPeriodoFiltro(filtro: Pick<FiltroMetricas, 'inicio' | 'fim'>): string {
  const mes = mesExato(filtro);
  const intervalo =
    filtro.inicio && filtro.fim
      ? `${formatarData(filtro.inicio)} a ${formatarData(filtro.fim)}`
      : filtro.inicio
        ? `a partir de ${formatarData(filtro.inicio)}`
        : filtro.fim
          ? `até ${formatarData(filtro.fim)}`
          : 'todo o histórico';
  if (mes) return `${rotuloMes(mes).replace(/^./, (c) => c.toUpperCase())} (${intervalo})`;
  return intervalo.replace(/^./, (c) => c.toUpperCase());
}

function media(valores: number[]): number | undefined {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : undefined;
}

function mediana(valores: number[]): number | undefined {
  if (!valores.length) return undefined;
  const o = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio] : (o[meio - 1]! + o[meio]!) / 2;
}

function linha(rotulo: string, grupo: Postagem[]): LinhaMetrica {
  const s = grupo.map((p) => p.score).filter((n): n is number => typeof n === 'number');
  return { rotulo, total: grupo.length, comScore: s.length, media: media(s) };
}

function mesesEntre(inicio: string, fim: string): string[] {
  const [ia, im] = inicio.split('-').map(Number) as [number, number];
  const [fa, fm] = fim.split('-').map(Number) as [number, number];
  const total = Math.max(1, (fa - ia) * 12 + (fm - im) + 1);
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(ia, im - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }).slice(-MAX_MESES);
}

/** Os filtros por extenso, com nomes (não ids): o documento não depende do catálogo. */
function descreverFiltros(filtro: FiltroMetricas, catalogo: Catalogo | null): string[] {
  const partes: string[] = [];
  const tipos = filtro.tipos.length ? filtro.tipos : TIPOS_POSTAGEM.map((t) => t.id);
  partes.push(`Tipos: ${tipos.map((t) => TIPOS_POSTAGEM.find((x) => x.id === t)?.rotulo ?? t).join(', ')}`);
  partes.push(filtro.base === 'publicados' ? 'Conta: só publicados, pelo dia em que foram ao ar' : 'Conta: tudo que tem data (publicado, agendado ou em produção)');
  if (filtro.redeIds.length) {
    partes.push(`Redes: ${filtro.redeIds.map((id) => catalogo?.redes.find((r) => r.id === id)?.nome ?? 'rede removida').join(', ')}`);
  }
  if (filtro.tagIds.length) {
    partes.push(`Tags: ${filtro.tagIds.map((id) => catalogo?.tags.find((t) => t.id === id)?.nome ?? 'tag removida').join(', ')}`);
  }
  if (filtro.prioridades.length) {
    partes.push(`Prioridade: ${filtro.prioridades.map((p) => PRIORIDADES.find((x) => x.id === p)?.rotulo ?? p).join(', ')}`);
  }
  return partes;
}

/** Redes, tags e prioridade: dentro de cada lista basta casar com um (OU); entre listas, todas (E). */
function passaListas(p: Postagem, filtro: FiltroMetricas): boolean {
  if (filtro.redeIds.length && !p.redeIds.some((id) => filtro.redeIds.includes(id))) return false;
  if (filtro.tagIds.length && !p.tagIds.some((id) => filtro.tagIds.includes(id))) return false;
  if (filtro.prioridades.length && !(p.prioridade && filtro.prioridades.includes(p.prioridade))) return false;
  return true;
}

export function calcularMetricas(filtro: FiltroMetricas): ResultadoMetricas {
  const catalogo = catalogoAtual();
  const tipos = filtro.tipos.length ? filtro.tipos : TIPOS_POSTAGEM.map((t) => t.id);

  const entradas: Array<{ tipo: TipoPostagem; p: Postagem; data: string }> = [];
  tipos.forEach((tipo) => {
    itensDoTipo(tipo).forEach((p) => {
      const data = dataParaMetricas(p, filtro.base);
      if (!data) return;
      if (filtro.inicio && data < filtro.inicio) return;
      if (filtro.fim && data > filtro.fim) return;
      if (!passaListas(p, filtro)) return;
      entradas.push({ tipo, p, data });
    });
  });
  entradas.sort((a, b) => a.data.localeCompare(b.data) || a.p.seq - b.p.seq);

  const todas = entradas.map((e) => e.p);
  const scores = todas.map((p) => p.score).filter((n): n is number => typeof n === 'number');
  const comScore = entradas.filter((e) => typeof e.p.score === 'number').sort((a, b) => b.p.score! - a.p.score!);
  const primeiraData = entradas[0]?.data;
  const ultimaData = entradas[entradas.length - 1]?.data;

  // Régua do bloco: a das empresas filtradas (o relatório de uma empresa lê pela
  // escala dela); sem empresa no filtro, a das postagens encontradas. Vai uma
  // cópia no resultado — mudar a escala depois não reescreve o documento.
  const recorte = catalogo ? escalaDoRecorte(catalogo, todas) : undefined;
  const escolhida: EscalaScore = (catalogo && escalaDasEmpresas(catalogo, filtro.tagIds)) ?? recorte?.escala ?? ESCALA_LEGADA;
  const escala: EscalaScore = { ...escolhida, faixas: escolhida.faixas.map((f) => ({ ...f })) };
  const escalaMisturada = !(catalogo && escalaDasEmpresas(catalogo, filtro.tagIds)) && Boolean(recorte?.misturada);

  // Meses do filtro inteiro (inclusive os vazios, que também são informação);
  // sem limite de data, do primeiro ao último mês com postagem.
  const inicioMeses = filtro.inicio ?? primeiraData;
  const fimMeses = filtro.fim ?? ultimaData;
  const meses = inicioMeses && fimMeses ? mesesEntre(inicioMeses, fimMeses) : [];

  const redes = (catalogo?.redes ?? [])
    .map((r) => linha(r.nome, todas.filter((p) => p.redeIds.includes(r.id))))
    .filter((l) => l.total > 0);
  const tags = (catalogo?.tags ?? [])
    .map((t) => linha(t.nome, todas.filter((p) => p.tagIds.includes(t.id))))
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total || (b.media ?? -1) - (a.media ?? -1));

  return {
    calculadoEm: new Date().toISOString(),
    filtrosDescritos: descreverFiltros(filtro, catalogo),
    primeiraData,
    ultimaData,
    total: todas.length,
    comScore: scores.length,
    media: media(scores),
    mediana: mediana(scores),
    maior: comScore[0] ? { titulo: comScore[0].p.titulo, score: comScore[0].p.score! } : undefined,
    menor: comScore.length > 1 ? { titulo: comScore[comScore.length - 1]!.p.titulo, score: comScore[comScore.length - 1]!.p.score! } : undefined,
    porTipo: tipos.map((t) => linha(t, entradas.filter((e) => e.tipo === t).map((e) => e.p))),
    porMes: meses.map((m) => linha(m, entradas.filter((e) => e.data.startsWith(m)).map((e) => e.p))),
    escala,
    ...(escalaMisturada ? { escalaMisturada: true } : {}),
    faixas: escala.faixas.map((f) => {
      const n = scores.filter((s) => faixaDaEscala(escala, s).id === f.id).length;
      return { rotulo: f.id, total: n, comScore: n };
    }),
    redes,
    tags,
    postagens: entradas.map(
      (e): PostagemMetrica => ({
        tipo: e.tipo,
        seq: e.p.seq,
        titulo: e.p.titulo,
        data: e.data,
        score: e.p.score,
        redes: (catalogo?.redes ?? []).filter((r) => e.p.redeIds.includes(r.id)).map((r) => r.nome),
      }),
    ),
  };
}

// ---------- Comparativo ----------

function diasEntre(inicio: string, fim: string): number {
  const [a1, m1, d1] = inicio.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = fim.split('-').map(Number) as [number, number, number];
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86_400_000) + 1;
}

/**
 * O período logo antes, do mesmo tamanho. Mês de calendário compara com o
 * mês anterior inteiro (outubro tem 31 dias, setembro 30: "os 31 dias antes"
 * pegaria 1 dia de agosto). Sem início e fim não há o que comparar.
 */
export function periodoAnterior(filtro: Pick<FiltroMetricas, 'inicio' | 'fim'>): { inicio: string; fim: string } | null {
  if (!filtro.inicio || !filtro.fim) return null;
  const mes = mesExato(filtro);
  if (mes) {
    const [a, m] = mes.split('-').map(Number) as [number, number];
    const anterior = new Date(a, m - 2, 1);
    return intervaloDoMes(`${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`);
  }
  const n = diasEntre(filtro.inicio, filtro.fim);
  return { inicio: somarDias(filtro.inicio, -n), fim: somarDias(filtro.inicio, -1) };
}

export function calcularComparativo(filtro: FiltroMetricas): Pick<BlocoComparativo, 'atual' | 'anterior' | 'periodoAnterior'> {
  const anterior = periodoAnterior(filtro);
  if (!anterior) return { atual: null, anterior: null, periodoAnterior: undefined };
  return {
    atual: calcularMetricas(filtro),
    anterior: calcularMetricas({ ...filtro, ...anterior }),
    periodoAnterior: anterior,
  };
}

/** Quantas postagens em cada sentido (positivo, mediano, negativo), pela escala gravada no resultado. */
export function contarPorSentido(r: ResultadoMetricas): Record<SentidoFaixa, number> {
  const escala = r.escala ?? ESCALA_LEGADA;
  const conta: Record<SentidoFaixa, number> = { positivo: 0, mediano: 0, negativo: 0 };
  escala.faixas.forEach((f) => {
    const gravada = r.faixas.find((x) => x.rotulo === f.id);
    const n = gravada ? gravada.total : r.postagens.filter((p) => p.score !== undefined && faixaDaEscala(escala, p.score).id === f.id).length;
    conta[f.sentido] += n;
  });
  return conta;
}

export interface LinhaComparativo {
  rotulo: string;
  anterior?: number;
  atual?: number;
  /** n: contagem (variação em % também); score: pontos; pct: pontos percentuais. */
  unidade: 'n' | 'score' | 'pct';
}

function pctPositivas(r: ResultadoMetricas | null): number | undefined {
  if (!r || !r.comScore) return undefined;
  return (contarPorSentido(r).positivo / r.comScore) * 100;
}

export function linhasDoComparativo(atual: ResultadoMetricas | null, anterior: ResultadoMetricas | null): LinhaComparativo[] {
  return [
    { rotulo: 'Postagens', anterior: anterior?.total, atual: atual?.total, unidade: 'n' },
    { rotulo: 'Com score', anterior: anterior?.comScore, atual: atual?.comScore, unidade: 'n' },
    { rotulo: 'Score médio', anterior: anterior?.media, atual: atual?.media, unidade: 'score' },
    { rotulo: 'Mediana', anterior: anterior?.mediana, atual: atual?.mediana, unidade: 'score' },
    { rotulo: 'Na faixa positiva', anterior: pctPositivas(anterior), atual: pctPositivas(atual), unidade: 'pct' },
    { rotulo: 'Maior score', anterior: anterior?.maior?.score, atual: atual?.maior?.score, unidade: 'score' },
  ];
}

/** Média por rede nos dois períodos (só redes com postagem em algum deles). */
export function redesDoComparativo(atual: ResultadoMetricas | null, anterior: ResultadoMetricas | null): LinhaComparativo[] {
  const nomes = [...new Set([...(atual?.redes ?? []), ...(anterior?.redes ?? [])].map((l) => l.rotulo))];
  return nomes.map((rotulo) => ({
    rotulo,
    anterior: anterior?.redes.find((l) => l.rotulo === rotulo)?.media,
    atual: atual?.redes.find((l) => l.rotulo === rotulo)?.media,
    unidade: 'score' as const,
  }));
}

function numBr(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function formatarValorComparativo(l: LinhaComparativo, v: number | undefined): string {
  if (v === undefined) return '—';
  return l.unidade === 'pct' ? `${numBr(v, 0)}%` : numBr(v, l.unidade === 'n' ? 0 : 1);
}

/**
 * A variação escrita com seta e sinal ("↑ +3,1 pts", "↓ −2 (−20%)"): a cor no
 * documento só reforça, o sentido sempre está no texto.
 */
export function variacaoComparativo(l: LinhaComparativo): { texto: string; sentido: 'sobe' | 'desce' | 'igual' | 'sem' } {
  if (l.atual === undefined || l.anterior === undefined) return { texto: '—', sentido: 'sem' };
  const d = l.atual - l.anterior;
  if (Math.abs(d) < 0.05) return { texto: '= igual', sentido: 'igual' };
  const seta = d > 0 ? '↑' : '↓';
  const sinal = d > 0 ? '+' : '−';
  const abs = Math.abs(d);
  if (l.unidade === 'n') {
    const pct = l.anterior ? ` (${sinal}${numBr((abs / l.anterior) * 100, 0)}%)` : '';
    return { texto: `${seta} ${sinal}${numBr(abs, 0)}${pct}`, sentido: d > 0 ? 'sobe' : 'desce' };
  }
  return { texto: `${seta} ${sinal}${numBr(abs, l.unidade === 'pct' ? 0 : 1)} pts`, sentido: d > 0 ? 'sobe' : 'desce' };
}

// ---------- Calendário ----------

/**
 * Postagens com data marcada no intervalo (de qualquer etapa, menos
 * arquivadas e já publicadas), das empresas/tags pedidas — para o calendário do próximo
 * período. Tudo por extenso: a tabela vira cópia, como os snapshots.
 */
export function agendadasEntre(
  inicio: string,
  fim: string,
  tagIds: string[],
): Array<{ data: string; hora: string; titulo: string; formato: string; redes: string }> {
  const catalogo = catalogoAtual();
  const lista: Array<{ data: string; hora: string; titulo: string; formato: string; redes: string }> = [];
  TIPOS_POSTAGEM.forEach((t) => {
    itensDoTipo(t.id).forEach((p) => {
      // O calendário é do que vem: publicada (mesmo hoje) já não entra.
      if (p.status === 'arquivado' || p.status === 'publicado' || !p.dataAgendada || p.dataAgendada < inicio || p.dataAgendada > fim) return;
      if (tagIds.length && !p.tagIds.some((id) => tagIds.includes(id))) return;
      lista.push({
        data: p.dataAgendada,
        hora: p.horaAgendada ?? '',
        titulo: p.titulo,
        formato: t.singular,
        redes: (catalogo?.redes ?? []).filter((r) => p.redeIds.includes(r.id)).map((r) => r.nome).join(', '),
      });
    });
  });
  return lista.sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`)).slice(0, 100);
}

// ---------- Ranking ----------

/**
 * As N de maior score e as N de menor, do resultado gravado. Com poucas
 * postagens, as "menores" não repetem as que já estão nas maiores.
 */
export function rankingDoResultado(r: ResultadoMetricas | null, n: number): { maiores: PostagemMetrica[]; menores: PostagemMetrica[] } {
  const com = (r?.postagens ?? []).filter((p) => p.score !== undefined).sort((a, b) => b.score! - a.score! || a.data.localeCompare(b.data));
  const maiores = com.slice(0, n);
  const menores = com
    .slice(maiores.length)
    .reverse()
    .slice(0, n);
  return { maiores, menores };
}

// ---------- Produção ----------

const ETAPAS_POR_TIPO: Record<TipoPostagem, ReadonlyArray<{ id: string; fase: string }>> = {
  video: VIDEO_STATUS,
  imagem: IMAGEM_STATUS,
};

/**
 * Quanto foi produzido no período e como está a pipeline agora. As contagens
 * seguem tipos, redes, tags e prioridade do filtro; o período vale para
 * criadas, publicadas e atrasadas (a situação por fase é a de agora).
 */
export function calcularProducao(filtro: FiltroMetricas): ResultadoProducao {
  const tipos = filtro.tipos.length ? filtro.tipos : TIPOS_POSTAGEM.map((t) => t.id);
  const noPeriodo = (dia: string | undefined): boolean =>
    Boolean(dia) && (!filtro.inicio || dia! >= filtro.inicio) && (!filtro.fim || dia! <= filtro.fim);
  const hoje = hojeIso();
  let criadas = 0;
  let publicadas = 0;
  let atrasadas = 0;
  const porFase = new Map<string, number>([...FASES_POSTAGEM.map((f) => [f.rotulo, 0] as [string, number]), ['Publicadas (total)', 0]]);
  tipos.forEach((tipo) => {
    itensDoTipo(tipo).forEach((p) => {
      if (p.status === 'arquivado' || !passaListas(p, filtro)) return;
      // createdAt é ISO em UTC: o dia local sai do Date, não do slice.
      const criada = new Date(p.createdAt);
      const diaCriada = `${criada.getFullYear()}-${String(criada.getMonth() + 1).padStart(2, '0')}-${String(criada.getDate()).padStart(2, '0')}`;
      if (noPeriodo(diaCriada)) criadas += 1;
      if (p.status === 'publicado') {
        if (noPeriodo(dataParaMetricas(p, 'publicados'))) publicadas += 1;
        porFase.set('Publicadas (total)', (porFase.get('Publicadas (total)') ?? 0) + 1);
        return;
      }
      if (p.dataAgendada && p.dataAgendada < hoje && noPeriodo(p.dataAgendada)) atrasadas += 1;
      const fase = ETAPAS_POR_TIPO[tipo].find((e) => e.id === p.status)?.fase;
      const rotulo = FASES_POSTAGEM.find((f) => f.id === fase)?.rotulo;
      if (rotulo) porFase.set(rotulo, (porFase.get(rotulo) ?? 0) + 1);
    });
  });
  return {
    calculadoEm: new Date().toISOString(),
    criadas,
    publicadas,
    atrasadas,
    porFase: [...porFase.entries()].map(([rotulo, total]) => ({ rotulo, total })),
  };
}
