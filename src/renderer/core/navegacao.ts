/**
 * Ponte de navegação entre módulos.
 *
 * O app.ts importa todos os módulos, então um módulo não pode importar o
 * app.ts de volta sem criar ciclo. Este arquivo não importa nada: o app.ts
 * registra como atender, e quem quiser navegar apenas pede. (O import abaixo é
 * só de tipo e some na compilação.)
 */

import type { ModuloId } from '../../shared/types/modulos.types.js';
import type { TipoPostagem } from '../../shared/types/postagens.types.js';

export type GuiaId = 'n8n' | 'servidores' | 'github';

type Atendente = (modulo: string) => void;

let atendente: Atendente | null = null;
let guiaPendente: GuiaId | null = null;
const ouvintes = new Set<(guia: GuiaId) => void>();

export function registrarAtendente(fn: Atendente): void {
  atendente = fn;
}

/** Troca para outro módulo, como se o usuário clicasse na sidebar. */
export function abrirModulo(modulo: ModuloId): void {
  atendente?.(modulo);
}

/** Abre a aba Tutorial já no guia pedido. */
export function abrirTutorial(guia: GuiaId): void {
  guiaPendente = guia;
  atendente?.('tutorial');
  // switchModule sai cedo quando o módulo já está aberto; avisar os ouvintes
  // cobre o caso de clicar "?" estando dentro do próprio tutorial.
  ouvintes.forEach((ouvir) => ouvir(guia));
}

/** Consumido uma vez pelo mount do tutorial; depois volta a null. */
export function consumirGuiaPendente(): GuiaId | null {
  const guia = guiaPendente;
  guiaPendente = null;
  return guia;
}

export function onGuiaSolicitado(cb: (guia: GuiaId) => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

// ---------- Postagens: abrir já num tipo (e numa postagem) ----------

export interface PedidoPostagem {
  tipo: TipoPostagem;
  /** Abre o painel desta postagem depois de carregar. */
  id?: string;
  /** Mostra os arquivados (a postagem pedida pode estar lá). */
  arquivados?: boolean;
}

let pedidoPostagem: PedidoPostagem | null = null;
const ouvintesPostagem = new Set<(pedido: PedidoPostagem) => void>();

/** Abre Postagens no tipo pedido — usado pela Biblioteca, pelo Sheets e pelos Relatórios. */
export function abrirPostagem(pedido: PedidoPostagem): void {
  pedidoPostagem = pedido;
  atendente?.('postagens');
  // Com Postagens já aberto, o switch não remonta: os ouvintes cobrem esse caso.
  ouvintesPostagem.forEach((ouvir) => ouvir(pedido));
}

/** Consumido pela tela de Postagens; depois volta a null. */
export function consumirPedidoPostagem(): PedidoPostagem | null {
  const pedido = pedidoPostagem;
  pedidoPostagem = null;
  return pedido;
}

export function onPostagemSolicitada(cb: (pedido: PedidoPostagem) => void): () => void {
  ouvintesPostagem.add(cb);
  return () => ouvintesPostagem.delete(cb);
}

// ---------- Ajustes: abrir já numa seção ----------

let secaoAjustesPendente: string | null = null;

/** Abre Ajustes na seção pedida (ex.: 'relatorios', de onde vem a assinatura). */
export function abrirAjustes(secao: string): void {
  secaoAjustesPendente = secao;
  atendente?.('ajustes');
}

export function consumirSecaoAjustes(): string | null {
  const secao = secaoAjustesPendente;
  secaoAjustesPendente = null;
  return secao;
}
