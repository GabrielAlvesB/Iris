import type {
  Colecao,
  RecenteDetalhado,
  RecursoDetalhado,
  ResultadoBuscaItem,
} from '../../../shared/types/explorador.types';
import type { TipoPostagem } from '../../../shared/types/postagens.types.js';
import { normalizar } from '../../../shared/types/videos.conversao.js';
import { abrirPostagem } from '../../core/navegacao.js';
import { ICONES_MODAL, openConfirmModal, openFormModal } from '../../ui/modal.js';
import { buildBotao, buildBusca, buildSelo, buildVazio, svg, tempoRelativo } from '../../ui/pagina.js';
import * as videosState from '../postagens/videos/videos.state.js';
import * as imagensState from '../postagens/imagens/imagens.state.js';
import * as exploradorState from './explorador.state.js';
import type { ExploradorViewState } from './explorador.state.js';
import { buildIconeArquivo, formatarTamanho } from './explorador.icones.js';

/**
 * Abas Biblioteca, Recentes e Busca. A Biblioteca guarda curadoria (coleção,
 * tags, nota) sobre caminhos dentro das pastas monitoradas — nunca cópias dos
 * arquivos — e é de onde as postagens (vídeos, imagens) puxam seus materiais.
 */

export const ICONES_BIBLIOTECA = {
  livro: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h7"/><path d="M9 11h5"/>',
  estrela: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  abrir: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  revelar: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  remover: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
} as const;

const CORES_COLECAO = [
  { value: '#a78bfa', label: 'Violeta' },
  { value: '#f472b6', label: 'Rosa' },
  { value: '#38bdf8', label: 'Azul' },
  { value: '#34d399', label: 'Verde' },
  { value: '#fbbf24', label: 'Âmbar' },
  { value: '#fb7185', label: 'Coral' },
  { value: '#9498a3', label: 'Cinza' },
];

type FiltroColecao = 'tudo' | 'fixados' | 'sem' | string;
type Ordem = 'recentes' | 'nome' | 'tipo';

let filtroColecao: FiltroColecao = 'tudo';
let buscaLocal = '';
let ordem: Ordem = 'recentes';
let termoBusca = '';
let timerBusca: ReturnType<typeof setTimeout> | null = null;
interface UsoRecurso {
  tipo: TipoPostagem;
  id: string;
  titulo: string;
}

/** Postagens que usam cada recurso, calculado dos states de Postagens. */
let usoPorRecurso = new Map<string, UsoRecurso[]>();
let postagensCarregando = false;

export function limparBiblioteca(): void {
  if (timerBusca) clearTimeout(timerBusca);
  timerBusca = null;
  buscaLocal = '';
}

function indexarUso(): void {
  usoPorRecurso = new Map();
  const registrar = (tipo: TipoPostagem, item: { id: string; titulo: string; recursoIds: string[] }): void =>
    item.recursoIds.forEach((id) => usoPorRecurso.set(id, [...(usoPorRecurso.get(id) ?? []), { tipo, id: item.id, titulo: item.titulo }]));
  videosState.getCurrentState()?.videos.forEach((v) => registrar('video', v));
  imagensState.getCurrentState()?.imagens.forEach((i) => registrar('imagem', i));
}

function garantirUsoDosVideos(redesenhar: () => void): void {
  if (videosState.getCurrentState() && imagensState.getCurrentState()) {
    indexarUso();
    return;
  }
  if (postagensCarregando) return;
  postagensCarregando = true;
  // Vídeos primeiro: as imagens validam tags e redes contra o catálogo de lá.
  void videosState
    .load()
    .then(() => imagensState.load())
    .then(() => {
      indexarUso();
      redesenhar();
    })
    .catch(() => undefined)
    .finally(() => (postagensCarregando = false));
}

// ---------- Ações compartilhadas ----------

function botaoIcone(icone: string, titulo: string, aoClicar: () => void, classe = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `bb-acao ${classe}`.trim();
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
  btn.innerHTML = svg(icone, 14, 2);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    aoClicar();
  });
  return btn;
}

function seloSituacao(situacao: RecursoDetalhado['situacao']): HTMLElement | null {
  if (situacao === 'ausente') return buildSelo('não encontrado', 'erro');
  if (situacao === 'fora') return buildSelo('pasta não monitorada', 'atencao');
  return null;
}

