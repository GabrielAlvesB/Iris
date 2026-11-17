import type { IpcResult } from '../../../shared/types/common.types';
import type {
  AtualizarServidorInput,
  ConfigHealthInput,
  CriarServidorHttpInput,
  CriarServidorSshInput,
  RemoverComandoInput,
  RodarComandoInput,
  ResultadoTesteServidor,
  SalvarComandoInput,
  ServidoresFile,
  SessaoTerminal,
  SshSaidaChunk,
  TerminalEvento,
  TestarConexaoInput,
} from '../../../shared/types/servidores.types';
import { createPushBinding } from '../../core/pushBinding.js';

type Listener = (state: ServidoresFile) => void;
type SaidaListener = (chunk: SshSaidaChunk) => void;
type TerminalListener = (evento: TerminalEvento) => void;

let state: ServidoresFile | null = null;
let listener: Listener | null = null;
let saidaListener: SaidaListener | null = null;
let terminalListener: TerminalListener | null = null;

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
  // O terminal também fica fora do redesenho: cada lote vai direto para o xterm.
  () => window.irisAPI.events.on('servidores:terminal', (evento) => terminalListener?.(evento)),
]);

export function onStateChange(cb: Listener): void {
  listener = cb;
  push.attach();
}

export function offStateChange(): void {
  listener = null;
  saidaListener = null;
  terminalListener = null;
  push.detach();
  state = null;
}

export function onSaida(cb: SaidaListener | null): void {
  saidaListener = cb;
}

export function onTerminal(cb: TerminalListener | null): void {
  terminalListener = cb;
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

export async function testarConexao(input: TestarConexaoInput): Promise<ResultadoTesteServidor> {
  return unwrap(await window.irisAPI.servidores.testarConexao(input));
}

export async function confiarHost(servidorId: string): Promise<void> {
  applyAndNotify(unwrap(await window.irisAPI.servidores.confiarHost(servidorId)));
}

export async function abrirTerminal(servidorId: string, cols: number, rows: number): Promise<SessaoTerminal> {
  return unwrap(await window.irisAPI.servidores.abrirTerminal({ servidorId, cols, rows }));
}

/** Tecla digitada: sem esperar resposta (a ordem é a do canal, e o eco volta pelo push). */
export function escreverTerminal(sessaoId: string, dados: string): void {
  void window.irisAPI.servidores.escreverTerminal({ sessaoId, dados });
}

export function redimensionarTerminal(sessaoId: string, cols: number, rows: number): void {
  void window.irisAPI.servidores.redimensionarTerminal({ sessaoId, cols, rows });
}

export async function fecharTerminal(sessaoId: string): Promise<void> {
  unwrap(await window.irisAPI.servidores.fecharTerminal(sessaoId));
}

export async function listarSessoes(): Promise<SessaoTerminal[]> {
  return unwrap(await window.irisAPI.servidores.listarSessoes());
}

export async function lerBufferTerminal(sessaoId: string): Promise<string> {
  return unwrap(await window.irisAPI.servidores.lerBufferTerminal(sessaoId));
}
