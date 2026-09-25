import type { BaseEntity } from './common.types';
import type { CampoExtra, TipoPostagem } from './postagens.types.js';

/**
 * Relatórios de análise: documentos com seções, cada uma com postagens
 * (vídeos, imagens) e as marcações, anotações e observações sobre elas.
 *
 * Um item guarda uma cópia (snapshot) dos dados da postagem no momento em que
 * entrou: apagar ou mudar a postagem depois não quebra o relatório — como a
 * cópia da linha do Sheets num vídeo importado. A tela renova a cópia quando
 * a postagem ainda existe.
 */

export const TIPOS_MARCACAO = [
  { id: 'ponto-forte', rotulo: 'Ponto forte' },
  { id: 'ajuste', rotulo: 'Ajuste' },
  { id: 'problema', rotulo: 'Problema' },
  { id: 'ideia', rotulo: 'Ideia' },
  { id: 'duvida', rotulo: 'Dúvida' },
] as const;

export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number]['id'];

export function isTipoMarcacao(v: unknown): v is TipoMarcacao {
  return typeof v === 'string' && TIPOS_MARCACAO.some((t) => t.id === v);
}

export const STATUS_MARCACAO = [
  { id: 'aberta', rotulo: 'Aberta' },
  { id: 'andamento', rotulo: 'Em andamento' },
  { id: 'resolvida', rotulo: 'Resolvida' },
  { id: 'descartada', rotulo: 'Descartada' },
] as const;

export type StatusMarcacao = (typeof STATUS_MARCACAO)[number]['id'];

export function isStatusMarcacao(v: unknown): v is StatusMarcacao {
  return typeof v === 'string' && STATUS_MARCACAO.some((s) => s.id === v);
}

/** Parte da arte que uma marcação de imagem aponta (o Iris não guarda a arte). */
export const AREAS_IMAGEM = [
  { id: 'geral', rotulo: 'Arte inteira' },
  { id: 'titulo', rotulo: 'Título' },
  { id: 'texto', rotulo: 'Texto na arte' },
  { id: 'fundo', rotulo: 'Fundo' },
  { id: 'elemento', rotulo: 'Elemento visual' },
  { id: 'marca', rotulo: 'Marca / logo' },
  { id: 'cta', rotulo: 'CTA' },
  { id: 'legenda', rotulo: 'Legenda' },
] as const;

export type AreaImagem = (typeof AREAS_IMAGEM)[number]['id'];

export function isAreaImagem(v: unknown): v is AreaImagem {
  return typeof v === 'string' && AREAS_IMAGEM.some((a) => a.id === v);
}

/** Categorias sugeridas na criação do arquivo; o usuário edita por tipo. */
export const CATEGORIAS_PADRAO: Record<TipoPostagem, string[]> = {
  video: ['Gancho', 'Roteiro', 'Edição', 'Áudio', 'Ritmo', 'Legenda', 'CTA'],
  imagem: ['Layout', 'Tipografia', 'Cores', 'Texto', 'Marca', 'CTA'],
};

interface MarcacaoBase {
  id: string;
  tipo: TipoMarcacao;
  comentario: string;
  observacao: string;
  status: StatusMarcacao;
  /** Uma das categorias do tipo (texto livre, para sobreviver a uma categoria apagada). */
  categoria: string;
}

export interface MarcacaoVideo extends MarcacaoBase {
  /** Segundos desde o início do vídeo. */
  tempo: number;
  /** Fim do trecho, quando a marcação cobre um intervalo. */
  tempoFim?: number;
}

export interface MarcacaoImagem extends MarcacaoBase {
  /** Peça do carrossel (1…n); ausente = a publicação inteira. */
  slide?: number;
  area: AreaImagem;
}

/**
 * Cópia do que se sabia da postagem ao entrar no relatório. `dados` são os
 * pares rótulo/valor próprios do tipo (formato, legenda, links publicados…),
 * já prontos para exibir — o documento não precisa conhecer cada tipo.
 */
export interface SnapshotPostagem {
  titulo: string;
  seq: number;
  etapa: string;
  dataAgendada?: string;
  horaAgendada?: string;
  redes: string[];
  tags: string[];
  prioridade?: string;
  score?: number;
  dados: CampoExtra[];
  capturadoEm: string;
}

interface ItemBase {
  id: string;
  postagemId: string;
  snapshot: SnapshotPostagem;
  anotacoes: string;
  observacoes: string;
}

