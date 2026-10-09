import { refIgual, type ContatosFile, type RefContato } from '../../../shared/types/contatos.types.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { mensagemDeErro, openAvisoModal } from '../../ui/modal.js';
import { focarBusca } from '../../ui/pagina.js';
import { buildFicha, descarregarFicha, soltarFicha } from './contatos.ficha.js';
import { destruirFunil } from './contatos.funil.js';
import { buildContratoTela, descarregarContrato } from './contatos.contratos.js';
import * as contatosState from './contatos.state.js';
import { todosOsContatos } from './contatos.ui.js';

/**
 * A casca dos módulos de Relacionamento que mostram contatos (Contatos e
 * Leads): a tela do módulo e, por cima dela, a ficha de alguém ou um contrato
 * aberto. Tudo o que é comum mora aqui — o arquivo do state, o push de lead
 * novo, marcar lead como visto, a rolagem que sobrevive ao redesenho —, e o
 * módulo só desenha a própria tela.
 *
 * Só um módulo fica montado por vez (app.ts), então cada um cria a sua casca
 * e o state de contatos é compartilhado.
 */

export interface CtxContatos {
  file: ContatosFile;
  abrirFicha: (ref: RefContato) => void;
  abrirContrato: (id: string) => void;
  /** Do contrato volta para a ficha; da ficha, para a tela do módulo. */
  voltar: () => void;
  /** Redesenha com o arquivo atual (filtros e opções que só a tela guarda). */
  redesenhar: () => void;
  falhou: (erro: unknown) => void;
  /** Texto do botão de voltar da ficha: o nome do módulo de onde ela foi aberta. */
  rotuloVoltar: string;
}

export interface OpcoesCasco {
  rotuloVoltar: string;
  /** A tela do módulo, quando não há ficha nem contrato aberto. */
  desenharTela: (ctx: CtxContatos) => HTMLElement;
  /** Ficha pedida de fora (Ctrl+P, notificação): o pedido pendente e o ouvinte para quando o módulo já está aberto. */
  consumirPedido?: () => RefContato | null;
  onPedido?: (cb: (ref: RefContato) => void) => () => void;
  /** Push de lead novo: além de recarregar, o módulo pode invalidar o que guarda (ex.: o status da API). */
  aoMudar?: () => void;
  /** A tela do módulo tem texto não salvo fora do DOM? Então o push não redesenha. */
  emEdicao?: () => boolean;
  aoDestruir?: () => void;
}

export interface Casco {
  montar: (viewRoot: HTMLElement) => void;
  destroy: () => void;
  /** Para o módulo redesenhar depois de mudar algo que só ele guarda (trocar de aba começa do topo). */
  redesenhar: (trocouDeTela?: boolean) => void;
}

export function falhou(erro: unknown): void {
  void openAvisoModal('Não deu certo', mensagemDeErro(erro), { erro: true });
}

/** Abrir a ficha de um lead por qualquer caminho (lista, notificação, Ctrl+P) é tê-lo visto. */
function marcarVistoSeLead(ref: RefContato): void {
  if (ref.tipo !== 'pessoa') return;
  const pessoa = contatosState.getCurrentState()?.pessoas.find((p) => p.id === ref.id);
  if (pessoa?.entrada && !pessoa.entrada.visto) void contatosState.marcarVisto([ref.id]).catch(() => undefined);
}

