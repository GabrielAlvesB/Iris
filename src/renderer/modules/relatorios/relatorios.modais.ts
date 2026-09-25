import { TIPOS_POSTAGEM, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import {
  AREAS_IMAGEM,
  STATUS_MARCACAO,
  TIPOS_MARCACAO,
  formatarTempo,
  parseTempo,
  type AreaImagem,
  type ItemRelatorio,
  type MarcacaoImagem,
  type MarcacaoVideo,
  type RelatoriosFile,
  type StatusMarcacao,
  type TipoMarcacao,
} from '../../../shared/types/relatorios.types.js';
import { buildSecaoModal, openCustomModal } from '../../ui/modal.js';
import { campo, erroInline, grade2, input, pilulas, select, textarea } from '../../ui/campos.js';
import { buildBotao, buildBusca, buildSegmentado, buildVazio } from '../../ui/pagina.js';
import { formatarData, ICONES_POSTAGEM } from '../postagens/postagens.ui.js';
import { alternaveis } from './relatorios.blocos.js';
import { catalogoAtual } from './relatorios.metricas.js';
import { ADAPTADORES, type OpcaoPostagem } from './relatorios.tipos.js';
import * as relatoriosState from './relatorios.state.js';

export const ICONES_RELATORIO = {
  relatorio: ICONES_POSTAGEM.relatorio,
  marcacao: '<path d="M12 22s8-6.4 8-12a8 8 0 0 0-16 0c0 5.6 8 12 8 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  categorias: ICONES_POSTAGEM.tag,
  adicionar: ICONES_POSTAGEM.mais,
} as const;

function novoId(): string {
  return crypto.randomUUID();
}

// ---------- Novo relatório ----------

export function abrirNovoRelatorio(aoCriar: (relatorioId: string) => void): void {
  void openCustomModal(
    'Novo relatório',
    ({ corpo, rodape, fechar }) => {
      const titulo = input('text', '', 'Ex.: Análise de outubro — Hora de Codar');
      titulo.classList.add('is-grande');
      corpo.appendChild(campo('Título', titulo));

      let tagIds: string[] = [];
      const tags = catalogoAtual()?.tags ?? [];
      if (tags.length) {
        const empresa = buildSecaoModal('Empresa', 'As tags da empresa. As postagens e as métricas do relatório já vêm filtradas por elas.');
        const desenharTags = (): void => {
          empresa.conteudo.replaceChildren(
            alternaveis(tags.map((t) => ({ id: t.id, rotulo: t.nome })), tagIds, (v) => {
              tagIds = v;
              desenharTags();
            }),
          );
        };
        desenharTags();
        corpo.appendChild(empresa.secao);
      }

      const contexto = buildSecaoModal('Contexto', 'Para quem e por quê: cliente, campanha, objetivo. Opcional.');
      const textoContexto = textarea('', 'Ex.: Revisão mensal dos vídeos curtos para o cliente X', 3);
      contexto.conteudo.appendChild(textoContexto);
      corpo.appendChild(contexto.secao);

      const periodo = buildSecaoModal('Período', 'Opcional. Ajuda a achar as postagens na hora de adicionar.');
      const inicio = input('date', '');
      const fim = input('date', '');
      periodo.conteudo.appendChild(grade2(campo('De', inicio), campo('Até', fim)));
      corpo.appendChild(periodo.secao);

      const criar = async (): Promise<void> => {
        if (!titulo.value.trim()) {
          titulo.focus();
          erroInline(corpo, 'Dê um título ao relatório.');
          return;
        }
        try {
          const antes = new Set((relatoriosState.getCurrentState()?.relatorios ?? []).map((r) => r.id));
          const file = await relatoriosState.criarRelatorio({
            titulo: titulo.value,
            tagIds,
            contexto: textoContexto.value,
            periodoInicio: inicio.value || undefined,
            periodoFim: fim.value || undefined,
          });
          fechar();
          const novo = file.relatorios.find((r) => !antes.has(r.id));
          if (novo) aoCriar(novo.id);
        } catch (erro) {
          erroInline(corpo, erro);
        }
      };
      titulo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void criar();
      });

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      const criarBtn = buildBotao('Criar relatório', { icone: ICONES_RELATORIO.adicionar, variante: 'primario' });
      criarBtn.addEventListener('click', () => void criar());
      rodape.append(cancelar, criarBtn);
      titulo.focus();
    },
    { largura: 560, icone: ICONES_RELATORIO.relatorio, subtitulo: 'Depois você adiciona seções, postagens, marcações e anotações.' },
  );
}

