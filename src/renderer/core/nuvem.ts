import { haModalAberto } from '../ui/modal.js';
import { comModuloFechado } from './navegacao.js';

/**
 * Vivo a sessão toda: quando a sincronização traz mudanças de outro computador,
 * a tela aberta relê os dados — o mesmo fechar-e-reabrir do Desfazer
 * (`comModuloFechado`), que primeiro descarrega o que estava para ser salvo.
 *
 * Com alguém digitando ou com um modal aberto, espera: remontar a tela tiraria
 * o cursor do campo no meio da frase. Os dados já estão no disco; só a tela
 * fica um instante atrás.
 */

const TENTAR_DE_NOVO_MS = 3_000;
let pendente = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function digitando(): boolean {
  const foco = document.activeElement;
  if (!(foco instanceof HTMLElement)) return false;
  return foco instanceof HTMLInputElement || foco instanceof HTMLTextAreaElement || foco instanceof HTMLSelectElement || foco.isContentEditable;
}

function reler(): void {
  if (!pendente) return;
  if (digitando() || haModalAberto()) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(reler, TENTAR_DE_NOVO_MS);
    return;
  }
  pendente = false;
  void comModuloFechado(() => Promise.resolve());
}

export function iniciarNuvem(): void {
  window.irisAPI.events.on('nuvem:chegou', () => {
    pendente = true;
    reler();
  });
}
