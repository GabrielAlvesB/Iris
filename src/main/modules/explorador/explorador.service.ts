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
import { buscarNasRaizes } from './explorador.busca';
import type {
  AdicionarRecursoInput,
  AdicionarRecursosResult,
  AtualizarRecursoInput,
  BibliotecaInfo,
  BuscarInput,
  Colecao,
  CriarInput,
  ExcluirInput,
  ExploradorFile,
  ExploradorListagem,
  ItemDoDiretorio,
  ListarDiretorioInput,
  MoverInput,
  RaizMonitorada,
  Recente,
  RecenteDetalhado,
  Recurso,
  RecursoDetalhado,
  RenomearInput,
  ResultadoBusca,
  SalvarColecaoInput,
  SituacaoRecurso,
} from '../../../shared/types/explorador.types';

const FILE_NAME = 'explorador.json';
/** v2: a Biblioteca (coleções, recursos, recentes) entrou ao lado das raízes. */
const SCHEMA_VERSION = 2;
/** Teto por pasta: evita travar a tela ao abrir um diretório gigante. */
const MAX_ITENS = 1000;
const MAX_RECENTES = 30;
const COR_REGEX = /^#[0-9a-f]{6}$/i;

function nowIso(): string {
  return new Date().toISOString();
}

/** Pontos de partida pensados para produção de conteúdo; o usuário renomeia ou apaga. */
function colecoesPadrao(): Colecao[] {
  return [
    { id: randomUUID(), nome: 'Roteiros', cor: '#a78bfa', order: 0 },
    { id: randomUUID(), nome: 'Thumbnails', cor: '#f472b6', order: 1 },
    { id: randomUUID(), nome: 'B-roll e mídia', cor: '#38bdf8', order: 2 },
    { id: randomUUID(), nome: 'Templates', cor: '#34d399', order: 3 },
    { id: randomUUID(), nome: 'Referências', cor: '#fbbf24', order: 4 },
  ];
}

function createDefaultFile(): ExploradorFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    raizes: [],
    colecoes: colecoesPadrao(),
    recursos: [],
    recentes: [],
  };
}

function migrateColecao(raw: unknown, indice: number): Colecao | null {
  const c = (raw ?? {}) as Partial<Colecao>;
  if (typeof c.nome !== 'string' || !c.nome.trim()) return null;
  return {
    id: typeof c.id === 'string' ? c.id : randomUUID(),
    nome: c.nome.trim(),
    cor: typeof c.cor === 'string' && COR_REGEX.test(c.cor) ? c.cor : '#9498a3',
    order: typeof c.order === 'number' ? c.order : indice,
  };
}

function migrateRecurso(raw: unknown, colecaoIds: Set<string>): Recurso | null {
  const c = (raw ?? {}) as Partial<Recurso>;
  if (typeof c.caminho !== 'string' || !c.caminho) return null;
  const timestamp = typeof c.createdAt === 'string' ? c.createdAt : nowIso();
  return {
    id: typeof c.id === 'string' ? c.id : randomUUID(),
    caminho: c.caminho,
    nome: typeof c.nome === 'string' && c.nome.trim() ? c.nome.trim() : path.basename(c.caminho),
    tipo: c.tipo === 'pasta' ? 'pasta' : 'arquivo',
    // Coleção apagada não deixa id fantasma: o recurso volta para "sem coleção".
    colecaoId: typeof c.colecaoId === 'string' && colecaoIds.has(c.colecaoId) ? c.colecaoId : undefined,
    tags: Array.isArray(c.tags) ? normalizarTags(c.tags.filter((t): t is string => typeof t === 'string')) : [],
    nota: typeof c.nota === 'string' ? c.nota : '',
    fixado: Boolean(c.fixado),
    createdAt: timestamp,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : timestamp,
  };
}

function migrate(raw: unknown): ExploradorFile {
  const candidate = (raw ?? {}) as Partial<ExploradorFile>;
  const raizes = Array.isArray(candidate.raizes)
    ? candidate.raizes.filter(
        (raiz): raiz is RaizMonitorada => Boolean(raiz) && typeof raiz.caminho === 'string',
      )
    : [];

  // Arquivo v1 não tem coleções: recebe as sementes, como uma instalação nova.
  const colecoes = Array.isArray(candidate.colecoes)
    ? candidate.colecoes.map(migrateColecao).filter((c): c is Colecao => c !== null)
    : colecoesPadrao();
  const colecaoIds = new Set(colecoes.map((c) => c.id));
  const recursos = Array.isArray(candidate.recursos)
    ? candidate.recursos.map((r) => migrateRecurso(r, colecaoIds)).filter((r): r is Recurso => r !== null)
    : [];
  const recentes = Array.isArray(candidate.recentes)
    ? candidate.recentes
        .filter((r): r is Recente => Boolean(r) && typeof r.caminho === 'string' && typeof r.em === 'string')
        .slice(0, MAX_RECENTES)
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    raizes,
    colecoes: colecoes.sort((a, b) => a.order - b.order),
    recursos,
    recentes,
  };
}

