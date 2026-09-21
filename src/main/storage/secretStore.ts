import { safeStorage } from 'electron';
import { readStore, writeStore } from './jsonStore';

const FILE_NAME = 'secrets.json';
const SCHEMA_VERSION = 1;

/**
 * Guarda credenciais fora dos arquivos de módulo.
 *
 * Três propriedades que nenhum outro arquivo tem: nunca volta para o renderer,
 * nunca entra no bundle de exportação, e é atrelado à máquina (no Windows o
 * DPAPI amarra ao usuário do SO, então o valor cifrado nem viajaria num backup).
 */

/** enc=false só acontece quando o SO não oferece criptografia. */
interface SecretEntry {
  enc: boolean;
  v: string;
}

interface SecretsFile {
  schemaVersion: number;
  updatedAt: string;
  values: Record<string, SecretEntry>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): SecretsFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), values: {} };
}

function migrate(raw: unknown): SecretsFile {
  const candidate = (raw ?? {}) as Partial<SecretsFile>;
  const values: Record<string, SecretEntry> = {};
  const brutos = (candidate.values ?? {}) as Record<string, unknown>;

  Object.keys(brutos).forEach((key) => {
    const entry = brutos[key] as Partial<SecretEntry> | undefined;
    if (entry && typeof entry.v === 'string') {
      values[key] = { enc: Boolean(entry.enc), v: entry.v };
    }
  });

  return { schemaVersion: SCHEMA_VERSION, updatedAt: candidate.updatedAt ?? nowIso(), values };
}

function loadFile(): SecretsFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: SecretsFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

/** Nunca chamar no topo do módulo: safeStorage só é confiável após whenReady(). */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  const file = loadFile();

  if (!value) {
    delete file.values[key];
  } else if (isEncryptionAvailable()) {
    file.values[key] = { enc: true, v: safeStorage.encryptString(value).toString('base64') };
  } else {
    // Gravar em texto puro é ruim, mas fingir criptografia seria pior: a flag
    // por valor deixa a UI avisar e permite recifrar na próxima escrita.
    file.values[key] = { enc: false, v: value };
  }

  await saveFile(file);
}

/** SÓ para uso no processo principal. Nunca exponha por IPC. */
export function getSecret(key: string): string | null {
  const entry = loadFile().values[key];
  if (!entry) return null;
  if (!entry.enc) return entry.v;

  try {
    return safeStorage.decryptString(Buffer.from(entry.v, 'base64'));
  } catch {
    // Perfil copiado para outra máquina/usuário: o DPAPI não decifra mais.
    // Descartamos para a UI pedir a credencial de novo em vez de falhar sempre.
    void deleteSecret(key);
    return null;
  }
}

export function hasSecret(key: string): boolean {
  return Boolean(loadFile().values[key]);
}

export async function deleteSecret(key: string): Promise<void> {
  const file = loadFile();
  if (!(key in file.values)) return;
  delete file.values[key];
  await saveFile(file);
}

/** Limpa os segredos de uma entidade apagada, ex.: `servidor.<id>.`. */
export async function deleteSecretsByPrefix(prefix: string): Promise<void> {
  const file = loadFile();
  let mudou = false;

  Object.keys(file.values).forEach((key) => {
    if (key.startsWith(prefix)) {
      delete file.values[key];
      mudou = true;
    }
  });

  if (mudou) await saveFile(file);
}
