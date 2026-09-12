import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import type { AddFileEntry, ArquivosFile, LinkFileToCardInput, UpdateNoteInput } from '../../../shared/types/arquivos.types';

const FILE_NAME = 'arquivos.json';
const SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): ArquivosFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    items: [],
  };
}

function migrateArquivosFile(raw: unknown): ArquivosFile {
  const candidate = (raw ?? {}) as Partial<ArquivosFile>;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    items: Array.isArray(candidate.items)
      ? candidate.items.map((item) => ({
          ...item,
          done: Boolean(item.done),
          verified: Boolean(item.verified),
        }))
      : [],
  };
}

function loadFile(): ArquivosFile {
  return readStore(FILE_NAME, createDefaultFile, migrateArquivosFile);
}

async function saveFile(file: ArquivosFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getItems(): Promise<ArquivosFile> {
  return loadFile();
}

export async function getFullFile(): Promise<ArquivosFile> {
  return loadFile();
}

export async function replaceFile(file: ArquivosFile): Promise<ArquivosFile> {
  await saveFile(file);
  return file;
}

export async function addFiles(entries: AddFileEntry[]): Promise<ArquivosFile> {
  const file = loadFile();
  const timestamp = nowIso();

  entries.forEach(({ fileName, size }) => {
    file.items.push({
      id: randomUUID(),
      fileName,
      size,
      done: false,
      verified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  await saveFile(file);
  return file;
}

export async function linkFileToCard(input: LinkFileToCardInput): Promise<ArquivosFile> {
  const file = loadFile();
  const item = file.items.find((i) => i.id === input.itemId);
  if (!item) {
    throw new Error(`Item ${input.itemId} não encontrado.`);
  }
  item.linkedCardId = input.cardId ?? undefined;
  item.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function toggleDone(itemId: string): Promise<ArquivosFile> {
  const file = loadFile();
  const item = file.items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error(`Item ${itemId} não encontrado.`);
  }
  item.done = !item.done;
  item.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function toggleVerified(itemId: string): Promise<ArquivosFile> {
  const file = loadFile();
  const item = file.items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error(`Item ${itemId} não encontrado.`);
  }
  item.verified = !item.verified;
  item.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function updateNote(input: UpdateNoteInput): Promise<ArquivosFile> {
  const file = loadFile();
  const item = file.items.find((i) => i.id === input.itemId);
  if (!item) {
    throw new Error(`Item ${input.itemId} não encontrado.`);
  }
  item.note = input.note || undefined;
  item.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function deleteItem(itemId: string): Promise<ArquivosFile> {
  const file = loadFile();
  file.items = file.items.filter((i) => i.id !== itemId);
  await saveFile(file);
  return file;
}
