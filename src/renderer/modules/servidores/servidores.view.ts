import type { Servidor, ServidoresFile, ServidorTipo } from '../../../shared/types/servidores.types';
import { abrirTutorial } from '../../core/navegacao.js';
import { abrirMenu } from '../../ui/menu.js';
import { mensagemDeErro, openAvisoModal, openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildBotaoAjuda, buildBusca, buildCabecalho, buildSelo, buildVazio, focarBusca, ICONES, svg } from '../../ui/pagina.js';
import { abrirCadastro, buildEscolhaDeTipo, ICONE_SITE, ICONE_TERMINAL } from './servidores.cadastro.js';
import { buildDetalheHttp, buildDetalheSsh, ICONE_MAIS, limparSaidas, receberSaida, situacaoHttp, ultimaChecagem } from './servidores.detalhe.js';
import * as servidoresState from './servidores.state.js';
import * as terminais from './servidores.terminal.js';

/**
 * Servidores: à esquerda a lista (agrupada), à direita o servidor escolhido — ou um
 * terminal. As abas do lado direito são "Detalhes" e um terminal por sessão aberta,
 * de qualquer servidor, como as abas de um navegador.
 */

const ICONE_TELA_CHEIA = '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>';
const ICONE_SAIR_TELA_CHEIA = '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>';
const ICONE_MENU = '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>';

let raiz: HTMLElement | null = null;
let selecionadoId: string | null = null;
/** 'detalhe' ou o id de uma sessão de terminal. */
let aba: string = 'detalhe';
let busca = '';
let telaCheia = false;
let montado = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function rerender(): void {
  const state = servidoresState.getCurrentState();
  if (raiz && state) render(raiz, state);
}

// ---------- Ações ----------

async function novo(tipo?: ServidorTipo): Promise<void> {
  const id = await abrirCadastro({ tipo });
  if (id) {
    selecionadoId = id;
    aba = 'detalhe';
    rerender();
  }
}

async function editar(servidor: Servidor): Promise<void> {
  await abrirCadastro({ servidor });
}

async function remover(servidor: Servidor): Promise<void> {
  const abertos = terminais.sessoes().filter((s) => s.servidorId === servidor.id && s.aberta).length;
  const ok = await openConfirmModal({
    title: `Remover ${servidor.nome}?`,
    message: `O histórico de checagens e os comandos salvos vão junto${servidor.tipo === 'ssh' ? ', e a senha ou passphrase sai do cofre' : ''}.${abertos ? ` ${abertos === 1 ? 'O terminal aberto fecha' : `Os ${abertos} terminais abertos fecham`}.` : ''}`,
    confirmText: 'Remover',
  });
  if (!ok) return;
  for (const s of terminais.sessoes().filter((x) => x.servidorId === servidor.id)) await terminais.fechar(s.sessaoId);
  await servidoresState.remover(servidor.id);
  if (selecionadoId === servidor.id) selecionadoId = null;
}

async function abrirTerminal(servidorId: string): Promise<void> {
  try {
    aba = await terminais.abrir(servidorId);
    selecionadoId = servidorId;
    rerender();
  } catch (erro) {
    falhou(erro);
  }
}

function irParaTerminal(sessaoId: string): void {
  aba = sessaoId;
  const s = terminais.sessao(sessaoId);
  if (s) selecionadoId = s.servidorId;
  rerender();
}

function abrirMenuGeral(ancora: HTMLElement, file: ServidoresFile): void {
  const intervalos = [30, 60, 300, 900];
  abrirMenu(ancora, [
    { rotulo: 'Checagem automática', nota: true },
    {
      rotulo: file.healthAtivo ? 'Ligada — clique para pausar' : 'Pausada — clique para ligar',
      icone: file.healthAtivo ? ICONES.check : ICONES.ponto,
      fazer: () => void servidoresState.configHealth({ healthAtivo: !file.healthAtivo, healthIntervaloSeg: file.healthIntervaloSeg }).catch(falhou),
    },
    'separador',
    { rotulo: 'Ciclo de conferência', nota: true },
    ...intervalos.map((seg) => ({
      rotulo: seg < 60 ? `A cada ${seg} s` : `A cada ${seg / 60} min`,
      marcado: file.healthIntervaloSeg === seg,
      fazer: () => void servidoresState.configHealth({ healthAtivo: file.healthAtivo, healthIntervaloSeg: seg }).catch(falhou),
    })),
    'separador',
    { rotulo: 'Como funciona', icone: ICONES.tutorial, fazer: () => abrirTutorial('servidores') },
  ]);
}

// ---------- Lista ----------

