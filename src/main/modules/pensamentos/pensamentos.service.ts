import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import type {
  CreatePensamentoInput,
  MarcarPromovidoInput,
  Pensamento,
  PensamentosFile,
  PromocaoTipo,
  UpdatePensamentoInput,
} from '../../../shared/types/pensamentos.types';

const FILE_NAME = 'pensamentos.json';
const SCHEMA_VERSION = 1;

const TIPOS_PROMOCAO: PromocaoTipo[] = ['kanban', 'quadro'];

// Aceita letras acentuadas e dígitos, porque as tags são escritas em português
// direto no meio do texto (#ideia, #não-esquecer, #reunião).
const TAG_REGEX = /#([\p{L}\p{N}_-]+)/gu;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Extrai as #tags de um texto livre. É a única fonte da verdade sobre o que
 * conta como tag — a busca e os filtros da tela dependem de bater exatamente
 * com o que foi gravado.
 */
export function extrairTags(texto: string): string[] {
  const encontradas = new Set<string>();
  for (const match of texto.matchAll(TAG_REGEX)) {
    const tag = match[1]?.toLocaleLowerCase('pt-BR');
    if (tag) encontradas.add(tag);
  }
  return Array.from(encontradas);
}

function createDefaultFile(): PensamentosFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    pensamentos: [],
  };
}

function migratePensamento(raw: unknown): Pensamento | null {
  const candidate = (raw ?? {}) as Partial<Pensamento>;
  if (typeof candidate.texto !== 'string') return null;

  const timestamp = candidate.createdAt ?? nowIso();
  const promocao = candidate.promovidoPara;

  return {
    id: typeof candidate.id === 'string' ? candidate.id : randomUUID(),
    texto: candidate.texto,
    // Recalcula em vez de confiar no que veio: se a regra de tags mudar, o
    // arquivo antigo se alinha sozinho na primeira leitura.
    tags: extrairTags(candidate.texto),
    fixado: Boolean(candidate.fixado),
    promovidoPara:
      promocao && typeof promocao.refId === 'string' && TIPOS_PROMOCAO.includes(promocao.tipo)
        ? { tipo: promocao.tipo, refId: promocao.refId, em: promocao.em ?? timestamp }
        : undefined,
    createdAt: timestamp,
    updatedAt: candidate.updatedAt ?? timestamp,
  };
}

function migratePensamentosFile(raw: unknown): PensamentosFile {
  const candidate = (raw ?? {}) as Partial<PensamentosFile>;
  const pensamentos = Array.isArray(candidate.pensamentos)
    ? candidate.pensamentos
        .map(migratePensamento)
        .filter((pensamento): pensamento is Pensamento => pensamento !== null)
    : [];

  ordenar(pensamentos);

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    pensamentos,
  };
}

/** Mais recente primeiro. O "fixado" é destaque na tela, não muda a ordem base. */
function ordenar(pensamentos: Pensamento[]): void {
  pensamentos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function loadFile(): PensamentosFile {
  return readStore(FILE_NAME, createDefaultFile, migratePensamentosFile);
}

async function saveFile(file: PensamentosFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function encontrar(file: PensamentosFile, pensamentoId: string): Pensamento {
  const pensamento = file.pensamentos.find((p) => p.id === pensamentoId);
  if (!pensamento) {
    throw new Error(`Pensamento ${pensamentoId} não encontrado.`);
  }
  return pensamento;
}

export async function getPensamentos(): Promise<PensamentosFile> {
  return loadFile();
}

export async function getFullFile(): Promise<PensamentosFile> {
  return loadFile();
}

export async function replaceFile(file: PensamentosFile): Promise<PensamentosFile> {
  await saveFile(file);
  return file;
}

export async function createPensamento(input: CreatePensamentoInput): Promise<PensamentosFile> {
  const texto = input.texto.trim();
  if (!texto) {
    throw new Error('O pensamento não pode ficar vazio.');
  }

  const file = loadFile();
  const timestamp = nowIso();

  file.pensamentos.unshift({
    id: randomUUID(),
    texto,
    tags: extrairTags(texto),
    fixado: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return file;
}

export async function updatePensamento(input: UpdatePensamentoInput): Promise<PensamentosFile> {
  const texto = input.texto.trim();
  if (!texto) {
    throw new Error('O pensamento não pode ficar vazio.');
  }

  const file = loadFile();
  const pensamento = encontrar(file, input.pensamentoId);

  pensamento.texto = texto;
  pensamento.tags = extrairTags(texto);
  pensamento.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function deletePensamento(pensamentoId: string): Promise<PensamentosFile> {
  const file = loadFile();
  file.pensamentos = file.pensamentos.filter((p) => p.id !== pensamentoId);
  await saveFile(file);
  return file;
}

export async function togglePin(pensamentoId: string): Promise<PensamentosFile> {
  const file = loadFile();
  const pensamento = encontrar(file, pensamentoId);

  pensamento.fixado = !pensamento.fixado;
  pensamento.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function marcarPromovido(input: MarcarPromovidoInput): Promise<PensamentosFile> {
  const file = loadFile();
  const pensamento = encontrar(file, input.pensamentoId);

  pensamento.promovidoPara = { tipo: input.tipo, refId: input.refId, em: nowIso() };
  pensamento.updatedAt = nowIso();

  await saveFile(file);
  return file;
}
