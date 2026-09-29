import { svg } from './pagina.js';

/**
 * Aviso flutuante no canto da tela, que some sozinho. Para confirmar uma ação
 * que tira algo da frente do usuário (ex.: checklist concluída saindo da aba
 * Abertas) sem interromper com um modal — e oferecer o caminho de volta.
 */

export interface AcaoToast {
  rotulo: string;
  fazer: () => void;
}

const ICONE_OK = '<polyline points="20 6 9 17 4 12"/>';
const ICONE_FECHAR = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

function pilha(): HTMLElement {
  let el = document.getElementById('toasts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toasts';
    el.className = 'toasts';
    // Leitor de tela anuncia sem roubar o foco.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

export function mostrarToast(texto: string, acoes: AcaoToast[] = [], duracaoMs = 7000): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icone = document.createElement('span');
  icone.className = 'toast-icone';
  icone.innerHTML = svg(ICONE_OK, 13, 2.6);
  const msg = document.createElement('span');
  msg.className = 'toast-texto';
  msg.textContent = texto;
  toast.append(icone, msg);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const fechar = (): void => {
    if (timer) clearTimeout(timer);
    toast.remove();
  };
  acoes.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-acao';
    b.textContent = a.rotulo;
    b.addEventListener('click', () => {
      fechar();
      a.fazer();
    });
    toast.appendChild(b);
  });
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'toast-fechar';
  x.setAttribute('aria-label', 'Fechar aviso');
  x.innerHTML = svg(ICONE_FECHAR, 12, 2.4);
  x.addEventListener('click', fechar);
  toast.appendChild(x);

  // Com o mouse em cima, não some: dá tempo de clicar em "Desfazer".
  const agendar = (): void => {
    timer = setTimeout(fechar, duracaoMs);
  };
  toast.addEventListener('mouseenter', () => timer && clearTimeout(timer));
  toast.addEventListener('mouseleave', agendar);
  agendar();
  pilha().appendChild(toast);
}
