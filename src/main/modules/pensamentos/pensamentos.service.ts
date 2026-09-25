import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import {
  COR_POSTIT_PADRAO,
  POSTIT_ALTURA,
  POSTIT_LARGURA,
  type CreatePensamentoInput,
  type MoverPensamentoInput,
  type Pensamento,
  type PensamentosFile,
  type PensamentosViewport,
  type UpdatePensamentoInput,
} from '../../../shared/types/pensamentos.types';

const FILE_NAME = 'pensamentos.json';
// v2: os pensamentos viraram post-its num quadro (posição, tamanho, cor).
const SCHEMA_VERSION = 2;

const LARGURA_MIN = 140;
const ALTURA_MIN = 110;
const LARGURA_MAX = 900;
const ALTURA_MAX = 900;
const COR_REGEX = /^#[0-9a-f]{6}$/i;

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

function numero(valor: unknown, padrao: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : padrao;
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function corValida(valor: unknown): string | null {
  return typeof valor === 'string' && COR_REGEX.test(valor) ? valor.toLowerCase() : null;
}

function viewportPadrao(): PensamentosViewport {
  return { x: 40, y: 40, zoom: 1 };
}

function createDefaultFile(): PensamentosFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    pensamentos: [],
    viewport: viewportPadrao(),
  };
}

/**
 * Posição em grade para quem veio da v1 (lista cronológica, sem posição):
 * o mais recente no canto de cima, como era na lista.
 */
function posicaoEmGrade(indice: number): { x: number; y: number } {
  const porLinha = 5;
  return {
    x: (indice % porLinha) * (POSTIT_LARGURA + 24),
    y: Math.floor(indice / porLinha) * (POSTIT_ALTURA + 24),
  };
}

function migratePensamento(raw: unknown, indice: number): Pensamento | null {
  const candidate = (raw ?? {}) as Partial<Pensamento>;
  if (typeof candidate.texto !== 'string') return null;

  const timestamp = candidate.createdAt ?? nowIso();
  const grade = posicaoEmGrade(indice);
  const temPosicao = typeof candidate.x === 'number' && typeof candidate.y === 'number';

  return {
    id: typeof candidate.id === 'string' ? candidate.id : randomUUID(),
    texto: candidate.texto,
    // Recalcula em vez de confiar no que veio: se a regra de tags mudar, o
    // arquivo antigo se alinha sozinho na primeira leitura.
    tags: extrairTags(candidate.texto),
    fixado: Boolean(candidate.fixado),
    cor: corValida(candidate.cor) ?? COR_POSTIT_PADRAO,
    x: temPosicao ? numero(candidate.x, grade.x) : grade.x,
    y: temPosicao ? numero(candidate.y, grade.y) : grade.y,
    largura: limitar(numero(candidate.largura, POSTIT_LARGURA), LARGURA_MIN, LARGURA_MAX),
    altura: limitar(numero(candidate.altura, POSTIT_ALTURA), ALTURA_MIN, ALTURA_MAX),
    ordem: numero(candidate.ordem, 0),
    createdAt: timestamp,
    updatedAt: candidate.updatedAt ?? timestamp,
  };
}

function migrateViewport(raw: unknown): PensamentosViewport {
  const candidate = (raw ?? {}) as Partial<PensamentosViewport>;
  const padrao = viewportPadrao();
  return {
    x: numero(candidate.x, padrao.x),
    y: numero(candidate.y, padrao.y),
    zoom: limitar(numero(candidate.zoom, padrao.zoom), 0.3, 2.5),
  };
}

function migratePensamentosFile(raw: unknown): PensamentosFile {
  const candidate = (raw ?? {}) as Partial<PensamentosFile>;
  const brutos = Array.isArray(candidate.pensamentos) ? [...candidate.pensamentos] : [];
  // A grade da v1 segue a ordem da lista antiga (mais recente primeiro).
  brutos.sort((a, b) => String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? '')));

  const pensamentos = brutos
    .map(migratePensamento)
    .filter((pensamento): pensamento is Pensamento => pensamento !== null);

  ordenar(pensamentos);

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    pensamentos,
    viewport: migrateViewport(candidate.viewport),
  };
}

/** Mais recente primeiro; a pilha visual é dada por `ordem`, não pela lista. */
function ordenar(pensamentos: Pensamento[]): void {
  pensamentos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function proximaOrdem(file: PensamentosFile): number {
  return file.pensamentos.reduce((max, p) => Math.max(max, p.ordem), 0) + 1;
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

/** Passa pela migração: um backup da v1 (lista sem posição) volta como quadro. */
export async function replaceFile(file: PensamentosFile): Promise<PensamentosFile> {
  const migrado = migratePensamentosFile(file);
  await saveFile(migrado);
  return migrado;
}

export async function createPensamento(input: CreatePensamentoInput): Promise<PensamentosFile> {
  const texto = (input.texto ?? '').trim();
  const file = loadFile();
  const timestamp = nowIso();

  file.pensamentos.unshift({
    id: randomUUID(),
    texto,
    tags: extrairTags(texto),
    fixado: false,
    cor: corValida(input.cor) ?? COR_POSTIT_PADRAO,
    x: numero(input.x, 0),
    y: numero(input.y, 0),
    largura: POSTIT_LARGURA,
    altura: POSTIT_ALTURA,
    ordem: proximaOrdem(file),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return file;
}

export async function updatePensamento(input: UpdatePensamentoInput): Promise<PensamentosFile> {
  const file = loadFile();
  const pensamento = encontrar(file, input.pensamentoId);

  if (input.texto !== undefined) {
    const texto = input.texto.trim();
    pensamento.texto = texto;
    pensamento.tags = extrairTags(texto);
  }
  if (input.cor !== undefined) {
    const cor = corValida(input.cor);
    if (!cor) throw new Error('Cor inválida.');
    pensamento.cor = cor;
  }
  pensamento.updatedAt = nowIso();

  await saveFile(file);
  return file;
}

export async function moverPensamento(input: MoverPensamentoInput): Promise<PensamentosFile> {
  const file = loadFile();
  const pensamento = encontrar(file, input.pensamentoId);

  pensamento.x = numero(input.x, pensamento.x);
  pensamento.y = numero(input.y, pensamento.y);
  if (input.largura !== undefined) {
    pensamento.largura = limitar(numero(input.largura, pensamento.largura), LARGURA_MIN, LARGURA_MAX);
  }
  if (input.altura !== undefined) {
    pensamento.altura = limitar(numero(input.altura, pensamento.altura), ALTURA_MIN, ALTURA_MAX);
  }
  pensamento.ordem = proximaOrdem(file);

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

export async function setViewport(viewport: PensamentosViewport): Promise<PensamentosFile> {
  const file = loadFile();
  file.viewport = migrateViewport(viewport);
  await saveFile(file);
  return file;
}
