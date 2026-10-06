import { markdownDasCenas } from '../../../shared/types/roteiros.conversao.js';
import type { Roteiro, VersaoRoteiro } from '../../../shared/types/roteiros.types.js';
import { mensagemDeErro, openConfirmModal, openCustomModal, promptText } from '../../ui/modal.js';
import { buildBotao, buildSelo, tempoRelativo } from '../../ui/pagina.js';
import { ICONES, type CtxEstudio } from './roteiros.comum.js';
import * as roteirosState from './roteiros.state.js';

/**
 * Versões do roteiro: fotografias das cenas, tiradas na mão ("Salvar versão
 * agora") ou sozinhas antes de toda troca feita pela IA. Dá para comparar
 * qualquer uma com o texto atual, lado a lado, e voltar a ela.
 */

const ORIGEM: Record<VersaoRoteiro['origem'], { rotulo: string; tom: 'neutro' | 'atencao' | 'ok' }> = {
  manual: { rotulo: 'Manual', tom: 'neutro' },
  ia: { rotulo: 'Antes da IA', tom: 'atencao' },
  restaurada: { rotulo: 'Antes de restaurar', tom: 'ok' },
};

type Op = { tipo: 'igual' | 'saiu' | 'entrou'; texto: string };

/**
 * Diferença por linhas (maior subsequência comum). Roteiros têm algumas
 * centenas de linhas: a tabela n×m cabe com folga.
 */
export function diferencaDeLinhas(antes: string, depois: string): Op[] {
  const a = antes.split('\n');
  const b = depois.split('\n');
  const n = a.length;
  const m = b.length;
  const tab: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) tab[i]![j] = a[i] === b[j] ? tab[i + 1]![j + 1]! + 1 : Math.max(tab[i + 1]![j]!, tab[i]![j + 1]!);
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ tipo: 'igual', texto: a[i]! });
      i += 1;
      j += 1;
    } else if (tab[i + 1]![j]! >= tab[i]![j + 1]!) ops.push({ tipo: 'saiu', texto: a[i++]! });
    else ops.push({ tipo: 'entrou', texto: b[j++]! });
  }
  while (i < n) ops.push({ tipo: 'saiu', texto: a[i++]! });
  while (j < m) ops.push({ tipo: 'entrou', texto: b[j++]! });
  return ops;
}

/** Duas colunas alinhadas: o que saiu à esquerda (−), o que entrou à direita (+). */
function buildComparacao(antes: string, depois: string): HTMLElement {
  const ops = diferencaDeLinhas(antes, depois);
  const wrap = document.createElement('div');
  wrap.className = 'rte-diff';
  const mudancas = ops.filter((o) => o.tipo !== 'igual').length;
  wrap.appendChild(
    Object.assign(document.createElement('p'), {
      className: 'rte-diff-resumo',
      textContent: mudancas ? `${ops.filter((o) => o.tipo === 'saiu').length} linha(s) saíram · ${ops.filter((o) => o.tipo === 'entrou').length} entraram` : 'Igual ao texto atual.',
    }),
  );
  const grade = document.createElement('div');
  grade.className = 'rte-diff-grade';
  grade.append(
    Object.assign(document.createElement('div'), { className: 'rte-diff-cab', textContent: 'Esta versão' }),
    Object.assign(document.createElement('div'), { className: 'rte-diff-cab', textContent: 'Agora' }),
  );
  const celula = (op: Op | null, lado: 'esq' | 'dir'): HTMLElement => {
    const c = document.createElement('div');
    c.className = 'rte-diff-linha';
    if (!op) {
      c.classList.add('is-vazia');
      return c;
    }
    if (op.tipo !== 'igual') {
      c.classList.add(op.tipo === 'saiu' ? 'is-saiu' : 'is-entrou');
      // O símbolo diz o que aconteceu; a cor só reforça.
      c.appendChild(Object.assign(document.createElement('span'), { className: 'rte-diff-sinal', textContent: op.tipo === 'saiu' ? '−' : '+' }));
    }
    c.append(op.texto || ' ');
    c.dataset.lado = lado;
    return c;
  };
  // Saídas e entradas seguidas ficam lado a lado (troca de linha); iguais nos dois.
  for (let k = 0; k < ops.length; ) {
    const op = ops[k]!;
    if (op.tipo === 'igual') {
      grade.append(celula(op, 'esq'), celula(op, 'dir'));
      k += 1;
      continue;
    }
    const saidas: Op[] = [];
    const entradas: Op[] = [];
    while (k < ops.length && ops[k]!.tipo === 'saiu') saidas.push(ops[k++]!);
    while (k < ops.length && ops[k]!.tipo === 'entrou') entradas.push(ops[k++]!);
    for (let x = 0; x < Math.max(saidas.length, entradas.length); x += 1) grade.append(celula(saidas[x] ?? null, 'esq'), celula(entradas[x] ?? null, 'dir'));
  }
  wrap.appendChild(grade);
  return wrap;
}

