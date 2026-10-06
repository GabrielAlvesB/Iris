import { FASES_POSTAGEM, PRIORIDADES, TIPOS_POSTAGEM, isTipoPostagem, type Prioridade, type TipoPostagem } from '../../../shared/types/postagens.types.js';
import { normalizar } from '../../../shared/types/videos.conversao.js';
import { escalaDaPostagem } from '../../../shared/types/score.types.js';
import { consumirPedidoPostagem, onPostagemSolicitada, type PedidoPostagem } from '../../core/navegacao.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { openAvisoModal, mensagemDeErro } from '../../ui/modal.js';
import {
  buildBotao,
  buildBusca,
  buildCabecalho,
  buildIndicadores,
  buildSegmentado,
  buildVazio,
  focarBusca,
  svg,
} from '../../ui/pagina.js';
import { buildCalendario } from './postagens.calendario.js';
import { faseDe, rotuloEtapa, type ControleTela, type Fonte, type Postagem } from './postagens.fonte.js';
import { buildMetricas, dataParaMetricas } from './postagens.metricas.js';
import { abrirExibicao, abrirTagsERedes } from './postagens.modais.js';
import { TIPOS } from './postagens.tipos.js';
import {
  ICONES_POSTAGEM,
  atrasado,
  buildPrioridade,
  buildRedeBadge,
  buildScore,
  buildSeloAgenda,
  buildTagChip,
  ordenarTags,
  encerrado,
  formatarDataCurta,
  formatarData,
  formatarDataLonga,
  hojeIso,
  inicioDaSemana,
  redesDe,
  somarDias,
  tagsDe,
  tituloExibido,
} from './postagens.ui.js';

/**
 * Tela de Postagens: um seletor de tipo (Vídeos, Imagens…) e, para o tipo
 * escolhido, as mesmas visões — pipeline, calendário, agenda e métricas. Tudo
 * aqui fala com a Fonte do tipo (postagens.fonte.ts); nada é específico de
 * vídeo ou imagem.
 */

type Modo = 'pipeline' | 'calendario' | 'agenda' | 'metricas';
/** '' = qualquer; 'com' = qualquer prioridade marcada. */
type FiltroPrioridade = '' | 'com' | Prioridade;

interface Filtros {
  busca: string;
  tagId: string;
  redeId: string;
  prioridade: FiltroPrioridade;
}

const FILTROS_VAZIOS: Filtros = { busca: '', tagId: '', redeId: '', prioridade: '' };
const CHAVE_TIPO = 'iris.postagens.tipo';
const CHAVE_RECOLHIDAS = 'iris.postagens.fasesRecolhidas';
const CHEVRON = '<polyline points="9 6 15 12 9 18"/>';

let tipo: TipoPostagem = lerTipoLembrado();
let modo: Modo = 'pipeline';
let mostrarArquivados = false;
let filtros: Filtros = { ...FILTROS_VAZIOS };
let containerAtual: HTMLElement | null = null;
let sortables: InstanceType<typeof Sortable>[] = [];
/** Scroll horizontal da pipeline, preservado entre redesenhos. */
let scrollPipeline = 0;
/**
 * Rolagem vertical de cada coluna ("tipo:etapa"). Toda mudança salva redesenha
 * a pipeline; sem isto a coluna voltava ao topo e o card em que se estava
 * mexendo sumia de vista.
 */
const rolagemColunas = new Map<string, number>();
/** Último card aberto por tipo: fica marcado depois que o painel fecha. */
const ultimoAberto = new Map<TipoPostagem, string>();
/** Onde o card em foco estava no último desenho — para segui-lo se ele mudar de etapa. */
let posicaoFoco: { tipo: TipoPostagem; id: string; status: string; indice: number } | null = null;
let pararDePedir: (() => void) | null = null;
/** Fases da pipeline recolhidas a uma faixa estreita; vale para todos os tipos. */
let fasesRecolhidas = lerRecolhidas();

/**
 * O main publica sozinho as agendadas que chegaram no horário; aqui só relemos
 * o arquivo do tipo, e o onStateChange redesenha.
 */
const push = createPushBinding([
  () =>
    window.irisAPI.events.on('postagens:mudou', ({ tipo: mudou }) => {
      void TIPOS[mudou].carregar().catch(falhou);
    }),
]);

function lerTipoLembrado(): TipoPostagem {
  try {
    const salvo = localStorage.getItem(CHAVE_TIPO);
    return isTipoPostagem(salvo) ? salvo : 'video';
  } catch {
    return 'video';
  }
}

function lembrarTipo(t: TipoPostagem): void {
  try {
    localStorage.setItem(CHAVE_TIPO, t);
  } catch {
    // Sem armazenamento local, a tela só volta a abrir em Vídeos.
  }
}

function lerRecolhidas(): Set<string> {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE_RECOLHIDAS) ?? '[]');
    return new Set(Array.isArray(salvo) ? salvo.filter((f): f is string => typeof f === 'string') : []);
  } catch {
    return new Set();
  }
}

function alternarFase(fase: string): void {
  if (fasesRecolhidas.has(fase)) fasesRecolhidas.delete(fase);
  else fasesRecolhidas.add(fase);
  try {
    localStorage.setItem(CHAVE_RECOLHIDAS, JSON.stringify([...fasesRecolhidas]));
  } catch {
    // Sem armazenamento local, a escolha só dura até fechar a tela.
  }
  redesenhar();
}