// ---------- Adicionar postagens ----------

export interface EscolhaPostagem {
  tipo: TipoPostagem;
  id: string;
}

/**
 * Seletor de postagens de qualquer tipo, com abas por tipo, busca e o recorte
 * do período do relatório. As que já estão na seção vêm marcadas e travadas.
 */
export function abrirAdicionarPostagens(
  opcoes: { jaNaSecao: EscolhaPostagem[]; tagIds: string[]; periodoInicio?: string; periodoFim?: string; titulo: string },
  aoConfirmar: (escolhas: EscolhaPostagem[]) => void,
): void {
  let tipo: TipoPostagem = 'video';
  let termo = '';
  let soPeriodo = Boolean(opcoes.periodoInicio || opcoes.periodoFim);
  // Já abre na empresa do relatório; desmarcar todas = sem filtro de tag.
  const catalogoTags = catalogoAtual()?.tags ?? [];
  let tagsFiltro = opcoes.tagIds.filter((id) => catalogoTags.some((t) => t.id === id));
  let mostrarArquivadas = false;
  const escolhidas = new Map<string, EscolhaPostagem>();
  const chave = (t: TipoPostagem, id: string): string => `${t}:${id}`;
  const jaEsta = new Set(opcoes.jaNaSecao.map((e) => chave(e.tipo, e.id)));

  void openCustomModal(
    'Adicionar postagens',
    ({ corpo, rodape, fechar }) => {
      const contador = document.createElement('span');
      contador.className = 'md-rodape-info';
      const adicionar = buildBotao('Adicionar', { icone: ICONES_RELATORIO.adicionar, variante: 'primario' });

      const atualizarRodape = (): void => {
        const n = escolhidas.size;
        contador.textContent = n ? `${n} selecionada${n > 1 ? 's' : ''}` : 'Marque as postagens que entram nesta seção';
        adicionar.disabled = n === 0;
        const span = adicionar.querySelector('span');
        if (span) span.textContent = n ? `Adicionar ${n}` : 'Adicionar';
      };

      const noPeriodo = (p: OpcaoPostagem): boolean => {
        if (!soPeriodo) return true;
        if (!p.dataAgendada) return false;
        if (opcoes.periodoInicio && p.dataAgendada < opcoes.periodoInicio) return false;
        if (opcoes.periodoFim && p.dataAgendada > opcoes.periodoFim) return false;
        return true;
      };

      const listaEl = document.createElement('div');
      listaEl.className = 'rel-seletor-lista';

      const comTag = (p: OpcaoPostagem): boolean => !tagsFiltro.length || p.tagIds.some((id) => tagsFiltro.includes(id));

      const selecionarFiltradas = buildBotao('Marcar todas as filtradas', { variante: 'secundario' });
      selecionarFiltradas.classList.add('is-mini');
      let filtradasAtuais: OpcaoPostagem[] = [];
      selecionarFiltradas.addEventListener('click', () => {
        filtradasAtuais.forEach((p) => {
          const k = chave(tipo, p.id);
          if (!jaEsta.has(k)) escolhidas.set(k, { tipo, id: p.id });
        });
        desenharLista();
        atualizarRodape();
      });

      const desenharLista = (): void => {
        const adaptador = ADAPTADORES[tipo];
        const t = termo.trim().toLocaleLowerCase('pt-BR');
        const itens = adaptador
          .listar()
          .filter((p) => mostrarArquivadas || !p.arquivada)
          .filter(noPeriodo)
          .filter(comTag)
          .filter((p) => !t || p.titulo.toLocaleLowerCase('pt-BR').includes(t))
          .sort((a, b) => (b.dataAgendada ?? '').localeCompare(a.dataAgendada ?? '') || b.seq - a.seq);
        filtradasAtuais = itens;
        selecionarFiltradas.disabled = !itens.some((p) => !jaEsta.has(chave(tipo, p.id)));
        listaEl.innerHTML = '';
        if (!itens.length) {
          const motivos = [
            soPeriodo ? 'desligue "Só do período"' : '',
            tagsFiltro.length ? 'desmarque alguma tag' : '',
          ].filter(Boolean);
          listaEl.appendChild(
            buildVazio(
              adaptador.icone,
              `Nenhuma postagem em ${adaptador.rotulo}`,
              motivos.length ? `Nada com esses filtros. Para ver mais, ${motivos.join(' ou ')}.` : 'Crie postagens na área Postagens.',
            ),
          );
          return;
        }
        itens.forEach((p) => {
          const k = chave(tipo, p.id);
          const bloqueada = jaEsta.has(k);
          const linha = document.createElement('label');
          linha.className = 'rel-seletor-item';
          linha.classList.toggle('is-bloqueada', bloqueada);
          const caixa = document.createElement('input');
          caixa.type = 'checkbox';
          caixa.checked = bloqueada || escolhidas.has(k);
          caixa.disabled = bloqueada;
          caixa.addEventListener('change', () => {
            if (caixa.checked) escolhidas.set(k, { tipo, id: p.id });
            else escolhidas.delete(k);
            atualizarRodape();
          });
          const textos = document.createElement('span');
          textos.className = 'rel-seletor-textos';
          const titulo = document.createElement('strong');
          titulo.textContent = p.titulo;
          const meta = document.createElement('small');
          meta.textContent = [p.etapa, p.dataAgendada ? formatarData(p.dataAgendada) : 'sem data', bloqueada ? 'já nesta seção' : '']
            .filter(Boolean)
            .join(' · ');
          textos.append(titulo, meta);
          linha.append(caixa, textos);
          listaEl.appendChild(linha);
        });
      };

      const topo = document.createElement('div');
      topo.className = 'rel-seletor-topo';
      const abas = buildSegmentado<TipoPostagem>(
        TIPOS_POSTAGEM.map((t) => ({ value: t.id, label: t.rotulo })),
        tipo,
        (v) => {
          tipo = v;
          desenharLista();
        },
      );
      const busca = buildBusca('', 'Buscar por título ou #número', (v) => {
        termo = v;
        desenharLista();
      });
      topo.append(abas, busca);
      corpo.appendChild(topo);

      const filtros = document.createElement('div');
      filtros.className = 'md-pilulas';
      const alternar = (rotulo: string, ativo: () => boolean, aoMudar: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'md-pilula';
        const marcar = (): void => {
          b.classList.toggle('is-ativa', ativo());
          b.setAttribute('aria-pressed', String(ativo()));
        };
        b.textContent = rotulo;
        marcar();
        b.addEventListener('click', () => {
          aoMudar();
          marcar();
          desenharLista();
        });
        return b;
      };
      if (opcoes.periodoInicio || opcoes.periodoFim) filtros.appendChild(alternar('Só do período do relatório', () => soPeriodo, () => (soPeriodo = !soPeriodo)));
      filtros.appendChild(alternar('Mostrar arquivadas', () => mostrarArquivadas, () => (mostrarArquivadas = !mostrarArquivadas)));
      corpo.appendChild(filtros);

      if (catalogoTags.length) {
        const tagsEl = document.createElement('div');
        tagsEl.className = 'md-pilulas rel-seletor-tags';
        tagsEl.setAttribute('role', 'group');
        tagsEl.setAttribute('aria-label', 'Filtrar por tag');
        catalogoTags.forEach((tag) => {
          tagsEl.appendChild(
            alternar(
              `#${tag.nome}`,
              () => tagsFiltro.includes(tag.id),
              () => (tagsFiltro = tagsFiltro.includes(tag.id) ? tagsFiltro.filter((id) => id !== tag.id) : [...tagsFiltro, tag.id]),
            ),
          );
        });
        corpo.appendChild(campo('Tags', tagsEl, 'Mostra as postagens com qualquer uma das tags marcadas. Nenhuma marcada = todas.'));
      }

      const acoesLista = document.createElement('div');
      acoesLista.className = 'rel-seletor-acoes';
      acoesLista.appendChild(selecionarFiltradas);
      corpo.appendChild(acoesLista);
      corpo.appendChild(listaEl);
      desenharLista();

      const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
      cancelar.addEventListener('click', fechar);
      adicionar.addEventListener('click', () => {
        aoConfirmar([...escolhidas.values()]);
        fechar();
      });
      rodape.append(contador, cancelar, adicionar);
      atualizarRodape();
    },
    { largura: 640, icone: ICONES_RELATORIO.adicionar, subtitulo: `Na seção "${opcoes.titulo}". Vídeos e imagens podem ir juntos.` },
  );
}

