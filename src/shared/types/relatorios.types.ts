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

export interface SecaoRelatorio {
  id: string;
  titulo: string;
  texto: string;
  itens: ItemRelatorio[];
}

export type SituacaoRelatorio = 'rascunho' | 'finalizado';

export interface Relatorio extends BaseEntity {
  seq: number;
  titulo: string;
  /** Para quem e por quê: cliente, campanha, objetivo. */
  contexto: string;
  /** YYYY-MM-DD */
  periodoInicio?: string;
  periodoFim?: string;
  /** Resumo executivo / informações gerais. */
  resumo: string;
  secoes: SecaoRelatorio[];
  conclusao: string;
  incluirAssinatura: boolean;
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