export interface ItemVideo extends ItemBase {
  tipo: 'video';
  marcacoes: MarcacaoVideo[];
}

export interface ItemImagem extends ItemBase {
  tipo: 'imagem';
  marcacoes: MarcacaoImagem[];
}

/** Um item por tipo de postagem; o compilador cobra um novo tipo aqui também. */
export type ItemRelatorio = ItemVideo | ItemImagem;
export type MarcacaoDe<T extends TipoPostagem> = Extract<ItemRelatorio, { tipo: T }>['marcacoes'][number];

// ---------- Blocos livres ----------
// Uma seção tem, na ordem: o texto de abertura, os blocos (na ordem que o
// usuário escolher) e as postagens analisadas.

export const TONS_DESTAQUE = [
  { id: 'info', rotulo: 'Informação' },
  { id: 'ok', rotulo: 'Resultado positivo' },
  { id: 'atencao', rotulo: 'Atenção' },
  { id: 'alerta', rotulo: 'Alerta' },
] as const;

export type TomDestaque = (typeof TONS_DESTAQUE)[number]['id'];

export function isTomDestaque(v: unknown): v is TomDestaque {
  return typeof v === 'string' && TONS_DESTAQUE.some((t) => t.id === v);
}

export type BaseMetricas = 'publicados' | 'todos';

/** O que entra na conta de um bloco de métricas. Listas vazias = sem filtro. */
export interface FiltroMetricas {
  tipos: TipoPostagem[];
  /** YYYY-MM-DD; sem data = sem limite daquele lado. */
  inicio?: string;
  fim?: string;
  base: BaseMetricas;
  redeIds: string[];
  tagIds: string[];
  prioridades: string[];
}

/** Partes opcionais do bloco de métricas (os números principais sempre aparecem). */
export const PARTES_METRICAS = [
  { id: 'porMes', rotulo: 'Tabela por mês' },
  { id: 'faixas', rotulo: 'Faixas de score' },
  { id: 'redes', rotulo: 'Por rede' },
  { id: 'tags', rotulo: 'Por tag' },
  { id: 'postagens', rotulo: 'Lista das postagens' },
] as const;

export type ParteMetricas = (typeof PARTES_METRICAS)[number]['id'];

export function isParteMetricas(v: unknown): v is ParteMetricas {
  return typeof v === 'string' && PARTES_METRICAS.some((p) => p.id === v);
}

export interface LinhaMetrica {
  rotulo: string;
  total: number;
  comScore: number;
  /** Média dos scores; ausente quando ninguém do grupo tem score. */
  media?: number;
}

export interface PostagemMetrica {
  tipo: TipoPostagem;
  seq: number;
  titulo: string;
  /** Dia que contou para o período (YYYY-MM-DD). */
  data: string;
  score?: number;
  redes: string[];
}

/**
 * Números calculados, guardados no relatório: o documento é uma fotografia
 * do momento do cálculo, como a cópia (snapshot) de cada postagem. Nomes de
 * rede e tag vão por extenso — apagar uma tag depois não apaga o dado.
 */
export interface ResultadoMetricas {
  calculadoEm: string;
  /** Filtros escritos por extenso ("Redes: Instagram, TikTok"). */
  filtrosDescritos: string[];
  /** Primeiro e último dia com postagem dentro do filtro. */
  primeiraData?: string;
  ultimaData?: string;
  total: number;
  comScore: number;
  media?: number;
  mediana?: number;
  maior?: { titulo: string; score: number };
  menor?: { titulo: string; score: number };
  porTipo: LinhaMetrica[];
  /** rotulo = YYYY-MM */
  porMes: LinhaMetrica[];
  /** rotulo = id da faixa (FAIXAS_SCORE); total = quantidade na faixa. */
  faixas: LinhaMetrica[];
  redes: LinhaMetrica[];
  tags: LinhaMetrica[];
  postagens: PostagemMetrica[];
}

export interface BlocoTexto {
  id: string;
  tipo: 'texto';
  titulo: string;
  texto: string;
}

export interface BlocoDestaque {
  id: string;
  tipo: 'destaque';
  tom: TomDestaque;
  titulo: string;
  texto: string;
}

export interface BlocoTabela {
  id: string;
  tipo: 'tabela';
  titulo: string;
  colunas: string[];
  linhas: string[][];
}

