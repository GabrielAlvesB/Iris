import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import { readStore, writeStore } from '../../storage/jsonStore';
import {
  assertCriavelDentroDasRaizes,
  assertDentroDasRaizes,
  assertMoverDentroDasRaizes,
} from '../../core/pathGuard';
import { iniciarWatch, pararTodosOsWatchers, pararWatch } from './explorador.watcher';
import { lerInfoDoDiretorio } from '../../core/gitClient';
import type {
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  ItemDoDiretorio,
  ListarDiretorioInput,
  MoverInput,
  RaizMonitorada,
  RenomearInput,
} from '../../../shared/types/explorador.types';

const FILE_NAME = 'explorador.json';
const SCHEMA_VERSION = 1;
/** Teto por pasta: evita travar a tela ao abrir um diretório gigante. */
const MAX_ITENS = 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): ExploradorFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), raizes: [] };
}

function migrate(raw: unknown): ExploradorFile {
  const candidate = (raw ?? {}) as Partial<ExploradorFile>;
  const raizes = Array.isArray(candidate.raizes)
    ? candidate.raizes.filter(
        (raiz): raiz is RaizMonitorada => Boolean(raiz) && typeof raiz.caminho === 'string',
      )
    : [];

  return { schemaVersion: SCHEMA_VERSION, updatedAt: candidate.updatedAt ?? nowIso(), raizes };
}

function loadFile(): ExploradorFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: ExploradorFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function caminhosDasRaizes(): string[] {
  return loadFile().raizes.map((raiz) => raiz.caminho);
}

function acharRaiz(file: ExploradorFile, raizId: string): RaizMonitorada {
  const raiz = file.raizes.find((r) => r.id === raizId);
  if (!raiz) throw new Error('Pasta monitorada não encontrada.');
  return raiz;
}

/**
 * fs.watch recursivo não é confiável sobre SMB, então caminhos de rede entram
 * como não monitoráveis e a tela oferece o botão Atualizar no lugar.
 */
function ehCaminhoDeRede(caminho: string): boolean {
  return caminho.startsWith('\\\\') || caminho.startsWith('//');
}

export async function getRaizes(): Promise<ExploradorFile> {
  return loadFile();
}