function destruirSortables(): void {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

function redesenhar(): void {
  if (!containerAtual) return;
  render(containerAtual);
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

/** Abre o painel e passa a marcar o card como o último aberto. */
function abrirItem(fonte: Fonte, id: string): void {
  ultimoAberto.set(fonte.tipo, id);
  document.querySelectorAll('.vd-card.is-recente').forEach((el) => el.classList.remove('is-recente'));
  const card = document.querySelector<HTMLElement>(`.vd-card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    card.classList.add('is-recente');
    lembrarPosicao(fonte.tipo, card);
  }
  fonte.abrir(id);
}

function lembrarPosicao(t: TipoPostagem, card: HTMLElement): void {
  const lista = card.parentElement;
  const id = card.dataset.id;
  if (!lista || !id) return;
  posicaoFoco = { tipo: t, id, status: lista.dataset.status ?? '', indice: Array.prototype.indexOf.call(lista.children, card) };
}

/**
 * Depois do redesenho: devolve a rolagem de cada coluna e, se o card em foco
 * mudou de lugar (data marcada o levou para Agendado, publicado vai ao topo…),
 * rola até ele e o faz piscar, para não se perder de vista.
 */
function acompanharFoco(fonte: Fonte, pipeline: HTMLElement): void {
  pipeline.querySelectorAll<HTMLElement>('.vd-lista').forEach((lista) => {
    const chave = `${fonte.tipo}:${lista.dataset.status}`;
    lista.scrollTop = rolagemColunas.get(chave) ?? 0;
    lista.addEventListener('scroll', () => rolagemColunas.set(chave, lista.scrollTop), { passive: true });
  });
  const id = fonte.painelAbertoPara() ?? ultimoAberto.get(fonte.tipo);
  const card = id ? pipeline.querySelector<HTMLElement>(`.vd-card[data-id="${CSS.escape(id)}"]`) : null;
  if (!card) return;
  const antes = posicaoFoco;
  lembrarPosicao(fonte.tipo, card);
  const agora = posicaoFoco;
  if (!antes || !agora || antes.tipo !== agora.tipo || antes.id !== agora.id) return;
  if (antes.status === agora.status && antes.indice === agora.indice) return;
  card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  if (antes.status !== agora.status) {
    card.classList.remove('is-chegou');
    void card.offsetWidth;
    card.classList.add('is-chegou');
  }
}

function trocarTipo(novo: TipoPostagem): void {
  if (novo === tipo) return;
  TIPOS[tipo].fecharPainel();
  tipo = novo;
  lembrarTipo(novo);
  filtros = { ...FILTROS_VAZIOS };
  mostrarArquivados = false;
  scrollPipeline = 0;
  redesenhar();
}

function atenderPedido(pedido: PedidoPostagem): void {
  trocarTipo(pedido.tipo);
  if (pedido.arquivados) mostrarArquivados = true;
  if (pedido.id) {
    modo = 'pipeline';
    redesenhar();
    const fonte = TIPOS[pedido.tipo].fonte();
    if (fonte?.itens.some((i) => i.id === pedido.id)) abrirItem(fonte, pedido.id);
  }
}

// ---------- Ciclo de vida (chamado pelo app.ts) ----------

export function montar(viewRoot: HTMLElement): void {
  containerAtual = viewRoot;
  const aoMudar = (): void => {
    redesenhar();
    TIPOS_POSTAGEM.forEach((t) => TIPOS[t.id].sincronizarPainel());
  };
  TIPOS_POSTAGEM.forEach((t) => TIPOS[t.id].ouvir(aoMudar));
  pararDePedir = onPostagemSolicitada(atenderPedido);
  push.attach();
  // O catálogo (tags, redes, exibição) está no arquivo de vídeos: carrega antes dos outros tipos.
  void TIPOS.video
    .carregar()
    .then(() => Promise.all(TIPOS_POSTAGEM.filter((t) => t.id !== 'video').map((t) => TIPOS[t.id].carregar())))
    .then(() => {
      const pedido = consumirPedidoPostagem();
      if (pedido) atenderPedido(pedido);
    })
    .catch(falhou);
}

export function destroy(): void {
  destruirSortables();
  TIPOS_POSTAGEM.forEach((t) => {
    TIPOS[t.id].fecharPainel();
    TIPOS[t.id].parar();
  });
  pararDePedir?.();
  pararDePedir = null;
  push.detach();
  containerAtual = null;
}

// ---------- Filtros ----------

function passaFiltros(fonte: Fonte, item: Postagem): boolean {
  if (filtros.tagId && !item.tagIds.includes(filtros.tagId)) return false;
  if (filtros.redeId && !item.redeIds.includes(filtros.redeId)) return false;
  if (filtros.prioridade === 'com' && !item.prioridade) return false;
  if (filtros.prioridade && filtros.prioridade !== 'com' && item.prioridade !== filtros.prioridade) return false;
  if (fonte.filtroExtra && !fonte.filtroExtra.passa(item)) return false;
  const termo = normalizar(filtros.busca);
  if (!termo) return true;
  const alvo = normalizar(
    [
      item.titulo,
      item.notas,
      fonte.textoBusca(item),
      ...item.camposExtras.map((c) => `${c.nome} ${c.valor}`),
      ...tagsDe(fonte.catalogo, item).map((t) => t.nome),
    ].join(' '),
  );
  return alvo.includes(termo);
}

function filtrosAtivos(fonte: Fonte): boolean {
  return Boolean(filtros.busca || filtros.tagId || filtros.redeId || filtros.prioridade || fonte.filtroExtra?.ativo());
}

function buildSelect(
  valor: string,
  opcoes: Array<{ value: string; label: string }>,
  rotulo: string,
  aoMudar: (v: string) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'vd-select';
  select.setAttribute('aria-label', rotulo);
  opcoes.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  });
  select.value = valor;
  select.classList.toggle('is-ativo', valor !== '' && valor !== 'todos');
  select.addEventListener('change', () => aoMudar(select.value));
  return select;
}

function buildBarra(fonte: Fonte): HTMLElement {
  const barra = document.createElement('div');
  barra.className = 'pg-barra vd-barra';

  barra.appendChild(
    buildSegmentado<Modo>(
      [
        { value: 'pipeline', label: 'Pipeline' },
        { value: 'calendario', label: 'Calendário' },
        { value: 'agenda', label: 'Agenda' },
        { value: 'metricas', label: 'Métricas' },
      ],
      modo,
      (v) => {
        modo = v;
        redesenhar();
      },
    ),
  );

  barra.appendChild(
    buildBusca(filtros.busca, 'Buscar título, #hashtag, #12…', (v) => {
      filtros.busca = v;
      redesenhar();
      focarBusca(containerAtual);
    }),
  );

  const { tags, redes } = fonte.catalogo;
  barra.appendChild(
    buildSelect(filtros.tagId, [{ value: '', label: 'Todas as tags' }, ...ordenarTags(tags).map((t) => ({ value: t.id, label: t.empresa ? `${t.nome} (empresa)` : t.nome }))], 'Filtrar por empresa ou tag', (v) => {
      filtros.tagId = v;
      redesenhar();
    }),
  );
  barra.appendChild(
    buildSelect(filtros.redeId, [{ value: '', label: 'Todas as redes' }, ...redes.map((r) => ({ value: r.id, label: r.nome }))], 'Filtrar por rede', (v) => {
      filtros.redeId = v;
      redesenhar();
    }),
  );
  barra.appendChild(
    buildSelect(
      filtros.prioridade,
      [
        { value: '', label: 'Qualquer prioridade' },
        { value: 'com', label: 'Só prioritários' },
        ...PRIORIDADES.map((p) => ({ value: p.id, label: `Prioridade ${p.rotulo.toLowerCase()}` })),
      ],
      'Filtrar por prioridade',
      (v) => {
        filtros.prioridade = v as FiltroPrioridade;
        redesenhar();
      },
    ),
  );
  fonte.filtroExtra?.controles(redesenhar).forEach((el) => barra.appendChild(el));

  if (filtrosAtivos(fonte)) {
    const limpar = buildBotao('Limpar', { variante: 'fantasma' });
    limpar.addEventListener('click', () => {
      filtros = { ...FILTROS_VAZIOS };
      fonte.filtroExtra?.limpar();
      redesenhar();
    });
    barra.appendChild(limpar);
  }

  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  barra.appendChild(espaco);

  const arquivados = fonte.itens.filter((v) => v.status === 'arquivado').length;
  if (modo === 'pipeline') {
    const toggle = buildBotao(`Arquivados${arquivados ? ` (${arquivados})` : ''}`, { icone: ICONES_POSTAGEM.arquivo, variante: 'fantasma' });
    toggle.setAttribute('aria-pressed', String(mostrarArquivados));
    toggle.classList.toggle('is-ligado', mostrarArquivados);
    toggle.addEventListener('click', () => {
      mostrarArquivados = !mostrarArquivados;
      redesenhar();
    });
    barra.appendChild(toggle);
  }

  return barra;
}

// ---------- Indicadores ----------

function buildResumo(fonte: Fonte): HTMLElement {
  const hoje = hojeIso();
  const fimSemana = somarDias(hoje, 7);
  const itens = fonte.itens;
  const etapasDa = (fase: string): string[] => fonte.etapas.filter((s) => s.fase === fase).map((s) => s.id);
  const contar = (status: string[]): number => itens.filter((v) => status.includes(v.status)).length;
  const descrever = (status: string[]): string => status.map((s) => rotuloEtapa(fonte, s).toLowerCase()).join(' e ');
  const pre = etapasDa('pre');
  const producao = etapasDa('producao');
  const agendadosSemana = itens.filter(
    (v) => v.status === 'agendado' && v.dataAgendada && v.dataAgendada >= hoje && v.dataAgendada <= fimSemana,
  ).length;
  const mesAtual = hoje.slice(0, 7);
  const publicadosMes = itens.filter((v) => v.status === 'publicado' && v.publicadoEm?.slice(0, 7) === mesAtual).length;
  const atrasados = itens.filter((v) => atrasado(v, hoje)).length;

  return buildIndicadores([
    { rotulo: 'A produzir', valor: String(contar(pre)), detalhe: descrever(pre) },
    { rotulo: 'Em produção', valor: String(contar(producao)), detalhe: descrever(producao) },
    { rotulo: 'Prontos', valor: String(contar(['pronto'])), detalhe: 'esperando agenda' },
    // Atraso é uma questão de agenda (data vencida sem publicar), qualquer que seja a etapa.
    {
      rotulo: 'Agendados',
      valor: String(contar(['agendado'])),
      detalhe: atrasados ? `${atrasados} com data vencida` : `${agendadosSemana} nos próximos 7 dias`,
      tom: atrasados ? 'erro' : 'neutro',
    },
    { rotulo: 'Publicados', valor: String(contar(['publicado'])), detalhe: `${publicadosMes} este mês`, tom: publicadosMes ? 'ok' : 'neutro' },
  ]);
}

// ---------- Card ----------

function buildCard(fonte: Fonte, item: Postagem): HTMLElement {
  const card = document.createElement('article');
  card.className = 'vd-card';
  card.dataset.id = item.id;
  card.tabIndex = 0;
  if (fonte.painelAbertoPara() === item.id) card.classList.add('is-aberto');
  if (ultimoAberto.get(fonte.tipo) === item.id) card.classList.add('is-recente');
  if (atrasado(item)) card.classList.add('is-atrasado');
  if (item.prioridade) card.classList.add(`is-prio-${item.prioridade}`);
  const prefs = fonte.catalogo.preferencias;

  const topo = document.createElement('div');
  topo.className = 'vd-card-topo';
  if (item.prioridade) topo.appendChild(buildPrioridade(item.prioridade));
  if (prefs.mostrarScore && item.score !== undefined) topo.appendChild(buildScore(item.score, escalaDaPostagem(fonte.catalogo, item.tagIds), true));
  const topoExtra = document.createElement('span');
  topoExtra.className = 'vd-card-topo-extra';
  topo.appendChild(topoExtra);
  if (item.status === 'arquivado') {
    const motivo = document.createElement('span');
    motivo.className = 'vd-card-motivo';
    motivo.textContent = item.motivoArquivamento === 'cancelado' ? 'cancelado' : 'arquivado';
    topo.appendChild(motivo);
  }
  const redes = document.createElement('span');
  redes.className = 'vd-card-redes';
  if (prefs.mostrarRedes) redesDe(fonte.catalogo, item).forEach((r) => redes.appendChild(buildRedeBadge(r)));
  topo.appendChild(redes);
  card.appendChild(topo);

  const exibido = tituloExibido(fonte.catalogo, item);
  const titulo = document.createElement('h3');
  titulo.className = 'vd-card-titulo';
  titulo.textContent = exibido;
  card.appendChild(titulo);
  // Com uma informação extra no lugar do título, o título real vira a linha de apoio.
  if (exibido !== item.titulo) {
    const apoio = document.createElement('p');
    apoio.className = 'vd-card-apoio';
    apoio.textContent = item.titulo;
    card.appendChild(apoio);
  }
  const aposTitulo = document.createElement('div');
  aposTitulo.className = 'vd-card-extra';
  card.appendChild(aposTitulo);

  const tags = prefs.mostrarTags ? tagsDe(fonte.catalogo, item) : [];
  if (tags.length) {
    const linha = document.createElement('div');
    linha.className = 'vd-card-tags';
    tags.forEach((t) => linha.appendChild(buildTagChip(t, { compacto: true })));
    card.appendChild(linha);
  }

  // As duas primeiras informações extras (ex.: Minuto) aparecem direto no card.
  const campoDoTitulo = prefs.tituloDoCard.tipo === 'extra' ? prefs.tituloDoCard.nome : null;
  const extras = prefs.mostrarExtras ? item.camposExtras.filter((c) => c.valor.trim() && c.nome !== campoDoTitulo).slice(0, 2) : [];
  if (extras.length) {
    const dl = document.createElement('dl');
    dl.className = 'vd-extras-resumo';
    extras.forEach((c) => {
      const dt = document.createElement('dt');
      dt.textContent = c.nome;
      const dd = document.createElement('dd');
      dd.textContent = c.valor;
      dd.title = c.valor;
      dl.append(dt, dd);
    });
    card.appendChild(dl);
  }

  const rodape = document.createElement('div');
  rodape.className = 'vd-card-rodape';
  if (item.dataAgendada) {
    const quando = document.createElement('span');
    quando.className = 'vd-card-data';
    quando.innerHTML = svg(ICONES_POSTAGEM.calendario, 11, 2);
    const texto = document.createElement('span');
    texto.textContent = `${formatarDataCurta(item.dataAgendada)}${item.horaAgendada ? ` · ${item.horaAgendada}` : ''}`;
    quando.appendChild(texto);
    rodape.appendChild(quando);
  }
  const alerta = buildSeloAgenda(item);
  if (alerta) rodape.appendChild(alerta);

  const metas = document.createElement('span');
  metas.className = 'vd-card-metas';
  fonte.decorarCard?.(item, { topo: topoExtra, aposTitulo, metas });
  if (item.recursoIds.length) {
    const m = document.createElement('span');
    m.title = 'Materiais anexados';
    m.innerHTML = svg(ICONES_POSTAGEM.clipe, 11, 2);
    m.append(String(item.recursoIds.length));
    metas.appendChild(m);
  }
  rodape.appendChild(metas);
  if (!topoExtra.childElementCount) topoExtra.remove();
  if (!aposTitulo.childElementCount) aposTitulo.remove();
  if (metas.childElementCount || item.dataAgendada || alerta) card.appendChild(rodape);

  const abrir = (): void => abrirItem(fonte, item.id);
  card.addEventListener('click', abrir);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrir();
  });
  return card;
}

// ---------- Pipeline ----------

function buildNovoInline(fonte: Fonte, status: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vd-novo';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'vd-novo-botao';
  botao.innerHTML = svg(ICONES_POSTAGEM.mais, 13, 2.2);
  botao.append(fonte.novoRotulo);

  botao.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'vd-input vd-novo-input';
    input.placeholder = 'Título e Enter';
    let enviando = false;
    const concluir = (): void => {
      if (!input.isConnected) return;
      input.replaceWith(botao);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        concluir();
      }
      if (e.key !== 'Enter' || enviando) return;
      const titulo = input.value.trim();
      if (!titulo) return;
      enviando = true;
      void fonte
        .criarRapido(titulo, status)
        .then(() => {
          // O redesenho recria a coluna; reabre o campo para cadastrar em sequência.
          document.querySelector<HTMLButtonElement>(`.vd-coluna[data-status="${status}"] .vd-novo-botao`)?.click();
        })
        .catch(falhou);
    });
    input.addEventListener('blur', () => {
      if (!enviando) concluir();
    });
    botao.replaceWith(input);
    input.focus();
  });

  wrap.appendChild(botao);
  return wrap;
}

function buildColuna(fonte: Fonte, status: Fonte['etapas'][number], itens: Postagem[], total: number): HTMLElement {
  const coluna = document.createElement('section');
  coluna.className = `vd-coluna is-fase-${status.fase} is-${status.id}`;
  coluna.dataset.status = status.id;

  const cabecalho = document.createElement('header');
  cabecalho.className = 'vd-coluna-cabecalho';
  const ponto = document.createElement('span');
  ponto.className = 'vd-coluna-ponto';
  const nome = document.createElement('h2');
  nome.textContent = status.rotulo;
  const contador = document.createElement('span');
  contador.className = 'vd-coluna-contador';
  contador.textContent = itens.length === total ? String(total) : `${itens.length}/${total}`;
  cabecalho.append(ponto, nome, contador);
  coluna.appendChild(cabecalho);

  const lista = document.createElement('div');
  lista.className = 'vd-lista';
  lista.dataset.status = status.id;
  itens.forEach((v) => lista.appendChild(buildCard(fonte, v)));
  if (itens.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'vd-lista-vazia';
    vazio.textContent = filtrosAtivos(fonte) && total > 0 ? 'Nada com esses filtros' : 'Arraste para cá';
    lista.appendChild(vazio);
  }
  coluna.appendChild(lista);

  if (status.id !== 'arquivado' && status.id !== 'publicado') coluna.appendChild(buildNovoInline(fonte, status.id));
  return coluna;
}

function iniciarSortables(fonte: Fonte, pipeline: HTMLElement): void {
  destruirSortables();
  pipeline.querySelectorAll<HTMLElement>('.vd-lista').forEach((lista) => {
    sortables.push(
      new Sortable(lista, {
        group: `vd-pipeline-${fonte.tipo}`,
        animation: 160,
        ghostClass: 'vd-card-fantasma',
        chosenClass: 'vd-card-escolhido',
        draggable: '.vd-card',
        filter: '.vd-lista-vazia',
        onEnd: (evt) => {
          const id = evt.item.dataset.id;
          const status = evt.to.dataset.status;
          if (!id || !status || evt.newDraggableIndex === undefined) return;
          if (evt.from === evt.to && evt.oldDraggableIndex === evt.newDraggableIndex) return;
          // Com filtro ativo, o índice visível não é o índice real na etapa:
          // posiciona depois do vizinho de cima, que existe nos dois mundos.
          const anterior = evt.item.previousElementSibling as HTMLElement | null;
          const daEtapa = fonte.itens.filter((v) => v.status === status && v.id !== id).sort((a, b) => a.order - b.order);
          const indiceAnterior = anterior?.dataset.id ? daEtapa.findIndex((v) => v.id === anterior.dataset.id) : -1;
          void fonte.mover(id, status, indiceAnterior + 1).catch(falhou);
        },
      }),
    );
  });
}

function buildTituloFase(fase: string, rotulo: string): HTMLElement {
  const recolhida = fasesRecolhidas.has(fase);
  const titulo = document.createElement('button');
  titulo.type = 'button';
  titulo.className = 'vd-fase-titulo is-botao';
  titulo.setAttribute('aria-expanded', String(!recolhida));
  titulo.title = recolhida ? `Mostrar ${rotulo}` : `Recolher ${rotulo}`;
  titulo.innerHTML = svg(CHEVRON, 12, 2.4);
  const texto = document.createElement('span');
  texto.textContent = rotulo;
  titulo.appendChild(texto);
  titulo.addEventListener('click', () => alternarFase(fase));
  return titulo;
}

/**
 * Fase recolhida: uma faixa com o nome e as contagens por etapa, para ver
 * quanto está parado ali sem ocupar a largura das colunas. Clicar reabre.
 */
function buildFaseRecolhida(
  fase: string,
  rotulo: string,
  etapas: Fonte['etapas'],
  porStatus: (status: string) => Postagem[],
): HTMLElement {
  const faixa = document.createElement('button');
  faixa.type = 'button';
  faixa.className = 'vd-fase-faixa';
  const contagens = etapas.map((e) => ({ rotulo: e.rotulo, total: porStatus(e.id).length }));
  const total = contagens.reduce((soma, c) => soma + c.total, 0);
  faixa.title = [`Mostrar ${rotulo}`, ...contagens.map((c) => `${c.rotulo}: ${c.total}`)].join('\n');
  faixa.setAttribute('aria-label', `${rotulo}: ${total} — mostrar`);

  const numero = document.createElement('span');
  numero.className = 'vd-fase-faixa-total';
  numero.textContent = String(total);
  const nome = document.createElement('span');
  nome.className = 'vd-fase-faixa-nome';
  nome.textContent = rotulo;
  const lista = document.createElement('span');
  lista.className = 'vd-fase-faixa-etapas';
  contagens.forEach((c) => {
    const item = document.createElement('span');
    item.className = 'vd-fase-faixa-etapa';
    item.textContent = `${c.rotulo} ${c.total}`;
    lista.appendChild(item);
  });
  faixa.append(numero, nome, lista);
  faixa.addEventListener('click', () => alternarFase(fase));
  return faixa;
}

function buildPipeline(fonte: Fonte): HTMLElement {
  const pipeline = document.createElement('div');
  pipeline.className = 'vd-pipeline';

  const porStatus = (status: string): Postagem[] => fonte.itens.filter((v) => v.status === status).sort((a, b) => a.order - b.order);

  const grupoDe = (classe: string, rotulo: string, etapas: Fonte['etapas']): HTMLElement => {
    const grupo = document.createElement('div');
    grupo.className = `vd-fase is-fase-${classe}`;
    if (classe === 'fora') {
      const titulo = document.createElement('div');
      titulo.className = 'vd-fase-titulo';
      titulo.textContent = rotulo;
      grupo.appendChild(titulo);
    } else {
      grupo.appendChild(buildTituloFase(classe, rotulo));
      if (fasesRecolhidas.has(classe)) {
        grupo.classList.add('is-recolhida');
        grupo.appendChild(buildFaseRecolhida(classe, rotulo, etapas, porStatus));
        return grupo;
      }
    }
    const colunas = document.createElement('div');
    colunas.className = 'vd-fase-colunas';
    etapas.forEach((status) => {
      const todos = porStatus(status.id);
      colunas.appendChild(buildColuna(fonte, status, todos.filter((v) => passaFiltros(fonte, v)), todos.length));
    });
    grupo.appendChild(colunas);
    return grupo;
  };

  FASES_POSTAGEM.forEach((fase) => pipeline.appendChild(grupoDe(fase.id, fase.rotulo, fonte.etapas.filter((s) => s.fase === fase.id))));
  if (mostrarArquivados) {
    pipeline.appendChild(grupoDe('fora', 'Fora da pipeline', fonte.etapas.filter((s) => s.id === 'arquivado')));
  }

  pipeline.addEventListener('scroll', () => {
    scrollPipeline = pipeline.scrollLeft;
  });
  return pipeline;
}

// ---------- Agenda ----------

type AbaAgenda = 'proximas' | 'anteriores';
type PeriodoAnteriores = '7' | 'semana-passada' | 'este-mes' | 'mes-passado' | '90' | 'tudo';
type BaseAnteriores = 'publicadas' | 'todas';

interface PrefsAgenda {
  aba: AbaAgenda;
  periodo: PeriodoAnteriores;
  base: BaseAnteriores;
  /** "Últimos 7 dias" aberto na aba Próximas. */
  recentesAbertos: boolean;
}

const CHAVE_AGENDA = 'iris.postagens.agenda';
const PERIODOS_ANTERIORES: Array<{ id: PeriodoAnteriores; rotulo: string; texto: string }> = [
  { id: '7', rotulo: 'Últimos 7 dias', texto: 'nos últimos 7 dias' },
  { id: 'semana-passada', rotulo: 'Semana passada', texto: 'na semana passada' },
  { id: 'este-mes', rotulo: 'Este mês', texto: 'neste mês' },
  { id: 'mes-passado', rotulo: 'Mês passado', texto: 'no mês passado' },
  { id: '90', rotulo: 'Últimos 90 dias', texto: 'nos últimos 90 dias' },
  { id: 'tudo', rotulo: 'Tudo', texto: 'até hoje' },
];

let prefsAgenda: PrefsAgenda = lerPrefsAgenda();

function lerPrefsAgenda(): PrefsAgenda {
  const padrao: PrefsAgenda = { aba: 'proximas', periodo: '7', base: 'publicadas', recentesAbertos: false };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_AGENDA) ?? '{}') as Partial<PrefsAgenda>;
    return {
      aba: salvo.aba === 'anteriores' ? 'anteriores' : 'proximas',
      periodo: PERIODOS_ANTERIORES.some((p) => p.id === salvo.periodo) ? salvo.periodo! : padrao.periodo,
      base: salvo.base === 'todas' ? 'todas' : 'publicadas',
      recentesAbertos: salvo.recentesAbertos === true,
    };
  } catch {
    return padrao;
  }
}

function mudarAgenda(mudanca: Partial<PrefsAgenda>): void {
  prefsAgenda = { ...prefsAgenda, ...mudanca };
  try {
    localStorage.setItem(CHAVE_AGENDA, JSON.stringify(prefsAgenda));
  } catch {
    // Sem armazenamento local, a escolha só dura até fechar a tela.
  }
  redesenhar();
}

/** Dia em que a postagem conta no histórico: o mesmo das Métricas (o dia em que foi ao ar). */
function diaNoHistorico(item: Postagem): string | undefined {
  if (item.status === 'publicado') return dataParaMetricas(item, 'publicados');
  // "Todas": também as que tinham data passada e não saíram.
  return atrasado(item) ? item.dataAgendada : undefined;
}

/** Hora marcada; publicada sem hora marcada mostra a hora em que mudou de etapa. */
function horaNoHistorico(item: Postagem): string | undefined {
  if (item.horaAgendada) return item.horaAgendada;
  if (!item.publicadoEm) return undefined;
  const d = new Date(item.publicadoEm);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function intervaloAnteriores(fonte: Fonte, periodo: PeriodoAnteriores): { inicio?: string; fim: string } {
  const hoje = hojeIso();
  const [a, m] = hoje.split('-').map(Number) as [number, number];
  const primeiroDia = fonte.catalogo.preferencias.inicioDaSemana;
  switch (periodo) {
    case '7':
      return { inicio: somarDias(hoje, -6), fim: hoje };
    case 'semana-passada': {
      const inicioEsta = inicioDaSemana(hoje, primeiroDia);
      return { inicio: somarDias(inicioEsta, -7), fim: somarDias(inicioEsta, -1) };
    }
    case 'este-mes':
      return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
    case 'mes-passado': {
      const anterior = new Date(a, m - 2, 1);
      const ultimo = new Date(a, m - 1, 0);
      const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { inicio: iso(anterior), fim: iso(ultimo) };
    }
    case '90':
      return { inicio: somarDias(hoje, -89), fim: hoje };
    case 'tudo':
      return { fim: hoje };
  }
}

/** Postagens do histórico no período, da mais recente para a mais antiga. */
function anterioresNoPeriodo(fonte: Fonte, periodo: PeriodoAnteriores, base: BaseAnteriores): Array<{ item: Postagem; dia: string }> {
  const { inicio, fim } = intervaloAnteriores(fonte, periodo);
  return fonte.itens
    .filter((v) => v.status !== 'arquivado' && passaFiltros(fonte, v))
    .filter((v) => base === 'todas' || v.status === 'publicado')
    .map((item) => ({ item, dia: diaNoHistorico(item) }))
    .filter((x): x is { item: Postagem; dia: string } => Boolean(x.dia) && x.dia! <= fim && (!inicio || x.dia! >= inicio))
    .sort((a, b) => `${b.dia}${horaNoHistorico(b.item) ?? ''}`.localeCompare(`${a.dia}${horaNoHistorico(a.item) ?? ''}`));
}

function rotuloDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'Hoje';
  if (dia === somarDias(hoje, -1)) return 'Ontem';
  if (dia === somarDias(hoje, 1)) return 'Amanhã';
  return formatarDataLonga(dia);
}

function buildLinhaAgenda(fonte: Fonte, item: Postagem, historico = false): HTMLElement {
  const linha = document.createElement('button');
  linha.type = 'button';
  linha.className = 'vd-agenda-linha';
  // No histórico tudo já passou: apagar as publicadas deixaria a aba inteira cinza.
  linha.classList.toggle('is-encerrado', !historico && encerrado(item));

  const hora = document.createElement('span');
  hora.className = 'vd-agenda-hora';
  hora.textContent = (historico ? horaNoHistorico(item) : item.horaAgendada) ?? '—';
  if (historico && !item.horaAgendada && item.publicadoEm) hora.title = 'Sem horário marcado: hora em que foi marcada como publicada';

  const principal = document.createElement('span');
  principal.className = 'vd-agenda-principal';
  const titulo = document.createElement('span');
  titulo.className = 'vd-agenda-titulo';
  titulo.textContent = tituloExibido(fonte.catalogo, item);
  const tags = document.createElement('span');
  tags.className = 'vd-card-tags';
  if (item.prioridade) tags.appendChild(buildPrioridade(item.prioridade));
  tagsDe(fonte.catalogo, item).forEach((t) => tags.appendChild(buildTagChip(t, { compacto: true })));
  principal.append(titulo, tags);

  const redes = document.createElement('span');
  redes.className = 'vd-card-redes';
  redesDe(fonte.catalogo, item).forEach((r) => redes.appendChild(buildRedeBadge(r)));

  const etapa = document.createElement('span');
  etapa.className = `vd-agenda-etapa is-${item.status} is-fase-${faseDe(fonte, item.status)}`;
  etapa.textContent = rotuloEtapa(fonte, item.status);

  linha.append(hora, principal, redes, etapa);
  const alerta = buildSeloAgenda(item);
  if (alerta) linha.appendChild(alerta);
  linha.addEventListener('click', () => abrirItem(fonte, item.id));
  return linha;
}

function buildSecaoAgenda(fonte: Fonte, titulo: string, classe: string, itens: Postagem[], historico = false): HTMLElement {
  const el = document.createElement('section');
  el.className = `vd-agenda-dia ${classe}`.trim();
  const h = document.createElement('h2');
  h.textContent = titulo;
  const n = document.createElement('span');
  n.textContent = String(itens.length);
  h.appendChild(n);
  el.appendChild(h);
  itens.forEach((v) => el.appendChild(buildLinhaAgenda(fonte, v, historico)));
  return el;
}

/** Abas da Agenda: o que vem pela frente e o que já passou. */
function buildAgenda(fonte: Fonte): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vd-agenda';
  const topo = document.createElement('div');
  topo.className = 'vd-agenda-topo';
  const qtdAnteriores = anterioresNoPeriodo(fonte, prefsAgenda.periodo, prefsAgenda.base).length;
  topo.appendChild(
    buildSegmentado<AbaAgenda>(
      [
        { value: 'proximas', label: 'Próximas' },
        { value: 'anteriores', label: `Anteriores · ${qtdAnteriores}` },
      ],
      prefsAgenda.aba,
      (v) => mudarAgenda({ aba: v }),
    ),
  );
  wrap.appendChild(topo);
  wrap.appendChild(prefsAgenda.aba === 'anteriores' ? buildAnteriores(fonte, topo) : buildProximas(fonte));
  return wrap;
}

/**
 * Histórico: o que foi ao ar no período, por dia, do mais recente ao mais
 * antigo. Períodos longos ganham um separador por semana para a lista não
 * virar um paredão.
 */
function buildAnteriores(fonte: Fonte, topo: HTMLElement): HTMLElement {
  const corpo = document.createElement('div');
  corpo.className = 'vd-agenda-corpo';
  const hoje = hojeIso();
  const periodo = PERIODOS_ANTERIORES.find((p) => p.id === prefsAgenda.periodo)!;

  const periodos = document.createElement('div');
  periodos.className = 'md-pilulas vd-agenda-periodos';
  PERIODOS_ANTERIORES.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'md-pilula';
    b.classList.toggle('is-ativa', p.id === prefsAgenda.periodo);
    b.setAttribute('aria-pressed', String(p.id === prefsAgenda.periodo));
    b.textContent = p.rotulo;
    b.addEventListener('click', () => mudarAgenda({ periodo: p.id }));
    periodos.appendChild(b);
  });
  topo.appendChild(periodos);
  topo.appendChild(
    buildSegmentado<BaseAnteriores>(
      [
        { value: 'publicadas', label: 'Só publicadas' },
        { value: 'todas', label: 'Todas' },
      ],
      prefsAgenda.base,
      (v) => mudarAgenda({ base: v }),
    ),
  );

  const lista = anterioresNoPeriodo(fonte, prefsAgenda.periodo, prefsAgenda.base);
  const { inicio, fim } = intervaloAnteriores(fonte, prefsAgenda.periodo);
  const descricaoPeriodo = inicio ? `${formatarData(inicio)} a ${formatarData(fim)}` : `até ${formatarData(fim)}`;

  if (!lista.length) {
    corpo.appendChild(
      buildVazio(
        ICONES_POSTAGEM.historico,
        `Nada publicado ${periodo.texto}`,
        `${descricaoPeriodo}. Escolha outro período acima${filtrosAtivos(fonte) ? ' ou limpe os filtros da barra' : ''}.`,
      ),
    );
    return corpo;
  }

  // Resumo: quanto saiu, em quantos dias, em que horário costuma sair.
  const publicadas = lista.filter((x) => x.item.status === 'publicado');
  const naoSairam = lista.length - publicadas.length;
  const dias = new Set(publicadas.map((x) => x.dia)).size;
  const horas = new Map<string, number>();
  publicadas.forEach((x) => {
    const h = horaNoHistorico(x.item);
    if (h) horas.set(`${h.slice(0, 2)}h`, (horas.get(`${h.slice(0, 2)}h`) ?? 0) + 1);
  });
  const horaComum = [...horas.entries()].sort((a, b) => b[1] - a[1])[0];
  corpo.appendChild(
    buildIndicadores([
      { rotulo: 'Publicadas', valor: String(publicadas.length), detalhe: descricaoPeriodo, tom: publicadas.length ? 'ok' : 'neutro' },
      { rotulo: 'Dias com publicação', valor: String(dias), detalhe: dias ? `${(publicadas.length / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por dia` : '—' },
      { rotulo: 'Horário mais usado', valor: horaComum ? horaComum[0] : '—', detalhe: horaComum ? `${horaComum[1]} de ${publicadas.length}` : 'sem horários' },
      prefsAgenda.base === 'todas'
        ? { rotulo: 'Passaram sem publicar', valor: String(naoSairam), detalhe: naoSairam ? 'data passou, não saiu' : 'nenhuma', tom: naoSairam ? 'erro' : 'ok' }
        : { rotulo: 'Por semana', valor: (publicadas.length / Math.max(1, semanasNoPeriodo(inicio ?? lista[lista.length - 1]!.dia, fim))).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), detalhe: 'média no período' },
    ]),
  );

  // Por dia, com separador de semana quando o período passa de uma semana.
  const porDia = new Map<string, Postagem[]>();
  lista.forEach((x) => porDia.set(x.dia, [...(porDia.get(x.dia) ?? []), x.item]));
  const comSemanas = prefsAgenda.periodo !== '7' && prefsAgenda.periodo !== 'semana-passada';
  const primeiroDia = fonte.catalogo.preferencias.inicioDaSemana;
  let semanaAtual = '';
  porDia.forEach((itens, dia) => {
    if (comSemanas) {
      const semana = inicioDaSemana(dia, primeiroDia);
      if (semana !== semanaAtual) {
        semanaAtual = semana;
        const sep = document.createElement('div');
        sep.className = 'vd-agenda-semana';
        const doPeriodo = lista.filter((x) => inicioDaSemana(x.dia, primeiroDia) === semana && x.item.status === 'publicado').length;
        sep.textContent = `Semana de ${formatarData(semana).slice(0, 5)} a ${formatarData(somarDias(semana, 6)).slice(0, 5)}`;
        sep.appendChild(Object.assign(document.createElement('span'), { textContent: `${doPeriodo} publicada${doPeriodo === 1 ? '' : 's'}` }));
        corpo.appendChild(sep);
      }
    }
    corpo.appendChild(buildSecaoAgenda(fonte, rotuloDia(dia, hoje), dia === hoje ? 'is-hoje' : '', itens, true));
  });
  return corpo;
}

function semanasNoPeriodo(inicio: string, fim: string): number {
  const [a1, m1, d1] = inicio.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = fim.split('-').map(Number) as [number, number, number];
  const dias = Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86_400_000) + 1;
  return Math.max(1, dias / 7);
}

function buildProximas(fonte: Fonte): HTMLElement {
  const agenda = document.createElement('div');
  agenda.className = 'vd-agenda-corpo';
  const hoje = hojeIso();

  // O que acabou de sair, recolhido: a aba não fica zerada e não empurra o
  // que vem pela frente para baixo.
  const recentes = anterioresNoPeriodo(fonte, '7', 'publicadas')// As de hoje com data marcada já aparecem em "Hoje", logo abaixo.
    .filter((x) => x.dia < hoje || !x.item.dataAgendada);
  if (recentes.length) {
    const caixa = document.createElement('details');
    caixa.className = 'vd-agenda-recentes';
    caixa.open = prefsAgenda.recentesAbertos;
    const resumo = document.createElement('summary');
    resumo.innerHTML = svg(ICONES_POSTAGEM.historico, 14, 2);
    resumo.append(
      Object.assign(document.createElement('strong'), { textContent: 'Últimos 7 dias' }),
      Object.assign(document.createElement('span'), { textContent: `${recentes.length} publicada${recentes.length === 1 ? '' : 's'}` }),
    );
    const verTudo = document.createElement('button');
    verTudo.type = 'button';
    verTudo.className = 'vd-agenda-ver-tudo';
    verTudo.textContent = 'Ver histórico completo';
    verTudo.addEventListener('click', (e) => {
      e.preventDefault();
      mudarAgenda({ aba: 'anteriores' });
    });
    resumo.appendChild(verTudo);
    caixa.appendChild(resumo);
    caixa.addEventListener('toggle', () => {
      // Sem redesenhar: só lembra a escolha.
      prefsAgenda = { ...prefsAgenda, recentesAbertos: caixa.open };
      try {
        localStorage.setItem(CHAVE_AGENDA, JSON.stringify(prefsAgenda));
      } catch {
        // Sem armazenamento local, volta recolhido na próxima vez.
      }
    });
    const dentro = document.createElement('div');
    dentro.className = 'vd-agenda-recentes-lista';
    const porDia = new Map<string, Postagem[]>();
    recentes.forEach((x) => porDia.set(x.dia, [...(porDia.get(x.dia) ?? []), x.item]));
    porDia.forEach((itens, dia) => dentro.appendChild(buildSecaoAgenda(fonte, rotuloDia(dia, hoje), '', itens, true)));
    caixa.appendChild(dentro);
    agenda.appendChild(caixa);
  }
  const limite = somarDias(hoje, 60);

  const visiveis = fonte.itens.filter((v) => v.status !== 'arquivado' && passaFiltros(fonte, v));
  const ordenar = (a: Postagem, b: Postagem): number =>
    `${a.dataAgendada}${a.horaAgendada ?? '99'}`.localeCompare(`${b.dataAgendada}${b.horaAgendada ?? '99'}`);

  const grupos: Array<{ titulo: string; destaque?: string; itens: Postagem[] }> = [];
  const atrasados = visiveis.filter((v) => atrasado(v, hoje)).sort(ordenar);
  if (atrasados.length) grupos.push({ titulo: 'Atrasados', destaque: 'is-atrasado', itens: atrasados });

  const futuros = visiveis.filter((v) => v.dataAgendada && v.dataAgendada >= hoje && v.dataAgendada <= limite).sort(ordenar);
  const porDia = new Map<string, Postagem[]>();
  futuros.forEach((v) => porDia.set(v.dataAgendada!, [...(porDia.get(v.dataAgendada!) ?? []), v]));
  porDia.forEach((itens, dia) => {
    const rotulo = dia === hoje ? 'Hoje' : dia === somarDias(hoje, 1) ? 'Amanhã' : formatarDataLonga(dia);
    grupos.push({ titulo: rotulo, destaque: dia === hoje ? 'is-hoje' : undefined, itens });
  });

  if (grupos.length === 0) {
    agenda.appendChild(
      buildVazio(
        ICONES_POSTAGEM.calendario,
        'Nada agendado nos próximos 60 dias',
        'Defina data e horário no painel de uma postagem para ela aparecer aqui.',
      ),
    );
  }

  const secao = (titulo: string, classe: string, itens: Postagem[]): HTMLElement => {
    const el = document.createElement('section');
    el.className = `vd-agenda-dia ${classe}`;
    const h = document.createElement('h2');
    h.textContent = titulo;
    const n = document.createElement('span');
    n.textContent = String(itens.length);
    h.appendChild(n);
    el.appendChild(h);
    itens.forEach((v) => el.appendChild(buildLinhaAgenda(fonte, v)));
    return el;
  };

  grupos.forEach((grupo) => agenda.appendChild(secao(grupo.titulo, grupo.destaque ?? '', grupo.itens)));

  const semData = visiveis.filter((v) => !v.dataAgendada && ['pronto', 'agendado'].includes(v.status));
  if (semData.length) agenda.appendChild(secao('Prontos sem data', 'is-sem-data', semData));

  return agenda;
}

// ---------- Render ----------

function buildSeletorTipo(): HTMLElement {
  const seletor = buildSegmentado<TipoPostagem>(
    TIPOS_POSTAGEM.map((t) => {
      const qtd = TIPOS[t.id].fonte()?.itens.filter((i) => i.status !== 'arquivado').length;
      return { value: t.id, label: qtd === undefined ? t.rotulo : `${t.rotulo} · ${qtd}` };
    }),
    tipo,
    trocarTipo,
  );
  seletor.classList.add('vd-tipos');
  seletor.setAttribute('aria-label', 'Tipo de postagem');
  return seletor;
}

export function render(container: HTMLElement): void {
  containerAtual = container;
  const fonte = TIPOS[tipo].fonte();
  destruirSortables();
  if (!fonte) return;

  const tela = document.createElement('div');
  tela.className = 'pg-view vd-view';
  tela.classList.toggle('is-pipeline', modo === 'pipeline');

  const controle: ControleTela = {
    redesenhar,
    irParaPipeline: (arquivados) => {
      mostrarArquivados = arquivados;
      modo = 'pipeline';
      redesenhar();
    },
  };

  const novo = buildBotao(fonte.novoRotulo, { icone: ICONES_POSTAGEM.mais, variante: 'primario' });
  novo.addEventListener('click', () => fonte.abrirNovo({}));
  const configurar = buildBotao('Empresas e tags', { icone: ICONES_POSTAGEM.tag, variante: 'secundario', titulo: 'Empresas, tags e redes sociais' });
  configurar.addEventListener('click', () => abrirTagsERedes());
  const exibicao = buildBotao('', {
    icone: ICONES_POSTAGEM.exibicao,
    variante: 'secundario',
    titulo: 'Exibição dos cards (título do card, o que mostrar)',
  });
  exibicao.addEventListener('click', abrirExibicao);

  tela.appendChild(
    buildCabecalho({
      icone: ICONES_POSTAGEM.postagens,
      titulo: 'Postagens',
      subtitulo: fonte.subtitulo?.() ?? 'Pipeline de conteúdo, da ideia à publicação',
      acoes: [...(fonte.acoesCabecalho?.(controle) ?? []), exibicao, configurar, novo],
    }),
  );
  tela.appendChild(buildSeletorTipo());

  if (fonte.itens.length === 0) {
    tela.appendChild(buildResumo(fonte));
    const comecar = buildBotao(`${fonte.novoRotulo}`, { icone: ICONES_POSTAGEM.mais, variante: 'primario' });
    comecar.addEventListener('click', () => novo.click());
    tela.appendChild(buildVazio(fonte.icone, `Nenhuma postagem em ${fonte.rotulo} ainda`, fonte.dicaVazio, comecar));
  } else {
    // Métricas traz os próprios indicadores; o resumo da pipeline ficaria repetido.
    if (modo !== 'metricas') tela.appendChild(buildResumo(fonte));
    tela.appendChild(buildBarra(fonte));
    const aviso = fonte.filtroExtra?.aviso?.();
    if (aviso) {
      const faixa = document.createElement('div');
      faixa.className = 'vd-filtro-aviso';
      faixa.textContent = aviso;
      tela.appendChild(faixa);
    }
    const visivel = (item: Postagem): boolean => passaFiltros(fonte, item);
    if (modo === 'pipeline') tela.appendChild(buildPipeline(fonte));
    else if (modo === 'agenda') tela.appendChild(buildAgenda(fonte));
    else if (modo === 'metricas') tela.appendChild(buildMetricas(fonte, { visivel, abrir: (id) => abrirItem(fonte, id), falhou, redesenhar }));
    else
      tela.appendChild(
        buildCalendario(fonte, {
          visivel,
          abrir: (id) => abrirItem(fonte, id),
          criarEm: (data, hora) => fonte.abrirNovo({ dataAgendada: data, horaAgendada: hora }),
          falhou,
          redesenhar,
        }),
      );
  }

  container.replaceChildren(tela);

  const pipeline = tela.querySelector<HTMLElement>('.vd-pipeline');
  if (pipeline) {
    pipeline.scrollLeft = scrollPipeline;
    acompanharFoco(fonte, pipeline);
    iniciarSortables(fonte, pipeline);
  }
}
