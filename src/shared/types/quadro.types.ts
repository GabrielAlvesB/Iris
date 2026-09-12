import type { BaseEntity } from './common.types';

export type QuadroBlockType = 'nota' | 'tarefa' | 'rotina';
export type QuadroBlockStatus = 'todo' | 'doing' | 'done';

export interface QuadroBlock extends BaseEntity {
  type: QuadroBlockType;
  title: string;
  content?: string;
  status?: QuadroBlockStatus;
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
  blocks: QuadroBlock[];
  connections: QuadroConnection[];
  viewport: QuadroViewport;
}

export interface CreateBlockInput {
  type: QuadroBlockType;
  title: string;
  content?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
}

export interface UpdateBlockInput {
  blockId: string;
  title?: string;
  content?: string;
  type?: QuadroBlockType;
  status?: QuadroBlockStatus | null;
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
