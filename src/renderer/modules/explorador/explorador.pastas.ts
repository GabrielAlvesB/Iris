import type { InfoGit, ItemDoDiretorio, RaizMonitorada } from '../../../shared/types/explorador.types';
import * as exploradorState from './explorador.state.js';
import type { ExploradorViewState } from './explorador.state.js';
import { ICONES_MODAL, openConfirmModal, openFormModal, promptText } from '../../ui/modal.js';
import { tempoRelativo } from '../../ui/pagina.js';
import { formatarTamanho } from './explorador.icones.js';

/**
 * Aba "Pastas" da Biblioteca: o navegador de arquivos das pastas monitoradas,
 * com as operações reais de disco. É por aqui que se chega aos arquivos que
 * valem virar recurso da Biblioteca.
 */

let rerender: () => void = () => undefined;
let filtro = '';

const ICON_PASTA =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const ICON_ARQUIVO =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

/** Faixa de contexto do repositório, só quando a pasta está dentro de um. */
function buildFaixaGit(git: InfoGit): HTMLElement {
  const faixa = document.createElement('div');
  faixa.className = 'explorador-git';

  const branch = document.createElement('span');
  branch.className = 'explorador-git-branch';
  branch.innerHTML =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7"/><path d="M18 10.5c0 4-4.5 3.5-6.5 5"/></svg>';
  const nomeBranch = document.createElement('span');
  nomeBranch.textContent = git.branch;
  branch.appendChild(nomeBranch);
  faixa.appendChild(branch);

  if (git.ahead !== undefined && git.behind !== undefined) {
    if (git.ahead > 0 || git.behind > 0) {
      const sincronia = document.createElement('span');
      sincronia.className = 'explorador-git-sync';
      const partes: string[] = [];
      if (git.ahead > 0) partes.push(`↑${git.ahead}`);
      if (git.behind > 0) partes.push(`↓${git.behind}`);
      sincronia.textContent = partes.join(' ');
      sincronia.title = `${git.ahead} commit(s) à frente, ${git.behind} atrás do remoto`;
      faixa.appendChild(sincronia);
    }
  } else {
    const semRemoto = document.createElement('span');
    semRemoto.className = 'explorador-git-sync is-neutro';
    semRemoto.textContent = 'sem remoto';
    semRemoto.title = 'Este branch não tem upstream configurado.';
    faixa.appendChild(semRemoto);
  }

  const alteracoes = document.createElement('span');
  alteracoes.className = `explorador-git-alteracoes${git.alteracoes > 0 ? ' is-pendente' : ''}`;
  alteracoes.textContent =
    git.alteracoes === 0
      ? 'sem alterações'
      : git.alteracoes === 1
        ? '1 alteração'
        : `${git.alteracoes} alterações`;
  faixa.appendChild(alteracoes);

  if (git.ultimoCommit) {
    const commit = document.createElement('span');
    commit.className = 'explorador-git-commit';

    const hash = document.createElement('code');
    hash.className = 'explorador-git-hash';
    hash.textContent = git.ultimoCommit.hash;
    commit.appendChild(hash);

    const mensagem = document.createElement('span');
    mensagem.className = 'explorador-git-mensagem';
    mensagem.textContent = git.ultimoCommit.mensagem;
    commit.appendChild(mensagem);

    const quando = document.createElement('span');
    quando.className = 'explorador-git-quando';
    quando.textContent = tempoRelativo(git.ultimoCommit.data);
    commit.appendChild(quando);

    commit.title = `${git.ultimoCommit.mensagem}\npor ${git.ultimoCommit.autor}`;
    faixa.appendChild(commit);
  }

  return faixa;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildSidebar(state: ExploradorViewState): HTMLElement {
  const lateral = document.createElement('aside');
  lateral.className = 'explorador-lateral';

  const titulo = document.createElement('div');
  titulo.className = 'explorador-lateral-titulo';
  titulo.textContent = 'PASTAS MONITORADAS';
  lateral.appendChild(titulo);

  const lista = document.createElement('div');
  lista.className = 'explorador-raizes';

  state.raizes.raizes.forEach((raiz: RaizMonitorada) => {
    const item = document.createElement('div');
    item.className = 'explorador-raiz';
    if (state.raizAtivaId === raiz.id) item.classList.add('is-ativa');

    const botao = document.createElement('button');
    botao.className = 'explorador-raiz-btn';
    botao.innerHTML = `${ICON_PASTA}<span class="explorador-raiz-nome"></span>`;
    const nomeEl = botao.querySelector('.explorador-raiz-nome');
    if (nomeEl) nomeEl.textContent = raiz.nome;
    botao.title = raiz.caminho;
    botao.addEventListener('click', () => void exploradorState.abrirDiretorio(raiz.id, ''));
    item.appendChild(botao);

    if (!raiz.monitoravel) {
      const aviso = document.createElement('span');
      aviso.className = 'explorador-raiz-aviso';
      aviso.textContent = 'sem auto';
      aviso.title = 'Caminho de rede: a atualização automática não é confiável aqui. Use Atualizar.';
      item.appendChild(aviso);
    }

    const remover = document.createElement('button');
    remover.className = 'btn-icon explorador-raiz-remover';
    remover.title = 'Parar de monitorar';
    remover.textContent = '×';
    remover.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmado = await openConfirmModal({
        title: 'Parar de monitorar',
        message: `"${raiz.nome}" sai da lista do Iris. Nenhum arquivo é apagado.`,
        confirmText: 'Parar de monitorar',
        danger: false,
      });
      if (confirmado) await exploradorState.removerRaiz(raiz.id);
    });
    item.appendChild(remover);

    lista.appendChild(item);
  });

  lateral.appendChild(lista);

  const adicionar = document.createElement('button');
  adicionar.className = 'btn btn-secondary explorador-adicionar';
  adicionar.textContent = '+ Monitorar pasta';
  adicionar.addEventListener('click', () => void exploradorState.adicionarRaiz());
  lateral.appendChild(adicionar);

  return lateral;
}