// ---------- Marcação ----------

function camposComuns(
  corpo: HTMLElement,
  base: { tipo: TipoMarcacao; status: StatusMarcacao; categoria: string; comentario: string; observacao: string },
  categorias: string[],
): { valores: () => typeof base; comentario: HTMLTextAreaElement } {
  let tipo = base.tipo;
  let status = base.status;

  const classificacao = buildSecaoModal('Classificação');
  classificacao.conteudo.appendChild(
    campo('Tipo', pilulas<TipoMarcacao>(TIPOS_MARCACAO.map((t) => ({ id: t.id, rotulo: t.rotulo, classe: `rel-tipo is-${t.id}` })), () => tipo, (v) => (tipo = v))),
  );
  const categoria = select(
    base.categoria,
    [{ value: '', label: 'Sem categoria' }, ...[...new Set([...categorias, base.categoria].filter(Boolean))].map((c) => ({ value: c, label: c }))],
  );
  classificacao.conteudo.appendChild(campo('Categoria', categoria, 'As categorias se editam em "Categorias", no topo de Relatórios.'));
  classificacao.conteudo.appendChild(
    campo('Status', pilulas<StatusMarcacao>(STATUS_MARCACAO.map((s) => ({ id: s.id, rotulo: s.rotulo })), () => status, (v) => (status = v))),
  );
  corpo.appendChild(classificacao.secao);

  const textos = buildSecaoModal('Anotação');
  const comentario = textarea(base.comentario, 'O que foi visto: o que funciona, o que ajustar…', 4);
  const observacao = textarea(base.observacao, 'Sugestão, referência, próximo passo…', 2);
  textos.conteudo.append(campo('Comentário', comentario), campo('Observação', observacao));
  corpo.appendChild(textos.secao);

  return {
    comentario,
    valores: () => ({ tipo, status, categoria: categoria.value, comentario: comentario.value, observacao: observacao.value }),
  };
}

