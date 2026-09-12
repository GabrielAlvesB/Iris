import fs from 'node:fs';
import path from 'node:path';
import { readStore, writeStore } from '../../storage/jsonStore';
import { getMarkdownNotesDir } from '../../storage/paths';
import type { MarkdownConfig, MarkdownFileMeta } from '../../../shared/types/markdown.types';

const FILE_NAME = 'markdown.json';
const SCHEMA_VERSION = 1;
const MAX_FILES = 500;
const MAX_DEPTH = 6;
const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg']);

interface StoredState {
  schemaVersion: number;
  updatedAt: string;
  linkedFolder: string | null;
  cardLinks: Record<string, string>;
  openedFiles: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): StoredState {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), linkedFolder: null, cardLinks: {}, openedFiles: [] };
}

function migrate(raw: unknown): StoredState {
  const candidate = (raw ?? {}) as Partial<StoredState>;
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    linkedFolder: typeof candidate.linkedFolder === 'string' ? candidate.linkedFolder : null,
    cardLinks: candidate.cardLinks && typeof candidate.cardLinks === 'object' ? candidate.cardLinks : {},
    openedFiles: Array.isArray(candidate.openedFiles) ? candidate.openedFiles.filter((p) => typeof p === 'string') : [],
  };
}

function loadState(): StoredState {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveState(state: StoredState): Promise<void> {
  state.updatedAt = nowIso();
  await writeStore(FILE_NAME, state);
}

function scanDir(rootDir: string, dir: string, source: 'external' | 'iris', depth: number, out: MarkdownFileMeta[]): void {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      scanDir(rootDir, fullPath, source, depth + 1, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const stat = fs.statSync(fullPath);
      const relativeDir = path.relative(rootDir, dir);
      out.push({
        path: fullPath,
        name: entry.name,
        folder: relativeDir === '' ? '' : relativeDir.split(path.sep).join('/'),
        mtime: stat.mtime.toISOString(),
        source,
      });
    }
  }
}

export async function getConfig(): Promise<MarkdownConfig> {
  const state = loadState();
  const files: MarkdownFileMeta[] = [];

  if (state.linkedFolder && fs.existsSync(state.linkedFolder)) {
    scanDir(state.linkedFolder, state.linkedFolder, 'external', 0, files);
  }
  scanDir(getMarkdownNotesDir(), getMarkdownNotesDir(), 'iris', 0, files);

  const known = new Set(files.map((f) => f.path));
  const stillValidOpenedFiles = state.openedFiles.filter((p) => fs.existsSync(p));
  if (stillValidOpenedFiles.length !== state.openedFiles.length) {
    state.openedFiles = stillValidOpenedFiles;
    await saveState(state);
  }
  stillValidOpenedFiles.forEach((filePath) => {
    if (known.has(filePath)) return;
    const stat = fs.statSync(filePath);
    files.push({
      path: filePath,
      name: path.basename(filePath),
      folder: path.dirname(filePath),
      mtime: stat.mtime.toISOString(),
      source: 'external',
    });
    known.add(filePath);
  });

  files.forEach((f) => {
    if (state.cardLinks[f.path]) f.linkedCardId = state.cardLinks[f.path];
  });
  files.sort((a, b) => b.mtime.localeCompare(a.mtime));

  return { linkedFolder: state.linkedFolder, files };
}

export async function registerOpenedFile(filePath: string): Promise<MarkdownConfig> {
  const state = loadState();
  if (!state.openedFiles.includes(filePath)) {
    state.openedFiles.push(filePath);
    await saveState(state);
  }
  return getConfig();
}

export async function setLinkedFolder(folderPath: string | null): Promise<MarkdownConfig> {
  const state = loadState();
  state.linkedFolder = folderPath;
  await saveState(state);
  return getConfig();
}

function assertKnownPath(filePath: string): void {
  const state = loadState();
  const notesDir = getMarkdownNotesDir();
  const underNotes = filePath.startsWith(notesDir);
  const underLinked = state.linkedFolder ? filePath.startsWith(state.linkedFolder) : false;
  const explicitlyOpened = state.openedFiles.includes(filePath);
  if (!underNotes && !underLinked && !explicitlyOpened) {
    throw new Error('Caminho de arquivo não permitido.');
  }
}

export async function readFile(filePath: string): Promise<string> {
  assertKnownPath(filePath);
  return fs.readFileSync(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  assertKnownPath(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');
}

function sanitizeFileName(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|]/g, '-') || 'sem-titulo';
  return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
}

export async function createFile(name: string, target: 'linked' | 'iris'): Promise<MarkdownFileMeta> {
  const state = loadState();
  const dir = target === 'linked' && state.linkedFolder ? state.linkedFolder : getMarkdownNotesDir();
  const fileName = sanitizeFileName(name);
  let fullPath = path.join(dir, fileName);

  let counter = 2;
  while (fs.existsSync(fullPath)) {
    fullPath = path.join(dir, fileName.replace(/\.md$/, `-${counter}.md`));
    counter += 1;
  }

  fs.writeFileSync(fullPath, `# ${name.trim() || 'Sem título'}\n\n`, 'utf-8');
  const stat = fs.statSync(fullPath);

  return {
    path: fullPath,
    name: path.basename(fullPath),
    folder: target === 'linked' && state.linkedFolder ? '' : '',
    mtime: stat.mtime.toISOString(),
    source: target === 'linked' && state.linkedFolder ? 'external' : 'iris',
  };
}

export async function linkFileToCard(filePath: string, cardId: string | null): Promise<void> {
  const state = loadState();
  if (cardId) {
    state.cardLinks[filePath] = cardId;
  } else {
    delete state.cardLinks[filePath];
  }
  await saveState(state);
}
