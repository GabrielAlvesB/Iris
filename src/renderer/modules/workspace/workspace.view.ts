import {
  APPS_WORKSPACE,
  FORMATOS,
  acharApp,
  emCriacao,
  tamanhoLegivel,
  type AppWorkspace,
  type EstadoApp,
  type EstadoWorkspace,
  type FormatoApp,
  type VersaoAnterior,
} from '../../../shared/types/workspace.types.js';
import { consumirWorkspacePendente, onWorkspaceSolicitado } from '../../core/navegacao.js';
import { renderMarkdown } from '../../ui/markdown.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildAviso, buildBotao, buildSegmentado, buildVazio, ICONES, svg, tempoRelativo } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import * as state from './workspace.state.js';
import { buildLinhaDoTempo } from './workspace.linha.js';
import {
  buildAcao,
  buildCeu,
  emAndamento,
  formatoSugerido,
  iconeDoApp,
  linhaDaVersao,
  seloDaSituacao,
  textoDaSituacao,
  type AcoesDoBotao,
} from './workspace.ui.js';

/**
 * Iris Workspace: a vitrine dos apps do ecossistema (o céu com as órbitas e, abaixo,
 * a lista de apps ao lado das novidades) e a página de cada app. O main faz
 * todo o trabalho; aqui só se desenha o EstadoWorkspace e se pede por id.
 */

let raiz: HTMLElement | null = null;
let soltar: (() => void) | null = null;
let soltarPedido: (() => void) | null = null;
/** Página aberta (id do app) ou null para a vitrine. */
let appAberto: string | null = null;
/** Formato escolhido na página de cada app, antes de instalar. */
const formatoEscolhido = new Map<string, FormatoApp>();
const versoes = new Map<string, VersaoAnterior[] | 'carregando' | string>();
/** Sem o progresso: se só ele mudou, o anel é atualizado no lugar. */
let ultimaChave = '';

type FiltroApps = 'todos' | 'instalados' | 'criacao';
const CHAVE_FILTRO = 'iris.workspace.filtro';
let filtroApps: FiltroApps = lerFiltro();

function lerFiltro(): FiltroApps {
  try {
    const v = localStorage.getItem(CHAVE_FILTRO);
    return v === 'instalados' || v === 'criacao' ? v : 'todos';
  } catch {
    return 'todos';
  }
}

function chave(e: EstadoWorkspace): string {
  return JSON.stringify(e.apps.map((a) => ({ ...a, progresso: a.situacao === 'baixando' ? undefined : a.progresso })));
}

export function montar(viewRoot: HTMLElement): void {
  raiz = viewRoot;
  appAberto = consumirWorkspacePendente() ?? appAberto;
  ultimaChave = '';
  soltar = state.assinar(redesenhar);
  soltarPedido = onWorkspaceSolicitado((id) => {
    consumirWorkspacePendente();
    appAberto = id;
    ultimaChave = '';
    const e = state.getEstado();
    if (e) redesenhar(e);
  });
  const atual = state.getEstado();
  if (atual) redesenhar(atual);
  else desenharCarregando();
  // Relê a cada entrada: detecta o que foi instalado ou removido por fora.
  void state.carregar().catch((erro: unknown) => falhou(erro));
}

export function destroy(): void {
  soltar?.();
  soltarPedido?.();
  soltar = null;
  soltarPedido = null;
  raiz = null;
}

function falhou(erro: unknown): void {
  mostrarToast(erro instanceof Error ? erro.message : String(erro));
}

function desenharCarregando(): void {
  if (!raiz) return;
  raiz.replaceChildren();
  const p = document.createElement('div');
  p.className = 'ws-pagina';
  const c = document.createElement('div');
  c.className = 'ws-ceu is-carregando';
  p.appendChild(c);
  raiz.appendChild(p);
}

function redesenhar(e: EstadoWorkspace): void {
  if (!raiz) return;
  const k = chave(e);
  if (k === ultimaChave) {
    atualizarProgresso(e);
    return;
  }
  ultimaChave = k;
  const rolagem = raiz.scrollTop;
  raiz.replaceChildren(appAberto && acharApp(appAberto) ? paginaDoApp(acharApp(appAberto)!, e) : vitrine(e));
  raiz.scrollTop = rolagem;
}

