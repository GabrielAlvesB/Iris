import { readStore, writeStore } from '../../storage/jsonStore';
import { isEncryptionAvailable } from '../../storage/secretStore';
import type { AjustesFile, AjustesInfo, ModuloInicial } from '../../../shared/types/ajustes.types';

const FILE_NAME = 'ajustes.json';
const SCHEMA_VERSION = 1;

const MODULOS: ModuloInicial[] = [
  'kanban',
  'quadro',
  'explorador',
  'sheets',
  'links',
  'copy',
  'pensamentos',
  'servidores',
  'n8n',
  'github',
  'tutorial',
  'ajustes',
];

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): AjustesFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), moduloInicial: 'kanban' };
}

function migrate(raw: unknown): AjustesFile {
  const candidate = (raw ?? {}) as Partial<AjustesFile>;
  const modulo = candidate.moduloInicial;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    // Um módulo removido em versão futura não pode deixar o app abrindo no vazio.
    moduloInicial: modulo && MODULOS.includes(modulo) ? modulo : 'kanban',
  };
}

function loadFile(): AjustesFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: AjustesFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getAjustes(): Promise<AjustesInfo> {
  const file = loadFile();
  return {
    moduloInicial: file.moduloInicial,
    criptografiaDisponivel: isEncryptionAvailable(),
  };
}

export async function setModuloInicial(modulo: ModuloInicial): Promise<AjustesInfo> {
  if (!MODULOS.includes(modulo)) {
    throw new Error('Módulo inicial inválido.');
  }

  const file = loadFile();
  file.moduloInicial = modulo;
  await saveFile(file);

  return getAjustes();
}

export async function getFullFile(): Promise<AjustesFile> {
  return loadFile();
}

export async function replaceFile(file: AjustesFile): Promise<AjustesFile> {
  await saveFile(file);
  return file;
}