/** Tags sem "#", minúsculas e sem repetição — é o que a busca da Biblioteca compara. */
function normalizarTags(tags: string[]): string[] {
  const vistas = new Set<string>();
  tags
    .flatMap((t) => t.split(/[,\s]+/))
    .map((t) => t.replace(/^#/, '').trim().toLocaleLowerCase('pt-BR'))
    .filter(Boolean)
    .forEach((t) => vistas.add(t));
  return [...vistas];
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
  await registrarRecente(alvo);
}

// ---------- Biblioteca ----------

async function registrarRecente(caminho: string): Promise<void> {
  const file = loadFile();
  const chave = path.normalize(caminho).toLowerCase();
  file.recentes = [
    { caminho, em: nowIso() },
    ...file.recentes.filter((r) => path.normalize(r.caminho).toLowerCase() !== chave),
  ].slice(0, MAX_RECENTES);
  await saveFile(file);
}

/** Raiz monitorada que contém o caminho, comparando fronteiras com path.relative. */
function raizQueContem(raizes: RaizMonitorada[], caminho: string): RaizMonitorada | undefined {
  return raizes.find((raiz) => {
    const relativo = path.relative(raiz.caminho, caminho);
    return relativo === '' || (!relativo.startsWith('..') && !path.isAbsolute(relativo));
  });
}

function situacaoDe(raizes: RaizMonitorada[], caminho: string): { situacao: SituacaoRecurso; stat?: fs.Stats } {
  if (!raizQueContem(raizes, caminho)) return { situacao: 'fora' };
  try {
    return { situacao: 'ok', stat: fs.statSync(caminho) };
  } catch {
    return { situacao: 'ausente' };
  }
}

function detalhar(file: ExploradorFile, recurso: Recurso): RecursoDetalhado {
  const { situacao, stat } = situacaoDe(file.raizes, recurso.caminho);
  const raiz = raizQueContem(file.raizes, recurso.caminho);
  return {
    ...recurso,
    situacao,
    tamanho: stat && !stat.isDirectory() ? stat.size : 0,
    modificadoEm: stat?.mtime.toISOString(),
    raizNome: raiz?.nome,
    relativo: raiz ? path.relative(raiz.caminho, path.dirname(recurso.caminho)).split(path.sep).join('/') : undefined,
  };
}

function montarBiblioteca(file: ExploradorFile): BibliotecaInfo {
  const porCaminho = new Map(file.recursos.map((r) => [path.normalize(r.caminho).toLowerCase(), r.id]));
  const recentes: RecenteDetalhado[] = file.recentes.map((r) => {
    const { situacao, stat } = situacaoDe(file.raizes, r.caminho);
    return {
      ...r,
      nome: path.basename(r.caminho),
      tipo: stat?.isDirectory() ? 'pasta' : 'arquivo',
      situacao,
      recursoId: porCaminho.get(path.normalize(r.caminho).toLowerCase()),
    };
  });
  return {
    colecoes: file.colecoes,
    recursos: file.recursos.map((r) => detalhar(file, r)),
    recentes,
    temRaizes: file.raizes.length > 0,
  };
}

function acharRecurso(file: ExploradorFile, recursoId: string): Recurso {
  const recurso = file.recursos.find((r) => r.id === recursoId);
  if (!recurso) throw new Error('Este item não está mais na Biblioteca.');
  return recurso;
}

export async function getBiblioteca(): Promise<BibliotecaInfo> {
  return montarBiblioteca(loadFile());
}

/**
 * Adiciona um ou mais caminhos à Biblioteca. Só aceita o que está dentro de
 * uma pasta monitorada — é essa fronteira que o pathGuard protege em todas as
 * operações de abrir e revelar depois.
 */
export async function adicionarRecursos(caminhos: string[], colecaoId?: string): Promise<AdicionarRecursosResult> {
  const file = loadFile();
  const raizes = file.raizes.map((r) => r.caminho);
  const colecao = colecaoId && file.colecoes.some((c) => c.id === colecaoId) ? colecaoId : undefined;
  const recusados: string[] = [];
  let adicionados = 0;

  for (const caminho of caminhos) {
    let canonico: string;
    try {
      canonico = assertDentroDasRaizes(raizes, caminho);
    } catch {
      recusados.push(caminho);
      continue;
    }
    const chave = path.normalize(canonico).toLowerCase();
    const existente = file.recursos.find((r) => path.normalize(r.caminho).toLowerCase() === chave);
    if (existente) {
      // Já estava: só move para a coleção pedida, sem duplicar.
      if (colecao) existente.colecaoId = colecao;
      continue;
    }
    const timestamp = nowIso();
    file.recursos.push({
      id: randomUUID(),
      caminho: canonico,
      nome: path.basename(canonico),
      tipo: fs.statSync(canonico).isDirectory() ? 'pasta' : 'arquivo',
      colecaoId: colecao,
      tags: [],
      nota: '',
      fixado: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    adicionados += 1;
  }

  await saveFile(file);
  return { biblioteca: montarBiblioteca(file), adicionados, recusados };
}

export async function adicionarRecurso(input: AdicionarRecursoInput): Promise<AdicionarRecursosResult> {
  const resultado = await adicionarRecursos([input.caminho], input.colecaoId);
  if (resultado.recusados.length > 0) {
    throw new Error('Só dá para guardar na Biblioteca itens de dentro das pastas monitoradas.');
  }
  return resultado;
}

export async function atualizarRecurso(input: AtualizarRecursoInput): Promise<BibliotecaInfo> {
  const file = loadFile();
  const recurso = acharRecurso(file, input.recursoId);

  if (input.nome !== undefined) recurso.nome = input.nome.trim() || path.basename(recurso.caminho);
  if (input.colecaoId !== undefined) {
    recurso.colecaoId = file.colecoes.some((c) => c.id === input.colecaoId) ? input.colecaoId : undefined;
  }
  if (input.tags !== undefined) recurso.tags = normalizarTags(input.tags);
  if (input.nota !== undefined) recurso.nota = input.nota;
  if (input.fixado !== undefined) recurso.fixado = input.fixado;
  recurso.updatedAt = nowIso();

  await saveFile(file);
  return montarBiblioteca(file);
}

/** Tira da Biblioteca. O arquivo no disco não é tocado. */
export async function removerRecurso(recursoId: string): Promise<BibliotecaInfo> {
  const file = loadFile();
  file.recursos = file.recursos.filter((r) => r.id !== recursoId);
  await saveFile(file);
  return montarBiblioteca(file);
}

export async function salvarColecao(input: SalvarColecaoInput): Promise<BibliotecaInfo> {
  const nome = input.nome.trim();
  if (!nome) throw new Error('A coleção precisa de um nome.');
  const file = loadFile();
  const cor = COR_REGEX.test(input.cor) ? input.cor : '#9498a3';
  const existente = input.id ? file.colecoes.find((c) => c.id === input.id) : undefined;
  if (existente) {
    existente.nome = nome;
    existente.cor = cor;
  } else {
    file.colecoes.push({ id: randomUUID(), nome, cor, order: file.colecoes.length });
  }
  await saveFile(file);
  return montarBiblioteca(file);
}

/** Apaga a coleção; os recursos dela continuam na Biblioteca, sem coleção. */
export async function excluirColecao(colecaoId: string): Promise<BibliotecaInfo> {
  const file = loadFile();
  file.colecoes = file.colecoes.filter((c) => c.id !== colecaoId).map((c, i) => ({ ...c, order: i }));
  file.recursos.forEach((r) => {
    if (r.colecaoId === colecaoId) r.colecaoId = undefined;
  });
  await saveFile(file);
  return montarBiblioteca(file);
}

export async function limparRecentes(): Promise<BibliotecaInfo> {
  const file = loadFile();
  file.recentes = [];
  await saveFile(file);
  return montarBiblioteca(file);
}

export async function buscar(input: BuscarInput): Promise<ResultadoBusca> {
  const file = loadFile();
  const raizes = input.raizIds?.length ? file.raizes.filter((r) => input.raizIds!.includes(r.id)) : file.raizes;
  return buscarNasRaizes(raizes, input.termo);
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
