import type { BaseEntity } from './common.types';

/** Um post-it no quadro de pensamentos. */
export interface Pensamento extends BaseEntity {
  texto: string;
  /** Derivadas do texto por extrairTags(); normalizadas em minúsculas, sem o '#'. */
  tags: string[];
  /** Fixado = preso no lugar: não arrasta nem redimensiona. */
  fixado: boolean;
  /** Cor do papel, sempre `#rrggbb`. */
  cor: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Ordem de empilhamento: o maior fica por cima. */
  ordem: number;
}

export interface PensamentosViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PensamentosFile {
  schemaVersion: number;
  updatedAt: string;
  /** Sempre do mais recente para o mais antigo. */
  pensamentos: Pensamento[];
  viewport: PensamentosViewport;
}

export interface CreatePensamentoInput {
  texto?: string;
  cor: string;
  x: number;
  y: number;
}

export interface UpdatePensamentoInput {
  pensamentoId: string;
  texto?: string;
  cor?: string;
}

/** Mover também traz o post-it para cima da pilha. */
export interface MoverPensamentoInput {
  pensamentoId: string;
  x: number;
  y: number;
  largura?: number;
  altura?: number;
}

export const CORES_POSTIT = [
  { cor: '#fde68a', nome: 'Amarelo' },
  { cor: '#fed7aa', nome: 'Laranja' },
  { cor: '#fbcfe8', nome: 'Rosa' },
  { cor: '#ddd6fe', nome: 'Lilás' },
  { cor: '#bfdbfe', nome: 'Azul' },
  { cor: '#bbf7d0', nome: 'Verde' },
  { cor: '#e5e7eb', nome: 'Cinza' },
] as const;

export const COR_POSTIT_PADRAO = '#fde68a';
export const POSTIT_LARGURA = 220;
export const POSTIT_ALTURA = 190;
