import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AtualizarServidorInput,
  ConfigHealthInput,
  CriarServidorHttpInput,
  CriarServidorSshInput,
  RemoverComandoInput,
  RodarComandoInput,
  SalvarComandoInput,
  ServidoresFile,
  SshSaidaChunk,
} from '../../../shared/types/servidores.types';
import { createPushBinding } from '../../core/pushBinding.js';

type Listener = (state: ServidoresFile) => void;
type SaidaListener = (chunk: SshSaidaChunk) => void;

let state: ServidoresFile | null = null;
let listener: Listener | null = null;
let saidaListener: SaidaListener | null = null;

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

function applyAndNotify(next: ServidoresFile): void {
  state = next;
  listener?.(state);
}

/**
 * A saída SSH tem um listener próprio, fora do applyAndNotify: são dezenas de
 * pedaços por comando, e re-renderizar a tela inteira a cada um deles faria a
 * saída piscar. A view anexa o texto direto no <pre>.
 */
const push = createPushBinding([
  () => window.irisAPI.events.on('servidores:estado', (file) => applyAndNotify(file)),
  () => window.irisAPI.events.on('servidores:saida', (chunk) => saidaListener?.(chunk)),
]);

export function onStateChange(cb: Listener): void {
  listener = cb;
  push.attach();
}

export function offStateChange(): void {
  listener = null;
  saidaListener = null;
  push.detach();
  state = null;
}

export function onSaida(cb: SaidaListener | null): void {
  saidaListener = cb;
}

export function getCurrentState(): ServidoresFile | null {
  return state;
}

export async function loadState(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.getState()));
}

export async function criarHttp(input: CriarServidorHttpInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.criarHttp(input)));
}

export async function criarSsh(input: CriarServidorSshInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.criarSsh(input)));
}

export async function atualizar(input: AtualizarServidorInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.atualizar(input)));
}

export async function remover(servidorId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.remover(servidorId)));
}

export async function checarAgora(servidorId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.checarAgora(servidorId)));
}

export async function checarTodos(): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.checarTodos()));
}

export async function salvarComando(input: SalvarComandoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.salvarComando(input)));
}

export async function removerComando(input: RemoverComandoInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.removerComando(input)));
}

export async function rodarComando(input: RodarComandoInput): Promise<void> {
  unwrap(await window.irisAPI.servidores.rodarComando(input));
}

export async function configHealth(input: ConfigHealthInput): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.configHealth(input)));
}

export async function escolherChave(): Promise<string> {
  return unwrap(await window.irisAPI.servidores.escolherChave());
}
