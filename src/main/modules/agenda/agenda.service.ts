import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { readStore, writeStore } from '../../storage/jsonStore';
import type { AgendaFile, AgendaItem, AgendaItemInput, ImportAgendaResult, UpdateAgendaItemInput } from '../../../shared/types/agenda.types';

const FILE_NAME = 'agenda.json';
const SCHEMA_VERSION = 1;

const COLUMN_MAP: Record<string, keyof AgendaItemInput> = {
  'video de origem': 'videoOrigem',
  formato: 'formato',
  arquivo: 'arquivo',
  duracao: 'duracao',
  titulo: 'titulo',
  descricao: 'descricao',
  hashtags: 'hashtags',
  plataforma: 'plataforma',
  'data agendada': 'dataAgendada',
  status: 'status',
  observacao: 'observacao',
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function createDefaultFile(): AgendaFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    items: [],
  };
}

function migrateAgendaFile(raw: unknown): AgendaFile {
  const candidate = (raw ?? {}) as Partial<AgendaFile>;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    items: Array.isArray(candidate.items) ? candidate.items : [],
  };
}

function loadFile(): AgendaFile {
  return readStore(FILE_NAME, createDefaultFile, migrateAgendaFile);
}

async function saveFile(file: AgendaFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getItems(): Promise<AgendaFile> {
  return loadFile();
}

export async function getFullFile(): Promise<AgendaFile> {
  return loadFile();
}

export async function replaceFile(file: AgendaFile): Promise<AgendaFile> {
  await saveFile(file);
  return file;
}

export async function createItem(input: AgendaItemInput): Promise<AgendaFile> {
  const file = loadFile();
  const timestamp = nowIso();

  file.items.push({
    id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  });

  await saveFile(file);
  return file;
}

export async function updateItem(input: UpdateAgendaItemInput): Promise<AgendaFile> {
  const file = loadFile();
  const item = file.items.find((i) => i.id === input.itemId);
  if (!item) {
    throw new Error(`Item ${input.itemId} não encontrado.`);
  }

  const { itemId, ...fields } = input;
  void itemId;
  Object.assign(item, fields);
  item.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function deleteItem(itemId: string): Promise<AgendaFile> {
  const file = loadFile();
  file.items = file.items.filter((i) => i.id !== itemId);
  await saveFile(file);
  return file;
}

function rowToAgendaItem(row: Record<string, unknown>): AgendaItem {
  const timestamp = nowIso();
  const item: AgendaItem = {
    id: randomUUID(),
    titulo: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const extra: Record<string, unknown> = {};

  Object.entries(row).forEach(([header, value]) => {
    const normalized = normalizeHeader(header);
    const mappedField = COLUMN_MAP[normalized];
    const stringValue = value === undefined || value === null ? '' : String(value);

    if (mappedField) {
      (item as unknown as Record<string, string>)[mappedField] = stringValue;
    } else if (stringValue !== '') {
      extra[header] = stringValue;
    }
  });

  if (Object.keys(extra).length > 0) {
    item.extra = extra;
  }

  return item;
}

// A hand-rolled CSV parser is used instead of XLSX's CSV reader: SheetJS applies
// spreadsheet type-inference to CSV cells, so values like "00:30" (a duration)
// get silently converted into a fractional day-serial number instead of staying
// as plain text. CSV has no real cell types, so plain string parsing is correct.
function parseCsv(content: string): Record<string, string>[] {
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

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0];
  return nonEmptyRows.slice(1).map((cols) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cols[index] ?? '';
    });
    return record;
  });
}

function readRows(filePath: string): Record<string, unknown>[] {
  if (filePath.toLowerCase().endsWith('.csv')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseCsv(content);
  }

  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  // raw: false returns the displayed/formatted text for each cell rather than
  // the underlying computed value, avoiding the same numeric-coercion problem
  // for spreadsheet cells that Excel itself formatted as text.
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
}

export async function importFromFile(filePath: string): Promise<ImportAgendaResult> {
  const rows = readRows(filePath);
  const file = loadFile();
  const newItems = rows.map(rowToAgendaItem).filter((item) => item.titulo.trim() !== '');
  file.items.push(...newItems);

  await saveFile(file);
  return { file, importedCount: newItems.length };
}
