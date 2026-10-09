import type { ContatosFile } from '../../../shared/types/contatos.types.js';
import { abrirModulo, consumirSecaoApiLeads, onSecaoApiLeadsSolicitada, type SecaoApiLeads } from '../../core/navegacao.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { mensagemDeErro, openAvisoModal } from '../../ui/modal.js';
import { buildBotao, buildCabecalho, buildSelo, svg, type Tom } from '../../ui/pagina.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { buildChaves, buildLocal, buildNuvem, buildPassoAPasso, buildTestar, seloDaNuvem } from './api-leads.conexoes.js';
import { buildN8n, carregarN8n, esquecerN8n } from './api-leads.n8n.js';
import { acompanharStatus, carregarStatus, cartao, invalidarStatusApi, status, statusVelho, ultimoLead, type CtxApi } from './api-leads.pecas.js';
import { buildAvisos, buildPontuacao } from './api-leads.pontuacao.js';
import { buildNoSeuSite } from './api-leads.site.js';
import { NO_LINUX } from '../../ui/plataforma.js';

/**
 * API e n8n — tudo para um lead chegar ao Iris: a caixa na nuvem (o caminho
 * de um site publicado), o servidor local (testes, n8n e rede da casa), o n8n,
 * o que pôr no formulário do site, as chaves, a pontuação e os avisos.
 *
 * Um índice fixo à esquerda e uma seção por vez à direita, como Ajustes: cada
 * seção se explica sozinha. A chave do Iris nunca chega aqui (gerar e copiar
 * acontecem no main).
 */

interface Secao {
  id: SecaoApiLeads;
  rotulo: string;
  icone: string;
  titulo: string;
  explica: string;
  desenhar: (ctx: CtxApi) => HTMLElement[];
}

const SECOES: Secao[] = [
  {
    id: 'geral',
    rotulo: 'Visão geral',
    icone: ICONES_CONTATO.painel,
    titulo: 'Visão geral',
    explica: 'Os caminhos de um lead até o Iris, como está cada um agora e qual usar em cada caso.',
    desenhar: (ctx) => buildVisaoGeral(ctx),
  },
  {
    id: 'nuvem',
    rotulo: 'Caixa na nuvem',
    icone: ICONES_CONTATO.nuvem,
    titulo: 'Caixa na nuvem',
    explica: 'O caminho de um formulário publicado na internet: um Cloudflare Worker gratuito guarda o lead, a qualquer hora, e o Iris busca a cada minuto.',
    desenhar: (ctx) => [buildNuvem(ctx), buildPassoAPasso(ctx)],
  },
  {
    id: 'local',
    rotulo: 'Servidor local',
    icone: ICONES_CONTATO.servidor,
    titulo: 'Servidor local',
    explica: 'O Iris recebe leads direto, enquanto está aberto: para testar, para um n8n neste computador e para formulários na mesma rede.',
    desenhar: (ctx) => [buildLocal(ctx), buildQuemAlcanca(ctx), buildTestar(ctx)],
  },
  {
    id: 'n8n',
    rotulo: 'n8n',
    icone: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 11 16.5 6.8"/><path d="M7.5 13l9 4.2"/>',
    titulo: 'n8n',
    explica: 'Leve ao Iris leads de qualquer formulário ou ferramenta, por um fluxo do n8n — neste computador, em Docker ou num servidor.',
    desenhar: (ctx) => [buildN8n(ctx)],
  },
  {
    id: 'site',
    rotulo: 'No seu site',
    icone: ICONES_CONTATO.link,
    titulo: 'No seu site',
    explica: 'O que pôr no formulário: os campos, os códigos prontos (com o seu endereço e a sua chave) e as respostas da API.',
    desenhar: (ctx) => [buildNoSeuSite(ctx)],
  },
  {
    id: 'chaves',
    rotulo: 'Chaves',
    icone: ICONES_CONTATO.chave,
    titulo: 'Chaves',
    explica: 'A chave do formulário (pública, só envia) e a chave do Iris (secreta, só ela lê a caixa na nuvem).',
    desenhar: (ctx) => [buildChaves(ctx)],
  },
  {
    id: 'pontuacao',
    rotulo: 'Pontuação',
    icone: ICONES_CONTATO.alvo,
    titulo: 'Pontuação',
    explica: 'Quanto cada critério vale na nota de 0 a 100 de um lead, e onde começam quente, morno e frio.',
    desenhar: (ctx) => [buildPontuacao(ctx)],
  },
  {
    id: 'avisos',
    rotulo: 'Avisos',
    icone: ICONES_CONTATO.sino2,
    titulo: 'Avisos',
    explica: 'O que acontece quando um lead chega.',
    desenhar: (ctx) => [buildAvisos(ctx)],
  },
];

