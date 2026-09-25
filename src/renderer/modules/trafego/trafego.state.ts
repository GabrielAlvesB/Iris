import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AtualizarCampanhaInput,
  CriarCampanhaInput,
  ImportarRegistrosResult,
  MoverCampanhaInput,
  RemoverRegistroInput,
  SalvarContaInput,
  SalvarRegistroInput,
  SalvarSiteInput,
  TrafegoFile,
} from '../../../shared/types/trafego.types';

type Listener = (state: TrafegoFile) => void;

let state: TrafegoFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: TrafegoFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): TrafegoFile | null {
  return state;
}

export async function load(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.getFile()));
}

export async function salvarConta(input: SalvarContaInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.salvarConta(input)));
}

export async function excluirConta(contaId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.excluirConta(contaId)));
}

export async function salvarSite(input: SalvarSiteInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.salvarSite(input)));
}

export async function excluirSite(siteId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.excluirSite(siteId)));
}

/** Devolve o id da campanha criada, para a tela já abri-la. */
export async function criarCampanha(input: CriarCampanhaInput): Promise<string | null> {
  const antes = new Set((state?.campanhas ?? []).map((c) => c.id));
  const next = unwrap(await window.irisAPI.trafego.criarCampanha(input));
  const nova = next.campanhas.find((c) => !antes.has(c.id));
  applyAndNotify(next);
  return nova?.id ?? null;
}

/** Texto digitado no painel: grava sem redesenhar a tela (o cursor não pode pular). */
export async function atualizarSilencioso(input: AtualizarCampanhaInput): Promise<void> {
  state = unwrap(await window.irisAPI.trafego.atualizarCampanha(input));
}

export async function moverCampanha(input: MoverCampanhaInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.moverCampanha(input)));
}

export async function excluirCampanha(campanhaId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.excluirCampanha(campanhaId)));
}

export async function duplicarCampanha(campanhaId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.duplicarCampanha(campanhaId)));
}

export async function salvarRegistro(input: SalvarRegistroInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.salvarRegistro(input)));
}

export async function removerRegistro(input: RemoverRegistroInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.trafego.removerRegistro(input)));
}

export async function importarRegistros(campanhaId: string): Promise<ImportarRegistrosResult> {
  const resultado = unwrap(await window.irisAPI.trafego.importarRegistros(campanhaId));
  if (resultado.file) applyAndNotify(resultado.file);
  return resultado;
}
