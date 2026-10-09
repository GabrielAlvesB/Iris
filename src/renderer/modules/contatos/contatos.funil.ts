import { CORES_ETAPA, nomeDoContato, type EtapaFunil, type RefContato, type TipoEtapa } from '../../../shared/types/contatos.types.js';
import { formatarMoeda } from '../../../shared/types/brasil.js';
import { openConfirmModal, openCustomModal } from '../../ui/modal.js';
import { buildBotao, buildSelo, svg } from '../../ui/pagina.js';
import type { CtxContatos } from './contatos.casco.js';
import * as contatosState from './contatos.state.js';
import { ICONES_CONTATO, buildAvatar, buildSeloEtapa, el, quandoFoi, situacaoDoProximo, subtituloDo, todosOsContatos } from './contatos.ui.js';

/**
 * O funil: uma coluna por etapa, com pessoas e empresas juntas. Arrastar muda
 * a etapa (e escreve "Etapa: A → B" no histórico); cada coluna soma o valor
 * estimado de quem está nela. Arquivados ficam de fora.
 */

let sortables: InstanceType<typeof Sortable>[] = [];

export function destruirFunil(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

const TIPOS_ETAPA: ReadonlyArray<{ id: TipoEtapa; rotulo: string; dica: string }> = [
  { id: 'aberta', rotulo: 'Em andamento', dica: 'Ainda em negociação' },
  { id: 'ganha', rotulo: 'Ganha', dica: 'Virou cliente: conta em "Clientes"' },
  { id: 'perdida', rotulo: 'Perdida', dica: 'Não seguiu adiante' },
];

function refDoCartao(elCartao: HTMLElement): RefContato | null {
  const tipo = elCartao.dataset.tipo;
  const id = elCartao.dataset.id;
  return (tipo === 'pessoa' || tipo === 'empresa') && id ? { tipo, id } : null;
}

export function buildFunil(ctx: CtxContatos): HTMLElement {
  const wrap = el('div', 'ct-funil-wrap');
  const topo = el('div', 'ct-filtros');
  topo.appendChild(el('span', 'ct-funil-dica', 'Arraste os cartões entre as etapas. Arquivados não aparecem aqui.'));
  const etapas = buildBotao('Editar etapas', { icone: ICONES_CONTATO.etapas, variante: 'secundario' });
  etapas.addEventListener('click', () => abrirEtapas(ctx));
  topo.appendChild(etapas);
  wrap.appendChild(topo);

  const quadro = el('div', 'ct-funil');
  const todos = todosOsContatos(ctx.file).filter(({ c }) => !c.arquivado);
  ctx.file.etapas.forEach((etapa) => {
    const daEtapa = todos.filter(({ c }) => c.etapaId === etapa.id).sort((a, b) => a.c.ordem - b.c.ordem || nomeDoContato(a.c).localeCompare(nomeDoContato(b.c), 'pt-BR'));
    const coluna = el('section', `ct-funil-coluna is-${etapa.tipo}`);
    coluna.style.setProperty('--c', etapa.cor);
    const cab = el('header', 'ct-funil-cab');
    cab.append(buildSeloEtapa(etapa), el('span', 'ct-funil-n', String(daEtapa.length)));
    const soma = daEtapa.reduce((s, { c }) => s + (c.valorEstimado ?? 0), 0);
    coluna.appendChild(cab);
    coluna.appendChild(el('div', 'ct-funil-soma', soma ? formatarMoeda(soma) : '—'));

    const lista = el('div', 'ct-funil-lista');
    lista.dataset.etapa = etapa.id;
    daEtapa.forEach(({ ref, c }) => {
      const cartao = el('div', 'ct-funil-cartao');
      cartao.dataset.tipo = ref.tipo;
      cartao.dataset.id = ref.id;
      cartao.tabIndex = 0;
      cartao.setAttribute('role', 'button');
      cartao.setAttribute('aria-label', `Abrir ${nomeDoContato(c)}`);
      const linha = el('div', 'ct-funil-cartao-topo');
      linha.appendChild(buildAvatar(c, 'p'));
      const textos = el('div', 'ct-funil-textos');
      textos.appendChild(el('strong', undefined, nomeDoContato(c)));
      const sub = subtituloDo(ctx.file, c);
      textos.appendChild(el('span', undefined, sub || (ref.tipo === 'empresa' ? 'Empresa' : 'Pessoa')));
      linha.appendChild(textos);
      cartao.appendChild(linha);
      const rodape = el('div', 'ct-funil-cartao-pe');
      if (c.valorEstimado) rodape.appendChild(el('span', 'ct-funil-valor', formatarMoeda(c.valorEstimado)));
      if (c.proximoContato) {
        const sit = situacaoDoProximo(c.proximoContato.data);
        rodape.appendChild(buildSelo(quandoFoi(c.proximoContato.data), sit === 'atrasado' ? 'erro' : sit === 'hoje' ? 'atencao' : 'neutro'));
      }
      if (rodape.childElementCount) cartao.appendChild(rodape);
      const abrir = (): void => ctx.abrirFicha(ref);
      cartao.addEventListener('click', abrir);
      cartao.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') abrir();
      });
      lista.appendChild(cartao);
    });
    if (!daEtapa.length) lista.appendChild(el('p', 'ct-funil-vazio', 'Ninguém aqui'));
    coluna.appendChild(lista);
    quadro.appendChild(coluna);

    sortables.push(
      new Sortable(lista, {
        group: 'ct-funil',
        animation: 150,
        ghostClass: 'sortable-ghost',
        draggable: '.ct-funil-cartao',
        filter: '.ct-funil-vazio',
        onEnd: (evt) => {
          const ref = refDoCartao(evt.item);
          const etapaId = (evt.to as HTMLElement).dataset.etapa;
          if (!ref || !etapaId) return;
          const ordem = [...evt.to.querySelectorAll<HTMLElement>('.ct-funil-cartao')].map(refDoCartao).filter((r): r is RefContato => r !== null);
          void contatosState.moverNoFunil({ contato: ref, etapaId, ordem }).catch(ctx.falhou);
        },
      }),
    );
  });
  wrap.appendChild(quadro);
  return wrap;
}