async function editarRecurso(recurso: RecursoDetalhado, colecoes: Colecao[]): Promise<void> {
  const valores = await openFormModal(
    'Editar item da Biblioteca',
    [
      { name: 'nome', label: 'Nome de exibição', defaultValue: recurso.nome },
      {
        name: 'colecao',
        label: 'Coleção',
        type: 'select',
        options: [{ value: '', label: 'Sem coleção' }, ...colecoes.map((c) => ({ value: c.id, label: c.nome }))],
        defaultValue: recurso.colecaoId ?? '',
      },
      { name: 'tags', label: 'Tags (separadas por vírgula)', defaultValue: recurso.tags.join(', '), placeholder: 'intro, horadecodar, logo' },
      { name: 'nota', label: 'Nota', type: 'textarea', defaultValue: recurso.nota, placeholder: 'Para que serve, onde foi usado…' },
    ],
    'Salvar',
    { icone: ICONES_MODAL.pasta, subtitulo: recurso.caminho, largura: 540 },
  );
  if (!valores) return;
  await exploradorState.atualizarRecurso({
    recursoId: recurso.id,
    nome: valores.nome,
    colecaoId: valores.colecao ?? '',
    tags: (valores.tags ?? '').split(','),
    nota: valores.nota,
  });
}

async function editarColecao(colecao: Colecao | null): Promise<void> {
  const valores = await openFormModal(
    colecao ? 'Editar coleção' : 'Nova coleção',
    [
      { name: 'nome', label: 'Nome', defaultValue: colecao?.nome ?? '', placeholder: 'Ex.: Vinhetas, Fontes, Contratos' },
      { name: 'cor', label: 'Cor', type: 'select', options: CORES_COLECAO, defaultValue: colecao?.cor ?? CORES_COLECAO[0]!.value },
    ],
    colecao ? 'Salvar' : 'Criar coleção',
    { icone: ICONES_MODAL.pasta, subtitulo: 'Agrupa itens da Biblioteca sem mover nenhum arquivo.' },
  );
  if (!valores?.nome?.trim()) return;
  await exploradorState.salvarColecao({ id: colecao?.id, nome: valores.nome, cor: valores.cor ?? '#9498a3' });
}

// ---------- Aba Biblioteca ----------

function buildColecoes(state: ExploradorViewState, redesenhar: () => void): HTMLElement {
  const bib = state.biblioteca!;
  const lateral = document.createElement('aside');
  lateral.className = 'bb-colecoes';

  const item = (id: FiltroColecao, rotulo: string, quantidade: number, cor?: string, colecao?: Colecao): void => {
    const linha = document.createElement('div');
    linha.className = 'bb-colecao';
    linha.classList.toggle('is-ativa', filtroColecao === id);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bb-colecao-btn';
    const ponto = document.createElement('span');
    ponto.className = 'bb-colecao-ponto';
    if (cor) ponto.style.setProperty('--cor', cor);
    else ponto.classList.add('is-neutro');
    const nome = document.createElement('span');
    nome.className = 'bb-colecao-nome';
    nome.textContent = rotulo;
    const qtd = document.createElement('span');
    qtd.className = 'bb-colecao-qtd';
    qtd.textContent = String(quantidade);
    btn.append(ponto, nome, qtd);
    btn.addEventListener('click', () => {
      filtroColecao = id;
      redesenhar();
    });
    linha.appendChild(btn);

    if (colecao) {
      linha.appendChild(botaoIcone(ICONES_BIBLIOTECA.editar, 'Editar coleção', () => void editarColecao(colecao), 'is-discreto'));
      linha.appendChild(
        botaoIcone(
          ICONES_BIBLIOTECA.remover,
          'Excluir coleção',
          () => {
            void openConfirmModal({
              title: 'Excluir coleção',
              message: `"${colecao.nome}" deixa de existir. Os ${quantidade} item(ns) dela continuam na Biblioteca, sem coleção.`,
            }).then((ok) => {
              if (!ok) return;
              if (filtroColecao === colecao.id) filtroColecao = 'tudo';
              void exploradorState.excluirColecao(colecao.id);
            });
          },
          'is-discreto',
        ),
      );
    }
    lateral.appendChild(linha);
  };

  item('tudo', 'Tudo', bib.recursos.length);
  item('fixados', 'Fixados', bib.recursos.filter((r) => r.fixado).length);

  const titulo = document.createElement('div');
  titulo.className = 'bb-colecoes-titulo';
  titulo.textContent = 'Coleções';
  lateral.appendChild(titulo);

  bib.colecoes.forEach((c) => item(c.id, c.nome, bib.recursos.filter((r) => r.colecaoId === c.id).length, c.cor, c));
  const semColecao = bib.recursos.filter((r) => !r.colecaoId).length;
  if (semColecao > 0) item('sem', 'Sem coleção', semColecao);

  const nova = document.createElement('button');
  nova.type = 'button';
  nova.className = 'bb-colecao-nova';
  nova.innerHTML = svg(ICONES_BIBLIOTECA.mais, 13, 2);
  nova.append('Nova coleção');
  nova.addEventListener('click', () => void editarColecao(null));
  lateral.appendChild(nova);

  return lateral;
}

