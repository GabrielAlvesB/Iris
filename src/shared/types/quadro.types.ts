import type { BaseEntity } from './common.types';

export type QuadroBlockType = 'nota' | 'tarefa' | 'rotina';
export type QuadroBlockStatus = 'todo' | 'doing' | 'done';

export interface QuadroBlock extends BaseEntity {
  type: QuadroBlockType;
  title: string;
  content?: string;
  status?: QuadroBlockStatus;
  assignee?: string;
  routineDays?: number[];
  routineTime?: string;
  streakCount?: number;
  /**
   * Rotina: o último dia (AAAA-MM-DD local) em que foi feita. É o que a tela
   * Hoje lê para tirar a rotina da lista do dia; o 🔥 continua sendo o contador.
   */
  rotinaFeitaEm?: string;
  /** Rotina: os dias (AAAA-MM-DD) em que foi feita, os últimos 120 — a revisão da semana conta por eles. */
  feitasEm?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface QuadroConnection extends BaseEntity {
  fromBlockId: string;
  toBlockId: string;
  label?: string;
}

export interface QuadroViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface QuadroFile {
  schemaVersion: number;
  updatedAt: string;
  boardName: string;
  blocks: QuadroBlock[];
  connections: QuadroConnection[];
  viewport: QuadroViewport;
}

export interface CreateBlockInput {
  type: QuadroBlockType;
  title: string;
  content?: string;
  assignee?: string;
  routineDays?: number[];
  routineTime?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
}

export interface MarcarRotinaInput {
  blockId: string;
  /** AAAA-MM-DD local do dia marcado. */
  data: string;
  feita: boolean;
}

export interface UpdateBlockInput {
  blockId: string;
  title?: string;
  content?: string;
  type?: QuadroBlockType;
  status?: QuadroBlockStatus | null;
  assignee?: string;
  routineDays?: number[];
  routineTime?: string;
  streakCount?: number;
  color?: string;
  width?: number;
  height?: number;
}

export interface MoveBlockInput {
  blockId: string;
  x: number;
  y: number;
}

export interface CreateConnectionInput {
  fromBlockId: string;
  toBlockId: string;
  label?: string;
}
