import type { IpcResult } from '../../../../shared/types/common.types';
import type {
  ArquivarVideoInput,
  AtualizarVideoInput,
  CriarVideoInput,
  ImportarDeSheetsInput,
  ImportarDeSheetsResult,
  MoverVideoInput,
  PreferenciasVideos,
  SalvarRedeInput,
  SalvarTagInput,
  VideosFile,
} from '../../../../shared/types/videos.types';

type Listener = (state: VideosFile) => void;

let state: VideosFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: VideosFile): VideosFile {
  state = next;
  listener?.(state);
  return next;
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): VideosFile | null {
  return state;
}

export async function load(): Promise<VideosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.videos.getFile()));
}

export async function criarVideo(input: CriarVideoInput): Promise<VideosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.videos.criarVideo(input)));
}

export async function atualizarVideo(input: AtualizarVideoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.atualizarVideo(input)));
}

export async function moverVideo(input: MoverVideoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.moverVideo(input)));
}

export async function arquivarVideo(input: ArquivarVideoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.arquivarVideo(input)));
}

export async function restaurarVideo(videoId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.restaurarVideo(videoId)));
}

export async function excluirVideo(videoId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.excluirVideo(videoId)));
}

export async function salvarTag(input: SalvarTagInput): Promise<VideosFile> {
  return applyAndNotify(unwrap(await window.irisAPI.videos.salvarTag(input)));
}

export async function excluirTag(tagId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.excluirTag(tagId)));
}

export async function salvarRede(input: SalvarRedeInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.salvarRede(input)));
}

export async function excluirRede(redeId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.excluirRede(redeId)));
}

/**
 * Chamado pela tela do Sheets. Atualiza o cache mesmo sem a tela de Vídeos
 * aberta (listener nulo), para ela abrir já com os importados.
 */
export async function importarDeSheets(input: ImportarDeSheetsInput): Promise<ImportarDeSheetsResult> {
  const result = unwrap(await window.irisAPI.videos.importarDeSheets(input));
  applyAndNotify(result.file);
  return result;
}

export async function salvarPreferencias(preferencias: PreferenciasVideos): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.videos.salvarPreferencias(preferencias)));
}

export async function listarLinhasImportadas(tabelaId: string): Promise<string[]> {
  return unwrap(await window.irisAPI.videos.listarLinhasImportadas(tabelaId));
}
