import type { BaseEntity } from './common.types';

/**
 * Gestão de tráfego pago: contas (clientes/empresas), sites e páginas de
 * destino, campanhas por plataforma e os registros diários de resultado
 * (investimento, impressões, cliques, conversões, receita).
 *
 * Tudo é digitado ou importado de planilha — o Iris não fala com as APIs das
 * plataformas de anúncio. As métricas derivadas (CTR, CPC, CPA, ROAS…) nunca
 * são gravadas: saem sempre da soma dos registros (`calcularMetricas`).
 */

export const PLATAFORMAS_TRAFEGO = [
  { id: 'meta', rotulo: 'Meta Ads' },
  { id: 'google', rotulo: 'Google Ads' },
  { id: 'tiktok', rotulo: 'TikTok Ads' },
  { id: 'youtube', rotulo: 'YouTube Ads' },
  { id: 'linkedin', rotulo: 'LinkedIn Ads' },
  { id: 'pinterest', rotulo: 'Pinterest Ads' },
  { id: 'outra', rotulo: 'Outra' },
] as const;

export type PlataformaTrafego = (typeof PLATAFORMAS_TRAFEGO)[number]['id'];

export const OBJETIVOS_TRAFEGO = [
  { id: 'trafego', rotulo: 'Tráfego' },
  { id: 'conversao', rotulo: 'Conversão' },
  { id: 'leads', rotulo: 'Leads' },
  { id: 'vendas', rotulo: 'Vendas' },
  { id: 'alcance', rotulo: 'Alcance' },
  { id: 'engajamento', rotulo: 'Engajamento' },
  { id: 'visualizacoes', rotulo: 'Visualizações de vídeo' },
] as const;

export type ObjetivoTrafego = (typeof OBJETIVOS_TRAFEGO)[number]['id'];

export const STATUS_CAMPANHA = [
  { id: 'planejamento', rotulo: 'Planejamento' },
  { id: 'ativa', rotulo: 'Ativa' },
  { id: 'pausada', rotulo: 'Pausada' },
  { id: 'encerrada', rotulo: 'Encerrada' },
] as const;

export type StatusCampanha = (typeof STATUS_CAMPANHA)[number]['id'];

export const TIPOS_SITE = [
  { id: 'site', rotulo: 'Site' },
  { id: 'landing', rotulo: 'Landing page' },
  { id: 'loja', rotulo: 'Loja' },
  { id: 'publicacao', rotulo: 'Publicação / post' },
  { id: 'outro', rotulo: 'Outro' },
] as const;

export type TipoSite = (typeof TIPOS_SITE)[number]['id'];

export function isPlataformaTrafego(v: unknown): v is PlataformaTrafego {
  return typeof v === 'string' && PLATAFORMAS_TRAFEGO.some((p) => p.id === v);
}
export function isObjetivoTrafego(v: unknown): v is ObjetivoTrafego {
  return typeof v === 'string' && OBJETIVOS_TRAFEGO.some((o) => o.id === v);
}
export function isStatusCampanha(v: unknown): v is StatusCampanha {
  return typeof v === 'string' && STATUS_CAMPANHA.some((s) => s.id === v);
}
export function isTipoSite(v: unknown): v is TipoSite {
  return typeof v === 'string' && TIPOS_SITE.some((t) => t.id === v);
}

/** Cliente/empresa atendida. As tags ligam a conta às mesmas empresas de Relatórios e Roteiros. */
export interface ContaTrafego extends BaseEntity {
  nome: string;
  tagIds: string[];
  /** Verba do mês, em reais. */
  orcamentoMensal?: number;
  observacoes: string;
}

export interface SiteTrafego extends BaseEntity {
  nome: string;
  url: string;
  tipo: TipoSite;
  contaId?: string;
  /** O que a página deve fazer o visitante fazer. */
  objetivo: string;
  pixel: boolean;
  analytics: boolean;
  observacoes: string;
}

export interface LinkCampanha {
  id: string;
  rotulo: string;
  url: string;
}

/** Resultado de um dia. Um registro por dia por campanha: importar o mesmo dia substitui. */
export interface RegistroTrafego {
  id: string;
  /** YYYY-MM-DD */
  data: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  receita: number;
}

