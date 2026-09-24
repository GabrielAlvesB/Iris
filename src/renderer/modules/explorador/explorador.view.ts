import * as exploradorState from './explorador.state.js';
import type { ExploradorViewState } from './explorador.state.js';
import { buildAviso, buildBotao, buildCabecalho, buildSegmentado, focarBusca } from '../../ui/pagina.js';
import { ICONES_BIBLIOTECA, buildAbaBiblioteca, buildAbaBusca, buildAbaRecentes, limparBiblioteca } from './biblioteca.view.js';
import { buildPastas, limparPastas } from './explorador.pastas.js';

/**
 * Módulo Biblioteca (id interno "explorador", mantido para não quebrar ajustes
 * e backups antigos). Quatro abas sobre as mesmas pastas monitoradas:
 * Biblioteca (curadoria), Recentes, Busca e Pastas (navegador de arquivos).
 */

type Aba = 'biblioteca' | 'recentes' | 'busca' | 'pastas';

let aba: Aba = 'biblioteca';
let containerAtual: HTMLElement | null = null;

function redesenhar(): void {
  if (containerAtual) render(containerAtual, exploradorState.getCurrentState());
}

function trocarAba(nova: Aba): void {
  aba = nova;
  redesenhar();
  if (nova === 'busca') focarBusca(containerAtual);
}

export function render(container: HTMLElement, state: ExploradorViewState): void {
  containerAtual = container;
  // A tela é redesenhada inteira; se a digitação estava numa busca, o foco volta para ela.
  const ativo = document.activeElement instanceof HTMLInputElement && container.contains(document.activeElement) ? document.activeElement : null;
  const seletorComFoco = ativo?.closest('.pg-busca') ? '.pg-busca input' : ativo?.classList.contains('explorador-filtro') ? '.explorador-filtro' : null;

  const tela = document.createElement('div');
  tela.className = 'pg-view bb-view';

  const adicionarRaiz = buildBotao('Monitorar pasta', { icone: ICONES_BIBLIOTECA.mais, variante: 'secundario' });
  adicionarRaiz.addEventListener('click', () => void exploradorState.adicionarRaiz());
  const adicionar = buildBotao('Adicionar arquivos', { icone: ICONES_BIBLIOTECA.mais, variante: 'primario' });
  adicionar.addEventListener('click', () => void exploradorState.adicionarPorDialogo());
  adicionar.disabled = state.raizes.raizes.length === 0;
  adicionar.title = adicionar.disabled ? 'Monitore uma pasta primeiro' : 'Escolher arquivos das pastas monitoradas';

  const bib = state.biblioteca;
  tela.appendChild(
    buildCabecalho({
      icone: ICONES_BIBLIOTECA.livro,
      titulo: 'Biblioteca',
      subtitulo: 'Materiais, referências e arquivos dos seus projetos — organizados sem sair do lugar no disco',
      acoes: [adicionarRaiz, adicionar],
    }),
  );

  tela.appendChild(
    buildSegmentado<Aba>(
      [
        { value: 'biblioteca', label: `Biblioteca${bib ? ` · ${bib.recursos.length}` : ''}` },
        { value: 'recentes', label: 'Recentes' },
        { value: 'busca', label: 'Busca' },
        { value: 'pastas', label: `Pastas${state.raizes.raizes.length ? ` · ${state.raizes.raizes.length}` : ''}` },
      ],
      aba,
      trocarAba,
    ),
  );

  if (state.erro) {
    const fechar = buildBotao('', { icone: ICONES_BIBLIOTECA.remover, variante: 'fantasma', titulo: 'Dispensar' });
    fechar.addEventListener('click', () => exploradorState.limparErro());
    tela.appendChild(buildAviso(state.erro, 'erro', fechar));
  }

  const conteudo = document.createElement('div');
  conteudo.className = 'bb-conteudo';
  if (aba === 'pastas') {
    conteudo.appendChild(buildPastas(state, redesenhar));
  } else if (!bib) {
    const carregando = document.createElement('p');
    carregando.className = 'bb-dica';
    carregando.textContent = 'Carregando…';
    conteudo.appendChild(carregando);
  } else if (aba === 'biblioteca') {
    conteudo.appendChild(buildAbaBiblioteca(state, redesenhar));
  } else if (aba === 'recentes') {
    conteudo.appendChild(buildAbaRecentes(state));
  } else {
    conteudo.appendChild(
      buildAbaBusca(state, (item) => {
        aba = 'pastas';
        void exploradorState.abrirDiretorio(item.raizId, item.pastaRelativa);
      }),
    );
  }
  tela.appendChild(conteudo);

  container.replaceChildren(tela);
  if (seletorComFoco) {
    const campo = container.querySelector<HTMLInputElement>(seletorComFoco);
    campo?.focus();
    campo?.setSelectionRange(campo.value.length, campo.value.length);
  }
}

export function destroy(): void {
  containerAtual = null;
  limparPastas();
  limparBiblioteca();
}