function rodapeMarcacao(rodape: HTMLElement, fechar: () => void, salvar: () => void, novo: boolean): void {
  const cancelar = buildBotao('Cancelar', { variante: 'fantasma' });
  cancelar.addEventListener('click', fechar);
  const ok = buildBotao(novo ? 'Adicionar marcação' : 'Salvar marcação', { variante: 'primario' });
  ok.addEventListener('click', salvar);
  rodape.append(cancelar, ok);
}

function editarMarcacaoVideo(existente: MarcacaoVideo | null, categorias: string[], titulo: string, aoSalvar: (m: MarcacaoVideo) => void): void {
  void openCustomModal(
    existente ? 'Editar marcação' : 'Nova marcação',
    ({ corpo, rodape, fechar }) => {
      const tempo = buildSecaoModal('Tempo no vídeo', 'Minutos:segundos (1:05) ou horas:minutos:segundos. O fim é opcional, para um trecho.');
      const inicio = input('text', existente ? formatarTempo(existente.tempo) : '', '0:00');
      const fim = input('text', existente?.tempoFim !== undefined ? formatarTempo(existente.tempoFim) : '', 'opcional');
      inicio.inputMode = 'numeric';
      fim.inputMode = 'numeric';
      tempo.conteudo.appendChild(grade2(campo('Início', inicio), campo('Fim', fim)));
      corpo.appendChild(tempo.secao);

      const comuns = camposComuns(
        corpo,
        existente ?? { tipo: 'ajuste', status: 'aberta', categoria: '', comentario: '', observacao: '' },
        categorias,
      );

      const salvar = (): void => {
        const t = parseTempo(inicio.value);
        const tf = fim.value.trim() ? parseTempo(fim.value) : undefined;
        if (t === undefined) {
          inicio.focus();
          erroInline(corpo, 'Informe o tempo como 1:05 ou 0:01:05.');
          return;
        }
        if (fim.value.trim() && (tf === undefined || tf <= t)) {
          fim.focus();
          erroInline(corpo, 'O fim precisa ser depois do início (ou ficar vazio).');
          return;
        }
        aoSalvar({ id: existente?.id ?? novoId(), tempo: t, tempoFim: tf, ...comuns.valores() });
        fechar();
      };
      [inicio, fim].forEach((c) =>
        c.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') salvar();
        }),
      );
      rodapeMarcacao(rodape, fechar, salvar, !existente);
      inicio.focus();
    },
    { largura: 600, icone: ICONES_RELATORIO.marcacao, subtitulo: titulo },
  );
}

