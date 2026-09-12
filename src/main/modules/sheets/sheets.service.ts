import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { readStore, writeStore } from '../../storage/jsonStore';
import type {
  AddColumnInput,
  CommitImportInput,
  CommitImportResult,
  CreateRowInput,
  CreateTableInput,
  DeleteColumnInput,
  DeleteRowInput,
  DeleteRowsInput,
  DeleteTableInput,
  DetectImportResult,
  DetectedSheet,
  RenameTableInput,
  SheetColumn,
  SheetRow,
  SheetTable,
  SheetsFile,
  UpdateColumnInput,
  UpdateRowInput,
  UpdateTableVisibilityInput,
} from '../../../shared/types/sheets.types';

const FILE_NAME = 'sheets.json';
const SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): SheetsFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    tables: [],
  };
}

function migrateSheetsFile(raw: unknown): SheetsFile {
  const candidate = (raw ?? {}) as Partial<SheetsFile>;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    tables: Array.isArray(candidate.tables) ? candidate.tables : [],
  };
}

function loadFile(): SheetsFile {
  return readStore(FILE_NAME, createDefaultFile, migrateSheetsFile);
}

async function saveFile(file: SheetsFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function findTable(file: SheetsFile, tableId: string): SheetTable {
  const table = file.tables.find((t) => t.id === tableId);
  if (!table) {
    throw new Error(`Tabela ${tableId} não encontrada.`);
  }
  return table;
}

export async function getFile(): Promise<SheetsFile> {
  return loadFile();
}

export async function getFullFile(): Promise<SheetsFile> {
  return loadFile();
}

export async function replaceFile(file: SheetsFile): Promise<SheetsFile> {
  await saveFile(file);
  return file;
}

// A hand-rolled CSV parser is used instead of XLSX's CSV reader: SheetJS applies
// spreadsheet type-inference to CSV cells, so values like "00:30" (a duration)
// get silently converted into a fractional day-serial number instead of staying
// as plain text. CSV has no real cell types, so plain string parsing is correct.
function parseCsv(content: string): string[][] {
  const withoutBom = content.replace(/^﻿/, '');
  const delimiter = (withoutBom.split('\n')[0]?.split(';').length ?? 0) > (withoutBom.split('\n')[0]?.split(',').length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < withoutBom.length; i++) {
    const char = withoutBom[i];
    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\r') {
      // ignore; line endings are handled by \n
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function toDetectedSheet(sheetName: string, table: string[][]): DetectedSheet {
  const headerRow = table[0] ?? [];
  const columns = headerRow.map((header, index) => ({
    label: header && header.trim() !== '' ? header.trim() : `Coluna ${index + 1}`,
  }));

  const dataRows = table.slice(1).filter((r) => r.some((cell) => cell.trim() !== ''));
  const rows = dataRows.map((r) => columns.map((_, index) => r[index] ?? ''));

  return { sheetName, columns, rows };
}

function readSheets(filePath: string): DetectedSheet[] {
  if (filePath.toLowerCase().endsWith('.csv')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const table = parseCsv(content);
    const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.csv$/i, '') ?? 'Planilha';
    return [toDetectedSheet(baseName, table)];
  }

  const workbook = XLSX.readFile(filePath);
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    // raw: false returns the displayed/formatted text for each cell rather than
    // the underlying computed value, avoiding numeric-coercion of text cells.
    const table = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
    return toDetectedSheet(sheetName, table);
  });
}

export async function detectImport(filePath: string): Promise<DetectImportResult> {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const sheets = readSheets(filePath);
  return { fileName, sheets };
}

export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const file = loadFile();
  const createdTableIds: string[] = [];

  input.selections.forEach((selection) => {
    const timestamp = nowIso();
    const columns: SheetColumn[] = selection.columns.map((c) => ({
      id: randomUUID(),
      label: c.label,
      type: 'text',
    }));

    const rows: SheetRow[] = selection.rows.map((rawRow) => {
      const cells: Record<string, string> = {};
      columns.forEach((column, index) => {
        cells[column.id] = rawRow[index] ?? '';
      });
      return { id: randomUUID(), cells };
    });

    const table: SheetTable = {
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
      name: selection.tableName,
      origin: 'imported',
      sourceFileName: input.fileName,
      sourceSheetName: selection.sheetName,
      visible: selection.visible,
      columns,
      rows,
    };

    file.tables.push(table);
    createdTableIds.push(table.id);
  });

  await saveFile(file);
  return { file, createdTableIds };
}

export async function createTable(input: CreateTableInput): Promise<SheetsFile> {
  const file = loadFile();
  const timestamp = nowIso();

  const columns: SheetColumn[] = input.columns.map((c) => ({
    id: randomUUID(),
    label: c.label,
    type: c.type,
    options: c.options,
  }));

  const table: SheetTable = {
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.name,
    origin: 'manual',
    visible: true,
    columns,
    rows: [],
  };

  file.tables.push(table);
  await saveFile(file);
  return file;
}

export async function renameTable(input: RenameTableInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  table.name = input.name;
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function setTableVisibility(input: UpdateTableVisibilityInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  table.visible = input.visible;
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function addColumn(input: AddColumnInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  table.columns.push({
    id: randomUUID(),
    label: input.label,
    type: input.type,
    options: input.options,
  });
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function updateColumn(input: UpdateColumnInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  const column = table.columns.find((c) => c.id === input.columnId);
  if (!column) {
    throw new Error(`Coluna ${input.columnId} não encontrada.`);
  }
  if (input.label !== undefined) column.label = input.label;
  if (input.type !== undefined) column.type = input.type;
  if (input.options !== undefined) column.options = input.options;
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function deleteColumn(input: DeleteColumnInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  table.columns = table.columns.filter((c) => c.id !== input.columnId);
  table.rows.forEach((row) => {
    delete row.cells[input.columnId];
  });
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function createRow(input: CreateRowInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  table.rows.push({ id: randomUUID(), cells: input.cells ?? {} });
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function updateRow(input: UpdateRowInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  const row = table.rows.find((r) => r.id === input.rowId);
  if (!row) {
    throw new Error(`Linha ${input.rowId} não encontrada.`);
  }
  Object.assign(row.cells, input.cells);
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function deleteRow(input: DeleteRowInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  table.rows = table.rows.filter((r) => r.id !== input.rowId);
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function deleteRows(input: DeleteRowsInput): Promise<SheetsFile> {
  const file = loadFile();
  const table = findTable(file, input.tableId);
  const idSet = new Set(input.rowIds);
  table.rows = table.rows.filter((r) => !idSet.has(r.id));
  table.updatedAt = nowIso();
  await saveFile(file);
  return file;
}

export async function deleteTable(input: DeleteTableInput): Promise<SheetsFile> {
  const file = loadFile();
  file.tables = file.tables.filter((t) => t.id !== input.tableId);
  await saveFile(file);
  return file;
}
