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
}

export interface UpdateCardInput {
  cardId: string;
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
