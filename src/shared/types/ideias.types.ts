import type { TipoPostagem } from './postagens.types';

/**
 * Banco de ideias de conteúdo: ideias soltas que, com um clique, viram uma
 * postagem na primeira etapa da pipeline. Mora na aba "Ideias" de Postagens.
 * Tags e redes são as do catálogo único (videos.json).
 */

export interface Ideia {
  id: string;
  titulo: string;
  notas: string;
  tagIds: string[];
  redeIds: string[];
  criadaEm: string;
  atualizadaEm: string;
  arquivada: boolean;
  /** Já virou postagem: sai da lista de pendentes e guarda o link para ela. */
  virouPostagem?: { tipo: TipoPostagem; id: string; em: string };
}

export interface IdeiasFile {
  schemaVersion: number;
  ideias: Ideia[];
}

export interface AtualizarIdeiaInput {
  id: string;
  titulo?: string;
  notas?: string;
  tagIds?: string[];
  redeIds?: string[];
  arquivada?: boolean;
}

export interface ResultadoVirarPostagem {
  file: IdeiasFile;
  postagem: { tipo: TipoPostagem; id: string };
}

export const TITULO_IDEIA_MAX = 200;