function buildTrilha(state: ExploradorViewState): HTMLElement {
  const trilha = document.createElement('nav');
  trilha.className = 'explorador-trilha';

  const raiz = state.raizes.raizes.find((r) => r.id === state.raizAtivaId);
  if (!raiz || !state.listagem) return trilha;

  function adicionarPasso(rotulo: string, relativo: string, ultimo: boolean): void {
    const btn = document.createElement('button');
    btn.className = 'explorador-passo';
    if (ultimo) btn.classList.add('is-atual');
    btn.textContent = rotulo;
    btn.addEventListener('click', () => void exploradorState.abrirDiretorio(raiz!.id, relativo));
    trilha.appendChild(btn);

    if (!ultimo) {
      const sep = document.createElement('span');
      sep.className = 'explorador-separador';
      sep.textContent = '/';
      trilha.appendChild(sep);
    }
  }

  const partes = state.listagem.relativo ? state.listagem.relativo.split('/') : [];
  adicionarPasso(raiz.nome, '', partes.length === 0);
  partes.forEach((parte, indice) => {
    adicionarPasso(parte, partes.slice(0, indice + 1).join('/'), indice === partes.length - 1);
  });

  return trilha;
}

async function criarItem(state: ExploradorViewState, tipo: 'arquivo' | 'pasta'): Promise<void> {
  if (!state.raizAtivaId || !state.listagem) return;

  const nome = await promptText(
    tipo === 'pasta' ? 'Nova pasta' : 'Novo arquivo',
    'Nome',
    tipo === 'arquivo' ? 'novo.txt' : '',
    { icone: ICONES_MODAL.pasta, subtitulo: state.listagem.relativo ? `Em ${state.listagem.relativo}` : 'Na raiz da pasta monitorada' },
  );
  if (!nome) return;

  await exploradorState.criar({
    raizId: state.raizAtivaId,
    relativo: state.listagem.relativo,
    nome,
    tipo,
  });
}

function buildBarraDeAcoes(state: ExploradorViewState): HTMLElement {
  const barra = document.createElement('div');
  barra.className = 'explorador-acoes';

  const novaPasta = document.createElement('button');
  novaPasta.className = 'btn btn-secondary explorador-btn-pequeno';
  novaPasta.textContent = '+ Pasta';
  novaPasta.addEventListener('click', () => void criarItem(state, 'pasta'));
  barra.appendChild(novaPasta);

  const novoArquivo = document.createElement('button');
  novoArquivo.className = 'btn btn-secondary explorador-btn-pequeno';
  novoArquivo.textContent = '+ Arquivo';
  novoArquivo.addEventListener('click', () => void criarItem(state, 'arquivo'));
  barra.appendChild(novoArquivo);

  const atualizar = document.createElement('button');
  atualizar.className = 'btn btn-secondary explorador-btn-pequeno';
  atualizar.textContent = 'Atualizar';
  atualizar.addEventListener('click', () => void exploradorState.recarregar());
  barra.appendChild(atualizar);

  const espaco = document.createElement('div');
  espaco.className = 'explorador-espaco';
  barra.appendChild(espaco);

  const campoFiltro = document.createElement('input');
  campoFiltro.type = 'search';
  campoFiltro.className = 'explorador-filtro';
  campoFiltro.placeholder = 'Filtrar nesta pasta…';
  campoFiltro.value = filtro;
  campoFiltro.addEventListener('input', () => {
    filtro = campoFiltro.value;
    rerender();
  });
  barra.appendChild(campoFiltro);

  return barra;
}