function editarMarcacaoImagem(
  existente: MarcacaoImagem | null,
  categorias: string[],
  titulo: string,
  pecas: number | undefined,
  aoSalvar: (m: MarcacaoImagem) => void,
): void {
  void openCustomModal(
    existente ? 'Editar marcação' : 'Nova marcação',
    ({ corpo, rodape, fechar }) => {
      let area: AreaImagem = existente?.area ?? 'geral';
      const onde = buildSecaoModal('Onde na arte', pecas ? `Carrossel com ${pecas} peças: diga qual, ou deixe em branco para a publicação inteira.` : undefined);
      onde.conteudo.appendChild(campo('Área', pilulas<AreaImagem>(AREAS_IMAGEM.map((a) => ({ id: a.id, rotulo: a.rotulo })), () => area, (v) => (area = v))));
      const slide = input('number', existente?.slide ? String(existente.slide) : '', pecas ? `1 a ${pecas}` : 'opcional');
      slide.min = '1';
      if (pecas) slide.max = String(pecas);
      onde.conteudo.appendChild(campo('Peça do carrossel', slide));
      corpo.appendChild(onde.secao);

      const comuns = camposComuns(
        corpo,
        existente ?? { tipo: 'ajuste', status: 'aberta', categoria: '', comentario: '', observacao: '' },
        categorias,
      );

      const salvar = (): void => {
        const n = slide.value.trim() ? Number(slide.value) : undefined;
        if (n !== undefined && (!Number.isInteger(n) || n < 1 || (pecas !== undefined && n > pecas))) {
          slide.focus();
          erroInline(corpo, pecas ? `A peça vai de 1 a ${pecas}.` : 'Use um número inteiro a partir de 1.');
          return;
        }
        aoSalvar({ id: existente?.id ?? novoId(), slide: n, area, ...comuns.valores() });
        fechar();
      };
      rodapeMarcacao(rodape, fechar, salvar, !existente);
      comuns.comentario.focus();
    },
    { largura: 620, icone: ICONES_RELATORIO.marcacao, subtitulo: titulo },
  );
}

