import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';
import { readStore, writeStore } from '../../storage/jsonStore';
import {
  migrateQuadro,
  migrateViewport,
  type CanvasFile,
  type ExportarImagemCanvasInput,
  type QuadroCanvas,
  type ViewportCanvas,
} from '../../../shared/types/canvas.types';

/**
 * Canvas — a lousa infinita. A tela edita o quadro inteiro na memória e manda o
 * quadro de volta na pausa (`salvarQuadro`): um traço à mão tem centenas de
 * pontos e não faz sentido uma chamada por ponto. Tudo passa pela `migrateQuadro`.
 */

const FILE_NAME = 'canvas.json';
const SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function quadroNovo(nome: string): QuadroCanvas {
  const agora = nowIso();
  return { id: randomUUID(), nome, createdAt: agora, updatedAt: agora, viewport: { x: 0, y: 0, zoom: 1 }, formas: [] };
}

function createDefaultFile(): CanvasFile {
  const primeiro = quadroNovo('Meu primeiro quadro');
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), quadros: [primeiro], quadroAtivoId: primeiro.id };
}

function migrate(raw: unknown): CanvasFile {
  const c = (raw ?? {}) as Partial<CanvasFile>;
  const agora = nowIso();
  const vistos = new Set<string>();
  const quadros = (Array.isArray(c.quadros) ? c.quadros : [])
    .map((q) => migrateQuadro(q, agora))
    .filter((q): q is QuadroCanvas => {
      if (!q || vistos.has(q.id)) return false;
      vistos.add(q.id);
      return true;
    });
  if (quadros.length === 0) quadros.push(quadroNovo('Meu primeiro quadro'));
  const ativo = typeof c.quadroAtivoId === 'string' && quadros.some((q) => q.id === c.quadroAtivoId) ? c.quadroAtivoId : quadros[0]!.id;
  return { schemaVersion: SCHEMA_VERSION, updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : agora, quadros, quadroAtivoId: ativo };
}

function loadFile(): CanvasFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: CanvasFile): Promise<CanvasFile> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
  return file;
}

function achar(file: CanvasFile, quadroId: string): QuadroCanvas {
  const q = file.quadros.find((x) => x.id === quadroId);
  if (!q) throw new Error('Quadro não encontrado.');
  return q;
}

export async function getFile(): Promise<CanvasFile> {
  return loadFile();
}

export async function getFullFile(): Promise<CanvasFile> {
  return loadFile();
}

export async function replaceFile(raw: unknown): Promise<CanvasFile> {
  return saveFile(migrate(raw));
}

export async function criarQuadro(nome: string): Promise<CanvasFile> {
  const file = loadFile();
  const q = quadroNovo(nome.trim().slice(0, 120) || 'Sem nome');
  file.quadros.push(q);
  file.quadroAtivoId = q.id;
  return saveFile(file);
}

export async function renomearQuadro(input: { quadroId: string; nome: string }): Promise<CanvasFile> {
  const file = loadFile();
  const q = achar(file, input.quadroId);
  q.nome = input.nome.trim().slice(0, 120) || q.nome;
  q.updatedAt = nowIso();
  return saveFile(file);
}

export async function duplicarQuadro(quadroId: string): Promise<CanvasFile> {
  const file = loadFile();
  const original = achar(file, quadroId);
  const agora = nowIso();
  // Ids novos para as formas, com as ligações das setas apontando para as cópias.
  const novosIds = new Map(original.formas.map((f) => [f.id, randomUUID()]));
  const copia: QuadroCanvas = {
    ...structuredClone(original),
    id: randomUUID(),
    nome: `${original.nome} (cópia)`,
    createdAt: agora,
    updatedAt: agora,
  };
  copia.formas.forEach((f) => {
    f.id = novosIds.get(f.id)!;
    if (f.ligacoes?.inicio) f.ligacoes.inicio = novosIds.get(f.ligacoes.inicio);
    if (f.ligacoes?.fim) f.ligacoes.fim = novosIds.get(f.ligacoes.fim);
  });
  file.quadros.splice(file.quadros.indexOf(original) + 1, 0, copia);
  file.quadroAtivoId = copia.id;
  return saveFile(file);
}

export async function excluirQuadro(quadroId: string): Promise<CanvasFile> {
  const file = loadFile();
  achar(file, quadroId);
  file.quadros = file.quadros.filter((q) => q.id !== quadroId);
  // Nunca fica sem quadro: a tela sempre tem onde desenhar.
  if (file.quadros.length === 0) file.quadros.push(quadroNovo('Sem nome'));
  if (file.quadroAtivoId === quadroId) file.quadroAtivoId = file.quadros[0]!.id;
  return saveFile(file);
}

export async function escolherQuadro(quadroId: string): Promise<CanvasFile> {
  const file = loadFile();
  achar(file, quadroId);
  file.quadroAtivoId = quadroId;
  return saveFile(file);
}

/** O quadro inteiro, como a tela o tem. O nome e o viewport vêm junto. */
export async function salvarQuadro(raw: unknown): Promise<CanvasFile> {
  const agora = nowIso();
  const quadro = migrateQuadro(raw, agora);
  if (!quadro) throw new Error('Quadro inválido.');
  const file = loadFile();
  const i = file.quadros.findIndex((q) => q.id === quadro.id);
  if (i < 0) throw new Error('Este quadro foi excluído.');
  quadro.createdAt = file.quadros[i]!.createdAt;
  quadro.updatedAt = agora;
  file.quadros[i] = quadro;
  return saveFile(file);
}

export async function salvarViewport(input: { quadroId: string; viewport: ViewportCanvas }): Promise<CanvasFile> {
  const file = loadFile();
  const q = file.quadros.find((x) => x.id === input.quadroId);
  if (!q) return file;
  q.viewport = migrateViewport(input.viewport);
  return saveFile(file);
}

/** PNG ou SVG montado na tela; o caminho só vem do diálogo, aqui. */
export async function exportarImagem(event: IpcMainInvokeEvent, input: ExportarImagemCanvasInput): Promise<string | null> {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const ext = input.formato === 'png' ? 'png' : 'svg';
  const nome = `${(input.nomeSugerido || 'canvas').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'canvas'}.${ext}`;
  const opcoes: Electron.SaveDialogOptions = {
    title: 'Exportar imagem do quadro',
    defaultPath: nome,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  };
  const r = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (r.canceled || !r.filePath) return null;
  if (input.formato === 'png') {
    const m = /^data:image\/png;base64,(.+)$/.exec(input.dados);
    if (!m) throw new Error('A imagem não veio no formato esperado.');
    await fs.writeFile(r.filePath, Buffer.from(m[1]!, 'base64'));
  } else {
    if (!input.dados.startsWith('<svg')) throw new Error('A imagem não veio no formato esperado.');
    await fs.writeFile(r.filePath, input.dados, 'utf-8');
  }
  return r.filePath;
}
