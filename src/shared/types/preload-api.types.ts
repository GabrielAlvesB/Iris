import type { IpcResult } from './common.types';
import type {
  CreateCardInput,
  CreateColumnInput,
  KanbanBoard,
  MoveCardInput,
  RenameColumnInput,
  ReorderColumnsInput,
  UpdateCardInput,
} from './kanban.types';
import type {
  CreateBlockInput,
  CreateConnectionInput,
  MoveBlockInput,
  QuadroFile,
  QuadroViewport,
  UpdateBlockInput,
} from './quadro.types';
import type { ArquivosFile, LinkFileToCardInput, UpdateNoteInput } from './arquivos.types';
import type { AgendaFile, AgendaItemInput, ImportAgendaResult, UpdateAgendaItemInput } from './agenda.types';
import type { FileOpResult } from './export.types';
import type { CreateLinkInput, LinksFile, UpdateLinkInput } from './links.types';
import type { CopyFile, CreateSnippetInput, ImportTxtResult, UpdateSnippetInput } from './copy.types';
import type {
  CreateMarkdownInput,
  ExportMarkdownPdfInput,
  LinkMarkdownToCardInput,
  MarkdownConfig,
  MarkdownFileMeta,
  OpenMarkdownFileResult,
  WriteMarkdownInput,
} from './markdown.types';

export interface KanbanApi {
  getBoard(): Promise<IpcResult<KanbanBoard>>;
  createColumn(input: CreateColumnInput): Promise<IpcResult<KanbanBoard>>;
  renameColumn(input: RenameColumnInput): Promise<IpcResult<KanbanBoard>>;
  reorderColumns(input: ReorderColumnsInput): Promise<IpcResult<KanbanBoard>>;
  deleteColumn(columnId: string): Promise<IpcResult<KanbanBoard>>;
  createCard(input: CreateCardInput): Promise<IpcResult<KanbanBoard>>;
  updateCard(input: UpdateCardInput): Promise<IpcResult<KanbanBoard>>;
  deleteCard(cardId: string): Promise<IpcResult<KanbanBoard>>;
  moveCard(input: MoveCardInput): Promise<IpcResult<KanbanBoard>>;
}

export interface QuadroApi {
  getState(): Promise<IpcResult<QuadroFile>>;
  createBlock(input: CreateBlockInput): Promise<IpcResult<QuadroFile>>;
  updateBlock(input: UpdateBlockInput): Promise<IpcResult<QuadroFile>>;
  moveBlock(input: MoveBlockInput): Promise<IpcResult<QuadroFile>>;
  deleteBlock(blockId: string): Promise<IpcResult<QuadroFile>>;
  createConnection(input: CreateConnectionInput): Promise<IpcResult<QuadroFile>>;
  deleteConnection(connectionId: string): Promise<IpcResult<QuadroFile>>;
  updateViewport(viewport: QuadroViewport): Promise<IpcResult<QuadroFile>>;
  updateBoardName(boardName: string): Promise<IpcResult<QuadroFile>>;
}

export interface ArquivosApi {
  getItems(): Promise<IpcResult<ArquivosFile>>;
  importFiles(): Promise<IpcResult<ArquivosFile>>;
  toggleDone(itemId: string): Promise<IpcResult<ArquivosFile>>;
  toggleVerified(itemId: string): Promise<IpcResult<ArquivosFile>>;
  updateNote(input: UpdateNoteInput): Promise<IpcResult<ArquivosFile>>;
  deleteItem(itemId: string): Promise<IpcResult<ArquivosFile>>;
  linkFileToCard(input: LinkFileToCardInput): Promise<IpcResult<ArquivosFile>>;
}

export interface AgendaApi {
  getItems(): Promise<IpcResult<AgendaFile>>;
  createItem(input: AgendaItemInput): Promise<IpcResult<AgendaFile>>;
  updateItem(input: UpdateAgendaItemInput): Promise<IpcResult<AgendaFile>>;
  deleteItem(itemId: string): Promise<IpcResult<AgendaFile>>;
  deleteItems(itemIds: string[]): Promise<IpcResult<AgendaFile>>;
  deleteAllItems(): Promise<IpcResult<AgendaFile>>;
  importSpreadsheet(): Promise<IpcResult<ImportAgendaResult>>;
}

export interface SystemApi {
  copyToClipboard(text: string): void;
  openExternalLink(url: string): void;
}

export interface LinksApi {
  getLinks(): Promise<IpcResult<LinksFile>>;
  createLink(input: CreateLinkInput): Promise<IpcResult<LinksFile>>;
  updateLink(input: UpdateLinkInput): Promise<IpcResult<LinksFile>>;
  deleteLink(linkId: string): Promise<IpcResult<LinksFile>>;
  reorderLinks(orderedLinkIds: string[]): Promise<IpcResult<LinksFile>>;
}

export interface ExportApi {
  exportAll(): Promise<IpcResult<FileOpResult>>;
  importAll(): Promise<IpcResult<FileOpResult>>;
  exportAgendaCsv(): Promise<IpcResult<FileOpResult>>;
  exportArquivosCsv(): Promise<IpcResult<FileOpResult>>;
}

export interface CopyApi {
  getSnippets(): Promise<IpcResult<CopyFile>>;
  createSnippet(input: CreateSnippetInput): Promise<IpcResult<CopyFile>>;
  updateSnippet(input: UpdateSnippetInput): Promise<IpcResult<CopyFile>>;
  deleteSnippet(snippetId: string): Promise<IpcResult<CopyFile>>;
  importTxt(): Promise<IpcResult<ImportTxtResult>>;
}

export interface MarkdownApi {
  getConfig(): Promise<IpcResult<MarkdownConfig>>;
  chooseFolder(): Promise<IpcResult<MarkdownConfig>>;
  openFile(): Promise<IpcResult<OpenMarkdownFileResult>>;
  listFiles(): Promise<IpcResult<MarkdownConfig>>;
  readFile(filePath: string): Promise<IpcResult<string>>;
  writeFile(input: WriteMarkdownInput): Promise<IpcResult<void>>;
  createFile(input: CreateMarkdownInput): Promise<IpcResult<MarkdownFileMeta>>;
  linkFileToCard(input: LinkMarkdownToCardInput): Promise<IpcResult<void>>;
  exportPdf(input: ExportMarkdownPdfInput): Promise<IpcResult<FileOpResult>>;
}

export interface IrisApi {
  kanban: KanbanApi;
  quadro: QuadroApi;
  arquivos: ArquivosApi;
  agenda: AgendaApi;
  system: SystemApi;
  export: ExportApi;
  links: LinksApi;
  copy: CopyApi;
  markdown: MarkdownApi;
}

declare global {
  interface Window {
    irisAPI: IrisApi;
  }
}
