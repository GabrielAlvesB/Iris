import type { IpcResult } from '../../../shared/types/common.types';
import type { RefContato } from '../../../shared/types/contatos.types';
import type { ResultadoEnvioWa } from '../../../shared/types/preload-api.types';
import type { CriarLoteInput, EnviarWaInput, SalvarConfigWaInput, SalvarModeloWaInput, StatusWhatsapp, WhatsappFile } from '../../../shared/types/whatsapp.types';

/**
 * O whatsapp.json no renderer. Diferente dos outros states, aceita vários
 * ouvintes: a conversa na ficha de Contatos e o módulo WhatsApp leem o mesmo
 * arquivo (só um fica montado por vez, mas a ficha registra e solta o seu a
 * cada redesenho).
 */

type Ouvinte = (file: WhatsappFile) => void;

let state: WhatsappFile | null = null;
let status: StatusWhatsapp | null = null;
let carregando: Promise<WhatsappFile> | null = null;
const ouvintes = new Set<Ouvinte>();

function unwrap<T>(r: IpcResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

function aplicar(next: WhatsappFile): WhatsappFile {
  state = next;
  ouvintes.forEach((o) => o(next));
  return next;
}

export function assinar(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

export function atual(): WhatsappFile | null {
  return state;
}

export function statusAtual(): StatusWhatsapp | null {
  return status;
}

export function load(): Promise<WhatsappFile> {
  carregando ??= window.irisAPI.whatsapp
    .getFile()
    .then((r) => aplicar(unwrap(r)))
    .finally(() => {
      carregando = null;
    });
  return carregando;
}

/** O arquivo, carregando se ainda não veio. */
export async function garantir(): Promise<WhatsappFile> {
  return state ?? load();
}

/** Push do main: só relê se alguém já usou o arquivo nesta sessão (ninguém olhando = nada a fazer). */
export function aoMudarNoMain(): void {
  if (state || ouvintes.size) void load().catch(() => undefined);
}

export async function carregarStatus(): Promise<StatusWhatsapp> {
  status = unwrap(await window.irisAPI.whatsapp.status());
  return status;
}

export function definirStatus(s: StatusWhatsapp): void {
  status = s;
}

const api = (): typeof window.irisAPI.whatsapp => window.irisAPI.whatsapp;

export async function enviar(input: EnviarWaInput): Promise<ResultadoEnvioWa> {
  const r = unwrap(await api().enviar(input));
  aplicar(r.file);
  return r;
}

export async function reenviar(id: string): Promise<ResultadoEnvioWa> {
  const r = unwrap(await api().reenviar(id));
  aplicar(r.file);
  return r;
}

export async function marcarLidas(alvo: RefContato | 'todas' | { numero: string }): Promise<void> {
  aplicar(unwrap(await api().marcarLidas(alvo)));
}

export async function ligarNumero(numero: string, ref: RefContato): Promise<void> {
  aplicar(unwrap(await api().ligarNumero(numero, ref)));
}

export async function excluirMensagem(id: string): Promise<void> {
  aplicar(unwrap(await api().excluirMensagem(id)));
}

export async function salvarConfig(input: SalvarConfigWaInput): Promise<void> {
  aplicar(unwrap(await api().salvarConfig(input)));
}

export async function salvarModelo(input: SalvarModeloWaInput): Promise<WhatsappFile> {
  return aplicar(unwrap(await api().salvarModelo(input)));
}

export async function excluirModelo(id: string): Promise<void> {
  aplicar(unwrap(await api().excluirModelo(id)));
}

export async function criarLote(input: CriarLoteInput): Promise<WhatsappFile> {
  return aplicar(unwrap(await api().criarLote(input)));
}

export async function mudarLote(id: string, acao: 'pausar' | 'retomar' | 'cancelar' | 'excluir'): Promise<void> {
  aplicar(unwrap(await api().mudarLote(id, acao)));
}

export async function sincronizar(ref: RefContato): Promise<{ novas: number; erro?: string }> {
  return unwrap(await api().sincronizarConversa(ref));
}

export { unwrap };
