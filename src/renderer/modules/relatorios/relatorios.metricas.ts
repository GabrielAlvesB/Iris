import { PRIORIDADES, TIPOS_POSTAGEM, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import {
  PARTES_METRICAS,
  type BlocoMetricas,
  type FiltroMetricas,
  type LinhaMetrica,
  type PostagemMetrica,
  type Relatorio,
  type ResultadoMetricas,
} from '../../../shared/types/relatorios.types.js';
import { FAIXAS_SCORE } from '../../../shared/types/videos.conversao.js';
import type { Catalogo, Postagem } from '../postagens/postagens.fonte.js';
import { dataParaMetricas } from '../postagens/postagens.metricas.js';
import { formatarData } from '../postagens/postagens.ui.js';
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
 * empresa do relatório — um relatório da "Hora de Codar" já nasce contando só ela.
 */
export function filtroPadrao(rel: Pick<Relatorio, 'periodoInicio' | 'periodoFim' | 'tagIds'>): FiltroMetricas {
  const base = { tipos: [], base: 'publicados' as const, redeIds: [], tagIds: [...rel.tagIds], prioridades: [] };
  if (rel.periodoInicio || rel.periodoFim) return { ...base, inicio: rel.periodoInicio, fim: rel.periodoFim };
  return { ...base, ...intervaloDoMes(new Date().toISOString().slice(0, 7)) };
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
      // Dentro de cada filtro de lista, basta casar com um (OU); entre filtros, todos (E).
      if (filtro.redeIds.length && !p.redeIds.some((id) => filtro.redeIds.includes(id))) return;
      if (filtro.tagIds.length && !p.tagIds.some((id) => filtro.tagIds.includes(id))) return;
      if (filtro.prioridades.length && !(p.prioridade && filtro.prioridades.includes(p.prioridade))) return;
      entradas.push({ tipo, p, data });
    });
  });
  entradas.sort((a, b) => a.data.localeCompare(b.data) || a.p.seq - b.p.seq);

  const todas = entradas.map((e) => e.p);
  const scores = todas.map((p) => p.score).filter((n): n is number => typeof n === 'number');
  const comScore = entradas.filter((e) => typeof e.p.score === 'number').sort((a, b) => b.p.score! - a.p.score!);
  const primeiraData = entradas[0]?.data;
  const ultimaData = entradas[entradas.length - 1]?.data;

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
    faixas: FAIXAS_SCORE.map((f) => {
      const n = scores.filter((s) => s >= f.min && s <= f.max).length;
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
