import type { AtualizarPostagemComum, CriarPostagemComum, PostagemBase } from './postagens.types.js';

/**
 * Publicação de imagem (post estático, carrossel, story). O Iris não guarda o
 * arquivo da arte: a postagem registra nome, textos e dados da publicação. A
 * arte, se quiser, fica ligada por Materiais (um caminho da Biblioteca).
 */

/**
 * Etapas da imagem. Mesmas fases dos vídeos, com o trabalho do meio próprio de
 * arte (briefing, criação, revisão). "pronto", "agendado", "publicado" e
 * "arquivado" têm o mesmo efeito em todos os tipos.
 */
export const IMAGEM_STATUS = [
  { id: 'ideia', rotulo: 'Ideias', fase: 'pre' },
  { id: 'briefing', rotulo: 'Briefing', fase: 'pre' },
  { id: 'criacao', rotulo: 'Criação', fase: 'producao' },
  { id: 'revisao', rotulo: 'Revisão', fase: 'producao' },
  { id: 'pronto', rotulo: 'Pronto', fase: 'distribuicao' },
  { id: 'agendado', rotulo: 'Agendado', fase: 'distribuicao' },
  { id: 'publicado', rotulo: 'Publicado', fase: 'distribuicao' },
  { id: 'arquivado', rotulo: 'Arquivado', fase: 'fora' },
] as const;

export type ImagemStatus = (typeof IMAGEM_STATUS)[number]['id'];

export function isImagemStatus(valor: unknown): valor is ImagemStatus {
  return typeof valor === 'string' && IMAGEM_STATUS.some((s) => s.id === valor);
}

/** Proporções usuais das redes; carrossel conta as peças à parte. */
export const FORMATOS_IMAGEM = [
  { id: 'quadrado', rotulo: 'Quadrado 1:1', proporcao: [1, 1] },
  { id: 'retrato', rotulo: 'Retrato 4:5', proporcao: [4, 5] },
  { id: 'story', rotulo: 'Story 9:16', proporcao: [9, 16] },
  { id: 'paisagem', rotulo: 'Paisagem 16:9', proporcao: [16, 9] },
  { id: 'carrossel', rotulo: 'Carrossel', proporcao: [4, 5] },
] as const;

export type FormatoImagem = (typeof FORMATOS_IMAGEM)[number]['id'];

export function isFormatoImagem(valor: unknown): valor is FormatoImagem {
  return typeof valor === 'string' && FORMATOS_IMAGEM.some((f) => f.id === valor);
}

export function rotuloFormato(formato: FormatoImagem): string {
  return FORMATOS_IMAGEM.find((f) => f.id === formato)?.rotulo ?? formato;
}

/** Máximo de peças num carrossel (o do Instagram, hoje o mais permissivo). */
export const MAX_SLIDES = 20;

export interface Imagem extends PostagemBase<ImagemStatus> {
  formato: FormatoImagem;
  /** Só para carrossel: quantas peças (2 a MAX_SLIDES). */
  quantidadeSlides?: number;
  /** O que a arte precisa comunicar: pedido para quem vai criar. */
  briefing: string;
  /** Texto que vai escrito na própria arte (título, chamada). */
  textoNaArte: string;
  /** Legenda da publicação; as #hashtags dela viram `hashtags`. */
  legenda: string;
  /** Derivado da legenda na leitura. */
  hashtags: string[];
  /** Descrição para acessibilidade (alt text). */
  textoAlternativo: string;
  /** Chamada para ação (ex.: "Link na bio"). */
  cta: string;
  /** Link de destino da publicação, se houver. */
  link: string;
  /** Autoria da arte, banco de imagens, fotógrafo. */
  creditos: string;
}

export interface ImagensFile {
  schemaVersion: number;
  updatedAt: string;
  seqAtual: number;
  imagens: Imagem[];
}

export interface CriarImagemInput extends CriarPostagemComum<ImagemStatus> {
  formato?: FormatoImagem;
}

export interface AtualizarImagemInput extends AtualizarPostagemComum<ImagemStatus> {
  imagemId: string;
  formato?: FormatoImagem;
  /** null limpa. */
  quantidadeSlides?: number | null;
  briefing?: string;
  textoNaArte?: string;
  legenda?: string;
  textoAlternativo?: string;
  cta?: string;
  link?: string;
  creditos?: string;
}

export interface MoverImagemInput {
  imagemId: string;
  status: ImagemStatus;
  indice: number;
}

export interface ArquivarImagemInput {
  imagemId: string;
  motivo: 'cancelado' | 'arquivado';
}