export interface Campanha extends BaseEntity {
  seq: number;
  nome: string;
  contaId?: string;
  siteId?: string;
  plataforma: PlataformaTrafego;
  objetivo: ObjetivoTrafego;
  status: StatusCampanha;
  /** Posição dentro da coluna do status (o quadro é arrastável). */
  ordem: number;
  inicio?: string;
  fim?: string;
  orcamentoDiario?: number;
  orcamentoTotal?: number;
  publico: string;
  criativos: string;
  anotacoes: string;
  links: LinkCampanha[];
  /** Ordenados por data. */
  registros: RegistroTrafego[];
}

export interface TrafegoFile {
  schemaVersion: number;
  updatedAt: string;
  seqAtual: number;
  contas: ContaTrafego[];
  sites: SiteTrafego[];
  campanhas: Campanha[];
}

// ---------- Entradas ----------

export interface SalvarContaInput {
  id?: string;
  nome: string;
  tagIds: string[];
  orcamentoMensal?: number;
  observacoes: string;
}

export interface SalvarSiteInput {
  id?: string;
  nome: string;
  url: string;
  tipo: TipoSite;
  contaId?: string;
  objetivo: string;
  pixel: boolean;
  analytics: boolean;
  observacoes: string;
}

export interface CriarCampanhaInput {
  nome: string;
  contaId?: string;
  plataforma: PlataformaTrafego;
  objetivo: ObjetivoTrafego;
}

export type AtualizarCampanhaInput = { campanhaId: string } & Partial<
  Pick<
    Campanha,
    | 'nome'
    | 'contaId'
    | 'siteId'
    | 'plataforma'
    | 'objetivo'
    | 'inicio'
    | 'fim'
    | 'orcamentoDiario'
    | 'orcamentoTotal'
    | 'publico'
    | 'criativos'
    | 'anotacoes'
    | 'links'
  >
>;

export interface MoverCampanhaInput {
  campanhaId: string;
  status: StatusCampanha;
  /** Posição na coluna de destino. */
  indice: number;
}

export interface SalvarRegistroInput {
  campanhaId: string;
  registro: Omit<RegistroTrafego, 'id'> & { id?: string };
}

export interface RemoverRegistroInput {
  campanhaId: string;
  registroId: string;
}

export interface ImportarRegistrosResult {
  file: TrafegoFile | null;
  /** null = o usuário cancelou o diálogo. */
  importados: number | null;
  ignorados: number;
  /** Colunas reconhecidas, para a tela dizer o que foi lido. */
  colunasLidas: string[];
}

// ---------- Métricas derivadas (usadas pelos dois lados) ----------

export interface Totais {
  investimento: number;
  impressoes: number;
  cliques: number;
  conversoes: number;
  receita: number;
}

export interface Metricas extends Totais {
  /** Cliques / impressões, em %. */
  ctr?: number;
  /** Investimento / cliques. */
  cpc?: number;
  /** Investimento por mil impressões. */
  cpm?: number;
  /** Investimento / conversões. */
  cpa?: number;
  /** Conversões / cliques, em %. */
  taxaConversao?: number;
  /** Receita / investimento. */
  roas?: number;
}

export function somar(registros: RegistroTrafego[]): Totais {
  return registros.reduce<Totais>(
    (t, r) => ({
      investimento: t.investimento + r.investimento,
      impressoes: t.impressoes + r.impressoes,
      cliques: t.cliques + r.cliques,
      conversoes: t.conversoes + r.conversoes,
      receita: t.receita + r.receita,
    }),
    { investimento: 0, impressoes: 0, cliques: 0, conversoes: 0, receita: 0 },
  );
}

/** Razões ficam indefinidas quando o denominador é zero — melhor "—" que um 0 enganoso. */
export function calcularMetricas(t: Totais): Metricas {
  const div = (a: number, b: number): number | undefined => (b > 0 ? a / b : undefined);
  return {
    ...t,
    ctr: div(t.cliques * 100, t.impressoes),
    cpc: div(t.investimento, t.cliques),
    cpm: div(t.investimento * 1000, t.impressoes),
    cpa: div(t.investimento, t.conversoes),
    taxaConversao: div(t.conversoes * 100, t.cliques),
    roas: t.receita > 0 ? div(t.receita, t.investimento) : undefined,
  };
}
