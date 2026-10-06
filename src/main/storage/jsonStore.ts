import fs from 'node:fs';
import { getDataFilePath } from './paths';

const writeQueues = new Map<string, Promise<void>>();

function readJsonIfExists<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export function readStore<T>(fileName: string, defaultFactory: () => T, migrate: (raw: unknown) => T): T {
  const filePath = getDataFilePath(fileName);
  const backupPath = `${filePath}.bak`;

  try {
    const raw = readJsonIfExists<unknown>(filePath);
    if (raw === undefined) {
      const defaults = defaultFactory();
      writeStoreSync(fileName, defaults);
      return defaults;
    }
    return migrate(raw);
  } catch (primaryError) {
    try {
      const raw = readJsonIfExists<unknown>(backupPath);
      if (raw !== undefined) {
        const recovered = migrate(raw);
        writeStoreSync(fileName, recovered);
        return recovered;
      }
    } catch {
      // backup is also unreadable, fall through to corruption handling below
    }

    if (fs.existsSync(filePath)) {
      const corruptedPath = `${filePath}.corrupted-${Date.now()}`;
      fs.renameSync(filePath, corruptedPath);
      console.error(`[jsonStore] ${fileName} estava corrompido, movido para ${corruptedPath}`, primaryError);
    }

    const defaults = defaultFactory();
    writeStoreSync(fileName, defaults);
    return defaults;
  }
}

function versaoDoSchema(dados: unknown): number | undefined {
  const v = (dados as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === 'number' ? v : undefined;
}

/**
 * Uma versão mais antiga do app (voltar de versão, ou o instalado rodando ao
 * lado do `npm run dev`) lê o arquivo novo, descarta o que não conhece e
 * regrava — foi assim que as escalas de score sumiam. O `.bak` não basta:
 * a escrita seguinte o sobrescreve. Fica uma cópia permanente do arquivo novo.
 */
function guardarVersaoMaisNova(filePath: string, novo: unknown): void {
  try {
    const versaoNova = versaoDoSchema(novo);
    if (versaoNova === undefined) return;
    const versaoNoDisco = versaoDoSchema(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    if (versaoNoDisco === undefined || versaoNoDisco <= versaoNova) return;
    const copia = filePath.replace(/\.json$/, `.v${versaoNoDisco}.json`);
    if (!fs.existsSync(copia)) fs.copyFileSync(filePath, copia);
  } catch {
    // Arquivo ilegível já tem o tratamento de corrompido na leitura.
  }
}

function writeStoreSync<T>(fileName: string, data: T): void {
  const filePath = getDataFilePath(fileName);
  const tmpPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;

  if (fs.existsSync(filePath)) {
    guardarVersaoMaisNova(filePath, data);
    fs.copyFileSync(filePath, backupPath);
  }
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function writeStore<T>(fileName: string, data: T): Promise<void> {
  const previous = writeQueues.get(fileName) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => writeStoreSync(fileName, data));
  writeQueues.set(fileName, next);
  return next;
}

/**
 * Espera as escritas em fila terminarem. Usado antes de fechar o app para o
 * instalador da atualização: uma edição salva no último segundo não pode se perder.
 */
export async function aguardarEscritas(): Promise<void> {
  await Promise.allSettled([...writeQueues.values()]);
}