export function abrirVersoes(ctx: CtxEstudio, antesDeAgir: () => Promise<void>): void {
  void openCustomModal(
    'Versões do roteiro',
    ({ corpo, rodape, fechar }) => {
      let selecionada: string | null = null;
      const desenhar = (): void => {
        const r: Roteiro = ctx.r;
        corpo.replaceChildren();
        const layout = document.createElement('div');
        layout.className = 'rte-versoes';
        const listaEl = document.createElement('div');
        listaEl.className = 'rte-versoes-lista';
        const detalhe = document.createElement('div');
        detalhe.className = 'rte-versoes-detalhe';

        const atual = markdownDasCenas({ titulo: r.titulo, cenas: r.cenas });
        const itens: Array<{ id: string; rotulo: string; quando: string; selo?: HTMLElement; texto: string; versao?: VersaoRoteiro }> = r.versoes.map((v) => ({
          id: v.id,
          rotulo: v.rotulo,
          quando: v.em,
          selo: buildSelo(ORIGEM[v.origem].rotulo, ORIGEM[v.origem].tom),
          texto: markdownDasCenas({ titulo: v.titulo, cenas: v.cenas }),
          versao: v,
        }));
        if (r.textoLegado?.trim()) {
          itens.push({ id: 'legado', rotulo: 'Texto original (antes das cenas)', quando: r.createdAt, selo: buildSelo('Original', 'neutro'), texto: r.textoLegado });
        }
        if (!itens.length) {
          listaEl.appendChild(
            Object.assign(document.createElement('p'), {
              className: 'md-vazio',
              textContent: 'Nenhuma versão ainda. Elas aparecem aqui quando você salva uma, e sozinhas antes de toda mudança feita pela IA.',
            }),
          );
        }
        if (!selecionada || !itens.some((i) => i.id === selecionada)) selecionada = itens[0]?.id ?? null;
        itens.forEach((it) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'rte-versoes-item';
          b.classList.toggle('is-ativa', it.id === selecionada);
          b.append(
            Object.assign(document.createElement('strong'), { textContent: it.rotulo }),
            Object.assign(document.createElement('span'), {
              className: 'rte-versoes-quando',
              textContent: `${new Date(it.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${tempoRelativo(it.quando)}`,
            }),
          );
          if (it.selo) b.appendChild(it.selo);
          b.addEventListener('click', () => {
            selecionada = it.id;
            desenhar();
          });
          listaEl.appendChild(b);
        });

        const escolhida = itens.find((i) => i.id === selecionada);
        if (escolhida) {
          const acoes = document.createElement('div');
          acoes.className = 'rte-versoes-acoes';
          if (escolhida.versao) {
            const restaurar = buildBotao('Voltar a esta versão', { icone: ICONES.voltar, variante: 'primario' });
            restaurar.addEventListener('click', () => {
              void openConfirmModal({
                title: 'Voltar a esta versão',
                message: 'As cenas atuais viram uma versão ("Antes de restaurar") — dá para desfazer voltando a ela.',
                confirmText: 'Voltar',
                danger: false,
              }).then(async (ok) => {
                if (!ok) return;
                try {
                  await antesDeAgir();
                  await roteirosState.restaurarVersao({ roteiroId: r.id, versaoId: escolhida.versao!.id });
                  fechar();
                } catch (e) {
                  detalhe.prepend(Object.assign(document.createElement('p'), { className: 'md-erro', textContent: mensagemDeErro(e) }));
                }
              });
            });
            acoes.appendChild(restaurar);
          }
          const copiar = buildBotao('Copiar texto', { icone: ICONES.duplicar, variante: 'secundario' });
          copiar.addEventListener('click', () => void navigator.clipboard.writeText(escolhida.texto).then(() => (copiar.lastChild!.textContent = 'Copiado')));
          acoes.appendChild(copiar);
          detalhe.append(acoes, buildComparacao(escolhida.texto, atual));
        } else {
          detalhe.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Escolha uma versão para comparar com o texto atual.' }));
        }
        layout.append(listaEl, detalhe);
        corpo.appendChild(layout);
      };
      desenhar();

      const salvar = buildBotao('Salvar versão agora', { icone: ICONES.mais, variante: 'secundario' });
      salvar.addEventListener('click', () => {
        void promptText('Salvar versão', 'Nome da versão', `Versão de ${new Date().toLocaleDateString('pt-BR')}`, { icone: ICONES.versoes }).then(async (nome) => {
          if (nome === null) return;
          try {
            await antesDeAgir();
            const file = await roteirosState.salvarVersao({ roteiroId: ctx.r.id, rotulo: nome, origem: 'manual' });
            const salvo = file.roteiros.find((x) => x.id === ctx.r.id);
            if (salvo) ctx.r.versoes = salvo.versoes;
            selecionada = ctx.r.versoes[0]?.id ?? null;
            desenhar();
          } catch (e) {
            ctx.falhou(e);
          }
        });
      });
      const fecharBtn = buildBotao('Fechar', { variante: 'fantasma' });
      fecharBtn.addEventListener('click', fechar);
      rodape.append(salvar, fecharBtn);
    },
    { largura: 1040, icone: ICONES.versoes, subtitulo: 'Compare com o texto atual e volte a qualquer uma' },
  );
}
