import type { BaseEntity } from './common.types';

export interface CopySnippet extends BaseEntity {
  title: string;
  text: string;
  group?: string;
  order: number;
}

export interface CopyFile {
  schemaVersion: number;
  updatedAt: string;
  snippets: CopySnippet[];
}

export interface CreateSnippetInput {
  title: string;
  text: string;
  group?: string;
}

export interface UpdateSnippetInput {
  snippetId: string;
  title?: string;
  text?: string;
  group?: string;
}

export interface ImportTxtResult {
  canceled: boolean;
  fileName?: string;
  content?: string;
}
