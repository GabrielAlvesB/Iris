import type { ContextoTexto, TarefaTexto } from '../../../shared/types/ia.types.js';
import { gerarTextoIa } from '../../core/ia.js';
import { ICONE_IA, abrirVariantes, buildBotaoIa, comGeracao, confirmarTextoGerado, exigirIa } from '../../ui/ia.js';
import { empilharCamada, openAvisoModal } from '../../ui/modal.js';
import { svg } from '../../ui/pagina.js';
import { renderMarkdown } from './roteiros.markdown.js';

/**
 * Botão "IA" da barra de escrita dos Roteiros. Tudo o que a IA devolve passa
 * por uma prévia antes de entrar no texto, e entra disparando `input` — o
 * mesmo caminho da digitação, então o salvamento e a prévia do editor seguem.
 */

export interface OpcoesIaRoteiro {
  area: HTMLTextAreaElement;
  contexto: () => ContextoTexto;
  /** Campos opcionais de gancho e CTA (ficam num <details> que é aberto ao usar). */
  gancho: () => HTMLTextAreaElement | null;
  cta: () => HTMLTextAreaElement | null;
  abrirExtras: () => void;
}

function aplicar(area: HTMLTextAreaElement, texto: string, inicio: number, fim: number): void {
  area.focus();
  area.setRangeText(texto, inicio, fim, 'select');
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function previaMarkdown(texto: string): (alvo: HTMLElement) => void {
  return (alvo) => {
    alvo.classList.add('rot-previa-corpo');
    alvo.appendChild(renderMarkdown(texto));
  };
}

async function pedir(botao: HTMLButtonElement, tarefa: TarefaTexto, contexto: ContextoTexto): Promise<string | undefined> {
  if (!(await exigirIa('texto'))) return undefined;
  const r = await comGeracao(botao, () => gerarTextoIa({ tarefa, contexto }));
  return r?.texto;
}

export function buildBotaoIaRoteiro(o: OpcoesIaRoteiro): HTMLButtonElement {
  const botao = buildBotaoIa('IA', 'Gerar rascunho, melhorar trecho, revisar, sugerir gancho e CTA');
  botao.classList.add('rot-barra-ia');
  // mousedown sem foco: a seleção do textarea precisa sobreviver ao clique.
  botao.addEventListener('mousedown', (e) => e.preventDefault());

  let fechar: (() => void) | null = null;

  const acoes: Array<{ rotulo: string; dica: string; fazer: (sel: { ini: number; fim: number }) => Promise<void> }> = [
    {
      rotulo: 'Gerar rascunho',
      dica: 'Roteiro completo a partir do título, formato, duração e gancho',
      fazer: async () => {
        const texto = await pedir(botao, 'roteiro-rascunho', o.contexto());
        if (!texto) return;
        const vazio = !o.area.value.trim();
        const escolha = await confirmarTextoGerado(
          'Rascunho do roteiro',
          'Confira antes de usar — dá para editar tudo depois',
          previaMarkdown(texto),
          vazio
            ? [{ id: 'substituir', rotulo: 'Usar este rascunho', primario: true }]
            : [
                { id: 'fim', rotulo: 'Inserir no fim' },
                { id: 'substituir', rotulo: 'Substituir o texto', primario: true },
              ],
        );
        if (escolha === 'substituir') aplicar(o.area, texto, 0, o.area.value.length);
        else if (escolha === 'fim') aplicar(o.area, `\n\n---\n\n${texto}`, o.area.value.length, o.area.value.length);
      },
    },
    {
      rotulo: 'Melhorar seleção',
      dica: 'Reescreve só o trecho selecionado no editor',
      fazer: async ({ ini, fim }) => {
        const selecao = o.area.value.slice(ini, fim);
        if (!selecao.trim()) {
          await openAvisoModal('Selecione um trecho', 'Marque no editor o trecho que a IA deve reescrever e clique de novo.');
          return;
        }
        const texto = await pedir(botao, 'roteiro-melhorar', { ...o.contexto(), selecao });
        if (!texto) return;
        const escolha = await confirmarTextoGerado('Trecho melhorado', 'Substitui só o que estava selecionado', previaMarkdown(texto), [
          { id: 'usar', rotulo: 'Substituir o trecho', primario: true },
        ]);
        if (escolha === 'usar') aplicar(o.area, texto, ini, fim);
      },
    },
    {
      rotulo: 'Revisar roteiro',
      dica: 'Português, ritmo e falas mais naturais, sem mudar a estrutura',
      fazer: async () => {
        if (!o.area.value.trim()) {
          await openAvisoModal('Nada para revisar', 'Escreva ou gere um rascunho primeiro.');
          return;
        }
        const texto = await pedir(botao, 'roteiro-revisar', { ...o.contexto(), texto: o.area.value });
        if (!texto) return;
        const escolha = await confirmarTextoGerado('Roteiro revisado', 'Aplicar substitui o texto inteiro (Ctrl+Z desfaz)', previaMarkdown(texto), [
          { id: 'usar', rotulo: 'Aplicar revisão', primario: true },
        ]);
        if (escolha === 'usar') aplicar(o.area, texto, 0, o.area.value.length);
      },
    },
    {
      rotulo: 'Sugerir gancho e CTA',
      dica: 'Três pares de gancho e chamada final',
      fazer: async () => {
        if (!(await exigirIa('texto'))) return;
        const r = await comGeracao(botao, () => gerarTextoIa({ tarefa: 'roteiro-gancho-cta', contexto: { ...o.contexto(), texto: o.area.value } }));
        if (!r?.variantes?.length) return;
        abrirVariantes({
          titulo: 'Gancho e CTA',
          subtitulo: `Gerado por ${r.modelo}`,
          variantes: r.variantes,
          linhas: (v) => [
            ['Gancho', v.gancho],
            ['CTA', v.cta],
          ],
          copiar: (v) => [v.gancho, v.cta].filter(Boolean).join('\n'),
          aoUsar: (v) => {
            o.abrirExtras();
            const gancho = o.gancho();
            const cta = o.cta();
            if (v.gancho && gancho) {
              gancho.value = v.gancho;
              gancho.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (v.cta && cta) {
              cta.value = v.cta;
              cta.dispatchEvent(new Event('input', { bubbles: true }));
            }
          },
        });
      },
    },
  ];

  botao.addEventListener('click', () => {
    if (fechar) {
      fechar();
      return;
    }
    // A seleção é lida agora: depois do menu e do modal, o textarea já perdeu o foco.
    const sel = { ini: o.area.selectionStart, fim: o.area.selectionEnd };
    const menu = document.createElement('div');
    menu.className = 'ia-menu';
    menu.setAttribute('role', 'menu');
    acoes.forEach((a) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ia-menu-item';
      item.setAttribute('role', 'menuitem');
      item.addEventListener('mousedown', (e) => e.preventDefault());
      const icone = document.createElement('span');
      icone.className = 'ia-menu-icone';
      icone.innerHTML = svg(ICONE_IA, 13, 2);
      const textos = document.createElement('span');
      textos.className = 'ia-menu-textos';
      textos.append(Object.assign(document.createElement('strong'), { textContent: a.rotulo }), Object.assign(document.createElement('small'), { textContent: a.dica }));
      item.append(icone, textos);
      item.addEventListener('click', () => {
        fechar?.();
        void a.fazer(sel);
      });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    const r = botao.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth))}px`;
    menu.style.top = `${r.bottom + 6 + menu.offsetHeight > window.innerHeight ? Math.max(8, r.top - menu.offsetHeight - 6) : r.bottom + 6}px`;

    const fora = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node) && !botao.contains(e.target as Node)) fechar?.();
    };
    const desempilhar = empilharCamada(menu, () => fechar?.());
    fechar = () => {
      fechar = null;
      desempilhar();
      document.removeEventListener('mousedown', fora, true);
      menu.remove();
    };
    document.addEventListener('mousedown', fora, true);
  });
  return botao;
}