export async function adicionarRaiz(caminho: string): Promise<ExploradorFile> {
  const file = loadFile();
  const resolvido = path.resolve(caminho);

  if (!fs.existsSync(resolvido) || !fs.statSync(resolvido).isDirectory()) {
    throw new Error('A pasta escolhida não existe mais.');
  }
  if (file.raizes.some((raiz) => path.resolve(raiz.caminho) === resolvido)) {
    throw new Error('Esta pasta já está sendo monitorada.');
  }

  const timestamp = nowIso();
  const raiz: RaizMonitorada = {
    id: randomUUID(),
    nome: path.basename(resolvido) || resolvido,
    caminho: resolvido,
    monitoravel: !ehCaminhoDeRede(resolvido),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  file.raizes.push(raiz);
  await saveFile(file);

  if (raiz.monitoravel) iniciarWatch(raiz.id, raiz.caminho);
  return file;
}

export async function removerRaiz(raizId: string): Promise<ExploradorFile> {
  const file = loadFile();
  file.raizes = file.raizes.filter((raiz) => raiz.id !== raizId);
  await saveFile(file);
  pararWatch(raizId);
  return file;
}

function lerItem(dir: string, entry: fs.Dirent): ItemDoDiretorio | null {
  const completo = path.join(dir, entry.name);
  try {
    const stat = fs.statSync(completo);
    return {
      nome: entry.name,
      caminho: completo,
      tipo: entry.isDirectory() ? 'pasta' : 'arquivo',
      tamanho: entry.isDirectory() ? 0 : stat.size,
      modificadoEm: stat.mtime.toISOString(),
    };
  } catch {
    // Arquivo sumiu entre o readdir e o stat, ou está bloqueado: ignora.
    return null;
  }
}

export async function listarDiretorio(input: ListarDiretorioInput): Promise<ExploradorListagem> {
  const file = loadFile();
  const raiz = acharRaiz(file, input.raizId);

  const alvo = input.relativo
    ? path.join(raiz.caminho, input.relativo.split('/').join(path.sep))
    : raiz.caminho;
  const canonico = assertDentroDasRaizes([raiz.caminho], alvo);

  let entradas: fs.Dirent[];
  try {
    entradas = fs.readdirSync(canonico, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Não foi possível abrir a pasta: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const truncado = entradas.length > MAX_ITENS;
  const itens = entradas
    .slice(0, MAX_ITENS)
    .map((entry) => lerItem(canonico, entry))
    .filter((item): item is ItemDoDiretorio => item !== null)
    // Pastas primeiro, depois alfabético respeitando acentuação.
    .sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'pasta' ? -1 : 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

  const relativo = path.relative(raiz.caminho, canonico).split(path.sep).join('/');

  // Medido em ~68 ms num repositório real, então cabe no tempo de uma
  // navegação e vai junto com a listagem em vez de chegar depois por push.
  const git = await lerInfoDoDiretorio(canonico);
  if (git) {
    itens.forEach((item) => {
      const status = git.statusPorCaminho.get(path.normalize(item.caminho));
      if (status) item.statusGit = status;
    });
  }

  return {
    raizId: raiz.id,
    caminho: canonico,
    relativo,
    itens,
    truncado,
    git: git?.info,
  };
}

export async function criar(input: CriarInput): Promise<ExploradorListagem> {
  const file = loadFile();
  const raiz = acharRaiz(file, input.raizId);

  const pai = input.relativo
    ? path.join(raiz.caminho, input.relativo.split('/').join(path.sep))
    : raiz.caminho;
  const alvo = assertCriavelDentroDasRaizes([raiz.caminho], path.join(pai, input.nome));

  if (fs.existsSync(alvo)) {
    throw new Error('Já existe um item com esse nome nesta pasta.');
  }

  if (input.tipo === 'pasta') {
    fs.mkdirSync(alvo);
  } else {
    fs.writeFileSync(alvo, '', 'utf-8');
  }

  return listarDiretorio({ raizId: input.raizId, relativo: input.relativo });
}

export async function renomear(input: RenomearInput): Promise<ExploradorListagem> {
  const file = loadFile();
  const raiz = acharRaiz(file, input.raizId);

  const origem = assertDentroDasRaizes([raiz.caminho], input.caminho);
  const destino = assertCriavelDentroDasRaizes(
    [raiz.caminho],
    path.join(path.dirname(origem), input.novoNome),
  );

  if (origem === destino) {
    return listarDiretorio({
      raizId: input.raizId,
      relativo: path.relative(raiz.caminho, path.dirname(origem)).split(path.sep).join('/'),
    });
  }
  if (fs.existsSync(destino)) {
    throw new Error('Já existe um item com esse nome nesta pasta.');
  }

  fs.renameSync(origem, destino);

  return listarDiretorio({
    raizId: input.raizId,
    relativo: path.relative(raiz.caminho, path.dirname(origem)).split(path.sep).join('/'),
  });
}

export async function mover(input: MoverInput): Promise<ExploradorListagem> {
  const file = loadFile();
  const raiz = acharRaiz(file, input.raizId);

  const destinoDir = input.destinoRelativo
    ? path.join(raiz.caminho, input.destinoRelativo.split('/').join(path.sep))
    : raiz.caminho;

  const { origem, destino } = assertMoverDentroDasRaizes(
    [raiz.caminho],
    input.caminho,
    path.join(destinoDir, path.basename(input.caminho)),
  );

  // Mover uma pasta para dentro dela mesma apagaria a árvore no rename.
  if (destino.startsWith(origem + path.sep)) {
    throw new Error('Não dá para mover uma pasta para dentro dela mesma.');
  }
  if (fs.existsSync(destino)) {
    throw new Error('Já existe um item com esse nome na pasta de destino.');
  }

  const origemDir = path.dirname(origem);
  fs.renameSync(origem, destino);

  return listarDiretorio({
    raizId: input.raizId,
    relativo: path.relative(raiz.caminho, origemDir).split(path.sep).join('/'),
  });
}

export async function excluir(input: ExcluirInput): Promise<ExploradorListagem> {
  const file = loadFile();
  const raiz = acharRaiz(file, input.raizId);
  const alvo = assertDentroDasRaizes([raiz.caminho], input.caminho);
  const paiDir = path.dirname(alvo);

  // Lixeira, nunca fs.rm: exclusão pelo Iris precisa ser reversível.
  await shell.trashItem(alvo);

  return listarDiretorio({
    raizId: input.raizId,
    relativo: path.relative(raiz.caminho, paiDir).split(path.sep).join('/'),
  });
}

export async function revelarNoSistema(caminho: string): Promise<void> {
  const alvo = assertDentroDasRaizes(caminhosDasRaizes(), caminho);
  shell.showItemInFolder(alvo);
}

export async function abrirNoSistema(caminho: string): Promise<void> {
  const alvo = assertDentroDasRaizes(caminhosDasRaizes(), caminho);
  const erro = await shell.openPath(alvo);
  if (erro) throw new Error(erro);
}

/** Chamado no boot: religa os watchers das raízes já salvas. */
export function iniciarWatchers(): void {
  loadFile().raizes.forEach((raiz) => {
    if (raiz.monitoravel) iniciarWatch(raiz.id, raiz.caminho);
  });
}

export function pararWatchers(): void {
  pararTodosOsWatchers();
}

export async function getFullFile(): Promise<ExploradorFile> {
  return loadFile();
}

export async function replaceFile(file: ExploradorFile): Promise<ExploradorFile> {
  await saveFile(file);
  return file;
}