/** Durante o download chegam até cem pushes: só o anel e o número mudam. */
function atualizarProgresso(e: EstadoWorkspace): void {
  e.apps.forEach((a) => {
    const p = Math.round((a.progresso ?? 0) * 100);
    raiz?.querySelectorAll<HTMLElement>(`[data-anel="${a.id}"]`).forEach((anel) => {
      anel.style.setProperty('--p', String(p));
      anel.setAttribute('aria-valuenow', String(p));
      const num = anel.querySelector('.ws-anel-num');
      if (num && a.situacao === 'baixando') num.textContent = `${p}%`;
    });
    raiz?.querySelectorAll<HTMLElement>(`[data-selo="${a.id}"]`).forEach((s) => s.replaceWith(selo(a)));
    raiz?.querySelectorAll<HTMLElement>(`[data-andamento="${a.id}"]`).forEach((s) => (s.textContent = textoDaSituacao(a)));
  });
}

function selo(e: EstadoApp): HTMLElement {
  const s = seloDaSituacao(e);
  s.dataset.selo = e.id;
  return s;
}

function abrirPagina(appId: string | null): void {
  appAberto = appId;
  ultimaChave = '';
  const e = state.getEstado();
  if (e) redesenhar(e);
  raiz?.scrollTo({ top: 0 });
}

function acoesDe(app: AppWorkspace): AcoesDoBotao {
  return {
    instalar: (formato) => void instalar(app, formato),
    cancelar: () => void state.cancelar(app.id).catch(falhou),
    abrir: () => void state.abrir(app.id).then(() => mostrarToast(`Abrindo o ${app.nome}…`), falhou),
    verificar: () => void state.verificar(app.id).catch(falhou),
    pagina: () => void state.abrirPagina(app.id).catch(falhou),
  };
}

