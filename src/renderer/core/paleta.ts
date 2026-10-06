import { MODULOS, type ModuloId } from '../../shared/types/modulos.types.js';
import { empilharCamada } from '../ui/modal.js';
import { ICONE_DO_MODULO } from './sidebar.js';
import { SECOES_AJUSTES, abrirAjustes, abrirModulo, abrirTutorial, type GuiaId } from './navegacao.js';

/**
 * Busca rápida (Ctrl+P): qualquer módulo, seção de Ajustes ou guia do
 * Tutorial em duas teclas. Carregada só no primeiro uso, pela barra lateral.
 *
 * O overlay usa a classe modal-overlay de propósito: `haModalAberto()` passa a
 * calar os atalhos das telas (Ctrl+K do Kanban, N dos Pensamentos) enquanto
 * ela está aberta.
 */

interface Opcao {
  tipo: 'Módulo' | 'Ajustes' | 'Tutorial';
  rotulo: string;
  detalhe: string;
  icone: string;
  /** Texto extra só para a busca (sinônimos). */
  termos: string;
  ir: () => void;
}

const ICONE_GUIA = ICONE_DO_MODULO.tutorial;

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function svg(path: string, tamanho = 16): string {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function opcoesFixas(): Opcao[] {
  const modulos: Opcao[] = MODULOS.map((m) => ({
    tipo: 'Módulo',
    rotulo: m.rotulo,
    detalhe: m.descricao,
    icone: ICONE_DO_MODULO[m.id],
    termos: m.id,
    ir: () => abrirModulo(m.id as ModuloId),
  }));
  const ajustes: Opcao[] = SECOES_AJUSTES.map((s) => ({
    tipo: 'Ajustes',
    rotulo: s.rotulo,
    detalhe: 'Ajustes',
    icone: ICONE_DO_MODULO.ajustes,
    termos: s.termos,
    ir: () => abrirAjustes(s.id),
  }));
  return [...modulos, ...ajustes];
}

/** Os guias vêm do próprio Tutorial, carregado só quando a paleta abre. */
async function opcoesDoTutorial(): Promise<Opcao[]> {
  try {
    const { GUIAS } = await import('../modules/tutorial/tutorial.content.js');
    return GUIAS.map((g) => ({
      tipo: 'Tutorial' as const,
      rotulo: `Como usar: ${g.titulo}`,
      detalhe: g.chamada,
      icone: ICONE_GUIA,
      termos: 'tutorial ajuda guia como usar',
      ir: () => abrirTutorial(g.id as GuiaId),
    }));
  } catch {
    return [];
  }
}

/** Pontua: começo do nome > palavra do nome > nome contém > detalhe/termos contêm. */
function filtrar(opcoes: Opcao[], busca: string): Opcao[] {
  const q = normalizar(busca.trim());
  if (!q) return opcoes.filter((o) => o.tipo === 'Módulo');
  const pontuadas = opcoes
    .map((o) => {
      const nome = normalizar(o.rotulo);
      const resto = normalizar(`${o.detalhe} ${o.termos}`);
      let pontos = 0;
      if (nome.startsWith(q)) pontos = 4;
      else if (nome.split(/\s+/).some((p) => p.startsWith(q))) pontos = 3;
      else if (nome.includes(q)) pontos = 2;
      else if (resto.includes(q)) pontos = 1;
      // Guia do Tutorial só sobe por cima de um módulo quando casa melhor.
      return { o, pontos: pontos ? pontos + (o.tipo === 'Módulo' ? 0.5 : o.tipo === 'Ajustes' ? 0.3 : 0) : 0 };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);
  return pontuadas.map((x) => x.o).slice(0, 12);
}

let aberta = false;

export function abrirPaleta(): void {
  if (aberta) return;
  aberta = true;

  let opcoes = opcoesFixas();
  let visiveis: Opcao[] = [];
  let selecionada = 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay paleta-overlay';
  const caixa = document.createElement('div');
  caixa.className = 'paleta';
  caixa.setAttribute('role', 'dialog');
  caixa.setAttribute('aria-label', 'Ir para');

  const campo = document.createElement('div');
  campo.className = 'paleta-campo';
  campo.innerHTML = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 17);
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ir para um módulo, seção de Ajustes ou guia…';
  input.setAttribute('aria-label', 'Buscar');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'paleta-lista');
  input.setAttribute('aria-expanded', 'true');
  input.spellcheck = false;
  campo.appendChild(input);
  const esc = document.createElement('kbd');
  esc.textContent = 'Esc';
  campo.appendChild(esc);

  const lista = document.createElement('div');
  lista.className = 'paleta-lista';
  lista.id = 'paleta-lista';
  lista.setAttribute('role', 'listbox');

  const rodape = document.createElement('div');
  rodape.className = 'paleta-rodape';
  rodape.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span>';

  caixa.append(campo, lista, rodape);
  overlay.appendChild(caixa);

  let soltar: (() => void) | null = null;
  const fechar = (): void => {
    if (!aberta) return;
    aberta = false;
    soltar?.();
    overlay.remove();
  };

  const escolher = (o: Opcao | undefined): void => {
    if (!o) return;
    fechar();
    o.ir();
  };

  const marcar = (): void => {
    lista.querySelectorAll<HTMLElement>('.paleta-item').forEach((el, i) => {
      const ativa = i === selecionada;
      el.classList.toggle('is-selecionada', ativa);
      el.setAttribute('aria-selected', String(ativa));
      if (ativa) {
        input.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const desenhar = (): void => {
    visiveis = filtrar(opcoes, input.value);
    selecionada = Math.min(selecionada, Math.max(0, visiveis.length - 1));
    lista.replaceChildren();
    if (!visiveis.length) {
      lista.appendChild(Object.assign(document.createElement('p'), { className: 'paleta-vazio', textContent: 'Nada com esse nome.' }));
      return;
    }
    visiveis.forEach((o, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'paleta-item';
      item.id = `paleta-item-${i}`;
      item.setAttribute('role', 'option');
      item.tabIndex = -1;
      const icone = document.createElement('span');
      icone.className = 'paleta-item-icone';
      icone.innerHTML = svg(o.icone);
      const textos = document.createElement('span');
      textos.className = 'paleta-item-textos';
      textos.append(
        Object.assign(document.createElement('span'), { className: 'paleta-item-nome', textContent: o.rotulo }),
        Object.assign(document.createElement('span'), { className: 'paleta-item-detalhe', textContent: o.detalhe }),
      );
      const tipo = Object.assign(document.createElement('span'), { className: 'paleta-item-tipo', textContent: o.tipo });
      item.append(icone, textos, tipo);
      item.addEventListener('mousemove', () => {
        if (selecionada === i) return;
        selecionada = i;
        marcar();
      });
      item.addEventListener('click', () => escolher(o));
      lista.appendChild(item);
    });
    marcar();
  };

  input.addEventListener('input', () => {
    selecionada = 0;
    desenhar();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selecionada = (selecionada + 1) % Math.max(1, visiveis.length);
      marcar();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selecionada = (selecionada - 1 + visiveis.length) % Math.max(1, visiveis.length);
      marcar();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolher(visiveis[selecionada]);
    }
  });
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) fechar();
  });

  document.body.appendChild(overlay);
  soltar = empilharCamada(overlay, fechar);
  desenhar();
  input.focus();

  void opcoesDoTutorial().then((guias) => {
    if (!aberta) return;
    opcoes = [...opcoes, ...guias];
    if (input.value.trim()) desenhar();
  });
}
