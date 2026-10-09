import type { ContatosFile } from '../../../shared/types/contatos.types.js';
import { naoLidas, type WhatsappFile } from '../../../shared/types/whatsapp.types.js';
import { consumirSecaoWhatsapp, onSecaoWhatsappSolicitada, type SecaoWhatsapp } from '../../core/navegacao.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { mensagemDeErro, openAvisoModal } from '../../ui/modal.js';
import { buildCabecalho, svg, type Tom } from '../../ui/pagina.js';
import * as contatosState from '../contatos/contatos.state.js';
import { el } from '../contatos/contatos.ui.js';
import { buildConexao, soltarConexao } from './whatsapp.conexao.js';
import { atualizarConversas, buildConversas, soltarConversas } from './whatsapp.conversas.js';
import { buildEnvios } from './whatsapp.envios.js';
import { buildModelos } from './whatsapp.modelos.js';
import { provedoresProntos } from './whatsapp.composer.js';
import { ICONES_WA } from './whatsapp.ui.js';
import * as whatsappState from './whatsapp.state.js';

/**
 * O módulo WhatsApp: a caixa de entrada de todas as conversas, o envio para
 * vários, os modelos e a conexão (por qual caminho sai, por onde chega).
 * A conversa de um contato também vive na ficha dele, em Contatos.
 */

export interface CtxWa {
  wa: WhatsappFile;
  contatos: ContatosFile;
  redesenhar: () => void;
  falhou: (erro: unknown) => void;
  irPara: (secao: SecaoWhatsapp) => void;
}

interface Secao {
  id: SecaoWhatsapp;
  rotulo: string;
  icone: string;
  titulo: string;
  explica: string;
  desenhar: (ctx: CtxWa) => HTMLElement[];
  /** A conversa ocupa a altura toda (a lista rola por dentro). */
  cheia?: boolean;
}

const SECOES: Secao[] = [
  {
    id: 'conversas',
    rotulo: 'Conversas',
    icone: ICONES_WA.conversas,
    titulo: 'Conversas',
    explica: 'Todas as conversas, a mais recente primeiro. Número que ainda não está no cadastro aparece em "Sem cadastro".',
    desenhar: (c) => [buildConversas(c)],
    cheia: true,
  },
  {
    id: 'envios',
    rotulo: 'Envio para vários',
    icone: ICONES_WA.lote,
    titulo: 'Envio para vários',
    explica: 'A mesma mensagem, com os campos de cada um, para uma lista de contatos — um por vez, com intervalo, dentro do horário e do limite do dia.',
    desenhar: (c) => buildEnvios(c),
  },
  {
    id: 'modelos',
    rotulo: 'Modelos',
    icone: ICONES_WA.modelo,
    titulo: 'Modelos de mensagem',
    explica: 'Textos prontos com campos do cadastro ({primeiro_nome}, {empresa}…). Para a API oficial, ligue o modelo a um template aprovado pela Meta.',
    desenhar: (c) => buildModelos(c),
  },
  {
    id: 'conexao',
    rotulo: 'Conexão',
    icone: ICONES_WA.conexao,
    titulo: 'Conexão',
    explica: 'Por onde as mensagens saem e por onde as respostas e as confirmações de entrega chegam.',
    desenhar: (c) => buildConexao(c),
  },
];

let container: HTMLElement | null = null;
let secao: SecaoWhatsapp = 'conversas';
let pararPedidos: (() => void) | null = null;
let pararWa: (() => void) | null = null;

const push = createPushBinding([() => window.irisAPI.events.on('contatos:mudou', () => void contatosState.load().catch(() => undefined))]);

function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

export function montar(viewRoot: HTMLElement): void {
  container = viewRoot;
  secao = consumirSecaoWhatsapp() ?? secao;
  pararPedidos?.();
  pararPedidos = onSecaoWhatsappSolicitada((nova) => {
    consumirSecaoWhatsapp();
    irPara(nova);
  });
  contatosState.onStateChange(() => desenhar());
  // Na caixa de entrada, mensagem nova atualiza só a lista (a conversa aberta assina o state sozinha).
  pararWa = whatsappState.assinar((wa) => {
    if (secao === 'conversas' && container?.querySelector('.wa-caixa')) {
      atualizarConversas(wa);
      atualizarIndice(wa);
    } else desenhar();
  });
  push.attach();
  void Promise.all([contatosState.load(), whatsappState.load(), whatsappState.carregarStatus()])
    .then(() => desenhar())
    .catch(falhou);
}