function buildCartao(recurso: RecursoDetalhado, colecoes: Colecao[]): HTMLElement {
  const cartao = document.createElement('article');
  cartao.className = 'bb-cartao';
  cartao.classList.toggle('is-indisponivel', recurso.situacao !== 'ok');
  cartao.tabIndex = 0;

  const topo = document.createElement('div');
  topo.className = 'bb-cartao-topo';
  topo.appendChild(buildIconeArquivo(recurso.caminho, recurso.tipo, 20));

  const textos = document.createElement('div');
  textos.className = 'bb-cartao-textos';
  const nome = document.createElement('h3');
  nome.textContent = recurso.nome;
  nome.title = recurso.caminho;
  const onde = document.createElement('span');
  onde.className = 'bb-cartao-onde';
  onde.textContent = recurso.raizNome ? [recurso.raizNome, recurso.relativo].filter(Boolean).join(' / ') : recurso.caminho;
  onde.title = recurso.caminho;
  textos.append(nome, onde);
  topo.appendChild(textos);

  const fixar = botaoIcone(
    ICONES_BIBLIOTECA.estrela,
    recurso.fixado ? 'Desafixar' : 'Fixar no topo',
    () => void exploradorState.atualizarRecurso({ recursoId: recurso.id, fixado: !recurso.fixado }),
    `bb-fixar${recurso.fixado ? ' is-fixado' : ''}`,
  );
  fixar.setAttribute('aria-pressed', String(recurso.fixado));
  topo.appendChild(fixar);
  cartao.appendChild(topo);

  if (recurso.nota) {
    const nota = document.createElement('p');
    nota.className = 'bb-cartao-nota';
    nota.textContent = recurso.nota;
    cartao.appendChild(nota);
  }

  const etiquetas = document.createElement('div');
  etiquetas.className = 'bb-cartao-etiquetas';
  const colecao = colecoes.find((c) => c.id === recurso.colecaoId);
  if (colecao) {
    const chip = document.createElement('span');
    chip.className = 'bb-chip-colecao';
    chip.style.setProperty('--cor', colecao.cor);
    chip.textContent = colecao.nome;
    etiquetas.appendChild(chip);
  }
  recurso.tags.forEach((t) => {
    const tag = document.createElement('span');
    tag.className = 'bb-tag';
    tag.textContent = `#${t}`;
    etiquetas.appendChild(tag);
  });
  const usos = usoPorRecurso.get(recurso.id) ?? [];
  if (usos.length) {
    const uso = document.createElement('button');
    uso.type = 'button';
    uso.className = 'bb-uso';
    uso.title = `Material de:\n${usos.map((u) => u.titulo).join('\n')}\n\nClique para abrir ${usos.length === 1 ? 'a postagem' : 'a primeira'}.`;
    uso.innerHTML = svg(ICONES_BIBLIOTECA.video, 11, 2);
    uso.append(usos.length === 1 ? 'em 1 postagem' : `em ${usos.length} postagens`);
    uso.addEventListener('click', (e) => {
      e.stopPropagation();
      const primeira = usos[0]!;
      abrirPostagem({ tipo: primeira.tipo, id: primeira.id, arquivados: true });
    });
    etiquetas.appendChild(uso);
  }
  const situacao = seloSituacao(recurso.situacao);
  if (situacao) etiquetas.appendChild(situacao);
  if (etiquetas.childElementCount) cartao.appendChild(etiquetas);

  const rodape = document.createElement('div');
  rodape.className = 'bb-cartao-rodape';
  const meta = document.createElement('span');
  meta.className = 'bb-cartao-meta';
  meta.textContent =
    recurso.situacao === 'ok'
      ? [recurso.tipo === 'arquivo' ? formatarTamanho(recurso.tamanho) : 'pasta', recurso.modificadoEm ? `alterado ${tempoRelativo(recurso.modificadoEm)}` : '']
          .filter(Boolean)
          .join(' · ')
      : `guardado ${tempoRelativo(recurso.createdAt)}`;
  rodape.appendChild(meta);

  const acoes = document.createElement('div');
  acoes.className = 'bb-cartao-acoes';
  if (recurso.situacao === 'ok') {
    acoes.appendChild(botaoIcone(ICONES_BIBLIOTECA.revelar, 'Mostrar no Explorer', () => void exploradorState.revelarNoSistema(recurso.caminho)));
  }
  acoes.appendChild(botaoIcone(ICONES_BIBLIOTECA.copiar, 'Copiar caminho', () => window.irisAPI.system.copyToClipboard(recurso.caminho)));
  acoes.appendChild(botaoIcone(ICONES_BIBLIOTECA.editar, 'Editar', () => void editarRecurso(recurso, colecoes)));
  acoes.appendChild(
    botaoIcone(
      ICONES_BIBLIOTECA.remover,
      'Tirar da Biblioteca',
      () => {
        void openConfirmModal({
          title: 'Tirar da Biblioteca',
          message: `"${recurso.nome}" sai da Biblioteca${usos.length ? ` e dos materiais de ${usos.length} vídeo(s)` : ''}. O arquivo no disco não é apagado.`,
          confirmText: 'Tirar',
        }).then((ok) => {
          if (ok) void exploradorState.removerRecurso(recurso.id);
        });
      },
      'is-perigo',
    ),
  );
  rodape.appendChild(acoes);
  cartao.appendChild(rodape);

  const abrir = (): void => {
    if (recurso.situacao === 'ok') void exploradorState.abrirNoSistema(recurso.caminho);
  };
  cartao.addEventListener('dblclick', abrir);
  cartao.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') abrir();
  });
  cartao.title = recurso.situacao === 'ok' ? 'Duplo clique para abrir' : '';
  return cartao;
}

