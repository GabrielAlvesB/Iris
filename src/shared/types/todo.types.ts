import type { BaseEntity } from './common.types';

/**
 * To-do: várias checklists independentes, cada uma com seus itens. Uma
 * checklist pode ser enviada ao Kanban (vira card com as subtarefas); ela
 * continua aqui, marcada como enviada — o card é uma cópia, como o do roteiro
 * aprovado.
 */

export const PRIORIDADES_TODO = [
  { id: 'alta', rotulo: 'Alta' },
  { id: 'media', rotulo: 'Média' },
  { id: 'baixa', rotulo: 'Baixa' },
] as const;

export type PrioridadeTodo = (typeof PRIORIDADES_TODO)[number]['id'];

export function isPrioridadeTodo(valor: unknown): valor is PrioridadeTodo {
  return typeof valor === 'string' && PRIORIDADES_TODO.some((p) => p.id === valor);
}

/** Cores da faixa lateral do cartão. A primeira é a padrão (o acento do app). */
export const CORES_TODO = ['#8b7cf6', '#3987e5', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#9498a3'] as const;

export interface ItemTodo {
  id: string;
  texto: string;
  feito: boolean;
  criadoEm: string;
  feitoEm?: string;
}

export interface EnvioKanban {
  destino: 'kanban';
  kanbanCardId: string;
  /** Nome da coluna no momento do envio — o card pode mudar de coluna depois. */
  colunaNome: string;
  em: string;
}

export interface Checklist extends BaseEntity {
  titulo: string;
  descricao: string;
  cor: string;
  prioridade?: PrioridadeTodo;
  /** YYYY-MM-DD */
  prazo?: string;
  itens: ItemTodo[];
  /** Posição na ordem manual (arrastar). */
  ordem: number;
  arquivada: boolean;
  envio?: EnvioKanban;
}

export interface TodoFile {
  schemaVersion: number;
  updatedAt: string;
  checklists: Checklist[];
}

export interface CriarChecklistInput {
  titulo: string;
  descricao?: string;
  cor?: string;
  prioridade?: PrioridadeTodo;
  prazo?: string;
  /** Itens iniciais, um por entrada. */
  itens?: string[];
}

/** String vazia em prioridade/prazo limpa o valor (undefined não sobrevive bem ao IPC). */
export interface AtualizarChecklistInput {
  checklistId: string;
  titulo?: string;
  descricao?: string;
  cor?: string;
  prioridade?: PrioridadeTodo | '';
  prazo?: string;
}

export interface ArquivarChecklistInput {
  checklistId: string;
  arquivada: boolean;
}

export interface AdicionarItensInput {
  checklistId: string;
  textos: string[];
}

export interface AtualizarItemInput {
  checklistId: string;
  itemId: string;
  texto?: string;
  feito?: boolean;
}

export interface RemoverItemInput {
  checklistId: string;
  itemId: string;
}

export interface ReordenarItensInput {
  checklistId: string;
  /** Os ids listados vão primeiro, nesta ordem; os demais seguem como estavam. */
  itemIds: string[];
}

export interface MarcarTodosInput {
  checklistId: string;
  feito: boolean;
}

export interface EnviarAoKanbanInput {
  checklistId: string;
  colunaId: string;
  /** Itens já concluídos vão como subtarefas marcadas; sem isto, ficam de fora. */
  incluirFeitos: boolean;
  /** Já enviada e o card ainda existe: cria outro card mesmo assim. */
  forcarNovo?: boolean;
}
