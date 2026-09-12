import type { BaseEntity } from './common.types';

export interface WhitelistItem extends BaseEntity {
  fileName: string;
  done: boolean;
  verified: boolean;
  note?: string;
  size?: number;
  linkedCardId?: string;
}

export interface ArquivosFile {
  schemaVersion: number;
  updatedAt: string;
  items: WhitelistItem[];
}

export interface UpdateNoteInput {
  itemId: string;
  note: string;
}

export interface AddFileEntry {
  fileName: string;
  size?: number;
}

export interface LinkFileToCardInput {
  itemId: string;
  cardId: string | null;
}
