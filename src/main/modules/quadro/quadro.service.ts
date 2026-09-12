import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import type {
  CreateBlockInput,
  CreateConnectionInput,
  MoveBlockInput,
  QuadroFile,
  QuadroViewport,
  UpdateBlockInput,
} from '../../../shared/types/quadro.types';

const FILE_NAME = 'quadro.json';
const SCHEMA_VERSION = 1;
const DEFAULT_BLOCK_WIDTH = 220;
const DEFAULT_BLOCK_HEIGHT = 120;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): QuadroFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    boardName: 'Projeto',
    blocks: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function migrateQuadroFile(raw: unknown): QuadroFile {
  const candidate = (raw ?? {}) as Partial<QuadroFile>;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    boardName: candidate.boardName ?? 'Projeto',
    blocks: Array.isArray(candidate.blocks) ? candidate.blocks : [],
    connections: Array.isArray(candidate.connections) ? candidate.connections : [],
    viewport: candidate.viewport ?? { x: 0, y: 0, zoom: 1 },
  };
}

function loadFile(): QuadroFile {
  return readStore(FILE_NAME, createDefaultFile, migrateQuadroFile);
}

async function saveFile(file: QuadroFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getState(): Promise<QuadroFile> {
  return loadFile();
}

export async function getFullFile(): Promise<QuadroFile> {
  return loadFile();
}

export async function replaceFile(file: QuadroFile): Promise<QuadroFile> {
  await saveFile(file);
  return file;
}

export async function createBlock(input: CreateBlockInput): Promise<QuadroFile> {
  const file = loadFile();
  const timestamp = nowIso();

  file.blocks.push({
    id: randomUUID(),
    type: input.type,
    title: input.title,
    content: input.content,
    assignee: input.assignee,
    routineDays: input.routineDays,
    routineTime: input.routineTime,
    streakCount: input.type === 'rotina' ? 0 : undefined,
    x: input.x,
    y: input.y,
    width: input.width ?? DEFAULT_BLOCK_WIDTH,
    height: input.height ?? DEFAULT_BLOCK_HEIGHT,
    color: input.color,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return file;
}

export async function updateBlock(input: UpdateBlockInput): Promise<QuadroFile> {
  const file = loadFile();
  const block = file.blocks.find((b) => b.id === input.blockId);
  if (!block) {
    throw new Error(`Bloco ${input.blockId} não encontrado.`);
  }

  if (input.title !== undefined) block.title = input.title;
  if (input.content !== undefined) block.content = input.content;
  if (input.type !== undefined) block.type = input.type;
  if (input.color !== undefined) block.color = input.color;
  if (input.status !== undefined) block.status = input.status === null ? undefined : input.status;
  if (input.assignee !== undefined) block.assignee = input.assignee;
  if (input.routineDays !== undefined) block.routineDays = input.routineDays;
  if (input.routineTime !== undefined) block.routineTime = input.routineTime;
  if (input.streakCount !== undefined) block.streakCount = input.streakCount;
  if (input.width !== undefined) block.width = input.width;
  if (input.height !== undefined) block.height = input.height;
  block.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function moveBlock(input: MoveBlockInput): Promise<QuadroFile> {
  const file = loadFile();
  const block = file.blocks.find((b) => b.id === input.blockId);
  if (!block) {
    throw new Error(`Bloco ${input.blockId} não encontrado.`);
  }

  block.x = input.x;
  block.y = input.y;
  block.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function deleteBlock(blockId: string): Promise<QuadroFile> {
  const file = loadFile();

  file.blocks = file.blocks.filter((b) => b.id !== blockId);
  file.connections = file.connections.filter((c) => c.fromBlockId !== blockId && c.toBlockId !== blockId);

  await saveFile(file);
  return file;
}

export async function createConnection(input: CreateConnectionInput): Promise<QuadroFile> {
  const file = loadFile();

  if (input.fromBlockId === input.toBlockId) {
    throw new Error('Não é possível conectar um bloco a ele mesmo.');
  }
  const fromExists = file.blocks.some((b) => b.id === input.fromBlockId);
  const toExists = file.blocks.some((b) => b.id === input.toBlockId);
  if (!fromExists || !toExists) {
    throw new Error('Bloco de origem ou destino não encontrado.');
  }
  const alreadyConnected = file.connections.some(
    (c) =>
      (c.fromBlockId === input.fromBlockId && c.toBlockId === input.toBlockId) ||
      (c.fromBlockId === input.toBlockId && c.toBlockId === input.fromBlockId),
  );
  if (alreadyConnected) {
    return file;
  }

  const timestamp = nowIso();
  file.connections.push({
    id: randomUUID(),
    fromBlockId: input.fromBlockId,
    toBlockId: input.toBlockId,
    label: input.label,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return file;
}

export async function deleteConnection(connectionId: string): Promise<QuadroFile> {
  const file = loadFile();
  file.connections = file.connections.filter((c) => c.id !== connectionId);
  await saveFile(file);
  return file;
}

export async function updateViewport(viewport: QuadroViewport): Promise<QuadroFile> {
  const file = loadFile();
  file.viewport = viewport;
  await saveFile(file);
  return file;
}

export async function updateBoardName(boardName: string): Promise<QuadroFile> {
  const file = loadFile();
  file.boardName = boardName;
  await saveFile(file);
  return file;
}
