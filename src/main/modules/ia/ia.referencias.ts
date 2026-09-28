import { dialog, nativeImage, type BrowserWindow, type OpenDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertDentroDasRaizes } from '../../core/pathGuard';
import * as exploradorService from '../explorador/explorador.service';
import type { ReferenciaIa, RefImagem } from '../../../shared/types/ia.types';
import type { ImagemEntrada } from './provedores/comum';
import { caminhoDoItem } from './ia.galeria';

/**
 * Imagens de referência. A tela só conhece ids: um arquivo escolhido no
 * dialog fica guardado aqui (id → caminho), um recurso da Biblioteca é
 * resolvido pelo id e validado contra as raízes, um item da galeria pelo id.
 * Nenhum caminho vindo do renderer é lido.
 */

const EXTENSOES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const TAMANHO_MAXIMO = 20 * 1024 * 1024;
export const MAX_REFERENCIAS = 8;

/** Arquivos escolhidos no dialog nesta sessão. */
const escolhidos = new Map<string, string>();

function mimeDe(caminho: string): string {
  const mime = EXTENSOES[path.extname(caminho).toLowerCase()];
  if (!mime) throw new Error(`"${path.basename(caminho)}" não é PNG, JPG ou WebP.`);
  return mime;
}

function miniatura(caminho: string): string {
  // nativeImage não abre WebP: a tela mostra só o nome nesse caso.
  const img = nativeImage.createFromPath(caminho);
  if (img.isEmpty()) return '';
  return img.resize({ width: 160, quality: 'good' }).toDataURL();
}

async function caminhoDaBiblioteca(recursoId: string): Promise<string> {
  const biblioteca = await exploradorService.getBiblioteca();
  const recurso = biblioteca.recursos.find((r) => r.id === recursoId);
  if (!recurso) throw new Error('Esse recurso não está mais na Biblioteca.');
  if (recurso.situacao !== 'ok') throw new Error(`"${recurso.nome}" não está mais na pasta monitorada.`);
  const raizes = (await exploradorService.getRaizes()).raizes.map((r) => r.caminho);
  return assertDentroDasRaizes(raizes, recurso.caminho);
}

async function caminhoDe(ref: RefImagem): Promise<string> {
  if (ref.origem === 'arquivo') {
    const caminho = escolhidos.get(ref.id);
    if (!caminho) throw new Error('A imagem escolhida expirou. Adicione de novo.');
    return caminho;
  }
  if (ref.origem === 'biblioteca') return caminhoDaBiblioteca(ref.id);
  if (ref.origem === 'galeria') return caminhoDoItem(ref.id);
  throw new Error('Origem de imagem desconhecida.');
}

function descrever(ref: RefImagem, caminho: string): ReferenciaIa {
  return { ...ref, nome: path.basename(caminho), miniatura: miniatura(caminho) };
}

export async function escolherDoComputador(janela: BrowserWindow | null): Promise<ReferenciaIa[]> {
  const opcoes: OpenDialogOptions = {
    title: 'Escolher imagens de referência',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  };
  const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
  if (escolha.canceled) return [];
  return escolha.filePaths.slice(0, MAX_REFERENCIAS).map((caminho) => {
    mimeDe(caminho);
    if (fs.statSync(caminho).size > TAMANHO_MAXIMO) throw new Error(`"${path.basename(caminho)}" passa de 20 MB.`);
    const id = randomUUID();
    escolhidos.set(id, caminho);
    return descrever({ origem: 'arquivo', id }, caminho);
  });
}

/** Miniatura e nome de uma referência da Biblioteca ou da galeria. */
export async function descreverReferencia(ref: RefImagem): Promise<ReferenciaIa> {
  const caminho = await caminhoDe(ref);
  mimeDe(caminho);
  return descrever(ref, caminho);
}

export async function carregar(refs: RefImagem[]): Promise<ImagemEntrada[]> {
  if (refs.length > MAX_REFERENCIAS) throw new Error(`No máximo ${MAX_REFERENCIAS} imagens de referência.`);
  return Promise.all(
    refs.map(async (ref) => {
      const caminho = await caminhoDe(ref);
      const mime = mimeDe(caminho);
      const dados = await fs.promises.readFile(caminho);
      if (dados.byteLength > TAMANHO_MAXIMO) throw new Error(`"${path.basename(caminho)}" passa de 20 MB.`);
      return { dados, mime, nome: path.basename(caminho) };
    }),
  );
}
