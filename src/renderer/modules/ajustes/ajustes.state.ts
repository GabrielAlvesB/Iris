import type { IpcResult } from '../../../shared/types/common.types';
import type { AjustesInfo, AssinaturaRelatorio, ModuloInicial } from '../../../shared/types/ajustes.types';
import type { N8nConfig, SalvarN8nConfigInput } from '../../../shared/types/n8n.types';
import type { GithubConfig, SalvarGithubConfigInput } from '../../../shared/types/github.types';
import type { IaConfig, ProvedorId, SalvarPadroesInput, SalvarProvedorInput } from '../../../shared/types/ia.types';
import { definirConfigIa } from '../../core/ia.js';

export interface AjustesViewState {
  ajustes: AjustesInfo;
  n8n: N8nConfig;
  github: GithubConfig;
  ia: IaConfig;
}

type Listener = (state: AjustesViewState) => void;

let state: AjustesViewState | null = null;
let listener: Listener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: AjustesViewState): void {
  state = next;
  listener?.(state);
}

export function onStateChange(cb: Listener): void {
  listener = cb;
}

export function offStateChange(): void {
  listener = null;
  state = null;
}

export function getCurrentState(): AjustesViewState | null {
  return state;
}

export async function load(): Promise<void> {
  const ajustes = unwrap(await window.irisAPI.ajustes.getAjustes());
  const n8n = unwrap(await window.irisAPI.n8n.getConfig());
  const github = unwrap(await window.irisAPI.github.getConfig());
  const ia = unwrap(await window.irisAPI.ia.getConfig());
  definirConfigIa(ia);
  applyAndNotify({ ajustes, n8n, github, ia });
}

export async function salvarGithub(input: SalvarGithubConfigInput): Promise<void> {
  const github = unwrap(await window.irisAPI.github.salvarConfig(input));
  if (state) applyAndNotify({ ...state, github });
}

export async function testarGithub(): Promise<string> {
  return unwrap(await window.irisAPI.github.testarConexao());
}

export async function salvarN8n(input: SalvarN8nConfigInput): Promise<void> {
  const n8n = unwrap(await window.irisAPI.n8n.salvarConfig(input));
  if (state) applyAndNotify({ ...state, n8n });
}

export async function testarConexao(): Promise<string> {
  return unwrap(await window.irisAPI.n8n.testarConexao());
}

function aplicarIa(ia: IaConfig): void {
  // As outras telas (Postagens, Roteiros, Estúdio) leem a mesma config.
  definirConfigIa(ia);
  if (state) applyAndNotify({ ...state, ia });
}

export async function salvarProvedorIa(input: SalvarProvedorInput): Promise<void> {
  aplicarIa(unwrap(await window.irisAPI.ia.salvarProvedor(input)));
}

export async function salvarPadroesIa(input: SalvarPadroesInput): Promise<void> {
  aplicarIa(unwrap(await window.irisAPI.ia.salvarPadroes(input)));
}

export async function testarIa(id: ProvedorId): Promise<string> {
  return unwrap(await window.irisAPI.ia.testarProvedor(id));
}

export async function setModuloInicial(modulo: ModuloInicial): Promise<void> {
  const ajustes = unwrap(await window.irisAPI.ajustes.setModuloInicial(modulo));
  if (state) applyAndNotify({ ...state, ajustes });
}

export async function setAssinatura(assinatura: AssinaturaRelatorio): Promise<void> {
  const ajustes = unwrap(await window.irisAPI.ajustes.setAssinatura(assinatura));
  if (state) applyAndNotify({ ...state, ajustes });
}