// ---------- Editor de etapas ----------

function abrirEtapas(ctx: CtxContatos): void {
  const lista: Array<Partial<EtapaFunil>> = ctx.file.etapas.map((e) => ({ ...e }));
  const usados = new Map<string, number>();
  todosOsContatos(ctx.file).forEach(({ c }) => usados.set(c.etapaId, (usados.get(c.etapaId) ?? 0) + 1));

  void openCustomModal(
    'Etapas do funil',
    ({ corpo, rodape, fechar }) => {
      const erro = el('p', 'md-erro');
      erro.hidden = true;
      const linhas = el('div', 'ct-etapas');
      const desenhar = (): void => {
        linhas.replaceChildren();
        lista.forEach((e, i) => {
          const linha = el('div', 'ct-etapa-linha');
          const cor = el('select', 'md-input ct-etapa-cor');
          cor.setAttribute('aria-label', 'Cor');
          CORES_ETAPA.forEach((c) => {
            const o = Object.assign(el('option'), { value: c, textContent: '●' });
            o.style.color = c;
            cor.appendChild(o);
          });
          cor.value = e.cor ?? CORES_ETAPA[0];
          cor.style.color = cor.value;
          cor.addEventListener('change', () => {
            e.cor = cor.value;
            cor.style.color = cor.value;
          });
          const nome = el('input', 'md-input');
          nome.value = e.nome ?? '';
          nome.placeholder = 'Nome da etapa';
          nome.setAttribute('aria-label', 'Nome da etapa');
          nome.addEventListener('input', () => (e.nome = nome.value));
          const tipo = el('select', 'md-input ct-etapa-tipo');
          tipo.setAttribute('aria-label', 'Tipo');
          TIPOS_ETAPA.forEach((t) => {
            const o = Object.assign(el('option'), { value: t.id, textContent: t.rotulo });
            o.title = t.dica;
            tipo.appendChild(o);
          });
          tipo.value = e.tipo ?? 'aberta';
          tipo.addEventListener('change', () => (e.tipo = tipo.value as TipoEtapa));
          const mover = (delta: number): void => {
            const j = i + delta;
            if (j < 0 || j >= lista.length) return;
            [lista[i], lista[j]] = [lista[j]!, lista[i]!];
            desenhar();
          };
          const botao = (icone: string, titulo: string, acao: () => void, desabilitado = false): HTMLButtonElement => {
            const b = el('button', 'ct-icone-btn');
            b.type = 'button';
            b.title = titulo;
            b.setAttribute('aria-label', titulo);
            b.innerHTML = svg(icone, 14, 2);
            b.disabled = desabilitado;
            b.addEventListener('click', acao);
            return b;
          };
          const n = e.id ? (usados.get(e.id) ?? 0) : 0;
          linha.append(
            cor,
            nome,
            tipo,
            el('span', 'ct-etapa-uso', n ? `${n}` : ''),
            botao('<path d="m18 15-6-6-6 6"/>', 'Subir', () => mover(-1), i === 0),
            botao('<path d="m6 9 6 6 6-6"/>', 'Descer', () => mover(1), i === lista.length - 1),
            botao(ICONES_CONTATO.lixeira, n ? `Excluir (os ${n} contatos vão para a primeira etapa)` : 'Excluir', () => {
              lista.splice(i, 1);
              desenhar();
            }, lista.length <= 1),
          );
          linhas.appendChild(linha);
        });
      };
      desenhar();
      const nova = buildBotao('Nova etapa', { icone: ICONES_CONTATO.mais, variante: 'secundario' });
      nova.addEventListener('click', () => {
        lista.push({ nome: '', cor: CORES_ETAPA[lista.length % CORES_ETAPA.length], tipo: 'aberta' });
        desenhar();
        [...linhas.querySelectorAll<HTMLInputElement>('input')].pop()?.focus();
      });
      corpo.append(
        el('p', 'md-mensagem', 'A ordem aqui é a ordem das colunas. "Ganha" conta como cliente; "Perdida" fecha o relacionamento. Quem estiver numa etapa excluída vai para a primeira.'),
        erro,
        linhas,
        nova,
      );

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const salvar = buildBotao('Salvar etapas', { variante: 'primario', icone: '<polyline points="20 6 9 17 4 12"/>' });
      salvar.addEventListener('click', () => {
        if (lista.some((e) => !(e.nome ?? '').trim())) {
          erro.hidden = false;
          erro.textContent = 'Toda etapa precisa de um nome.';
          return;
        }
        const removidas = ctx.file.etapas.filter((e) => !lista.some((x) => x.id === e.id)).reduce((s, e) => s + (usados.get(e.id) ?? 0), 0);
        const seguir = removidas
          ? openConfirmModal({ title: 'Excluir etapas com contatos', message: `${removidas} contato(s) estão em etapas que você excluiu e vão para "${lista[0]?.nome || 'a primeira etapa'}".`, confirmText: 'Continuar', danger: false })
          : Promise.resolve(true);
        void seguir.then((ok) => {
          if (!ok) return;
          contatosState
            .salvarEtapas(lista.map((e) => ({ ...e, nome: (e.nome ?? '').trim() })))
            .then(fechar)
            .catch((e: unknown) => {
              erro.hidden = false;
              erro.textContent = e instanceof Error ? e.message : String(e);
            });
        });
      });
      rodape.append(cancelar, salvar);
    },
    { icone: ICONES_CONTATO.funil, largura: 600, subtitulo: 'As colunas do funil' },
  );
}
