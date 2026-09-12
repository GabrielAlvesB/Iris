import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import type { CopyFile, CreateSnippetInput, UpdateSnippetInput } from '../../../shared/types/copy.types';

const FILE_NAME = 'copy.json';
const SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): CopyFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    snippets: [],
  };
}

function migrateCopyFile(raw: unknown): CopyFile {
  const candidate = (raw ?? {}) as Partial<CopyFile>;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    snippets: Array.isArray(candidate.snippets)
      ? candidate.snippets.map((s, index) => ({ ...s, order: s.order ?? index }))
      : [],
  };
}

function loadFile(): CopyFile {
  return readStore(FILE_NAME, createDefaultFile, migrateCopyFile);
}

async function saveFile(file: CopyFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getSnippets(): Promise<CopyFile> {
  return loadFile();
}

export async function getFullFile(): Promise<CopyFile> {
  return loadFile();
}

export async function replaceFile(file: CopyFile): Promise<CopyFile> {
  await saveFile(file);
  return file;
}

export async function createSnippet(input: CreateSnippetInput): Promise<CopyFile> {
  const file = loadFile();
  const timestamp = nowIso();

  file.snippets.push({
    id: randomUUID(),
    title: input.title,
    text: input.text,
    group: input.group,
    order: file.snippets.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return file;
}

export async function updateSnippet(input: UpdateSnippetInput): Promise<CopyFile> {
  const file = loadFile();
  const snippet = file.snippets.find((s) => s.id === input.snippetId);
  if (!snippet) {
    throw new Error(`Texto ${input.snippetId} não encontrado.`);
  }

  if (input.title !== undefined) snippet.title = input.title;
  if (input.text !== undefined) snippet.text = input.text;
  if (input.group !== undefined) snippet.group = input.group;
  snippet.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function deleteSnippet(snippetId: string): Promise<CopyFile> {
  const file = loadFile();
  file.snippets = file.snippets.filter((s) => s.id !== snippetId);
  file.snippets.forEach((s, index) => {
    s.order = index;
  });
  await saveFile(file);
  return file;
}
