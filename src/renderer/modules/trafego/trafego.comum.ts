import {
  PLATAFORMAS_TRAFEGO,
  calcularMetricas,
  somar,
  type Campanha,
  type Metricas,
  type PlataformaTrafego,
  type RegistroTrafego,
  type StatusCampanha,
  type TrafegoFile,
} from '../../../shared/types/trafego.types.js';
import type { Tom } from '../../ui/pagina.js';
import { formatarNumero } from '../postagens/postagens.graficos.js';
import { hojeIso, somarDias } from '../postagens/postagens.ui.js';

/** O que as partes da tela de Tráfego dividem: ícones, formatação e os recortes de período. */

export type Periodo = '7' | '30' | '90' | 'mes' | 'tudo';

export const ICONES = {
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
  trofeu: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
} as const;

export const TOM_STATUS: Record<StatusCampanha, Tom> = {
  planejamento: 'neutro',
  ativa: 'ok',
  pausada: 'atencao',
  encerrada: 'neutro',
};

/** Sigla curta da plataforma, para o selo colorido (a cor vem do CSS: `.tf-plataforma.is-<id>`). */
export const SIGLA_PLATAFORMA: Record<PlataformaTrafego, string> = {
  meta: 'Meta',
  google: 'Google',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  outra: 'Outra',
};

export function moeda(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Moeda sem centavos, para números grandes em destaque. */
export function moedaCurta(n: number): string {
  return Math.abs(n) >= 1000 ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : moeda(n);
}

export function talvez(n: number | undefined, formatar: (v: number) => string): string {
  return n === undefined ? '—' : formatar(n);
}

export function pct(n: number | undefined): string {
  return talvez(n, (v) => `${formatarNumero(v, 2)}%`);
}

export function vezes(n: number | undefined): string {
  return talvez(n, (v) => `${formatarNumero(v, 2)}×`);
}

export function rotulo<T extends string>(lista: ReadonlyArray<{ id: T; rotulo: string }>, id: T): string {
  return lista.find((x) => x.id === id)?.rotulo ?? id;
}

export function rotuloPlataforma(id: PlataformaTrafego): string {
  return rotulo(PLATAFORMAS_TRAFEGO, id);
}

export function nomeConta(file: TrafegoFile, contaId?: string): string {
  return file.contas.find((c) => c.id === contaId)?.nome ?? 'Sem conta';
}

export function metricasDe(registros: RegistroTrafego[]): Metricas {
  return calcularMetricas(somar(registros));
}

// ---------- Períodos ----------

export interface Intervalo {
  /** Ausente = desde o começo. */
  inicio?: string;
  fim: string;
}

export function intervaloDo(periodo: Periodo): Intervalo {
  const hoje = hojeIso();
  switch (periodo) {
    case '7':
      return { inicio: somarDias(hoje, -6), fim: hoje };
    case '30':
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case '90':
      return { inicio: somarDias(hoje, -89), fim: hoje };
    case 'mes':
      return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
    case 'tudo':
      return { fim: hoje };
  }
}

function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb!, mb! - 1, db!) - Date.UTC(ya!, ma! - 1, da!)) / 86_400_000);
}

/**
 * O mesmo tamanho logo antes, para a comparação ("este mês" compara com os
 * mesmos dias do mês anterior até o dia de hoje). "Tudo" não tem anterior.
 */
export function intervaloAnterior(periodo: Periodo): Intervalo | null {
  const atual = intervaloDo(periodo);
  if (!atual.inicio) return null;
  if (periodo === 'mes') {
    const [a, m] = atual.inicio.split('-').map(Number);
    const ano = m === 1 ? a! - 1 : a!;
    const mes = m === 1 ? 12 : m! - 1;
    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dia = Math.min(Number(atual.fim.slice(8, 10)), ultimoDia);
    return { inicio, fim: `${inicio.slice(0, 8)}${String(dia).padStart(2, '0')}` };
  }
  const tamanho = diasEntre(atual.inicio, atual.fim);
  const fim = somarDias(atual.inicio, -1);
  return { inicio: somarDias(fim, -tamanho), fim };
}

export function dentro(intervalo: Intervalo, data: string): boolean {
  return (!intervalo.inicio || data >= intervalo.inicio) && data <= intervalo.fim;
}

export function registrosNo(campanhas: Campanha[], intervalo: Intervalo): RegistroTrafego[] {
  return campanhas.flatMap((c) => c.registros.filter((r) => dentro(intervalo, r.data)));
}

export function descreverPeriodo(periodo: Periodo): string {
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

export function descreverAnterior(periodo: Periodo): string {
  switch (periodo) {
    case '7':
      return 'os 7 dias antes';
    case '30':
      return 'os 30 dias antes';
    case '90':
      return 'os 90 dias antes';
    case 'mes':
      return 'o mesmo trecho do mês passado';
    case 'tudo':
      return '';
  }
}

export interface PontoSerie {
  chave: string;
  rotulo: string;
  investimento: number;
  conversoes: number;
  cliques: number;
  receita: number;
}

/** Dias (ou meses, se o recorte passa de ~3 meses) com os totais de cada um. */
export function serieTemporal(registros: RegistroTrafego[], intervalo: Intervalo): PontoSerie[] {
  if (!registros.length) return [];
  const datas = registros.map((r) => r.data).sort();
  const primeiro = intervalo.inicio ?? datas[0]!;
  const ultimo = intervalo.fim < datas[datas.length - 1]! ? datas[datas.length - 1]! : intervalo.fim;
  const chaves: string[] = [];
  for (let d = primeiro; d <= ultimo && chaves.length < 400; d = somarDias(d, 1)) chaves.push(d);
  const porMes = chaves.length > 92;
  const grupos = new Map<string, Omit<PontoSerie, 'chave' | 'rotulo'>>();
  (porMes ? [...new Set(chaves.map((d) => d.slice(0, 7)))] : chaves).forEach((k) => grupos.set(k, { investimento: 0, conversoes: 0, cliques: 0, receita: 0 }));
  registros.forEach((r) => {
    const g = grupos.get(porMes ? r.data.slice(0, 7) : r.data);
    if (!g) return;
    g.investimento += r.investimento;
    g.conversoes += r.conversoes;
    g.cliques += r.cliques;
    g.receita += r.receita;
  });
  return [...grupos].map(([chave, v]) => ({
    chave,
    rotulo: porMes ? `${chave.slice(5, 7)}/${chave.slice(2, 4)}` : `${chave.slice(8, 10)}/${chave.slice(5, 7)}`,
    ...v,
  }));
}