function ordenarRecursos(recursos: RecursoDetalhado[]): RecursoDetalhado[] {
  const copia = [...recursos];
  copia.sort((a, b) => {
    if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
    if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
    if (ordem === 'tipo') return (a.caminho.split('.').pop() ?? '').localeCompare(b.caminho.split('.').pop() ?? '') || a.nome.localeCompare(b.nome, 'pt-BR');
    return b.createdAt.localeCompare(a.createdAt);
  });
  return copia;
}

export function buildAbaBiblioteca(state: ExploradorViewState, redesenhar: () => void): HTMLElement {
  const bib = state.biblioteca!;
  garantirUsoDosVideos(redesenhar);

  const tela = document.createElement('div');
  tela.className = 'bb-biblioteca';
  tela.appendChild(buildColecoes(state, redesenhar));

  const principal = document.createElement('section');
  principal.className = 'bb-principal';

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  barra.appendChild(
    buildBusca(buscaLocal, 'Filtrar por nome, tag ou nota…', (v) => {
      buscaLocal = v;
      redesenhar();
    }),
  );
  const selectOrdem = document.createElement('select');
  selectOrdem.className = 'vd-select';
  selectOrdem.setAttribute('aria-label', 'Ordenar');
  (
    [
      ['recentes', 'Guardados por último'],
      ['nome', 'Nome'],
      ['tipo', 'Tipo de arquivo'],
    ] as const
  ).forEach(([valor, rotulo]) => {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = rotulo;
    selectOrdem.appendChild(opt);
  });
  selectOrdem.value = ordem;
  selectOrdem.addEventListener('change', () => {
    ordem = selectOrdem.value as Ordem;
    redesenhar();
  });
  barra.appendChild(selectOrdem);
  principal.appendChild(barra);

  const termo = normalizar(buscaLocal);
  const filtrados = bib.recursos.filter((r) => {
    if (filtroColecao === 'fixados' && !r.fixado) return false;
    if (filtroColecao === 'sem' && r.colecaoId) return false;
    if (!['tudo', 'fixados', 'sem'].includes(filtroColecao) && r.colecaoId !== filtroColecao) return false;
    if (!termo) return true;
    return normalizar([r.nome, r.nota, ...r.tags, r.relativo ?? ''].join(' ')).includes(termo);
  });

  if (bib.recursos.length === 0) {
    const adicionar = buildBotao('Adicionar arquivos', { icone: ICONES_BIBLIOTECA.mais, variante: 'primario' });
    adicionar.addEventListener('click', () => void exploradorState.adicionarPorDialogo());
    principal.appendChild(
      buildVazio(
        ICONES_BIBLIOTECA.livro,
        'Guarde aqui o que você usa sempre',
        'Roteiros, thumbnails, vinhetas, templates, referências. Adicione pelo botão, pela aba Busca ou pela estrela ☆ na aba Pastas. Os arquivos continuam onde estão — a Biblioteca só organiza.',
        adicionar,
      ),
    );
  } else if (filtrados.length === 0) {
    principal.appendChild(buildVazio(ICONES_BIBLIOTECA.lupa, 'Nada aqui', termo ? 'Nenhum item bate com o filtro.' : 'Esta coleção ainda está vazia.'));
  } else {
    const grade = document.createElement('div');
    grade.className = 'bb-grade';
    ordenarRecursos(filtrados).forEach((r) => grade.appendChild(buildCartao(r, bib.colecoes)));
    principal.appendChild(grade);
  }

  tela.appendChild(principal);
  return tela;
}

