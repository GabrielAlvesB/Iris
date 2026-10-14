import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import { broadcast } from '../../core/broadcast';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import type { TipoPostagem } from '../../../shared/types/postagens.types';
import { TITULO_IDEIA_MAX, type AtualizarIdeiaInput, type Ideia, type IdeiasFile, type ResultadoVirarPostagem } from '../../../shared/types/ideias.types';

/**
 * Banco de ideias (aba Ideias de Postagens). "Virar postagem" cria o vídeo ou
 * a imagem pelo mesmo `criar` da pipeline (primeira etapa, tags e redes do
 * catálogo) e marca a ideia — ela não some: fica com o link para a postagem.
 */

const FILE_NAME = 'ideias.json';
const SCHEMA_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function ids(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : [];
}

function migrateIdeia(raw: unknown): Ideia | null {
  const r = (raw ?? {}) as Partial<Ideia>;
  const titulo = texto(r.titulo, TITULO_IDEIA_MAX);
  if (!titulo) return null;
  const criadaEm = typeof r.criadaEm === 'string' ? r.criadaEm : nowIso();
  const v = r.virouPostagem;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : randomUUID(),
    titulo,
    notas: typeof r.notas === 'string' ? r.notas : '',
    tagIds: ids(r.tagIds),
    redeIds: ids(r.redeIds),
    criadaEm,
    atualizadaEm: typeof r.atualizadaEm === 'string' ? r.atualizadaEm : criadaEm,
    arquivada: r.arquivada === true,
    virouPostagem:
      v && (v.tipo === 'video' || v.tipo === 'imagem') && typeof v.id === 'string' ? { tipo: v.tipo, id: v.id, em: typeof v.em === 'string' ? v.em : criadaEm } : undefined,
  };
}

function migrate(raw: unknown): IdeiasFile {
  const r = (raw ?? {}) as Partial<IdeiasFile>;
  return {
    schemaVersion: SCHEMA_VERSION,
    ideias: (Array.isArray(r.ideias) ? r.ideias : []).map(migrateIdeia).filter((i): i is Ideia => i !== null),
  };
}

function loadFile(): IdeiasFile {
  return readStore(FILE_NAME, () => migrate({}), migrate);
}

async function saveFile(file: IdeiasFile): Promise<IdeiasFile> {
  await writeStore(FILE_NAME, file);
  return file;
}

/** Tags e redes que não existem mais no catálogo não ficam penduradas na ideia. */
function filtrarCatalogo(i: Pick<Ideia, 'tagIds' | 'redeIds'>): void {
  const catalogo = videosService.getCatalogo();
  const tags = new Set(catalogo.tags.map((t) => t.id));
  const redes = new Set(catalogo.redes.map((r) => r.id));
  i.tagIds = i.tagIds.filter((id) => tags.has(id));
  i.redeIds = i.redeIds.filter((id) => redes.has(id));
}

export async function getFile(): Promise<IdeiasFile> {
  const file = loadFile();
  file.ideias.forEach(filtrarCatalogo);
  return file;
}

export async function getFullFile(): Promise<IdeiasFile> {
  return loadFile();
}

export async function replaceFile(raw: unknown): Promise<IdeiasFile> {
  return saveFile(migrate(raw));
}

/** Várias de uma vez: colar várias linhas cria uma ideia por linha. */
export async function criar(entrada: unknown): Promise<IdeiasFile> {
  const r = (entrada ?? {}) as { titulos?: unknown; notas?: unknown };
  const titulos = (Array.isArray(r.titulos) ? r.titulos : []).map((t) => texto(t, TITULO_IDEIA_MAX)).filter(Boolean);
  if (!titulos.length) throw new Error('Escreva a ideia.');
  const file = loadFile();
  const agora = nowIso();
  titulos.forEach((titulo) => {
    file.ideias.push({
      id: randomUUID(),
      titulo,
      notas: titulos.length === 1 && typeof r.notas === 'string' ? r.notas : '',
      tagIds: [],
      redeIds: [],
      criadaEm: agora,
      atualizadaEm: agora,
      arquivada: false,
    });
  });
  return saveFile(file);
}

function achar(file: IdeiasFile, id: string): Ideia {
  const i = file.ideias.find((x) => x.id === id);
  if (!i) throw new Error('Essa ideia não existe mais.');
  return i;
}

export async function atualizar(input: AtualizarIdeiaInput): Promise<IdeiasFile> {
  const file = loadFile();
  const i = achar(file, input.id);
  if (input.titulo !== undefined) {
    const t = texto(input.titulo, TITULO_IDEIA_MAX);
    if (!t) throw new Error('A ideia precisa de um título.');
    i.titulo = t;
  }
  if (input.notas !== undefined) i.notas = String(input.notas);
  if (input.tagIds !== undefined) i.tagIds = ids(input.tagIds);
  if (input.redeIds !== undefined) i.redeIds = ids(input.redeIds);
  if (input.arquivada !== undefined) i.arquivada = input.arquivada === true;
  filtrarCatalogo(i);
  i.atualizadaEm = nowIso();
  return saveFile(file);
}

export async function excluir(id: string): Promise<IdeiasFile> {
  const file = loadFile();
  file.ideias = file.ideias.filter((x) => x.id !== id);
  return saveFile(file);
}

export async function virarPostagem(id: unknown, tipo: unknown): Promise<ResultadoVirarPostagem> {
  if (tipo !== 'video' && tipo !== 'imagem') throw new Error('Tipo de postagem inválido.');
  const file = loadFile();
  const ideia = achar(file, String(id));
  filtrarCatalogo(ideia);
  const comum = { titulo: ideia.titulo, tagIds: ideia.tagIds, redeIds: ideia.redeIds };
  let novoId: string;
  if (tipo === 'video') {
    const antes = new Set((await videosService.getFile()).videos.map((v) => v.id));
    const depois = await videosService.criarVideo(comum);
    novoId = depois.videos.find((v) => !antes.has(v.id))?.id ?? '';
    if (novoId && ideia.notas.trim()) await videosService.atualizarVideo({ videoId: novoId, notas: ideia.notas });
  } else {
    const antes = new Set((await imagensService.getFile()).imagens.map((v) => v.id));
    const depois = await imagensService.criarImagem(comum);
    novoId = depois.imagens.find((v) => !antes.has(v.id))?.id ?? '';
    if (novoId && ideia.notas.trim()) await imagensService.atualizarImagem({ imagemId: novoId, notas: ideia.notas });
  }
  if (!novoId) throw new Error('A postagem não foi criada.');
  ideia.virouPostagem = { tipo: tipo as TipoPostagem, id: novoId, em: nowIso() };
  ideia.atualizadaEm = ideia.virouPostagem.em;
  await saveFile(file);
  // A pipeline aberta em outro lugar (ou a contagem do tipo) acompanha.
  broadcast('postagens:mudou', { tipo: tipo as TipoPostagem });
  return { file, postagem: { tipo: tipo as TipoPostagem, id: novoId } };
}
