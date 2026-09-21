import type { BaseEntity } from './common.types';

/** Para onde um pensamento foi promovido, quando deixou de ser só uma captura solta. */
export type PromocaoTipo = 'kanban' | 'quadro';

export interface Promocao {
  tipo: PromocaoTipo;
  /** Id do card do Kanban ou do bloco do Quadro. */
  refId: string;
  em: string;
}

export interface Pensamento extends BaseEntity {
  texto: string;
  /** Derivadas do texto por extrairTags(); normalizadas em minúsculas, sem o '#'. */
  tags: string[];
  fixado: boolean;
  promovidoPara?: Promocao;
}

export interface PensamentosFile {
  schemaVersion: number;
  updatedAt: string;
  /** Sempre do mais recente para o mais antigo. */
  pensamentos: Pensamento[];
}

export interface CreatePensamentoInput {
  texto: string;
}

export interface UpdatePensamentoInput {
  pensamentoId: string;
  texto: string;
}

export interface MarcarPromovidoInput {
  pensamentoId: string;
  tipo: PromocaoTipo;
  refId: string;
}