// ---------- Aba Recentes ----------

function buildLinhaArquivo(opcoes: {
  nome: string;
  caminho: string;
  tipo: 'arquivo' | 'pasta';
  detalhe: string;
  disponivel: boolean;
  naBiblioteca: boolean;
  extra?: HTMLElement;
  aoIrParaPasta?: () => void;
}): HTMLElement {
  const linha = document.createElement('div');
  linha.className = 'bb-linha';
  linha.classList.toggle('is-indisponivel', !opcoes.disponivel);
  linha.appendChild(buildIconeArquivo(opcoes.nome, opcoes.tipo, 16));

  const textos = document.createElement('button');
  textos.type = 'button';
  textos.className = 'bb-linha-textos';
  textos.title = opcoes.disponivel ? `Abrir ${opcoes.caminho}` : opcoes.caminho;
  const nome = document.createElement('span');
  nome.className = 'bb-linha-nome';
  nome.textContent = opcoes.nome;
  const detalhe = document.createElement('span');
  detalhe.className = 'bb-linha-detalhe';
  detalhe.textContent = opcoes.detalhe;
  textos.append(nome, detalhe);
  textos.addEventListener('click', () => {
    if (opcoes.disponivel) void exploradorState.abrirNoSistema(opcoes.caminho);
  });
  linha.appendChild(textos);
  if (opcoes.extra) linha.appendChild(opcoes.extra);

  const acoes = document.createElement('div');
  acoes.className = 'bb-cartao-acoes';
  if (opcoes.aoIrParaPasta) acoes.appendChild(botaoIcone(ICONES_BIBLIOTECA.revelar, 'Ir para a pasta na aba Pastas', opcoes.aoIrParaPasta));
  if (opcoes.disponivel) {
    acoes.appendChild(botaoIcone(ICONES_BIBLIOTECA.abrir, 'Mostrar no Explorer', () => void exploradorState.revelarNoSistema(opcoes.caminho)));
  }
  acoes.appendChild(botaoIcone(ICONES_BIBLIOTECA.copiar, 'Copiar caminho', () => window.irisAPI.system.copyToClipboard(opcoes.caminho)));
  const guardar = botaoIcone(
    ICONES_BIBLIOTECA.estrela,
    opcoes.naBiblioteca ? 'Já está na Biblioteca' : 'Guardar na Biblioteca',
    () => {
      if (!opcoes.naBiblioteca) void exploradorState.adicionarRecurso(opcoes.caminho);
    },
    opcoes.naBiblioteca ? 'bb-fixar is-fixado' : 'bb-fixar',
  );
  if (!opcoes.disponivel) guardar.disabled = true;
  acoes.appendChild(guardar);
  linha.appendChild(acoes);
  return linha;
}

