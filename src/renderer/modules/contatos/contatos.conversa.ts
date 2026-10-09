import { refIgual, type EmpresaCrm, type Pessoa, type RefContato } from '../../../shared/types/contatos.types.js';
import { mesmoNumeroWa, numeroWhatsapp, telefonesWhatsappDe } from '../../../shared/types/whatsapp.numero.js';
import { descritorProvedor, mensagensDe, naoLidas, type MensagemWa, type WhatsappFile } from '../../../shared/types/whatsapp.types.js';
import { abrirWhatsapp } from '../../core/navegacao.js';
import { openConfirmModal } from '../../ui/modal.js';
import { buildBotao, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import { buildComposer } from '../whatsapp/whatsapp.composer.js';
import { ICONES_WA, buildBolha, diaDaMensagem } from '../whatsapp/whatsapp.ui.js';
import * as whatsappState from '../whatsapp/whatsapp.state.js';
import type { CtxContatos } from './contatos.casco.js';
import { el, quandoFoi } from './contatos.ui.js';

/**
 * A aba Conversa da ficha: o WhatsApp com este contato, como no celular —
 * bolhas por dia, a situação de cada mensagem e a caixa de escrever embaixo.
 *
 * Mensagem chegando com a aba aberta redesenha só a lista: o que está sendo
 * escrito na caixa não perde o foco nem o texto.
 */

/** Conversas já sincronizadas nesta sessão (a busca na Evolution/WAHA é uma por abertura de ficha). */
const sincronizadas = new Set<string>();

export interface AbaConversa {
  el: HTMLElement;
  destruir(): void;
  focar(): void;
}

function chaveDe(ref: RefContato): string {
  return `${ref.tipo}:${ref.id}`;
}

function semCadastroDoContato(file: WhatsappFile, c: Pessoa | EmpresaCrm): MensagemWa[] {
  const numeros = telefonesWhatsappDe(c)
    .map((t) => numeroWhatsapp(t.numero))
    .filter((n): n is string => Boolean(n));
  return file.mensagens.filter((m) => !m.contato && numeros.some((n) => mesmoNumeroWa(n, m.numero)));
}

/** Só o arquivo e o aviso de erro: o módulo WhatsApp monta a mesma conversa fora da ficha. */
export type CtxConversa = Pick<CtxContatos, 'file' | 'falhou'>;

export function buildAbaConversa(ctx: CtxConversa, ref: RefContato, c: Pessoa | EmpresaCrm, numeroPedido?: string): AbaConversa {
  const aba = el('div', 'cf-conversa');
  const topo = el('div', 'cf-conversa-topo');
  const juntar = el('div', 'cf-conversa-juntar');
  const lista = el('div', 'wa-lista');
  lista.dataset.rolagem = 'conversa';
  lista.setAttribute('role', 'log');
  lista.setAttribute('aria-label', 'Mensagens');

  const numeros = [...new Set(telefonesWhatsappDe(c).map((t) => numeroWhatsapp(t.numero)).filter((n): n is string => Boolean(n)))];
  // O telefone clicado na Visão geral vai primeiro.
  if (numeroPedido) numeros.sort((a, b) => Number(mesmoNumeroWa(b, numeroPedido)) - Number(mesmoNumeroWa(a, numeroPedido)));
  const composer = buildComposer({ chave: chaveDe(ref), contato: { ref, c, contatos: ctx.file }, numeros }, () => rolarParaFim(true));

  aba.append(topo, juntar, lista, composer.el);

  let primeira = true;
  function rolarParaFim(forcar = false): void {
    requestAnimationFrame(() => {
      if (forcar || primeira || lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80) lista.scrollTop = lista.scrollHeight;
      primeira = false;
    });
  }

  const desenharTopo = (file: WhatsappFile | null): void => {
    topo.replaceChildren();
    const textos = el('div', 'cf-conversa-textos');
    textos.appendChild(el('h3', undefined, 'WhatsApp'));
    const msgs = file ? mensagensDe(file, ref) : [];
    const ultima = msgs[msgs.length - 1];
    textos.appendChild(
      el(
        'span',
        undefined,
        ultima ? `Última mensagem ${quandoFoi(diaDaMensagem(ultima.criadaEm))} · ${msgs.length} ${msgs.length === 1 ? 'mensagem' : 'mensagens'}` : 'Nenhuma mensagem ainda',
      ),
    );
    topo.appendChild(textos);
    const provedor = file?.config.provedor;
    if (provedor === 'evolution' || provedor === 'waha') {
      const sync = buildBotao('Buscar mensagens', { variante: 'fantasma', icone: ICONES_WA.sincronizar, titulo: `Buscar as últimas mensagens desta conversa em ${descritorProvedor(provedor).rotulo}` });
      sync.addEventListener('click', () => void sincronizar(true, sync));
      topo.appendChild(sync);
    }
    const conexao = buildBotao('', { variante: 'fantasma', icone: ICONES_WA.conexao, titulo: 'Conexão do WhatsApp' });
    conexao.setAttribute('aria-label', 'Conexão do WhatsApp');
    conexao.addEventListener('click', () => abrirWhatsapp('conexao'));
    topo.appendChild(conexao);
  };

  const desenharJuntar = (file: WhatsappFile | null): void => {
    juntar.replaceChildren();
    const soltas = file ? semCadastroDoContato(file, c) : [];
    juntar.hidden = !soltas.length;
    if (!soltas.length) return;
    const p = el('div', 'wa-aviso is-info');
    p.innerHTML = svg(ICONES_WA.conversas, 14, 2);
    p.appendChild(el('span', undefined, `${soltas.length} ${soltas.length === 1 ? 'mensagem deste número chegou' : 'mensagens deste número chegaram'} antes do cadastro (estão em "Sem cadastro").`));
    const b = el('button', 'ct-link', 'Juntar a esta conversa');
    b.type = 'button';
    b.addEventListener('click', () => {
      const numeroSolto = soltas[0]!.numero;
      void whatsappState.ligarNumero(numeroSolto, ref).catch(ctx.falhou);
    });
    p.appendChild(b);
    juntar.appendChild(p);
  };

  const desenharLista = (file: WhatsappFile | null): void => {
    lista.replaceChildren();
    const msgs = file ? mensagensDe(file, ref) : [];
    if (!msgs.length) {
      const vazio = el('div', 'wa-vazio');
      vazio.innerHTML = svg(ICONES_WA.whatsapp, 28, 1.5);
      vazio.append(
        el('strong', undefined, numeros.length ? 'Comece a conversa' : 'Sem número de WhatsApp'),
        el('p', undefined, numeros.length ? 'O que você escrever aqui sai exatamente assim — confira na prévia antes de enviar.' : 'Adicione um celular (ou marque um telefone como WhatsApp) na Visão geral.'),
      );
      lista.appendChild(vazio);
      return;
    }
    let dia = '';
    msgs.forEach((m) => {
      const d = diaDaMensagem(m.criadaEm);
      if (d !== dia) {
        dia = d;
        lista.appendChild(el('div', 'wa-dia', quandoFoi(d)));
      }
      lista.appendChild(
        buildBolha(m, {
          reenviar: (x) => void whatsappState.reenviar(x.id).catch(ctx.falhou),
          tirar: (x) =>
            void openConfirmModal({ title: 'Tirar da conversa', message: 'Tirar esta mensagem do histórico do Iris? Não muda nada no WhatsApp de ninguém.', confirmText: 'Tirar' }).then((ok) => {
              if (ok) void whatsappState.excluirMensagem(x.id).catch(ctx.falhou);
            }),
        }),
      );
    });
  };

  const marcarLidas = (file: WhatsappFile): void => {
    if (naoLidas(file, ref) && aba.isConnected) {
      void whatsappState.marcarLidas(ref).catch(() => undefined);
      return;
    }
    // Lidas: a contagem na aba "Conversa" (desenhada com a ficha) sai sem redesenhar a ficha.
    if (!naoLidas(file, ref)) aba.closest('.cf-ficha')?.querySelector('.cf-aba-contagem.is-alerta')?.remove();
  };

  const desenhar = (file: WhatsappFile | null): void => {
    desenharTopo(file);
    desenharJuntar(file);
    desenharLista(file);
    composer.atualizar();
    rolarParaFim();
    if (file) marcarLidas(file);
  };

  async function sincronizar(manual: boolean, botao?: HTMLButtonElement): Promise<void> {
    const chave = chaveDe(ref);
    if (!manual && sincronizadas.has(chave)) return;
    sincronizadas.add(chave);
    if (botao) botao.disabled = true;
    try {
      const r = await whatsappState.sincronizar(ref);
      if (manual) mostrarToast(r.erro ? `Não deu para buscar: ${r.erro}` : r.novas ? `${r.novas} ${r.novas === 1 ? 'mensagem nova' : 'mensagens novas'}` : 'Nada novo nesta conversa.', [], 3500);
    } catch (e) {
      if (manual) ctx.falhou(e);
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  const soltar = whatsappState.assinar((file) => desenhar(file));
  desenhar(whatsappState.atual());
  // O primeiro desenho acontece antes de a aba entrar na tela: marcar como lidas fica para agora.
  void whatsappState
    .garantir()
    .then((file) => {
      marcarLidas(file);
      return sincronizar(false);
    })
    .catch(ctx.falhou);

  return {
    el: aba,
    destruir: soltar,
    focar: () => composer.focar(),
  };
}

/** Não lidas deste contato (para a contagem na aba). */
export function naoLidasDoContato(ref: RefContato): number {
  const file = whatsappState.atual();
  return file ? file.mensagens.filter((m) => m.direcao === 'entrada' && !m.vista && m.contato && refIgual(m.contato, ref)).length : 0;
}
