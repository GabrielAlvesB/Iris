import { consumirGuiaPendente, onGuiaSolicitado, type GuiaId } from '../../core/navegacao.js';
import { GUIAS } from './tutorial.content.js';
import type { EstadoPasso } from './tutorial.types.js';

export interface TutorialViewState {
  /** null = Início. */
  guiaAtivo: GuiaId | null;
  busca: string;
  /** id do passo → estado; ausente enquanto a checagem não terminou. */
  estados: Record<string, EstadoPasso>;
  conferindo: boolean;
  /** Guias já abertos — só para o selo "lido" no Início. */
  vistos: GuiaId[];
  /** Passo para onde rolar ao abrir o guia (resultado da busca). */
  passoAlvo: string | null;
}

type Listener = (state: TutorialViewState) => void;

const CHAVE_VISTOS = 'iris.tutorial.vistos';

function lerVistos(): GuiaId[] {
  try {
    const cru: unknown = JSON.parse(localStorage.getItem(CHAVE_VISTOS) ?? '[]');
    return Array.isArray(cru) ? cru.filter((id): id is GuiaId => GUIAS.some((g) => g.id === id)) : [];
  } catch {
    return [];
  }
}

function gravarVistos(vistos: GuiaId[]): void {
  try {
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify(vistos));
  } catch {
    // Sem armazenamento, o selo "lido" só não sobrevive ao reinício.
  }
}

let state: TutorialViewState = { guiaAtivo: null, busca: '', estados: {}, conferindo: false, vistos: lerVistos(), passoAlvo: null };
let listener: Listener | null = null;
let cancelarOuvinte: (() => void) | null = null;

function notify(): void {
  listener?.(state);
}

function aplicar(parcial: Partial<TutorialViewState>): void {
  state = { ...state, ...parcial };
  notify();
}

function comVisto(guia: GuiaId | null): Partial<TutorialViewState> {
  if (!guia || state.vistos.includes(guia)) return {};
  const vistos = [...state.vistos, guia];
  gravarVistos(vistos);
  return { vistos };
}

export function onStateChange(cb: Listener): void {
  listener = cb;

  // Quem clicou no "?" de outro módulo já deixou o guia escolhido. Sem pedido,
  // o Tutorial volta ao Início — reabrir no último guia lido confundia quem
  // vinha procurar outra coisa.
  const pedido = consumirGuiaPendente();
  state = { ...state, guiaAtivo: pedido, busca: '', passoAlvo: null, ...comVisto(pedido) };

  // Cobre o clique no "?" quando o tutorial já está aberto.
  cancelarOuvinte?.();
  cancelarOuvinte = onGuiaSolicitado((guia) => abrirGuia(guia));
}

export function offStateChange(): void {
  listener = null;
  cancelarOuvinte?.();
  cancelarOuvinte = null;
}

export function getCurrentState(): TutorialViewState {
  return state;
}

export function abrirGuia(guia: GuiaId, passoAlvo: string | null = null): void {
  aplicar({ guiaAtivo: guia, busca: '', passoAlvo, ...comVisto(guia) });
}

export function irParaInicio(): void {
  aplicar({ guiaAtivo: null, busca: '', passoAlvo: null });
}

export function buscar(texto: string): void {
  aplicar({ busca: texto, passoAlvo: null });
}

/** A tela já rolou até o passo; não rolar de novo no próximo redesenho. */
export function consumirPassoAlvo(): void {
  state = { ...state, passoAlvo: null };
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
