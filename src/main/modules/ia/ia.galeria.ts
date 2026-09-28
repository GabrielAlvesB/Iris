import { app, dialog, nativeImage, type BrowserWindow, type SaveDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertCriavelDentroDasRaizes, assertDentroDasRaizes } from '../../core/pathGuard';
import { readStore, writeStore } from '../../storage/jsonStore';
import * as exploradorService from '../explorador/explorador.service';
import {
  FORMATOS_IMAGEM_IA,
  isProvedorId,
  type DestinoBiblioteca,
  type FormatoImagemIa,
  type ItemGaleria,
  type ItemGaleriaComMiniatura,
  type SalvarNaBibliotecaResult,
  type VinculoPostagem,
} from '../../../shared/types/ia.types';
import { destinoPadrao, subpastaValida } from './ia.service';

/**
 * Galeria interna: toda imagem gerada fica em userData/ia-galeria/<id>.png,
 * com o índice em ia-galeria.json. "Salvar na Biblioteca" copia para uma
 * pasta monitorada e cria o recurso — é lá que a imagem passa a ser do
 * usuário (backup, anexar em postagem). A galeria é o histórico.
 */

const FILE_NAME = 'ia-galeria.json';
const SCHEMA_VERSION = 1;
const LARGURA_MINIATURA = 384;

interface GaleriaArquivo {
  schemaVersion: number;
  updatedAt: string;
  itens: ItemGaleria[];
}

function pasta(): string {
  return path.join(app.getPath('userData'), 'ia-galeria');
}

function caminhoDe(id: string): string {
  // O id é sempre um UUID nosso; basename impede qualquer "../" vindo de fora.
  return path.join(pasta(), `${path.basename(id)}.png`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function migrateItem(raw: unknown): ItemGaleria | null {
  const c = (raw ?? {}) as Partial<ItemGaleria>;
  if (typeof c.id !== 'string' || !isProvedorId(c.provedor)) return null;
  const formato = FORMATOS_IMAGEM_IA.some((f) => f.id === c.formato) ? (c.formato as FormatoImagemIa) : 'quadrado';
  return {
    id: c.id,
    prompt: typeof c.prompt === 'string' ? c.prompt : '',
    provedor: c.provedor,
    modelo: typeof c.modelo === 'string' ? c.modelo : '',
    formato,
    largura: typeof c.largura === 'number' ? c.largura : 0,
    altura: typeof c.altura === 'number' ? c.altura : 0,
    referencias: Array.isArray(c.referencias) ? c.referencias.filter((r): r is string => typeof r === 'string') : [],
    criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : nowIso(),
    postagem: c.postagem && typeof c.postagem.id === 'string' ? c.postagem : undefined,
    biblioteca: c.biblioteca && typeof c.biblioteca.recursoId === 'string' ? c.biblioteca : undefined,
  };
}

function migrate(raw: unknown): GaleriaArquivo {
  const c = (raw ?? {}) as Partial<GaleriaArquivo>;
  // Item cujo arquivo sumiu (pasta apagada à mão) sai do índice na leitura.
  const itens = (Array.isArray(c.itens) ? c.itens : [])
    .map(migrateItem)
    .filter((i): i is ItemGaleria => i !== null && fs.existsSync(caminhoDe(i.id)));
  itens.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return { schemaVersion: SCHEMA_VERSION, updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowIso(), itens };
}

function loadFile(): GaleriaArquivo {
  return readStore(FILE_NAME, () => ({ schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), itens: [] }), migrate);
}

async function saveFile(file: GaleriaArquivo): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

function encontrar(file: GaleriaArquivo, id: string): ItemGaleria {
  const item = file.itens.find((i) => i.id === id);
  if (!item) throw new Error('Essa imagem não está mais na galeria.');
  return item;
}

/** Miniaturas em memória: gerar de novo a cada listagem custaria caro. */
const miniaturas = new Map<string, string>();

function miniaturaDe(id: string): string {
  const emCache = miniaturas.get(id);
  if (emCache) return emCache;
  const img = nativeImage.createFromPath(caminhoDe(id));
  if (img.isEmpty()) return '';
  const { width } = img.getSize();
  const url = (width > LARGURA_MINIATURA ? img.resize({ width: LARGURA_MINIATURA, quality: 'good' }) : img).toDataURL();
  miniaturas.set(id, url);
  return url;
}

export function caminhoDoItem(id: string): string {
  const file = loadFile();
  encontrar(file, id);
  return caminhoDe(id);
}

export async function adicionar(
  png: Buffer,
  dados: Omit<ItemGaleria, 'id' | 'criadoEm' | 'largura' | 'altura' | 'biblioteca'> & { postagem?: VinculoPostagem },
): Promise<ItemGaleria> {
  await fs.promises.mkdir(pasta(), { recursive: true });
  const id = randomUUID();
  await fs.promises.writeFile(caminhoDe(id), png);
  const tamanho = nativeImage.createFromBuffer(png).getSize();
  const item: ItemGaleria = { ...dados, id, largura: tamanho.width, altura: tamanho.height, criadoEm: nowIso() };
  const file = loadFile();
  file.itens.unshift(item);
  await saveFile(file);
  return item;
}

export async function listar(): Promise<ItemGaleriaComMiniatura[]> {
  return loadFile().itens.map((i) => ({ ...i, miniatura: miniaturaDe(i.id) }));
}

/** A imagem em tamanho real, só quando a tela abre a visualização grande. */
export async function original(id: string): Promise<string> {
  const file = loadFile();
  encontrar(file, id);
  const dados = await fs.promises.readFile(caminhoDe(id));
  return `data:image/png;base64,${dados.toString('base64')}`;
}

export async function excluir(id: string): Promise<ItemGaleriaComMiniatura[]> {
  const file = loadFile();
  file.itens = file.itens.filter((i) => i.id !== id);
  await fs.promises.rm(caminhoDe(id), { force: true });
  miniaturas.delete(id);
  await saveFile(file);
  return listar();
}

function nomeDeArquivo(item: ItemGaleria): string {
  const base =
    (item.postagem?.titulo || item.prompt)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 7)
      .join('-')
      .toLowerCase() || 'imagem';
  const d = new Date(item.criadoEm);
  const carimbo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `iris-ia-${base}-${carimbo}.png`;
}