async function renomearItem(state: ExploradorViewState, item: ItemDoDiretorio): Promise<void> {
  if (!state.raizAtivaId) return;
  const novoNome = await promptText('Renomear', 'Novo nome', item.nome, { icone: ICONES_MODAL.texto, subtitulo: item.nome });
  if (!novoNome || novoNome === item.nome) return;

  await exploradorState.renomear({ raizId: state.raizAtivaId, caminho: item.caminho, novoNome });
}

async function excluirItem(state: ExploradorViewState, item: ItemDoDiretorio): Promise<void> {
  if (!state.raizAtivaId) return;

  const confirmado = await openConfirmModal({
    title: 'Mover para a lixeira',
    message: `"${item.nome}" vai para a Lixeira do Windows — dá para restaurar de lá.`,
    confirmText: 'Mover para a lixeira',
  });
  if (!confirmado) return;

  await exploradorState.excluir({ raizId: state.raizAtivaId, caminho: item.caminho });
}

async function moverItem(state: ExploradorViewState, item: ItemDoDiretorio): Promise<void> {
  if (!state.raizAtivaId || !state.listagem) return;

  // Só oferece as subpastas visíveis e a pasta acima: mover para qualquer
  // lugar exigiria um seletor de árvore que não cabe neste modal.
  const opcoes = [{ value: '', label: '(raiz da pasta monitorada)' }];
  if (state.listagem.relativo) {
    const acima = state.listagem.relativo.split('/').slice(0, -1).join('/');
    opcoes.push({ value: acima, label: '.. (uma pasta acima)' });
  }
  state.listagem.itens
    .filter((i) => i.tipo === 'pasta' && i.caminho !== item.caminho)
    .forEach((pasta) => {
      const destino = state.listagem!.relativo ? `${state.listagem!.relativo}/${pasta.nome}` : pasta.nome;
      opcoes.push({ value: destino, label: `→ ${pasta.nome}` });
    });

  const resposta = await openFormModal(
    `Mover "${item.nome}"`,
    [{ name: 'destino', label: 'Para onde', type: 'select', options: opcoes, defaultValue: '' }],
    'Mover',
    { icone: ICONES_MODAL.mover, subtitulo: 'Só as pastas visíveis aqui e a de cima.' },
  );
  if (!resposta) return;

  await exploradorState.mover({
    raizId: state.raizAtivaId,
    caminho: item.caminho,
    destinoRelativo: resposta.destino,
  });
}

