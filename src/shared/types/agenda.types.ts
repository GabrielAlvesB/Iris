import type { BaseEntity } from './common.types';

export interface AgendaItem extends BaseEntity {
  videoOrigem?: string;
  formato?: string;
  arquivo?: string;
  duracao?: string;
  titulo: string;
  descricao?: string;
  hashtags?: string;
  plataforma?: string;
  dataAgendada?: string;
  status?: string;
  observacao?: string;
  extra?: Record<string, unknown>;
}

export interface AgendaFile {
  schemaVersion: number;
  updatedAt: string;
  items: AgendaItem[];
}

export interface AgendaItemInput {
  videoOrigem?: string;
  formato?: string;
  arquivo?: string;
  duracao?: string;
  titulo: string;
  descricao?: string;
  hashtags?: string;
  plataforma?: string;
  dataAgendada?: string;
  status?: string;
  observacao?: string;
}

export interface UpdateAgendaItemInput extends Partial<AgendaItemInput> {
  itemId: string;
}

export interface ImportAgendaResult {
  file: AgendaFile;
  importedCount: number;
}
