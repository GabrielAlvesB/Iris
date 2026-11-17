import { empilharCamada } from './modal.js';
import { svg } from './pagina.js';

/**
 * Menu suspenso ("⋯") preso a um botão. Entra na pilha de camadas: Esc e clique
 * fora fecham só ele. Segundo clique no mesmo botão fecha em vez de reabrir.
 */

export interface AcaoMenu {
  rotulo: string;
  icone?: string;
  perigo?: boolean;
  /** Linha cinza, sem clique (um título de grupo ou uma explicação). */
  nota?: boolean;
  marcado?: boolean;
  fazer?: () => void;
}

let fecharAtual: (() => void) | null = null;
let ancoraAtual: HTMLElement | null = null;

export function abrirMenu(ancora: HTMLElement, acoes: Array<AcaoMenu | 'separador'>, opcoes: { alinhar?: 'esquerda' | 'direita' } = {}): void {
  const eraEste = ancoraAtual === ancora;
  fecharAtual?.();
  if (eraEste) return;

  const menu = document.createElement('div');
  menu.className = 'ui-menu';
  menu.setAttribute('role', 'menu');

  acoes.forEach((a) => {
    if (a === 'separador') {
      menu.appendChild(Object.assign(document.createElement('div'), { className: 'ui-menu-sep' }));
      return;
    }
    if (a.nota) {
      menu.appendChild(Object.assign(document.createElement('div'), { className: 'ui-menu-nota', textContent: a.rotulo }));
      return;
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `ui-menu-item${a.perigo ? ' is-perigo' : ''}${a.marcado ? ' is-marcado' : ''}`;
    item.setAttribute('role', a.marcado === undefined ? 'menuitem' : 'menuitemcheckbox');
    if (a.marcado !== undefined) item.setAttribute('aria-checked', String(a.marcado));
    item.innerHTML = a.icone ? svg(a.icone, 15) : '<span class="ui-menu-vazio"></span>';
    item.appendChild(Object.assign(document.createElement('span'), { textContent: a.rotulo }));
    item.addEventListener('click', () => {
      fechar();
      a.fazer?.();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  const r = ancora.getBoundingClientRect();
  const largura = menu.offsetWidth;
  const altura = menu.offsetHeight;
  const esquerda = opcoes.alinhar === 'esquerda' ? r.left : r.right - largura;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - largura - 8, esquerda))}px`;
  const embaixo = r.bottom + 6;
  menu.style.top = `${embaixo + altura > window.innerHeight - 8 ? Math.max(8, r.top - altura - 6) : embaixo}px`;

  ancora.setAttribute('aria-expanded', 'true');
  const foraDali = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node) && !ancora.contains(e.target as Node)) fechar();
  };
  const desempilhar = empilharCamada(menu, () => fechar());
  setTimeout(() => document.addEventListener('mousedown', foraDali), 0);
  window.addEventListener('blur', fechar);

  function fechar(): void {
    if (fecharAtual !== fechar) return;
    fecharAtual = null;
    ancoraAtual = null;
    desempilhar();
    document.removeEventListener('mousedown', foraDali);
    window.removeEventListener('blur', fechar);
    ancora.setAttribute('aria-expanded', 'false');
    menu.remove();
  }
  fecharAtual = fechar;
  ancoraAtual = ancora;
  (menu.querySelector<HTMLElement>('.ui-menu-item') ?? menu).focus();
}

export function fecharMenu(): void {
  fecharAtual?.();
}
