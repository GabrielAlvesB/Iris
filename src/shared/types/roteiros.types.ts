import type { BaseEntity } from './common.types';

/**
 * Roteiros: o texto de um conteúdo antes de ele existir. Passa por rascunho →
 * revisão → aprovado (ou reprovado, que volta a rascunho quando editado) e,
 * aprovado, vira um card no Kanban para ser produzido.
 *
 * Tags são as do catálogo único de Postagens (as mesmas que marcam a empresa
 * de um relatório), guardadas por id.
 */

export const STATUS_ROTEIRO = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'revisao', rotulo: 'Em revisão' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'reprovado', rotulo: 'Reprovado' },
] as const;

export type StatusRoteiro = (typeof STATUS_ROTEIRO)[number]['id'];

export function isStatusRoteiro(v: unknown): v is StatusRoteiro {
  return typeof v === 'string' && STATUS_ROTEIRO.some((s) => s.id === v);
}

export const FORMATOS_ROTEIRO = [
  { id: 'reels', rotulo: 'Reels / vídeo curto' },
  { id: 'youtube', rotulo: 'YouTube' },
  { id: 'carrossel', rotulo: 'Carrossel' },
  { id: 'live', rotulo: 'Live / aula' },
  { id: 'outro', rotulo: 'Outro' },
] as const;

export type FormatoRoteiro = (typeof FORMATOS_ROTEIRO)[number]['id'];

export function isFormatoRoteiro(v: unknown): v is FormatoRoteiro {
  return typeof v === 'string' && FORMATOS_ROTEIRO.some((f) => f.id === v);
}

export interface ItemChecklist {
  id: string;
  texto: string;
  feito: boolean;
}

export interface EventoRoteiro {
  em: string;
  status: StatusRoteiro;
  comentario: string;
}

export interface Roteiro extends BaseEntity {
  seq: number;
  titulo: string;
  tagIds: string[];
  formato: FormatoRoteiro;
  /** Texto livre ("45s", "8 min"). */
  duracao: string;
  /** Opcional: resumo do gancho para o card do Kanban (o roteiro em si vai em `texto`). */
  gancho: string;
  /**
   * O roteiro, livre, em markdown: títulos (#), seções com tempo
   * ("## [0:00 - 0:50] Abertura"), notas de cena entre colchetes, listas,
   * **negrito**, separadores (---).
   */
  texto: string;
  cta: string;
  observacoes: string;
  checklist: ItemChecklist[];
  status: StatusRoteiro;
  /** Do mais antigo ao mais novo. */
  historico: EventoRoteiro[];
  /** Card criado na aprovação; some se o card for apagado no Kanban. */
  kanbanCardId?: string;
}

export interface RoteirosFile {
  schemaVersion: number;
  updatedAt: string;
  seqAtual: number;
  roteiros: Roteiro[];
  /** Itens com que todo roteiro novo nasce na verificação. */
  checklistPadrao: string[];
}

export interface CriarRoteiroInput {
  titulo: string;
  formato?: FormatoRoteiro;
  tagIds?: string[];
  /** Roteiro colado já na criação. */
  texto?: string;
  duracao?: string;
}

/** Campos editáveis; status muda só por `mudarStatus`/`aprovar`. */
export type AtualizarRoteiroInput = { roteiroId: string } & Partial<
  Pick<Roteiro, 'titulo' | 'tagIds' | 'formato' | 'duracao' | 'gancho' | 'texto' | 'cta' | 'observacoes' | 'checklist'>
>;

export interface MudarStatusRoteiroInput {
  roteiroId: string;
  status: Exclude<StatusRoteiro, 'aprovado'>;
  comentario?: string;
}

export interface AprovarRoteiroInput {
  roteiroId: string;
  comentario?: string;
}