export function buildAbaRecentes(state: ExploradorViewState): HTMLElement {
  const bib = state.biblioteca!;
  const tela = document.createElement('div');
  tela.className = 'bb-lista-tela';

  if (bib.recentes.length === 0) {
    tela.appendChild(buildVazio(ICONES_BIBLIOTECA.relogio, 'Nada aberto ainda', 'Os arquivos que você abrir pelo Iris aparecem aqui, do mais recente para o mais antigo.'));
    return tela;
  }

  const barra = document.createElement('div');
  barra.className = 'pg-barra';
  const espaco = document.createElement('span');
  espaco.className = 'pg-espaco';
  const limpar = buildBotao('Limpar histórico', { variante: 'fantasma' });
  limpar.addEventListener('click', () => void exploradorState.limparRecentes());
  barra.append(espaco, limpar);
  tela.appendChild(barra);

  const lista = document.createElement('div');
  lista.className = 'bb-lista';
  bib.recentes.forEach((r: RecenteDetalhado) => {
    lista.appendChild(
      buildLinhaArquivo({
        nome: r.nome,
        caminho: r.caminho,
        tipo: r.tipo,
        detalhe: `${tempoRelativo(r.em)} · ${r.caminho}`,
        disponivel: r.situacao === 'ok',
        naBiblioteca: Boolean(r.recursoId),
        extra: seloSituacao(r.situacao) ?? undefined,
      }),
    );
  });
  tela.appendChild(lista);
  return tela;
}

// ---------- Aba Busca ----------

export function buildAbaBusca(state: ExploradorViewState, irParaPasta: (item: ResultadoBuscaItem) => void): HTMLElement {
  const tela = document.createElement('div');
  tela.className = 'bb-lista-tela';

  const barra = document.createElement('div');
  barra.className = 'pg-barra bb-busca-barra';
  const busca = buildBusca(termoBusca, 'Buscar arquivos e pastas em todas as pastas monitoradas…', (v) => {
    termoBusca = v;
    if (timerBusca) clearTimeout(timerBusca);
    timerBusca = setTimeout(() => void exploradorState.buscar(termoBusca), 280);
  });
  busca.classList.add('bb-busca-grande');
  barra.appendChild(busca);
  if (state.buscando) barra.appendChild(buildSelo('buscando…', 'neutro'));
  tela.appendChild(barra);

  if (!state.raizes.raizes.length) {
    tela.appendChild(buildVazio(ICONES_BIBLIOTECA.lupa, 'Nenhuma pasta monitorada', 'A busca percorre as pastas monitoradas. Adicione uma na aba Pastas.'));
    return tela;
  }

  const resultado = state.busca;
  if (!resultado || termoBusca.trim().length < 2) {
    const dica = document.createElement('p');
    dica.className = 'bb-dica';
    dica.textContent = `Procura pelo nome em ${state.raizes.raizes.length} pasta(s) monitorada(s), ignorando node_modules, .git, dist e pastas ocultas. Várias palavras = todas precisam aparecer no nome.`;
    tela.appendChild(dica);
    return tela;
  }

  if (resultado.itens.length === 0) {
    tela.appendChild(buildVazio(ICONES_BIBLIOTECA.lupa, 'Nada encontrado', `Nenhum arquivo ou pasta com "${resultado.termo}" no nome.`));
    return tela;
  }

  const resumo = document.createElement('p');
  resumo.className = 'bb-dica';
  resumo.textContent = `${resultado.itens.length} resultado(s) para "${resultado.termo}"${resultado.truncado ? ' — a busca parou no limite; refine o termo para ver o resto' : ''}.`;
  tela.appendChild(resumo);

  const naBiblioteca = new Set((state.biblioteca?.recursos ?? []).map((r) => r.caminho.toLowerCase()));
  const lista = document.createElement('div');
  lista.className = 'bb-lista';
  resultado.itens.forEach((item) => {
    const onde = [item.raizNome, item.pastaRelativa].filter(Boolean).join(' / ');
    lista.appendChild(
      buildLinhaArquivo({
        nome: item.nome,
        caminho: item.caminho,
        tipo: item.tipo,
        detalhe: `${onde}${item.tipo === 'arquivo' ? ` · ${formatarTamanho(item.tamanho)}` : ''} · alterado ${tempoRelativo(item.modificadoEm)}`,
        disponivel: true,
        naBiblioteca: naBiblioteca.has(item.caminho.toLowerCase()),
        aoIrParaPasta: () => irParaPasta(item),
      }),
    );
  });
  tela.appendChild(lista);
  return tela;
}