let container: HTMLElement | null = null;
let secao: SecaoApiLeads = 'geral';
let timerStatus: ReturnType<typeof setInterval> | null = null;
let pararPedidos: (() => void) | null = null;

const push = createPushBinding([
  () =>
    window.irisAPI.events.on('contatos:mudou', () => {
      invalidarStatusApi();
      carregarStatus();
      void contatosState.load().catch(() => undefined);
    }),
]);

export function montar(viewRoot: HTMLElement): void {
  container = viewRoot;
  esquecerN8n();
  secao = consumirSecaoApiLeads() ?? secao;
  pararPedidos?.();
  pararPedidos = onSecaoApiLeadsSolicitada((nova) => {
    consumirSecaoApiLeads();
    irPara(nova);
  });
  contatosState.onStateChange(() => desenhar());
  acompanharStatus(() => desenhar());
  push.attach();
  carregarStatus();
  // Enquanto o módulo está aberto, a última busca e o servidor se atualizam sozinhos.
  timerStatus = setInterval(carregarStatus, 15_000);
  void contatosState.load().catch(falhou);
}

export function destroy(): void {
  contatosState.offStateChange();
  acompanharStatus(null);
  push.detach();
  if (timerStatus) clearInterval(timerStatus);
  timerStatus = null;
  pararPedidos?.();
  pararPedidos = null;
  container = null;
}

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

function irPara(nova: SecaoApiLeads): void {
  secao = nova;
  desenhar(true);
}

function ctx(file: ContatosFile): CtxApi {
  return { file, redesenhar: () => desenhar(), falhou, irPara };
}

function desenhar(trocouDeSecao = false): void {
  const file = contatosState.getCurrentState();
  if (!container || !file) return;
  if (statusVelho()) carregarStatus();
  const rolagem = container.querySelector<HTMLElement>('.la-conteudo');
  const topo = trocouDeSecao ? 0 : (rolagem?.scrollTop ?? 0);
  container.replaceChildren(buildTela(file));
  const nova = container.querySelector<HTMLElement>('.la-conteudo');
  if (nova) nova.scrollTop = topo;
}

// ---------- Situação no índice ----------

function situacaoDe(id: SecaoApiLeads, file: ContatosFile): { texto: string; tom: Tom } | null {
  if (id === 'nuvem') return seloDaNuvem();
  if (id === 'local') {
    if (!file.leadsConfig.servidor.ativo) return { texto: 'Desligado', tom: 'neutro' };
    return status?.servidor.ouvindo ? { texto: 'Ligado', tom: 'ok' } : status?.servidor.erro ? { texto: 'Não ligou', tom: 'erro' } : null;
  }
  return null;
}

function buildTela(file: ContatosFile): HTMLElement {
  const view = el('div', 'pg-view la-view');
  const leads = buildBotao('Ver os leads', { variante: 'secundario', icone: ICONES_CONTATO.caixa });
  leads.addEventListener('click', () => abrirModulo('leads'));
  view.appendChild(
    buildCabecalho({
      icone: ICONES_CONTATO.api,
      titulo: 'API e n8n',
      subtitulo: 'Conecte o formulário do seu site e o n8n: cada lead vira um contato, com horário, origem e pontuação',
      acoes: [leads],
    }),
  );

  const grade = el('div', 'la-grade');
  const indice = el('nav', 'la-indice');
  indice.setAttribute('aria-label', 'Seções de API e n8n');
  SECOES.forEach((s) => {
    const b = el('button', `la-indice-item${s.id === secao ? ' is-ativo' : ''}`);
    b.type = 'button';
    if (s.id === secao) b.setAttribute('aria-current', 'page');
    b.innerHTML = svg(s.icone, 16);
    b.appendChild(el('span', 'la-indice-rotulo', s.rotulo));
    const sit = situacaoDe(s.id, file);
    if (sit) {
      // Bolinha + texto na dica e no nome acessível: a situação não fica só na cor.
      const ponto = el('span', `la-indice-ponto is-${sit.tom}`);
      ponto.title = sit.texto;
      b.appendChild(ponto);
      b.setAttribute('aria-label', `${s.rotulo} — ${sit.texto}`);
    }
    b.addEventListener('click', () => irPara(s.id));
    indice.appendChild(b);
  });
  grade.appendChild(indice);

  const atual = SECOES.find((s) => s.id === secao) ?? SECOES[0]!;
  const conteudo = el('main', 'la-conteudo');
  const cab = el('header', 'la-secao-cab');
  cab.append(el('h2', undefined, atual.titulo), el('p', undefined, atual.explica));
  conteudo.appendChild(cab);
  const corpo = el('div', 'la-secao');
  atual.desenhar(ctx(file)).forEach((e) => corpo.appendChild(e));
  conteudo.appendChild(corpo);
  grade.appendChild(conteudo);
  view.appendChild(grade);
  return view;
}

