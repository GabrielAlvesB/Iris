/**
 * Leva o olho até um item que a busca global (ou outro módulo) pediu: espera o
 * elemento existir — a tela pode ainda estar lendo os dados —, rola até ele e
 * pisca o contorno. Desiste em silêncio se o item não aparecer (foi apagado).
 */

const ESPERA_MAXIMA_MS = 3000;
const DURACAO_DESTAQUE_MS = 2400;
/** Tempo em que um redesenho logo depois (cache → dados novos) ainda troca o elemento. */
const VIGIAR_REDESENHO_MS = 1500;

export function destacarItem(achar: () => HTMLElement | null, aoAchar?: (el: HTMLElement) => void): void {
  const limite = performance.now() + ESPERA_MAXIMA_MS;
  let vigiarAte = 0;
  let atual: HTMLElement | null = null;

  const marcar = (el: HTMLElement, rolar: boolean): void => {
    if (rolar) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    el.classList.remove('is-encontrado');
    // Força o reinício da animação quando o mesmo item é pedido duas vezes.
    void el.offsetWidth;
    el.classList.add('is-encontrado');
    setTimeout(() => el.classList.remove('is-encontrado'), DURACAO_DESTAQUE_MS);
  };

  const tentar = (): void => {
    const el = achar();
    if (!el) {
      if (performance.now() < limite) requestAnimationFrame(tentar);
      return;
    }
    atual = el;
    vigiarAte = performance.now() + VIGIAR_REDESENHO_MS;
    marcar(el, true);
    aoAchar?.(el);
    requestAnimationFrame(vigiar);
  };

  // A tela redesenhou e trocou o nó: destaca o novo, no mesmo lugar.
  const vigiar = (): void => {
    if (performance.now() > vigiarAte) return;
    if (atual && !atual.isConnected) {
      const novo = achar();
      if (novo) {
        atual = novo;
        marcar(novo, true);
      }
    }
    requestAnimationFrame(vigiar);
  };

  requestAnimationFrame(tentar);
}