function buildLinha(state: ExploradorViewState, item: ItemDoDiretorio): HTMLElement {
  const linha = document.createElement('div');
  linha.className = `explorador-linha explorador-linha--${item.tipo}`;
  if (item.statusGit) linha.classList.add(`is-git-${item.statusGit}`);

  const icone = document.createElement('span');
  icone.className = 'explorador-icone';
  icone.innerHTML = item.tipo === 'pasta' ? ICON_PASTA : ICON_ARQUIVO;
  linha.appendChild(icone);

  const nome = document.createElement('button');
  nome.className = 'explorador-nome';
  nome.textContent = item.nome;
  nome.addEventListener('click', () => {
    if (item.tipo === 'pasta' && state.raizAtivaId && state.listagem) {
      const relativo = state.listagem.relativo
        ? `${state.listagem.relativo}/${item.nome}`
        : item.nome;
      void exploradorState.abrirDiretorio(state.raizAtivaId, relativo);
    } else {
      void exploradorState.abrirNoSistema(item.caminho);
    }
  });
  linha.appendChild(nome);

  const tamanho = document.createElement('span');
  tamanho.className = 'explorador-col';
  tamanho.textContent = item.tipo === 'pasta' ? '—' : formatarTamanho(item.tamanho);
  linha.appendChild(tamanho);

  const data = document.createElement('span');
  data.className = 'explorador-col explorador-col--data';
  data.textContent = formatarData(item.modificadoEm);
  linha.appendChild(data);

  const acoes = document.createElement('div');
  acoes.className = 'explorador-linha-acoes';

  function botao(rotulo: string, titulo: string, onClick: () => void, classe = ''): void {
    const btn = document.createElement('button');
    btn.className = `btn-icon explorador-acao ${classe}`.trim();
    btn.title = titulo;
    btn.textContent = rotulo;
    btn.addEventListener('click', onClick);
    acoes.appendChild(btn);
  }

  botao('✎', 'Renomear', () => void renomearItem(state, item));
  botao('⇄', 'Mover', () => void moverItem(state, item));
  const naBiblioteca = state.biblioteca?.recursos.some((r) => r.caminho.toLowerCase() === item.caminho.toLowerCase());
  botao(naBiblioteca ? '★' : '☆', naBiblioteca ? 'Já está na Biblioteca' : 'Guardar na Biblioteca', () => {
    if (!naBiblioteca) void exploradorState.adicionarRecurso(item.caminho);
  }, naBiblioteca ? 'is-na-biblioteca' : '');
  botao('⧉', 'Copiar caminho', () => window.irisAPI.system.copyToClipboard(item.caminho));
  botao('⇱', 'Revelar no Explorer', () => void exploradorState.revelarNoSistema(item.caminho));
  botao('🗑', 'Mover para a lixeira', () => void excluirItem(state, item), 'explorador-acao--danger');

  linha.appendChild(acoes);
  return linha;
}

export function buildPastas(state: ExploradorViewState, redesenhar: () => void): HTMLElement {
  rerender = redesenhar;

  const view = document.createElement('div');
  view.className = 'explorador-view';

  view.appendChild(buildSidebar(state));

  const principal = document.createElement('section');
  principal.className = 'explorador-principal';

  if (state.raizes.raizes.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'explorador-vazio';
    vazio.textContent =
      'Nenhuma pasta monitorada ainda. Use "Monitorar pasta" para escolher a primeira.';
    principal.appendChild(vazio);
    view.appendChild(principal);
    return view;
  }

  principal.appendChild(buildTrilha(state));

  if (state.listagem?.git) {
    principal.appendChild(buildFaixaGit(state.listagem.git));
  }

  principal.appendChild(buildBarraDeAcoes(state));

  const cabecalho = document.createElement('div');
  cabecalho.className = 'explorador-linha explorador-cabecalho';
  cabecalho.innerHTML =
    '<span class="explorador-icone"></span><span class="explorador-nome">Nome</span>' +
    '<span class="explorador-col">Tamanho</span><span class="explorador-col explorador-col--data">Modificado</span>' +
    '<div class="explorador-linha-acoes"></div>';
  principal.appendChild(cabecalho);

  const lista = document.createElement('div');
  lista.className = 'explorador-lista';

  const termo = filtro.trim().toLocaleLowerCase('pt-BR');
  const itens = (state.listagem?.itens ?? []).filter(
    (item) => !termo || item.nome.toLocaleLowerCase('pt-BR').includes(termo),
  );

  if (itens.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'explorador-vazio';
    vazio.textContent = termo ? 'Nada bate com o filtro.' : 'Esta pasta está vazia.';
    lista.appendChild(vazio);
  } else {
    itens.forEach((item) => lista.appendChild(buildLinha(state, item)));
  }

  principal.appendChild(lista);

  if (state.listagem?.git && itens.some((item) => item.statusGit)) {
    const legenda = document.createElement('div');
    legenda.className = 'explorador-legenda';
    ([
      ['novo', 'novo'],
      ['modificado', 'modificado'],
      ['apagado', 'apagado'],
      ['ignorado', 'ignorado'],
    ] as const).forEach(([status, rotulo]) => {
      const item = document.createElement('span');
      item.className = `explorador-legenda-item is-git-${status}`;
      item.textContent = rotulo;
      legenda.appendChild(item);
    });
    principal.appendChild(legenda);
  }

  if (state.listagem?.truncado) {
    const aviso = document.createElement('div');
    aviso.className = 'explorador-truncado';
    aviso.textContent = 'Pasta muito grande: mostrando apenas os primeiros 1000 itens.';
    principal.appendChild(aviso);
  }

  view.appendChild(principal);
  return view;
}

export function limparPastas(): void {
  rerender = () => undefined;
  filtro = '';
}
