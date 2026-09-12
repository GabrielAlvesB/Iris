export type MarkdownSource = 'external' | 'iris';

export interface MarkdownFileMeta {
  path: string;
  name: string;
  folder: string;
  mtime: string;
  source: MarkdownSource;
  linkedCardId?: string;
}

export interface MarkdownConfig {
  linkedFolder: string | null;
  files: MarkdownFileMeta[];
}

export interface MarkdownFileContent {
  path: string;
  content: string;
}

export interface WriteMarkdownInput {
  path: string;
  content: string;
}

export interface CreateMarkdownInput {
  name: string;
  target: 'linked' | 'iris';
}

export interface LinkMarkdownToCardInput {
  path: string;
  cardId: string | null;
}

export interface ExportMarkdownPdfInput {
  html: string;
  suggestedName: string;
}

export interface OpenMarkdownFileResult {
  canceled: boolean;
  path?: string;
  config?: MarkdownConfig;
}
