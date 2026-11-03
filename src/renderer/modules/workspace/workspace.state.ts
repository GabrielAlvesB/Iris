import type { IpcResult } from '../../../shared/types/common.types';
import type { EstadoWorkspace, FormatoApp, VersaoAnterior } from '../../../shared/types/workspace.types';

/**
 * Cache do Workspace. Vários ouvintes (a tela e o selo do trilho), por isso
 * um Set e não o listener único dos outros states: o selo de atualizações
 * vive a sessão toda, a tela só enquanto está aberta.
 */

type Ouvinte = (estado: EstadoWorkspace) => void;

let estado: EstadoWorkspace | null = null;
const ouvintes = new Set<Ouvinte>();

function unwrap<T>(r: IpcResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/** Também é por aqui que chega o push 'workspace:estado' (core/workspace.ts). */
export function aplicar(novo: EstadoWorkspace): void {
  estado = novo;
  ouvintes.forEach((cb) => cb(novo));
}

export function assinar(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

export function getEstado(): EstadoWorkspace | null {
  return estado;
}

export async function carregar(): Promise<void> {
  aplicar(unwrap(await window.irisAPI.workspace.getEstado()));
}

export async function verificar(appId?: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.workspace.verificar(appId)));
}

/** Volta só quando terminou (ou falhou); o progresso chega pelo push no meio. */
export async function instalar(appId: string, formato?: FormatoApp, versao?: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.workspace.instalar({ appId, formato, versao })));
}

export async function cancelar(appId: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.workspace.cancelar(appId)));
}

export async function abrir(appId: string): Promise<void> {
  unwrap(await window.irisAPI.workspace.abrir(appId));
}

export async function mostrarNaPasta(appId: string): Promise<void> {
  unwrap(await window.irisAPI.workspace.mostrarNaPasta(appId));
}

export async function abrirPagina(appId: string, versao?: string): Promise<void> {
  unwrap(await window.irisAPI.workspace.abrirPagina(appId, versao));
}

export async function listarVersoes(appId: string): Promise<VersaoAnterior[]> {
  return unwrap(await window.irisAPI.workspace.listarVersoes(appId));
}

export async function desinstalar(appId: string): Promise<void> {
  aplicar(unwrap(await window.irisAPI.workspace.desinstalar(appId)));
}