export interface BlocoMetricas {
  id: string;
  tipo: 'metricas';
  titulo: string;
  filtro: FiltroMetricas;
  partes: ParteMetricas[];
  resultado: ResultadoMetricas | null;
  /** Texto que apresenta os números, antes deles. */
  introducao: string;
  /** Leitura dos números, escrita pelo usuário. */
  comentario: string;
}

export interface BlocoQuebra {
  id: string;
  tipo: 'quebra';
}

/** Um número digitado à mão — para o que não sai do app (alcance, seguidores, vendas…). */
export interface IndicadorManual {
  id: string;
  rotulo: string;
  valor: string;
  /** Texto livre ("+12%", "−3 mil"): o sinal do começo decide a cor no documento. */
  variacao: string;
  nota: string;
}

/** Texto + métrica: indicadores escritos pelo usuário e a análise deles. */
export interface BlocoAnalise {
  id: string;
  tipo: 'analise';
  titulo: string;
  indicadores: IndicadorManual[];
  texto: string;
}

/** Dois textos lado a lado ("Pontos fortes" / "A melhorar"). */
export interface BlocoColunas {
  id: string;
  tipo: 'colunas';
  tituloEsquerda: string;
  textoEsquerda: string;
  tituloDireita: string;
  textoDireita: string;
}

export interface BlocoCitacao {
  id: string;
  tipo: 'citacao';
  texto: string;
  fonte: string;
}

export type BlocoRelatorio =
  | BlocoTexto
  | BlocoDestaque
  | BlocoTabela
  | BlocoMetricas
  | BlocoAnalise
  | BlocoColunas
  | BlocoCitacao
  | BlocoQuebra;
export type TipoBloco = BlocoRelatorio['tipo'];

export interface SecaoRelatorio {
  id: string;
  titulo: string;
  texto: string;
  blocos: BlocoRelatorio[];
  itens: ItemRelatorio[];
}

export type SituacaoRelatorio = 'rascunho' | 'finalizado';

export interface Relatorio extends BaseEntity {
  seq: number;
  titulo: string;
  /**
   * A empresa/cliente do relatório, pelas tags do catálogo único de postagens:
   * a seleção de postagens e os blocos de métricas já vêm filtrados por elas.
   */
  tagIds: string[];
  /** Nomes das tags por extenso, renovados ao salvar — apagar a tag não apaga a empresa do documento. */
  tagsNomes: string[];
  /** Para quem e por quê: cliente, campanha, objetivo. */
  contexto: string;
  /** Objetivos do período (o que se buscava). */
  objetivos: string;
  /** YYYY-MM-DD */
  periodoInicio?: string;
  periodoFim?: string;
  /** Resumo executivo / informações gerais. */
  resumo: string;
  secoes: SecaoRelatorio[];
  conclusao: string;
  /** Próximos passos / recomendações. */
  recomendacoes: string;
  /** Observações finais, depois das recomendações. */
  observacoesFinais: string;
  incluirAssinatura: boolean;
  /** Partes automáticas do documento, que o usuário pode tirar. */
  mostrarIndicadores: boolean;
  mostrarPostagensUtilizadas: boolean;
  situacao: SituacaoRelatorio;
}

export interface RelatoriosFile {
  schemaVersion: number;
  updatedAt: string;
  seqAtual: number;
  relatorios: Relatorio[];
  categorias: Record<TipoPostagem, string[]>;
}

export interface CriarRelatorioInput {
  titulo: string;
  tagIds?: string[];
  contexto?: string;
  periodoInicio?: string;
  periodoFim?: string;
}

export interface SalvarCategoriasInput {
  tipo: TipoPostagem;
  categorias: string[];
}

export interface ExportarPdfInput {
  relatorioId: string;
  /** Nome sugerido no diálogo de salvar, sem extensão. */
  nomeArquivo: string;
}

/** Converte "1:05", "01:02:03" ou "75" em segundos. undefined se não for tempo. */
export function parseTempo(texto: string): number | undefined {
  const limpo = texto.trim();
  if (!limpo) return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(limpo)) return undefined;
  const partes = limpo.split(':').map(Number);
  if (partes.slice(1).some((p) => p >= 60)) return undefined;
  return partes.reduce((total, p) => total * 60 + p, 0);
}

/** Segundos em "m:ss" ou "h:mm:ss". */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const resto = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${resto}` : `${m}:${resto}`;
}
