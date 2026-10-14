import type { SessaoFoco } from './pomodoro.types';
import type { BaseEntity } from './common.types';

export type KanbanPriority = 'low' | 'medium' | 'high';

export interface KanbanSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface KanbanCard extends BaseEntity {
  title: string;
  description?: string;
  tags?: string[];
  priority?: KanbanPriority;
  dueDate?: string;
  assignee?: string;
  subtasks?: KanbanSubtask[];
  columnId: string;
  order: number;
  seq?: number;
  /** Sessões de foco do Pomodoro (o total é sempre a soma, nunca gravado). */
  tempo?: SessaoFoco[];
  /** Arquivos da Biblioteca ligados ao card (por id, como nas Postagens). */
  recursoIds?: string[];
  /** Descrição lida como Markdown (botão no painel; desligado = texto puro, como sempre). */
  markdown?: boolean;
  /** ISO de quando entrou na última coluna (a revisão da semana conta por ele). */
  concluidoEm?: string;
  /** Empresa do catálogo único de Postagens (tag com `empresa: true`), a mesma de relatórios e postagens. */
  empresaId?: string;
}

export interface KanbanColumn extends BaseEntity {
  title: string;
  order: number;
  color?: string;
  wipLimit?: number;
}

export interface KanbanBoard extends BaseEntity {
  name: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  cardSeq?: number;
}

export interface KanbanFile {
  schemaVersion: number;
  updatedAt: string;
  boards: KanbanBoard[];
}

export interface CreateColumnInput {
  title: string;
  color?: string;
}

export interface RenameColumnInput {
  columnId: string;
  title: string;
  wipLimit?: number | null;
}

export interface ReorderColumnsInput {
  orderedColumnIds: string[];
}

export interface CreateCardInput {
  columnId: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: KanbanPriority;
  dueDate?: string;
  assignee?: string;
  subtasks?: KanbanSubtask[];
  empresaId?: string;
}

export interface UpdateCardInput {
  cardId: string;
  /** '' ou null tira a empresa. */
  empresaId?: string | null;
  recursoIds?: string[];
  markdown?: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  priority?: KanbanPriority;
  dueDate?: string;
  assignee?: string;
  subtasks?: KanbanSubtask[];
}

export interface MoveCardInput {
  cardId: string;
  toColumnId: string;
  toIndex: number;
}
