import { consumirGuiaPendente, onGuiaSolicitado, type GuiaId } from '../../core/navegacao.js';
import { GUIAS } from './tutorial.content.js';
import type { EstadoPasso } from './tutorial.types.js';

export interface TutorialViewState {
  guiaAtivo: GuiaId;
  /** id do passo → estado; ausente enquanto a checagem não terminou. */
  estados: Record<string, EstadoPasso>;
  conferindo: boolean;
}

type Listener = (state: TutorialViewState) => void;

let state: TutorialViewState = { guiaAtivo: 'n8n', estados: {}, conferindo: false };
let listener: Listener | null = null;
let cancelarOuvinte: (() => void) | null = null;

function notify(): void {
  listener?.(state);
}

function aplicar(parcial: Partial<TutorialViewState>): void {
  state = { ...state, ...parcial };
  notify();
}

export function onStateChange(cb: Listener): void {
  listener = cb;

  // Quem clicou no "?" de outro módulo já deixou o guia escolhido.
  const pedido = consumirGuiaPendente();
  if (pedido) state = { ...state, guiaAtivo: pedido };

  // Cobre o clique no "?" quando o tutorial já está aberto.
  cancelarOuvinte?.();
  cancelarOuvinte = onGuiaSolicitado((guia) => {
    aplicar({ guiaAtivo: guia });
    void conferir();
  });
}

export function offStateChange(): void {
  listener = null;
  cancelarOuvinte?.();
  cancelarOuvinte = null;
}

export function getCurrentState(): TutorialViewState {
  return state;
}

export function selecionarGuia(guia: GuiaId): void {
  aplicar({ guiaAtivo: guia });
  void conferir();
}

/**
 * Roda as verificações de todos os passos de todos os guias.
 * Uma falha de IPC vira 'desconhecido', nunca 'pendente': acusar pendência
 * falsa é pior do que admitir que não deu para checar.
 */
export async function conferir(): Promise<void> {
  aplicar({ conferindo: true });

  const estados: Record<string, EstadoPasso> = {};

  await Promise.all(
    GUIAS.flatMap((guia) =>
      guia.passos.map(async (passo) => {
        if (!passo.verificar) {
          estados[passo.id] = 'manual';
          return;
        }
        try {
          estados[passo.id] = (await passo.verificar()) ? 'ok' : 'pendente';
        } catch {
          estados[passo.id] = 'desconhecido';
        }
      }),
    ),
  );

  aplicar({ estados, conferindo: false });
}