function situacaoDaLinha(s: Servidor): { tom: 'ok' | 'atencao' | 'erro' | 'neutro'; texto: string; meta: string } {
  if (s.tipo === 'http') {
    const sit = situacaoHttp(s);
    const ultima = ultimaChecagem(s);
    return { ...sit, meta: ultima?.ok ? `${ultima.latenciaMs} ms` : ultima ? 'falhou' : '—' };
  }
  const abertas = terminais.sessoes().filter((x) => x.servidorId === s.id && x.aberta).length;
  return abertas ? { tom: 'ok', texto: 'Terminal aberto', meta: 'SSH' } : { tom: 'neutro', texto: 'SSH', meta: 'SSH' };
}

function buildLista(file: ServidoresFile): HTMLElement {
  const lado = el('aside', 'sv-lista');
  lado.appendChild(buildBusca(busca, 'Buscar servidor', (v) => {
    busca = v;
    rerender();
    focarBusca(raiz);
  }));

  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = file.servidores.filter((s) => {
    if (!termo) return true;
    const alvo = s.tipo === 'http' ? s.url : `${s.usuario}@${s.host}`;
    return `${s.nome} ${alvo} ${s.grupo ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo);
  });

  const rolagem = el('div', 'sv-lista-rolagem');
  rolagem.dataset.rolagem = 'sv-lista';
  if (visiveis.length === 0) rolagem.appendChild(el('p', 'sv-nota', 'Nada encontrado.'));

  const grupos = new Map<string, Servidor[]>();
  visiveis.forEach((s) => {
    const g = s.grupo?.trim() || '';
    grupos.set(g, [...(grupos.get(g) ?? []), s]);
  });
  const nomes = [...grupos.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')));
  nomes.forEach((g) => {
    if (nomes.length > 1 || g) rolagem.appendChild(el('h4', 'sv-lista-grupo', g || 'Sem grupo'));
    grupos.get(g)!.forEach((s) => {
      const item = el('button', `sv-item${s.id === selecionadoId ? ' is-ativo' : ''}`);
      item.type = 'button';
      const sit = situacaoDaLinha(s);
      const icone = el('span', `sv-item-icone is-${sit.tom}`);
      icone.innerHTML = svg(s.tipo === 'http' ? ICONE_SITE : ICONE_TERMINAL, 16, 1.9);
      const textos = el('span', 'sv-item-textos');
      textos.append(el('span', 'sv-item-nome', s.nome), el('span', 'sv-item-alvo', s.tipo === 'http' ? s.url.replace(/^https?:\/\//, '') : `${s.usuario}@${s.host}`));
      const lado = el('span', 'sv-item-lado');
      const ponto = el('span', `sv-ponto is-${sit.tom}`);
      ponto.title = sit.texto;
      lado.append(ponto, el('span', 'sv-item-meta', sit.meta));
      item.setAttribute('aria-label', `${s.nome} — ${sit.texto}`);
      item.append(icone, textos, lado);
      item.addEventListener('click', () => {
        selecionadoId = s.id;
        aba = 'detalhe';
        rerender();
      });
      rolagem.appendChild(item);
    });
  });
  lado.appendChild(rolagem);
  return lado;
}

// ---------- Abas e área da direita ----------

function buildAbas(servidor: Servidor | undefined): HTMLElement {
  const barra = el('div', 'sv-abas');
  barra.setAttribute('role', 'tablist');
  const detalhe = el('button', `sv-aba${aba === 'detalhe' ? ' is-ativa' : ''}`);
  detalhe.type = 'button';
  detalhe.setAttribute('role', 'tab');
  detalhe.innerHTML = svg(servidor?.tipo === 'ssh' ? ICONE_TERMINAL : ICONES.servidor, 14);
  detalhe.appendChild(el('span', undefined, 'Detalhes'));
  detalhe.title = servidor ? `Detalhes de ${servidor.nome}` : 'Detalhes';
  detalhe.addEventListener('click', () => {
    aba = 'detalhe';
    rerender();
  });
  barra.appendChild(detalhe);

  terminais.sessoes().forEach((s) => {
    const b = el('div', `sv-aba is-terminal${aba === s.sessaoId ? ' is-ativa' : ''}${s.aberta ? '' : ' is-fechada'}`);
    b.setAttribute('role', 'tab');
    b.tabIndex = 0;
    const ponto = el('span', `sv-ponto is-${s.aberta ? 'ok' : 'erro'}`);
    ponto.title = s.aberta ? 'Conectado' : (s.motivo ?? 'Desconectado');
    b.append(ponto, el('span', 'sv-aba-rotulo', s.titulo));
    const fechar = el('button', 'sv-aba-fechar');
    fechar.type = 'button';
    fechar.title = 'Fechar terminal';
    fechar.setAttribute('aria-label', `Fechar ${s.titulo}`);
    fechar.innerHTML = svg(ICONES.xis, 12, 2.2);
    fechar.addEventListener('click', (e) => {
      e.stopPropagation();
      void fecharAba(s.sessaoId);
    });
    b.appendChild(fechar);
    b.addEventListener('click', () => irParaTerminal(s.sessaoId));
    b.addEventListener('auxclick', (e) => {
      if (e.button === 1) void fecharAba(s.sessaoId);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') irParaTerminal(s.sessaoId);
    });
    barra.appendChild(b);
  });

  if (servidor?.tipo === 'ssh') {
    const mais = el('button', 'sv-aba-nova');
    mais.type = 'button';
    mais.title = `Novo terminal em ${servidor.nome}`;
    mais.innerHTML = svg(ICONE_MAIS, 14, 2);
    mais.addEventListener('click', () => void abrirTerminal(servidor.id));
    barra.appendChild(mais);
  }
  return barra;
}

async function fecharAba(sessaoId: string): Promise<void> {
  const s = terminais.sessao(sessaoId);
  if (s?.aberta) {
    const ok = await openConfirmModal({ title: 'Fechar o terminal?', message: 'A conexão com o servidor é encerrada. O que estiver rodando em primeiro plano no shell para junto.', confirmText: 'Fechar', danger: false });
    if (!ok) return;
  }
  const lista = terminais.sessoes();
  const i = lista.findIndex((x) => x.sessaoId === sessaoId);
  await terminais.fechar(sessaoId);
  if (aba === sessaoId) {
    const vizinha = terminais.sessoes()[Math.max(0, i - 1)];
    aba = vizinha ? vizinha.sessaoId : 'detalhe';
  }
  rerender();
}

function buildTerminal(sessaoId: string, file: ServidoresFile): HTMLElement {
  const s = terminais.sessao(sessaoId)!;
  const servidor = file.servidores.find((x) => x.id === s.servidorId);
  const area = el('div', 'sv-terminal');
  const barra = el('div', 'sv-terminal-barra');
  const alvo = servidor?.tipo === 'ssh' ? `${servidor.usuario}@${servidor.host}` : s.titulo;
  barra.append(el('code', 'sv-terminal-alvo', alvo), buildSelo(s.aberta ? 'Conectado' : 'Desconectado', s.aberta ? 'ok' : 'erro'));
  barra.appendChild(el('span', 'pg-espaco'));

  if (servidor?.tipo === 'ssh' && servidor.comandos.length && s.aberta) {
    const comandos = buildBotao('Comandos', { icone: ICONE_TERMINAL, variante: 'fantasma', titulo: 'Digitar um comando salvo' });
    comandos.type = 'button';
    comandos.addEventListener('click', () =>
      abrirMenu(comandos, servidor.comandos.map((c) => ({ rotulo: c.rotulo, icone: ICONES.play, fazer: () => terminais.digitar(sessaoId, c.comando) }))),
    );
    barra.appendChild(comandos);
  }
  if (!s.aberta && s.chaveMudou) {
    const confiar = buildBotao('Confiar na nova chave', { icone: ICONES.escudo });
    confiar.type = 'button';
    confiar.title = 'Só se você sabe por que a chave mudou (servidor reinstalado, por exemplo).';
    confiar.addEventListener('click', async () => {
      const ok = await openConfirmModal({
        title: 'Confiar na nova chave?',
        message: 'Faça isso só se você sabe por que a chave mudou — o servidor foi reinstalado ou trocou de máquina. Se não sabe, pode ser alguém se passando pelo servidor.',
        confirmText: 'Confiar e conectar',
        danger: false,
      });
      if (!ok) return;
      try {
        await servidoresState.confiarHost(s.servidorId);
        aba = await terminais.reconectar(sessaoId);
        rerender();
      } catch (erro) {
        falhou(erro);
      }
    });
    barra.appendChild(confiar);
  }
  if (!s.aberta) {
    const reconectar = buildBotao('Reconectar', { icone: ICONES.atualizar, variante: 'primario' });
    reconectar.type = 'button';
    reconectar.addEventListener('click', async () => {
      try {
        aba = await terminais.reconectar(sessaoId);
        rerender();
      } catch (erro) {
        falhou(erro);
      }
    });
    barra.appendChild(reconectar);
  }
  const cheia = buildBotao('', { icone: telaCheia ? ICONE_SAIR_TELA_CHEIA : ICONE_TELA_CHEIA, variante: 'fantasma', titulo: telaCheia ? 'Sair da tela cheia' : 'Tela cheia' });
  cheia.type = 'button';
  cheia.addEventListener('click', () => {
    telaCheia = !telaCheia;
    rerender();
  });
  barra.appendChild(cheia);
  area.appendChild(barra);

  const moldura = el('div', 'sv-terminal-moldura');
  area.appendChild(moldura);
  // O xterm é movido (não recriado) para a moldura nova: a sessão continua igual.
  terminais.montarEm(sessaoId, moldura, true);
  return area;
}

function buildVazioGeral(): HTMLElement {
  const wrap = el('div', 'sv-vazio');
  wrap.appendChild(
    buildVazio(
      ICONES.servidor,
      'Nenhum servidor ainda',
      'Vigie um site ou API — o Iris avisa quando cai ou fica lento — ou cadastre uma máquina para entrar por SSH num terminal aqui dentro.',
    ),
  );
  wrap.appendChild(buildEscolhaDeTipo((tipo) => void novo(tipo)));
  return wrap;
}

// ---------- Tela ----------

export function render(viewRoot: HTMLElement, state: ServidoresFile): void {
  raiz = viewRoot;
  if (!montado) {
    montado = true;
    servidoresState.onSaida(receberSaida);
    void terminais.reanexar(rerender).catch(falhou);
  }

  // Servidor apagado (aqui ou por desfazer) ou nada escolhido: o primeiro da lista.
  if (!state.servidores.some((s) => s.id === selecionadoId)) selecionadoId = state.servidores[0]?.id ?? null;
  if (aba !== 'detalhe' && !terminais.sessao(aba)) aba = 'detalhe';
  if (aba === 'detalhe') telaCheia = false;

  const rolagens = new Map<string, number>();
  viewRoot.querySelectorAll<HTMLElement>('[data-rolagem]').forEach((n) => rolagens.set(n.dataset.rolagem!, n.scrollTop));

  const view = el('div', `pg-view sv-view${telaCheia ? ' is-tela-cheia' : ''}`);

  const menu = buildBotao('', { icone: ICONE_MENU, variante: 'fantasma', titulo: 'Checagem automática' });
  menu.type = 'button';
  menu.addEventListener('click', () => abrirMenuGeral(menu, state));
  const checarTodos = buildBotao('Checar todos', { icone: ICONES.atualizar });
  checarTodos.type = 'button';
  checarTodos.addEventListener('click', async () => {
    checarTodos.disabled = true;
    try {
      await servidoresState.checarTodos();
    } catch (erro) {
      falhou(erro);
    } finally {
      checarTodos.disabled = false;
    }
  });
  const adicionar = buildBotao('Novo servidor', { icone: ICONE_MAIS, variante: 'primario' });
  adicionar.type = 'button';
  adicionar.addEventListener('click', () => void novo());

  const temHttp = state.servidores.some((s) => s.tipo === 'http');
  const pausada = temHttp && !state.healthAtivo;
  view.appendChild(
    buildCabecalho({
      icone: ICONES.servidor,
      titulo: 'Servidores',
      subtitulo: 'Sites que o Iris vigia e máquinas em que você entra por SSH',
      extras: pausada ? [buildSelo('Checagem pausada', 'atencao')] : [],
      acoes: [...(temHttp ? [checarTodos] : []), menu, adicionar, buildBotaoAjuda(() => abrirTutorial('servidores'))],
    }),
  );

  if (state.servidores.length === 0 && terminais.sessoes().length === 0) {
    view.appendChild(buildVazioGeral());
    viewRoot.replaceChildren(view);
    return;
  }

  const grade = el('div', 'sv-grade');
  grade.appendChild(buildLista(state));

  const direita = el('section', 'sv-direita');
  const servidor = state.servidores.find((s) => s.id === selecionadoId);
  direita.appendChild(buildAbas(servidor));
  if (aba !== 'detalhe') {
    direita.appendChild(buildTerminal(aba, state));
  } else if (servidor) {
    const corpo = el('div', 'sv-detalhe');
    corpo.dataset.rolagem = `sv-detalhe-${servidor.id}`;
    const ctx = {
      abrirTerminal: (id: string) => void abrirTerminal(id),
      irParaTerminal,
      editar: () => void editar(servidor).catch(falhou),
      remover: () => void remover(servidor).catch(falhou),
    };
    corpo.appendChild(servidor.tipo === 'http' ? buildDetalheHttp(servidor, ctx) : buildDetalheSsh(servidor, ctx));
    direita.appendChild(corpo);
  }
  grade.appendChild(direita);
  view.appendChild(grade);

  viewRoot.replaceChildren(view);
  viewRoot.querySelectorAll<HTMLElement>('[data-rolagem]').forEach((n) => {
    const topo = rolagens.get(n.dataset.rolagem!);
    if (topo) n.scrollTop = topo;
  });
}

export function destroy(): void {
  terminais.desmontar();
  limparSaidas();
  servidoresState.onSaida(null);
  raiz = null;
  montado = false;
  telaCheia = false;
}