export function destroy(): void {
  contatosState.offStateChange();
  pararWa?.();
  pararWa = null;
  push.detach();
  pararPedidos?.();
  pararPedidos = null;
  soltarConversas();
  soltarConexao();
  container = null;
}

function irPara(nova: SecaoWhatsapp): void {
  secao = nova;
  desenhar(true);
}

function situacaoDe(id: SecaoWhatsapp, wa: WhatsappFile): { texto: string; tom: Tom } | null {
  if (id === 'conversas') {
    const n = naoLidas(wa);
    return n ? { texto: `${n} não ${n === 1 ? 'lida' : 'lidas'}`, tom: 'ok' } : null;
  }
  if (id === 'envios') return wa.lotes.some((l) => l.situacao === 'rodando') ? { texto: 'Enviando', tom: 'atencao' } : null;
  if (id === 'conexao') {
    const prontos = provedoresProntos(whatsappState.statusAtual()).filter((p) => p !== 'link');
    return prontos.length ? { texto: 'Conectado', tom: 'ok' } : { texto: 'Só "Abrir no WhatsApp"', tom: 'neutro' };
  }
  return null;
}

/** Redesenha a seção atual, mantendo a rolagem (trocar de seção começa do topo). */
function desenhar(trocouDeSecao = false, forcar = false): void {
  const wa = whatsappState.atual();
  const contatos = contatosState.getCurrentState();
  if (!container || !wa || !contatos) return;
  const rolagem = container.querySelector<HTMLElement>('.la-conteudo');
  const topo = trocouDeSecao ? 0 : (rolagem?.scrollTop ?? 0);
  const foco = document.activeElement;
  const digitando = foco instanceof HTMLElement && container.contains(foco) && foco.matches('textarea, input:not([type="checkbox"])');
  if (!trocouDeSecao && !forcar && digitando) {
    // Quem está escrevendo (um modelo, a caixa da conversa, um campo da conexão) não perde o que digita.
    atualizarIndice(wa);
    return;
  }
  container.replaceChildren(buildTela(wa, contatos));
  const nova = container.querySelector<HTMLElement>('.la-conteudo');
  if (nova) nova.scrollTop = topo;
}

function ctx(wa: WhatsappFile, contatos: ContatosFile): CtxWa {
  return { wa, contatos, redesenhar: () => desenhar(false, true), falhou, irPara };
}

function atualizarIndice(wa: WhatsappFile): void {
  container?.querySelectorAll<HTMLButtonElement>('.la-indice-item').forEach((b) => {
    const s = SECOES.find((x) => x.id === b.dataset.secao);
    if (!s) return;
    b.querySelector('.la-indice-ponto')?.remove();
    const sit = situacaoDe(s.id, wa);
    if (sit) {
      const ponto = el('span', `la-indice-ponto is-${sit.tom}`);
      ponto.title = sit.texto;
      b.appendChild(ponto);
    }
  });
}

function buildTela(wa: WhatsappFile, contatos: ContatosFile): HTMLElement {
  const view = el('div', 'pg-view la-view wa-view');
  view.appendChild(
    buildCabecalho({
      icone: ICONES_WA.whatsapp,
      titulo: 'WhatsApp',
      subtitulo: 'Escreva no Iris e envie exatamente aquele texto — pela API oficial, Evolution, WAHA, n8n ou pelo WhatsApp do computador',
    }),
  );
  const grade = el('div', 'la-grade');
  const indice = el('nav', 'la-indice');
  indice.setAttribute('aria-label', 'Seções do WhatsApp');
  SECOES.forEach((s) => {
    const b = el('button', `la-indice-item${s.id === secao ? ' is-ativo' : ''}`);
    b.type = 'button';
    b.dataset.secao = s.id;
    if (s.id === secao) b.setAttribute('aria-current', 'page');
    b.innerHTML = svg(s.icone, 16);
    b.appendChild(el('span', 'la-indice-rotulo', s.rotulo));
    const sit = situacaoDe(s.id, wa);
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
  const conteudo = el('main', `la-conteudo${atual.cheia ? ' is-cheia' : ''}`);
  if (!atual.cheia) {
    const cab = el('header', 'la-secao-cab');
    cab.append(el('h2', undefined, atual.titulo), el('p', undefined, atual.explica));
    conteudo.appendChild(cab);
  }
  const corpo = el('div', `la-secao${atual.cheia ? ' is-cheia' : ''}`);
  atual.desenhar(ctx(wa, contatos)).forEach((e) => corpo.appendChild(e));
  conteudo.appendChild(corpo);
  grade.appendChild(conteudo);
  view.appendChild(grade);
  return view;
}
