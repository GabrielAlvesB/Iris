import { readStore, writeStore } from '../../storage/jsonStore';
import { isEncryptionAvailable } from '../../storage/secretStore';
import {
  isFormatoAssinatura,
  type AjustesFile,
  type AjustesInfo,
  type AssinaturaRelatorio,
  type ModuloInicial,
} from '../../../shared/types/ajustes.types';
import { MODULO_PADRAO, isModuloId } from '../../../shared/types/modulos.types';

const FILE_NAME = 'ajustes.json';
const SCHEMA_VERSION = 2;

/** Ids de módulo que mudaram de nome: o módulo inicial salvo acompanha. */
const MODULOS_RENOMEADOS: Record<string, ModuloInicial> = { videos: 'postagens' };

const MAX_LINHAS_ASSINATURA = 4;

function nowIso(): string {
  return new Date().toISOString();
}

function assinaturaPadrao(): AssinaturaRelatorio {
  return { nome: '', linhas: [], formato: 'com-linha', mostrarData: true };
}

function createDefaultFile(): AjustesFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), moduloInicial: MODULO_PADRAO, assinatura: assinaturaPadrao() };
}

function migrateAssinatura(raw: unknown): AssinaturaRelatorio {
  const c = (raw ?? {}) as Partial<AssinaturaRelatorio>;
  const padrao = assinaturaPadrao();
  return {
    nome: typeof c.nome === 'string' ? c.nome.trim().slice(0, 120) : padrao.nome,
    linhas: Array.isArray(c.linhas)
      ? c.linhas
          .filter((l): l is string => typeof l === 'string')
          .map((l) => l.trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, MAX_LINHAS_ASSINATURA)
      : padrao.linhas,
    formato: isFormatoAssinatura(c.formato) ? c.formato : padrao.formato,
    mostrarData: typeof c.mostrarData === 'boolean' ? c.mostrarData : padrao.mostrarData,
  };
}

function migrate(raw: unknown): AjustesFile {
  const candidate = (raw ?? {}) as Partial<AjustesFile>;
  const bruto = candidate.moduloInicial as unknown;
  const modulo = typeof bruto === 'string' && MODULOS_RENOMEADOS[bruto] ? MODULOS_RENOMEADOS[bruto] : bruto;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    // Um módulo removido em versão futura não pode deixar o app abrindo no vazio.
    moduloInicial: isModuloId(modulo) ? modulo : MODULO_PADRAO,
    assinatura: migrateAssinatura(candidate.assinatura),
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
    assinatura: file.assinatura,
  };
}

export async function setModuloInicial(modulo: ModuloInicial): Promise<AjustesInfo> {
  if (!isModuloId(modulo)) {
    throw new Error('Módulo inicial inválido.');
  }

  const file = loadFile();
  file.moduloInicial = modulo;
  await saveFile(file);

  return getAjustes();
}

export async function setAssinatura(assinatura: AssinaturaRelatorio): Promise<AjustesInfo> {
  const file = loadFile();
  file.assinatura = migrateAssinatura(assinatura);
  await saveFile(file);
  return getAjustes();
}

/** Lida pelo gerador de relatórios; nunca atravessa o IPC sozinha. */
export function getAssinatura(): AssinaturaRelatorio {
  return loadFile().assinatura;
}

export async function getFullFile(): Promise<AjustesFile> {
  return loadFile();
}

export async function replaceFile(file: AjustesFile): Promise<AjustesFile> {
  // Um backup antigo entra normalizado (sem assinatura, com id de módulo antigo).
  const normalizado = migrate(file);
  await saveFile(normalizado);
  return normalizado;
}
