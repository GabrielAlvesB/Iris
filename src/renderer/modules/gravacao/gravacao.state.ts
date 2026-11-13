import type { IpcResult } from '../../../shared/types/common.types';
import type { ConviteLido, CriarGravacaoInput, GravacaoFile, SessaoGravacao } from '../../../shared/types/gravacao.types';

type Listener = (state: GravacaoFile) => void;

let state: GravacaoFile | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function applyAndNotify(next: GravacaoFile): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
}

export function getCurrentState(): GravacaoFile | null {
  return state;
}

export function sessaoPorId(id: string): SessaoGravacao | undefined {
  return state?.sessoes.find((s) => s.id === id);
}

export async function load(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.gravacao.getFile()));
}

export async function criarGravacao(input: CriarGravacaoInput): Promise<SessaoGravacao> {
  const r = unwrap(await window.irisAPI.gravacao.criarGravacao(input));
  applyAndNotify(r.file);
  return r.file.sessoes.find((s) => s.id === r.id)!;
}

/** Para gravar sozinho: nada vai para o arquivo. */
export async function montarGravacao(input: CriarGravacaoInput): Promise<SessaoGravacao> {
  return unwrap(await window.irisAPI.gravacao.montarGravacao(input));
}

export async function limparSessoes(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.gravacao.limparSessoes()));
}

export async function salvarSessao(sessao: SessaoGravacao): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.gravacao.salvarSessao(sessao)));
}

/** Do palco: troca o cache sem redesenhar a tela de trás. */
export async function salvarSilencioso(sessao: SessaoGravacao): Promise<void> {
  state = unwrap(await window.irisAPI.gravacao.salvarSessao(sessao));
}

export async function excluirSessao(id: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.gravacao.excluirSessao(id)));
}

export async function salvarChecklist(itens: string[]): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.gravacao.salvarChecklist(itens)));
}

export async function criarConvite(sessaoId: string, inicioEm: number): Promise<string> {
  const r = unwrap(await window.irisAPI.gravacao.criarConvite({ sessaoId, inicioEm }));
  state = r.file;
  return r.texto;
}

export async function lerConvite(texto: string): Promise<ConviteLido> {
  return unwrap(await window.irisAPI.gravacao.lerConvite(texto));
}

export async function conviteCopiado(): Promise<ConviteLido | null> {
  return unwrap(await window.irisAPI.gravacao.conviteCopiado());
}

export async function entrarComConvite(texto: string): Promise<SessaoGravacao> {
  const r = unwrap(await window.irisAPI.gravacao.entrarComConvite(texto));
  applyAndNotify(r.file);
  return r.file.sessoes.find((s) => s.id === r.id)!;
}

export async function exportarMarcadores(sessaoId: string, formato: 'csv' | 'txt'): Promise<string | null> {
  const r = unwrap(await window.irisAPI.gravacao.exportarMarcadores(sessaoId, formato));
  return r.canceled ? null : r.filePath;
}
