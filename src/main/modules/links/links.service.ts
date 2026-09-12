import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import type { CreateLinkInput, LinksFile, UpdateLinkInput } from '../../../shared/types/links.types';

const FILE_NAME = 'links.json';
const SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): LinksFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    links: [],
  };
}

function migrateLinksFile(raw: unknown): LinksFile {
  const candidate = (raw ?? {}) as Partial<LinksFile>;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    links: Array.isArray(candidate.links)
      ? candidate.links.map((link, index) => ({ ...link, order: link.order ?? index }))
      : [],
  };
}

function loadFile(): LinksFile {
  return readStore(FILE_NAME, createDefaultFile, migrateLinksFile);
}

async function saveFile(file: LinksFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getLinks(): Promise<LinksFile> {
  return loadFile();
}

export async function getFullFile(): Promise<LinksFile> {
  return loadFile();
}

export async function replaceFile(file: LinksFile): Promise<LinksFile> {
  await saveFile(file);
  return file;
}

export async function createLink(input: CreateLinkInput): Promise<LinksFile> {
  const file = loadFile();
  const timestamp = nowIso();

  file.links.push({
    id: randomUUID(),
    title: input.title,
    url: input.url,
    icon: input.icon,
    group: input.group,
    order: file.links.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return file;
}

export async function updateLink(input: UpdateLinkInput): Promise<LinksFile> {
  const file = loadFile();
  const link = file.links.find((l) => l.id === input.linkId);
  if (!link) {
    throw new Error(`Link ${input.linkId} não encontrado.`);
  }

  if (input.title !== undefined) link.title = input.title;
  if (input.url !== undefined) link.url = input.url;
  if (input.icon !== undefined) link.icon = input.icon;
  if (input.group !== undefined) link.group = input.group;
  link.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function deleteLink(linkId: string): Promise<LinksFile> {
  const file = loadFile();
  file.links = file.links.filter((l) => l.id !== linkId);
  file.links.forEach((link, index) => {
    link.order = index;
  });
  await saveFile(file);
  return file;
}

export async function reorderLinks(orderedLinkIds: string[]): Promise<LinksFile> {
  const file = loadFile();
  orderedLinkIds.forEach((linkId, index) => {
    const link = file.links.find((l) => l.id === linkId);
    if (link) link.order = index;
  });
  file.links.sort((a, b) => a.order - b.order);

  await saveFile(file);
  return file;
}