export function criarCasco(op: OpcoesCasco): Casco {
  let container: HTMLElement | null = null;
  let fichaAberta: RefContato | null = null;
  let contratoAberto: string | null = null;
  let pararPedidos: (() => void) | null = null;
  /** O que está na tela: trocar de tela começa do topo; o mesmo redesenho mantém a rolagem. */
  let telaDesenhada = '';
  let vistoConferido = false;

  // Lead chegou. Com ficha ou contrato aberto, troca o cache sem redesenhar:
  // quem está digitando não perde o foco.
  const push = createPushBinding([
    () =>
      window.irisAPI.events.on('contatos:mudou', () => {
        op.aoMudar?.();
        if (fichaAberta || contratoAberto || op.emEdicao?.()) void contatosState.recarregarSilencioso().catch(() => undefined);
        else void contatosState.load().catch(() => undefined);
      }),
  ]);

  const ctx = (file: ContatosFile): CtxContatos => ({
    file,
    abrirFicha,
    abrirContrato,
    voltar,
    redesenhar: () => redesenhar(),
    falhou,
    rotuloVoltar: op.rotuloVoltar,
  });

  function descarregar(): Promise<unknown> {
    return Promise.all([descarregarFicha(), descarregarContrato()]);
  }

  function abrirFicha(ref: RefContato, desenhar = true): void {
    void descarregar().then(() => {
      fichaAberta = ref;
      contratoAberto = null;
      marcarVistoSeLead(ref);
      if (desenhar) redesenhar(true);
    });
  }

  function abrirContrato(id: string): void {
    void descarregar().then(() => {
      contratoAberto = id;
      redesenhar(true);
    });
  }

  function voltar(): void {
    void descarregar().then(() => {
      if (contratoAberto) contratoAberto = null;
      else fichaAberta = null;
      redesenhar(true);
    });
  }

  function redesenhar(trocouDeTela = false): void {
    const file = contatosState.getCurrentState();
    if (!container || !file) return;
    // A ficha pedida antes do primeiro arquivo (notificação, Ctrl+P) é marcada como vista agora.
    if (fichaAberta && !vistoConferido) {
      vistoConferido = true;
      marcarVistoSeLead(fichaAberta);
    }
    // Contato ou contrato excluído em outra ação: volta para a tela do módulo.
    if (contratoAberto && !file.contratos.some((c) => c.id === contratoAberto)) contratoAberto = null;
    if (fichaAberta && !todosOsContatos(file).some((i) => refIgual(i.ref, fichaAberta!))) fichaAberta = null;

    const tela = contratoAberto ? `contrato:${contratoAberto}` : fichaAberta ? `ficha:${fichaAberta.tipo}:${fichaAberta.id}` : 'tela';
    const rolagens =
      trocouDeTela || tela !== telaDesenhada ? null : [...container.querySelectorAll<HTMLElement>('[data-rolagem]')].map((e) => [e.dataset.rolagem!, e.scrollTop] as const);
    const buscaFocada = Boolean(document.activeElement?.closest('.pg-view .pg-busca'));
    telaDesenhada = tela;
    destruirFunil();

    const c = ctx(file);
    // Fora da ficha, a conversa do WhatsApp para de ouvir (a ficha refaz a dela a cada desenho).
    if (contratoAberto || !fichaAberta) soltarFicha();
    if (contratoAberto) container.replaceChildren(buildContratoTela(c, contratoAberto));
    else if (fichaAberta) container.replaceChildren(buildFicha(c, fichaAberta));
    else container.replaceChildren(op.desenharTela(c));

    rolagens?.forEach(([chave, topo]) => {
      const alvo = container?.querySelector<HTMLElement>(`[data-rolagem="${chave}"]`);
      if (alvo) alvo.scrollTop = topo;
    });
    if (buscaFocada) focarBusca(container);
  }

  return {
    montar(viewRoot) {
      container = viewRoot;
      contatosState.onStateChange(() => redesenhar());
      const pedido = op.consumirPedido?.();
      if (pedido) abrirFicha(pedido, false);
      pararPedidos?.();
      pararPedidos =
        op.onPedido?.((ref) => {
          op.consumirPedido?.();
          abrirFicha(ref);
        }) ?? null;
      push.attach();
      void contatosState.load().catch(falhou);
    },
    destroy() {
      void descarregarFicha();
      soltarFicha();
      void descarregarContrato();
      destruirFunil();
      contatosState.offStateChange();
      pararPedidos?.();
      pararPedidos = null;
      push.detach();
      op.aoDestruir?.();
      container = null;
      // Voltar ao módulo começa na tela dele (como em Relatórios); filtros ficam.
      fichaAberta = null;
      contratoAberto = null;
      telaDesenhada = '';
      vistoConferido = false;
    },
    redesenhar: (trocouDeTela = false) => redesenhar(trocouDeTela),
  };
}
