/**
 * Ponte de navegação entre módulos.
 *
 * O app.ts importa todos os módulos, então um módulo não pode importar o
 * app.ts de volta sem criar ciclo. Este arquivo não importa nada: o app.ts
 * registra como atender, e quem quiser navegar apenas pede.
 */

export type GuiaId = 'n8n' | 'servidores' | 'github';

type Atendente = (modulo: string) => void;

let atendente: Atendente | null = null;
let guiaPendente: GuiaId | null = null;
const ouvintes = new Set<(guia: GuiaId) => void>();

export function registrarAtendente(fn: Atendente): void {
  atendente = fn;
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
