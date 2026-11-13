import type { IpcResult } from '../../../shared/types/common.types';
import type { DialetoSql, EstadoNuvem, ExtracaoGerada, ModoDeEntrada, ResultadoSync, TesteNuvem } from '../../../shared/types/nuvem.types';

/** Cache do estado da Nuvem. O main faz todo o trabalho; aqui só se guarda o que ele devolve. */

type Ouvinte = (estado: EstadoNuvem) => void;

let estado: EstadoNuvem | null = null;
let ouvinte: Ouvinte | null = null;

function unwrap<T>(r: IpcResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

function aplicar(novo: EstadoNuvem): void {
  estado = novo;
  ouvinte?.(novo);
}

export function onStateChange(cb: Ouvinte): void {
  ouvinte = cb;
}

export function offStateChange(): void {
  ouvinte = null;
}

export function getEstado(): EstadoNuvem | null {
  return estado;
}

export async function carregar(): Promise<void> {
  aplicar(unwrap(await window.irisAPI.nuvem.getEstado()));
}

export async function salvarIdentidade(entrada: { nome?: string; espaco?: string }): Promise<void> {
  aplicar(unwrap(await window.irisAPI.nuvem.salvarIdentidade(entrada)));
}

/** null = o usuário cancelou o diálogo. */
export async function gerarExtracao(dialeto: DialetoSql): Promise<ExtracaoGerada | null> {
  return unwrap(await window.irisAPI.nuvem.gerarExtracao(dialeto));
}

export async function mostrarExtracao(): Promise<void> {
  unwrap(await window.irisAPI.nuvem.mostrarExtracao());
}

/** `chave` vazia mantém a que já está no cofre. */
export async function salvarSupabase(entrada: { url: string; chave?: string }): Promise<void> {
  aplicar(unwrap(await window.irisAPI.nuvem.salvarSupabase(entrada)));
}

export async function testar(): Promise<TesteNuvem> {
  return unwrap(await window.irisAPI.nuvem.testar());
}

export async function criarTabelas(token: string): Promise<TesteNuvem> {
  return unwrap(await window.irisAPI.nuvem.criarTabelas(token));
}

/** A entrada no espaço e a rodada manual: o estado novo chega relido depois. */
export async function entrar(modo: ModoDeEntrada): Promise<ResultadoSync> {
  try {
    return unwrap(await window.irisAPI.nuvem.entrar(modo));
  } finally {
    await carregar().catch(() => undefined);
  }
}

export async function sincronizar(): Promise<ResultadoSync> {
  try {
    return unwrap(await window.irisAPI.nuvem.sincronizar());
  } finally {
    await carregar().catch(() => undefined);
  }
}

export async function desconectar(): Promise<void> {
  aplicar(unwrap(await window.irisAPI.nuvem.desconectar()));
}

export async function definirPrincipal(valor: boolean): Promise<void> {
  aplicar(unwrap(await window.irisAPI.nuvem.definirPrincipal(valor)));
}
