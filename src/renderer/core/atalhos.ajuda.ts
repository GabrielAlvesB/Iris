import { MODULOS } from '../../shared/types/modulos.types.js';
import { openCustomModal } from '../ui/modal.js';
import { buildBotao, buildBusca, buildTeclas } from '../ui/pagina.js';
import { ATALHOS_FIXOS, CATALOGO_ATALHOS, GRUPO_GERAL, GRUPO_NAVEGACAO } from './atalhos.catalogo.js';
import { comboDe } from './atalhos.js';
import { abrirAjustes, moduloAtual } from './navegacao.js';

/**
 * Ajuda dos atalhos (Shift+?): todos, com a tecla de agora (as trocas do
 * usuário já valem aqui). Os da tela aberta vêm logo depois dos gerais;
 * "Personalizar" leva a Ajustes › Atalhos.
 */

const ICONE_TECLADO =
  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01"/><path d="M10 9h.01"/><path d="M14 9h.01"/><path d="M18 9h.01"/><path d="M6 13h.01"/><path d="M18 13h.01"/><path d="M10 13h4"/><path d="M8 16h8"/>';

interface Linha {
  rotulo: string;
  grupo: string;
  teclas: string[];
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function linhas(): Linha[] {
  return [
    ...CATALOGO_ATALHOS.map((d) => ({ rotulo: d.rotulo, grupo: d.grupo, teclas: [comboDe(d.id)] })),
    ...ATALHOS_FIXOS.map((f) => ({ rotulo: f.rotulo, grupo: f.grupo, teclas: f.teclas })),
  ];
}

/** Geral → a tela aberta → Ir para → os outros módulos, na ordem da barra lateral. */
function ordemDosGrupos(): string[] {
  const atual = MODULOS.find((m) => m.id === moduloAtual())?.rotulo;
  const modulos = MODULOS.map((m) => m.rotulo);
  const grupos = [GRUPO_GERAL, ...(atual ? [atual] : []), GRUPO_NAVEGACAO, ...modulos.filter((g) => g !== atual)];
  return grupos.filter((g, i) => grupos.indexOf(g) === i);
}

let aberta = false;

export function abrirAjudaAtalhos(): void {
  if (aberta) return;
  aberta = true;
  const atual = MODULOS.find((m) => m.id === moduloAtual())?.rotulo;
  void openCustomModal(
    'Atalhos de teclado',
    ({ corpo, rodape, fechar }) => {
      const lista = document.createElement('div');
      lista.className = 'at-ajuda';
      let busca = '';
      const desenhar = (): void => {
        lista.replaceChildren();
        const termo = normalizar(busca.trim());
        const todas = linhas().filter((l) => !termo || normalizar(`${l.rotulo} ${l.grupo} ${l.teclas.join(' ')}`).includes(termo));
        let algum = false;
        ordemDosGrupos().forEach((grupo) => {
          const doGrupo = todas.filter((l) => l.grupo === grupo);
          if (!doGrupo.length) return;
          algum = true;
          const secao = document.createElement('section');
          secao.className = `at-ajuda-grupo${grupo === atual ? ' is-atual' : ''}${grupo === GRUPO_NAVEGACAO ? ' is-navegacao' : ''}`;
          const titulo = document.createElement('h3');
          titulo.textContent = grupo;
          if (grupo === atual) titulo.appendChild(Object.assign(document.createElement('span'), { className: 'at-ajuda-aqui', textContent: 'nesta tela' }));
          secao.appendChild(titulo);
          const itens = document.createElement('div');
          itens.className = 'at-ajuda-itens';
          doGrupo.forEach((l) => {
            const linha = document.createElement('div');
            linha.className = 'at-ajuda-linha';
            linha.appendChild(Object.assign(document.createElement('span'), { className: 'at-ajuda-rotulo', textContent: l.rotulo }));
            const teclas = document.createElement('span');
            teclas.className = 'at-ajuda-teclas';
            l.teclas.forEach((t, i) => {
              if (i > 0) teclas.appendChild(Object.assign(document.createElement('span'), { className: 'pg-teclas-depois', textContent: 'ou' }));
              teclas.appendChild(buildTeclas(t));
            });
            linha.appendChild(teclas);
            itens.appendChild(linha);
          });
          secao.appendChild(itens);
          lista.appendChild(secao);
        });
        if (!algum) lista.appendChild(Object.assign(document.createElement('p'), { className: 'at-ajuda-vazio', textContent: 'Nenhum atalho com esse nome.' }));
      };
      const campo = buildBusca('', 'Buscar atalho ou tecla…', (v) => {
        busca = v;
        desenhar();
      });
      campo.classList.add('at-ajuda-busca');
      corpo.append(campo, lista);
      desenhar();
      requestAnimationFrame(() => campo.querySelector('input')?.focus());

      const personalizar = buildBotao('Personalizar atalhos', { variante: 'secundario', icone: ICONE_TECLADO });
      personalizar.addEventListener('click', () => {
        fechar();
        abrirAjustes('atalhos');
      });
      rodape.appendChild(personalizar);
    },
    { largura: 720, icone: ICONE_TECLADO, subtitulo: 'Com o foco num campo de texto, só valem os que usam Ctrl ou Alt.' },
  ).finally(() => {
    aberta = false;
  });
}