/** Abre o editor de marcação certo para o tipo do item; grava no próprio item. */
export function abrirMarcacao(
  item: ItemRelatorio,
  marcacaoId: string | null,
  categorias: RelatoriosFile['categorias'],
  aoMudar: () => void,
): void {
  const titulo = `${ADAPTADORES[item.tipo].singular} · ${item.snapshot.titulo}`;
  switch (item.tipo) {
    case 'video': {
      const existente = item.marcacoes.find((m) => m.id === marcacaoId) ?? null;
      editarMarcacaoVideo(existente, categorias.video, titulo, (m) => {
        item.marcacoes = [...item.marcacoes.filter((x) => x.id !== m.id), m].sort((a, b) => a.tempo - b.tempo);
        aoMudar();
      });
      return;
    }
    case 'imagem': {
      const existente = item.marcacoes.find((m) => m.id === marcacaoId) ?? null;
      const formato = item.snapshot.dados.find((d) => d.nome === 'Formato')?.valor ?? '';
      const pecas = Number(/\((\d+) peças\)/.exec(formato)?.[1]) || undefined;
      editarMarcacaoImagem(existente, categorias.imagem, titulo, pecas, (m) => {
        const i = item.marcacoes.findIndex((x) => x.id === m.id);
        if (i >= 0) item.marcacoes[i] = m;
        else item.marcacoes.push(m);
        aoMudar();
      });
      return;
    }
  }
}

// ---------- Categorias ----------

export function abrirCategorias(): void {
  let tipo: TipoPostagem = 'video';
  void openCustomModal(
    'Categorias das marcações',
    ({ corpo, rodape, fechar }) => {
      const desenhar = (): void => {
        const file = relatoriosState.getCurrentState();
        if (!file) return;
        corpo.innerHTML = '';
        corpo.appendChild(
          buildSegmentado<TipoPostagem>(
            TIPOS_POSTAGEM.map((t) => ({ value: t.id, label: `${t.rotulo} · ${file.categorias[t.id].length}` })),
            tipo,
            (v) => {
              tipo = v;
              desenhar();
            },
          ),
        );
        const lista = [...file.categorias[tipo]];
        const salvar = (nova: string[]): void =>
          void relatoriosState
            .salvarCategorias({ tipo, categorias: nova })
            .then(desenhar)
            .catch((e) => erroInline(corpo, e));

        const secao = buildSecaoModal(
          ADAPTADORES[tipo].rotulo,
          'Assuntos para agrupar as marcações (ex.: Gancho, Edição). Renomear aqui não altera marcações já feitas.',
        );
        const itens = document.createElement('div');
        itens.className = 'md-lista';
        lista.forEach((nome, i) => {
          const linha = document.createElement('div');
          linha.className = 'md-item';
          const campoNome = input('text', nome);
          campoNome.setAttribute('aria-label', 'Nome da categoria');
          campoNome.addEventListener('change', () => {
            const copia = [...lista];
            copia[i] = campoNome.value;
            salvar(copia);
          });
          const remover = buildBotao('', { icone: ICONES_POSTAGEM.lixeira, variante: 'fantasma', titulo: 'Remover categoria' });
          remover.classList.add('is-perigo');
          remover.addEventListener('click', () => salvar(lista.filter((_, j) => j !== i)));
          linha.append(campoNome, remover);
          itens.appendChild(linha);
        });
        if (!lista.length) itens.appendChild(Object.assign(document.createElement('p'), { className: 'md-vazio', textContent: 'Nenhuma categoria ainda.' }));
        secao.conteudo.appendChild(itens);

        const form = document.createElement('form');
        form.className = 'md-novo';
        const nova = input('text', '', 'Nova categoria');
        const adicionar = buildBotao('Adicionar', { icone: ICONES_POSTAGEM.mais, variante: 'secundario' });
        adicionar.type = 'submit';
        form.append(nova, adicionar);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (nova.value.trim()) salvar([...lista, nova.value]);
        });
        secao.conteudo.appendChild(form);
        corpo.appendChild(secao.secao);
      };
      desenhar();

      const info = document.createElement('span');
      info.className = 'md-rodape-info';
      info.textContent = 'Alterações salvas automaticamente';
      const pronto = buildBotao('Pronto', { variante: 'primario' });
      pronto.addEventListener('click', fechar);
      rodape.append(info, pronto);
    },
    { largura: 560, icone: ICONES_RELATORIO.categorias, subtitulo: 'Cada tipo de postagem tem as suas.' },
  );
}