// ---------- Visão geral ----------

function buildVisaoGeral(c: CtxApi): HTMLElement[] {
  const file = c.file;
  carregarN8n(c);

  const caminhos = cartao('caminhos', ICONES_CONTATO.api, 'Os caminhos de um lead', 'Três jeitos de um lead chegar; no fim, sempre a mesma API e o mesmo tratamento.');
  const linhas: Array<[string, string, string]> = [
    ['Formulário do site', 'Caixa na nuvem', 'O Iris busca a cada minuto'],
    ['n8n neste computador', 'Servidor local', 'Chega na hora, com o Iris aberto'],
    ['n8n num servidor', 'Caixa na nuvem', 'O Iris busca a cada minuto'],
  ];
  const tabelaCaminhos = el('div', 'la-caminhos');
  linhas.forEach(([origem, meio, chegada]) => {
    const l = el('div', 'la-caminho');
    const seta = (): HTMLElement => {
      const s = el('span', 'la-caminho-seta');
      s.innerHTML = svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', 14);
      return s;
    };
    l.append(el('span', 'la-caminho-no', origem), seta(), el('span', 'la-caminho-no is-meio', meio), seta(), el('span', 'la-caminho-no is-iris', 'Iris'), el('span', 'la-caminho-nota', chegada));
    tabelaCaminhos.appendChild(l);
  });
  caminhos.corpo.appendChild(tabelaCaminhos);
  caminhos.corpo.appendChild(
    el(
      'p',
      'la-nota',
      'O Iris roda só no seu computador, e um site ou servidor na internet não consegue chegar até ele. Por isso o que vem da internet passa pela caixa na nuvem (Cloudflare, gratuita), que guarda o lead mesmo com o PC desligado. O que roda no próprio computador fala direto com o servidor local.',
    ),
  );

  // Situação de cada caminho, com atalho para a seção.
  const situacao = el('div', 'la-situacao');
  const cartaoSituacao = (id: SecaoApiLeads, icone: string, titulo: string, sit: { texto: string; tom: Tom }, linhasInfo: string[]): HTMLElement => {
    const b = el('button', 'la-sit');
    b.type = 'button';
    const topo = el('span', 'la-sit-topo');
    const i = el('span', 'la-sit-icone');
    i.innerHTML = svg(icone, 16);
    topo.append(i, el('strong', undefined, titulo), buildSelo(sit.texto, sit.tom));
    b.appendChild(topo);
    linhasInfo.forEach((t) => b.appendChild(el('span', 'la-sit-info', t)));
    b.addEventListener('click', () => irPara(id));
    return b;
  };
  const nuvem = file.leadsConfig.nuvem;
  situacao.appendChild(
    cartaoSituacao('nuvem', ICONES_CONTATO.nuvem, 'Caixa na nuvem', seloDaNuvem(), [nuvem.url ? nuvem.url.replace(/^https?:\/\//, '') : 'Ainda não criada', `Último lead: ${ultimoLead(c, 'nuvem')}`]),
  );
  const servidor = file.leadsConfig.servidor;
  situacao.appendChild(
    cartaoSituacao(
      'local',
      ICONES_CONTATO.servidor,
      'Servidor local',
      !servidor.ativo ? { texto: 'Desligado', tom: 'neutro' } : status?.servidor.ouvindo ? { texto: 'Ligado', tom: 'ok' } : { texto: 'Não ligou', tom: 'erro' },
      [servidor.ativo ? `http://127.0.0.1:${servidor.porta}${servidor.rede ? ' · aceita da rede local' : ''}` : 'Liga quando precisar', `Último lead: ${ultimoLead(c, 'local')}`],
    ),
  );
  situacao.appendChild(cartaoSituacao('n8n', SECOES.find((s) => s.id === 'n8n')!.icone, 'n8n', { texto: 'Ver o fluxo', tom: 'neutro' }, ['Fluxo pronto para colar ou criar', 'No PC, em Docker ou num servidor']));
  const caixaSituacao = cartao('situacao', ICONES_CONTATO.raio, 'Como está agora', 'Clique num caminho para configurar');
  caixaSituacao.corpo.appendChild(situacao);

  const qual = cartao('qual', ICONES_CONTATO.alvo, 'Qual caminho usar?', 'Pelo que você tem hoje');
  const tabela = el('div', 'la-campos la-qual');
  const cab = el('div', 'la-campo is-cabecalho');
  ['Você tem…', 'Use', 'Onde configurar'].forEach((t) => cab.appendChild(el('span', undefined, t)));
  tabela.appendChild(cab);
  const casos: Array<[string, string, SecaoApiLeads, string]> = [
    ['Um formulário num site publicado (WordPress, Wix, HTML…)', 'Caixa na nuvem', 'nuvem', 'Caixa na nuvem › passo a passo'],
    ['Um n8n instalado neste computador', 'Servidor local', 'n8n', 'n8n › Neste computador'],
    ['Um n8n em Docker neste computador', 'Servidor local + rede local', 'n8n', 'n8n › Em Docker'],
    ['Um n8n num servidor, VPS ou n8n Cloud', 'Caixa na nuvem', 'n8n', 'n8n › Num servidor'],
    ['Um formulário de teste, antes de publicar', 'Servidor local', 'local', 'Servidor local › Testar agora'],
    ['Outro aparelho na mesma rede (casa, escritório)', 'Servidor local + rede local', 'local', 'Servidor local'],
  ];
  casos.forEach(([caso, usar, id, onde]) => {
    const l = el('div', 'la-campo');
    const ir = el('button', 'ct-link', onde);
    ir.type = 'button';
    ir.addEventListener('click', () => irPara(id));
    l.append(el('span', undefined, caso), el('strong', 'la-qual-usar', usar), ir);
    tabela.appendChild(l);
  });
  qual.corpo.appendChild(tabela);

  return [caminhos.cartao, caixaSituacao.cartao, qual.cartao];
}

// ---------- Servidor local: quem alcança ----------

function buildQuemAlcanca(c: CtxApi): HTMLElement {
  const rede = c.file.leadsConfig.servidor.rede;
  const bloco = cartao('alcance', ICONES_CONTATO.alvo, 'Quem consegue enviar para o servidor local', rede ? 'Com "aceitar da rede local" ligado' : 'Só este computador, por enquanto');
  const linhas: Array<[string, boolean, string]> = [
    ['Este computador', true, 'Testes, formulários abertos aqui e um n8n instalado neste PC (127.0.0.1).'],
    ['n8n em Docker neste computador', rede, rede ? 'Pelo host.docker.internal.' : 'Ligue "aceitar da rede local": o contêiner não chega pelo 127.0.0.1.'],
    ['Outros aparelhos da mesma rede', rede, rede ? NO_LINUX ? 'Pelo endereço "Na rede da casa". Com firewall ligado (ufw), libere a porta.' : 'Pelo endereço "Na rede da casa". O Windows pode perguntar sobre o firewall: permita em redes privadas.' : 'Ligue "aceitar da rede local".'],
    ['Sites e servidores na internet', false, 'Nunca: o seu roteador não deixa entrar. Para eles existe a caixa na nuvem.'],
  ];
  const lista = el('ul', 'la-requisitos');
  linhas.forEach(([quem, alcanca, porque]) => {
    const li = el('li', alcanca ? 'is-ok' : 'is-falta');
    li.appendChild(buildSelo(alcanca ? 'Alcança' : 'Não alcança', alcanca ? 'ok' : 'neutro'));
    const t = el('span');
    t.append(el('strong', undefined, quem), document.createTextNode(` — ${porque}`));
    li.appendChild(t);
    lista.appendChild(li);
  });
  bloco.corpo.appendChild(lista);
  return bloco.cartao;
}