async function instalar(app: AppWorkspace, formato?: FormatoApp, versao?: string): Promise<void> {
  try {
    await state.instalar(app.id, formato, versao);
    const depois = state.getEstado()?.apps.find((a) => a.id === app.id);
    if (!depois || depois.erro || emAndamento(depois)) return;
    // Portátil e .tar.gz só baixam: o main já mostrou na pasta, e o app instalado (se houver) continua o mesmo.
    const soBaixou = depois.baixado && !FORMATOS[depois.baixado.formato].instala;
    if (soBaixou) {
      mostrarToast(`${depois.baixado!.nome} baixado e conferido.`, [{ rotulo: 'Mostrar na pasta', fazer: () => void state.mostrarNaPasta(app.id).catch(falhou) }]);
    } else if (depois.instalacao) {
      mostrarToast(`${app.nome} ${depois.instalacao.versao ? `v${depois.instalacao.versao} ` : ''}instalado.`, [
        { rotulo: 'Abrir', fazer: () => void state.abrir(app.id).catch(falhou) },
      ]);
    }
  } catch (erro) {
    falhou(erro);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function estadoDe(e: EstadoWorkspace, app: AppWorkspace): EstadoApp {
  return e.apps.find((a) => a.id === app.id) ?? { id: app.id, situacao: 'nao-publicado' };
}

/** Matiz do app numa variável: o cartão tinge a borda e o brilho com a cor dele. */
function comCorDoApp(node: HTMLElement, app: AppWorkspace): HTMLElement {
  node.style.setProperty('--ws-h', String(app.matiz));
  return node;
}

// ---------- Vitrine ----------

function fraseDoTopo(e: EstadoWorkspace): string {
  const instalados = e.apps.filter((a) => a.instalacao).length;
  const atualizacoes = e.apps.filter((a) => a.situacao === 'atualizacao').length;
  const total = APPS_WORKSPACE.length;
  const partes = [`${total} ${total === 1 ? 'app' : 'apps'} no ecossistema`];
  partes.push(instalados ? `${instalados} ${instalados === 1 ? 'instalado' : 'instalados'} aqui` : 'nenhum instalado aqui ainda');
  if (atualizacoes) partes.push(`${atualizacoes} com versão nova`);
  const emCriacao = e.apps.filter((a) => a.situacao === 'em-criacao').length;
  if (emCriacao) partes.push(`${emCriacao} em criação`);
  return partes.join(' · ');
}

function vitrine(e: EstadoWorkspace): HTMLElement {
  const pagina = el('div', 'ws-pagina');

  // O céu: textos à esquerda, a constelação à direita.
  const ceu = el('section', 'ws-ceu');
  const textos = el('div', 'ws-ceu-textos');
  textos.append(el('p', 'ws-rotulo', 'Iris Workspace'), el('h1', 'ws-titulo', 'Um ecossistema, vários apps.'));
  textos.appendChild(
    el('p', 'ws-ceu-sub', 'Os apps irmãos do Iris num lugar só: instale com um clique, abra daqui e receba as versões novas sem procurar.'),
  );
  textos.appendChild(el('p', 'ws-ceu-fato', fraseDoTopo(e)));
  const barra = el('div', 'ws-ceu-acoes');
  const procurar = buildBotao('Procurar atualizações', { icone: ICONES.atualizar, variante: 'secundario' });
  const verificando = e.apps.some((a) => a.situacao === 'verificando');
  procurar.disabled = verificando;
  procurar.classList.toggle('is-girando', verificando);
  procurar.addEventListener('click', () => void state.verificar().catch(falhou));
  barra.appendChild(procurar);
  const ultima = e.apps.map((a) => a.verificadoEm).filter(Boolean).sort().pop();
  if (ultima) barra.appendChild(el('span', 'ws-ceu-quando', `Conferido ${tempoRelativo(ultima)}`));
  textos.appendChild(barra);
  ceu.append(textos, buildCeu(e.apps, (id) => abrirPagina(id)));
  pagina.appendChild(ceu);

  // Abaixo do céu, duas colunas: os apps (uma lista só) e as novidades (a linha do tempo das versões).
  // Antes eram quatro seções empilhadas e o mesmo app aparecia em três delas.
  const corpo = el('div', 'ws-corpo');
  corpo.append(colunaDeApps(e), buildLinhaDoTempo(e, (id) => abrirPagina(id), redesenharTudo));
  pagina.appendChild(corpo);
  return pagina;
}

function redesenharTudo(): void {
  ultimaChave = '';
  const atual = state.getEstado();
  if (atual) redesenhar(atual);
}

/**
 * Instalados primeiro, depois o que dá para instalar, o que ainda não saiu e o que está em criação.
 * Atualização não muda a posição: o cartão pularia de lugar no meio do download.
 */
function ordemDoApp(app: AppWorkspace, e: EstadoApp): number {
  if (e.instalacao) return 0;
  if (emCriacao(app)) return 3;
  return e.situacao === 'nao-publicado' ? 2 : 1;
}

function colunaDeApps(e: EstadoWorkspace): HTMLElement {
  const col = el('section', 'ws-col');
  const instalados = APPS_WORKSPACE.filter((a) => estadoDe(e, a).instalacao).length;
  const futuros = APPS_WORKSPACE.filter((a) => emCriacao(a)).length;
  if (filtroApps === 'criacao' && !futuros) filtroApps = 'todos';

  const cab = el('header', 'ws-col-cab');
  cab.appendChild(el('h2', 'ws-col-titulo', 'Apps'));
  const opcoes: Array<{ value: FiltroApps; label: string }> = [
    { value: 'todos', label: 'Todos' },
    { value: 'instalados', label: instalados ? `Instalados · ${instalados}` : 'Instalados' },
  ];
  if (futuros) opcoes.push({ value: 'criacao', label: 'Em criação' });
  cab.appendChild(
    buildSegmentado(opcoes, filtroApps, (valor) => {
      filtroApps = valor;
      try {
        localStorage.setItem(CHAVE_FILTRO, valor);
      } catch {
        // Sem localStorage o filtro só não é lembrado.
      }
      redesenharTudo();
    }),
  );
  col.appendChild(cab);

  const lista = APPS_WORKSPACE.map((app, i) => ({ app, estado: estadoDe(e, app), i }))
    .filter(({ app, estado }) => (filtroApps === 'instalados' ? Boolean(estado.instalacao) : filtroApps === 'criacao' ? emCriacao(app) : true))
    .sort((a, b) => ordemDoApp(a.app, a.estado) - ordemDoApp(b.app, b.estado) || a.i - b.i);
  if (!lista.length) {
    col.appendChild(buildVazio(ICONES.backup, 'Nenhum app instalado aqui ainda', 'Em "Todos" estão os apps do ecossistema: cada um instala com um clique.'));
    return col;
  }
  const grade = el('div', 'ws-grade');
  lista.forEach(({ app, estado }) => grade.appendChild(cartao(app, estado)));
  col.appendChild(grade);
  return col;
}

/** Um desenho só de cartão, para todo app: instalado, disponível, em breve ou em criação. */
function cartao(app: AppWorkspace, e: EstadoApp): HTMLElement {
  const card = comCorDoApp(el('article', 'ws-cartao'), app);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Abrir a página do ${app.nome}`);
  card.addEventListener('click', () => abrirPagina(app.id));
  card.addEventListener('keydown', (ev) => {
    if (ev.target === card && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      abrirPagina(app.id);
    }
  });
  const topo = el('div', 'ws-cartao-topo');
  topo.append(iconeDoApp(app, 44), selo(e));
  card.appendChild(topo);
  card.append(el('h3', 'ws-cartao-nome', app.nome), el('p', 'ws-cartao-frase', app.frase));
  const meta = linhaDaVersao(e, undefined, true);
  if (meta) card.appendChild(el('p', 'ws-meta', meta));
  // Em criação o selo já diz tudo: um botão desativado só ocuparia o lugar.
  if (e.situacao !== 'em-criacao') card.appendChild(buildAcao(app, e, acoesDe(app)));
  return card;
}

// ---------- Página do app ----------

function paginaDoApp(app: AppWorkspace, estado: EstadoWorkspace): HTMLElement {
  const e = estadoDe(estado, app);
  const pagina = el('div', 'ws-pagina is-app');

  const voltar = buildBotao('Workspace', { icone: '<path d="m15 18-6-6 6-6"/>', variante: 'fantasma' });
  voltar.classList.add('ws-voltar');
  voltar.addEventListener('click', () => abrirPagina(null));
  pagina.appendChild(voltar);

  // Topo do app, na cor dele.
  const topo = comCorDoApp(el('header', 'ws-app-topo'), app);
  topo.appendChild(iconeDoApp(app, 104));
  const textos = el('div', 'ws-app-textos');
  const linha = el('div', 'ws-destaque-linha');
  linha.append(el('h1', 'ws-app-nome', app.nome), selo(e));
  textos.append(linha, el('p', 'ws-destaque-frase', app.frase));
  const meta = linhaDaVersao(e, formatoEscolhido.get(app.id));
  if (meta) textos.appendChild(el('p', 'ws-meta', meta));
  textos.appendChild(buildAcao(app, e, acoesDe(app), formatoEscolhido.get(app.id)));
  topo.appendChild(textos);
  pagina.appendChild(topo);
  if (e.erro) pagina.appendChild(buildAviso(e.erro, 'erro'));
  if (e.situacao === 'em-criacao') {
    pagina.appendChild(
      buildAviso(
        `${app.nome} está em criação. Quando ele ganhar repositório e a primeira versão, esta página passa a mostrar as novidades e o botão Instalar.`,
        'neutro',
      ),
    );
  }
  if (e.situacao === 'nao-publicado') {
    pagina.appendChild(
      buildAviso(
        `${app.nome} ainda não tem uma versão pública no GitHub. Assim que a primeira sair, o botão vira Instalar — o Iris confere sozinho a cada 6 horas.`,
        'neutro',
      ),
    );
  }

  const colunas = el('div', 'ws-app-colunas');
  const principal = el('div', 'ws-app-principal');
  const lado = el('aside', 'ws-app-lado');

  const sobre = bloco('Sobre');
  sobre.appendChild(el('p', 'ws-texto', app.descricao));
  const recursos = el('div', 'ws-recursos');
  app.recursos.forEach((r) => {
    const item = el('div', 'ws-recurso');
    item.append(el('strong', undefined, r.titulo), el('span', undefined, r.texto));
    recursos.appendChild(item);
  });
  if (app.recursos.length) sobre.appendChild(recursos);
  principal.appendChild(sobre);

  if (e.release) {
    const novidades = bloco(`Novidades da v${e.release.versao}`);
    if (e.release.titulo && e.release.titulo !== e.release.versao && e.release.titulo !== `v${e.release.versao}`) {
      novidades.appendChild(el('p', 'ws-texto ws-forte', e.release.titulo));
    }
    novidades.appendChild(e.release.notas.trim() ? renderMarkdown(e.release.notas) : el('p', 'ws-texto ws-fraco', 'Esta versão não tem notas.'));
    novidades.classList.add('ws-novidades');
    principal.appendChild(novidades);
  }

  // Em criação não há o que instalar, versão nem página no GitHub: a página fica numa coluna só.
  if (e.situacao === 'em-criacao') colunas.classList.add('is-uma');
  else {
    if (e.release && e.release.arquivos.length) lado.appendChild(blocoFormatos(app, e));
    lado.appendChild(blocoNesteComputador(app, e));
    lado.appendChild(blocoVersoes(app, e));
  }

  colunas.append(principal, lado);
  pagina.appendChild(colunas);
  return pagina;
}

function bloco(titulo: string): HTMLElement {
  const b = el('section', 'ws-bloco');
  b.appendChild(el('h2', 'ws-bloco-titulo', titulo));
  return b;
}

function blocoFormatos(app: AppWorkspace, e: EstadoApp): HTMLElement {
  const b = bloco('Como instalar');
  const atual = formatoSugerido(e, formatoEscolhido.get(app.id));
  const lista = el('div', 'ws-formatos');
  lista.setAttribute('role', 'radiogroup');
  lista.setAttribute('aria-label', 'Formato');
  e.release!.arquivos.forEach((arq) => {
    const op = el('button', 'ws-formato');
    op.type = 'button';
    op.setAttribute('role', 'radio');
    op.setAttribute('aria-checked', String(arq.formato === atual));
    op.classList.toggle('is-ativo', arq.formato === atual);
    op.disabled = emAndamento(e);
    const cab = el('span', 'ws-formato-cab');
    cab.append(el('strong', undefined, FORMATOS[arq.formato].rotulo), el('span', 'ws-formato-tam', tamanhoLegivel(arq.tamanho)));
    op.append(cab, el('span', 'ws-formato-texto', FORMATOS[arq.formato].explicacao));
    op.addEventListener('click', () => {
      formatoEscolhido.set(app.id, arq.formato);
      ultimaChave = '';
      redesenhar(state.getEstado()!);
    });
    lista.appendChild(op);
  });
  b.appendChild(lista);
  if (!e.release!.temSomas) b.appendChild(buildAviso('Esta versão não traz o SHA256SUMS.txt e o GitHub não publicou o hash dos arquivos: sem isso o Iris não confere o arquivo e não instala.', 'atencao'));
  else {
    const nota = el('p', 'ws-nota');
    nota.innerHTML = svg(ICONES.escudo, 13, 2);
    nota.appendChild(document.createTextNode('Todo arquivo é conferido pelo SHA-256 publicado na versão antes de instalar.'));
    b.appendChild(nota);
  }
  return b;
}

function blocoNesteComputador(app: AppWorkspace, e: EstadoApp): HTMLElement {
  const b = bloco('Neste computador');
  const linhas = el('dl', 'ws-dados');
  const linha = (rotulo: string, valor: string): void => {
    linhas.append(el('dt', undefined, rotulo), el('dd', undefined, valor));
  };
  linha('Situação', e.instalacao ? (e.instalacao.versao ? `Instalado, v${e.instalacao.versao}` : 'Instalado') : 'Não instalado');
  if (e.instalacao?.local) linha('Onde', e.instalacao.local);
  if (e.baixado) linha('Último download', `${e.baixado.nome}`);
  if (e.verificadoEm) linha('Conferido', tempoRelativo(e.verificadoEm));
  b.appendChild(linhas);

  const acoes = el('div', 'ws-bloco-acoes');
  if (e.instalacao || e.baixado) {
    const pasta = buildBotao('Mostrar na pasta', { icone: ICONES.pasta, variante: 'secundario' });
    pasta.addEventListener('click', () => void state.mostrarNaPasta(app.id).catch(falhou));
    acoes.appendChild(pasta);
  }
  const github = buildBotao('Página no GitHub', { icone: ICONES.externo, variante: 'secundario' });
  github.addEventListener('click', () => void state.abrirPagina(app.id).catch(falhou));
  acoes.appendChild(github);
  if (e.instalacao && !emAndamento(e)) {
    const tirar = buildBotao('Desinstalar…', { variante: 'fantasma' });
    tirar.classList.add('is-perigo');
    tirar.addEventListener('click', () => void desinstalar(app, e));
    acoes.appendChild(tirar);
  }
  b.appendChild(acoes);
  return b;
}

async function desinstalar(app: AppWorkspace, e: EstadoApp): Promise<void> {
  if (e.instalacao?.via === 'workspace') {
    const ok = await openConfirmModal({
      title: `Remover o ${app.nome}`,
      message: `O arquivo ${e.instalacao.local ?? ''} será apagado. Os seus documentos não são tocados.`,
      confirmText: 'Remover',
    });
    if (!ok) return;
  }
  await state.desinstalar(app.id).catch(falhou);
}

function blocoVersoes(app: AppWorkspace, e: EstadoApp): HTMLElement {
  const b = bloco('Versões');
  const lista = versoes.get(app.id);
  if (!lista) {
    b.appendChild(el('p', 'ws-texto ws-fraco', 'Precisa voltar para uma versão anterior? Liste as versões publicadas.'));
    const listar = buildBotao('Ver versões', { icone: ICONES.branch, variante: 'secundario' });
    listar.disabled = e.situacao === 'nao-publicado';
    listar.addEventListener('click', () => void carregarVersoes(app.id));
    b.appendChild(listar);
    return b;
  }
  if (lista === 'carregando') {
    b.appendChild(el('p', 'ws-texto ws-fraco', 'Buscando no GitHub…'));
    return b;
  }
  if (typeof lista === 'string') {
    b.appendChild(buildAviso(lista, 'erro'));
    return b;
  }
  if (!lista.length) {
    b.appendChild(el('p', 'ws-texto ws-fraco', 'Nenhuma versão publicada ainda.'));
    return b;
  }
  const ul = el('ul', 'ws-versoes');
  lista.forEach((v) => {
    const li = el('li', 'ws-versao');
    const t = el('div', 'ws-versao-textos');
    const nome = el('strong', undefined, `v${v.versao}`);
    t.appendChild(nome);
    if (v.preRelease) t.appendChild(el('span', 'ws-versao-pre', 'pré-lançamento'));
    t.appendChild(el('span', 'ws-versao-data', new Date(v.publicadaEm).toLocaleDateString('pt-BR')));
    li.appendChild(t);
    const atual = e.instalacao?.versao === v.versao;
    if (atual) li.appendChild(el('span', 'ws-versao-atual', 'instalada'));
    else {
      const instalarEsta = buildBotao('Instalar', { variante: 'fantasma' });
      instalarEsta.disabled = emAndamento(e);
      instalarEsta.addEventListener('click', () => void instalarVersao(app, e, v.versao));
      li.appendChild(instalarEsta);
    }
    ul.appendChild(li);
  });
  b.appendChild(ul);
  return b;
}

async function carregarVersoes(appId: string): Promise<void> {
  versoes.set(appId, 'carregando');
  ultimaChave = '';
  redesenhar(state.getEstado()!);
  try {
    versoes.set(appId, await state.listarVersoes(appId));
  } catch (erro) {
    versoes.set(appId, erro instanceof Error ? erro.message : String(erro));
  }
  ultimaChave = '';
  const e = state.getEstado();
  if (e) redesenhar(e);
}

async function instalarVersao(app: AppWorkspace, e: EstadoApp, versao: string): Promise<void> {
  const voltando = e.instalacao?.versao && e.release && versao !== e.release.versao;
  if (voltando) {
    const ok = await openConfirmModal({
      title: `Instalar a v${versao}`,
      message: `Esta não é a versão mais nova do ${app.nome}. Documentos salvos com recursos de uma versão mais nova podem não abrir igual.`,
      confirmText: 'Instalar mesmo assim',
      danger: false,
    });
    if (!ok) return;
  }
  await instalar(app, formatoEscolhido.get(app.id), versao);
}