export async function exportar(id: string, janela: BrowserWindow | null): Promise<string | null> {
  const file = loadFile();
  const item = encontrar(file, id);
  const opcoes: SaveDialogOptions = {
    title: 'Salvar imagem',
    defaultPath: path.join(app.getPath('pictures'), nomeDeArquivo(item)),
    filters: [{ name: 'PNG', extensions: ['png'] }],
  };
  const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
  if (escolha.canceled || !escolha.filePath) return null;
  await fs.promises.copyFile(caminhoDe(id), escolha.filePath);
  return escolha.filePath;
}

/** Id da coleção "Thumbnails" (as coleções padrão têm id aleatório: acha pelo nome). */
async function colecaoThumbnails(): Promise<string | undefined> {
  const biblioteca = await exploradorService.getBiblioteca();
  return biblioteca.colecoes.find((c) => c.nome.toLocaleLowerCase('pt-BR') === 'thumbnails')?.id;
}

/**
 * Copia para a pasta da Biblioteca e cria o recurso. Se já foi salva e o
 * arquivo continua lá, devolve o mesmo recurso — anexar duas vezes não duplica.
 */
export async function salvarNaBiblioteca(id: string, destinoPedido?: DestinoBiblioteca): Promise<SalvarNaBibliotecaResult> {
  const file = loadFile();
  const item = encontrar(file, id);

  if (item.biblioteca && fs.existsSync(item.biblioteca.caminho)) {
    const biblioteca = await exploradorService.getBiblioteca();
    if (biblioteca.recursos.some((r) => r.id === item.biblioteca?.recursoId)) {
      return { item, recursoId: item.biblioteca.recursoId, caminho: item.biblioteca.caminho };
    }
  }

  const destino = destinoPedido ?? destinoPadrao();
  const raizes = (await exploradorService.getRaizes()).raizes;
  if (!raizes.length) throw new Error('A Biblioteca não tem nenhuma pasta monitorada. Adicione uma pasta na Biblioteca primeiro.');
  const raiz = raizes.find((r) => r.id === destino?.raizId) ?? raizes[0]!;
  const raizCanonica = assertDentroDasRaizes([raiz.caminho], raiz.caminho);

  // A subpasta vem limpa (sem ".."), mas o caminho final ainda passa pelo pathGuard.
  const subpasta = subpastaValida(destino?.subpasta ?? 'Iris IA') || 'Iris IA';
  const pastaDestino = assertDentroDasRaizes([raizCanonica], path.join(raizCanonica, ...subpasta.split('/')));
  await fs.promises.mkdir(pastaDestino, { recursive: true });

  let nome = nomeDeArquivo(item);
  if (fs.existsSync(path.join(pastaDestino, nome))) nome = nome.replace(/\.png$/, `-${id.slice(0, 6)}.png`);
  const alvo = assertCriavelDentroDasRaizes([raizCanonica], path.join(pastaDestino, nome));
  await fs.promises.copyFile(caminhoDe(id), alvo);

  const resultado = await exploradorService.adicionarRecursos([alvo], await colecaoThumbnails());
  const normal = path.normalize(alvo).toLowerCase();
  const recurso = resultado.biblioteca.recursos.find((r) => path.normalize(r.caminho).toLowerCase() === normal);
  if (!recurso) throw new Error('A imagem foi copiada, mas a Biblioteca não aceitou o arquivo como recurso.');

  item.biblioteca = { recursoId: recurso.id, caminho: alvo };
  await saveFile(file);
  return { item, recursoId: recurso.id, caminho: alvo };
}

/** Marca a postagem que usou a imagem (para a galeria mostrar onde ela foi parar). */
export async function vincularPostagem(id: string, postagem: VinculoPostagem): Promise<void> {
  const file = loadFile();
  const item = encontrar(file, id);
  item.postagem = postagem;
  await saveFile(file);
}
