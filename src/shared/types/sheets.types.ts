import type { BaseEntity } from './common.types';

export type SheetColumnType = 'text' | 'number' | 'date' | 'select';

export interface SheetColumnOption {
  value: string;
  label: string;
}

export interface SheetColumn {
  id: string;
  label: string;
  type: SheetColumnType;
  options?: SheetColumnOption[];
}

export interface SheetRow {
  id: string;
  cells: Record<string, string>;
}

export type SheetTableOrigin = 'imported' | 'manual';

export interface SheetTable extends BaseEntity {
  name: string;
  origin: SheetTableOrigin;
  sourceFileName?: string;
  sourceSheetName?: string;
  visible: boolean;
  columns: SheetColumn[];
  rows: SheetRow[];
}

export interface SheetsFile {
  schemaVersion: number;
  updatedAt: string;
  tables: SheetTable[];
}

export interface CreateColumnDef {
  label: string;
  type: SheetColumnType;
  options?: SheetColumnOption[];
}

export interface CreateTableInput {
  name: string;
  columns: CreateColumnDef[];
}

export interface RenameTableInput {
  tableId: string;
  name: string;
}

export interface UpdateTableVisibilityInput {
  tableId: string;
  visible: boolean;
}

export interface AddColumnInput {
  tableId: string;
  label: string;
  type: SheetColumnType;
  options?: SheetColumnOption[];
}

export interface UpdateColumnInput {
  tableId: string;
  columnId: string;
  label?: string;
  type?: SheetColumnType;
  options?: SheetColumnOption[];
}

export interface DeleteColumnInput {
  tableId: string;
  columnId: string;
}

export interface CreateRowInput {
  tableId: string;
  cells?: Record<string, string>;
}

export interface UpdateRowInput {
  tableId: string;
  rowId: string;
  cells: Record<string, string>;
}

export interface DeleteRowInput {
  tableId: string;
  rowId: string;
}

export interface DeleteRowsInput {
  tableId: string;
  rowIds: string[];
}

export interface DeleteTableInput {
  tableId: string;
}

export interface DetectedSheet {
  sheetName: string;
  columns: { label: string }[];
  rows: string[][];
}

export interface DetectImportResult {
  fileName: string;
  sheets: DetectedSheet[];
}

export interface CommitImportSelection {
  sheetName: string;
  tableName: string;
  visible: boolean;
  columns: { label: string }[];
  rows: string[][];
}

export interface CommitImportInput {
  fileName: string;
  selections: CommitImportSelection[];
}

export interface CommitImportResult {
  file: SheetsFile;
  createdTableIds: string[];
}
