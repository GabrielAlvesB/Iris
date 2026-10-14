import { MAX_ENTRADAS_HISTORICO, type EntradaHistorico } from '../../../shared/types/historico.types.js';
import type {} from '../../../shared/types/preload-api.types';
import { openConfirmModal } from '../../ui/modal.js';
import { buildBotao, buildTeclas, buildVazio, svg, tempoRelativo } from '../../ui/pagina.js';
import { createPushBinding } from '../../core/pushBinding.js';
import { comboDe } from '../../core/atalhos.js';
import { desfazer, textoDaEntrada } from '../../core/historico.js';

/**
 * Ajustes › Histórico: as últimas alterações feitas pela tela, cada uma com
 * "Desfazer". Desfazer uma antiga volta o arquivo dela ao que era naquele
 * momento — as mais novas do mesmo módulo vão junto, e a tela avisa antes.
 */

export const ICONE_HISTORICO = '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>';

const ICONES_TIPO: Record<EntradaHistorico['tipo'], string> = {
  criacao: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  edicao: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  exclusao: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  desfazer: ICONE_HISTORICO,
};

let raiz: HTMLElement | null = null;
let entradas: EntradaHistorico[] | null = null;
let erro = '';

const push = createPushBinding([() => window.irisAPI.events.on('historico:mudou', () => void recarregar())]);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Data local AAAA-MM-DD: é por ela que as entradas se agrupam em "Hoje", "Ontem"… */
function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tituloDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  if (diaLocal(d) === diaLocal(hoje)) return 'Hoje';
  if (diaLocal(d) === diaLocal(ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function recarregar(): Promise<void> {
  const r = await window.irisAPI.historico.listar();
  entradas = r.ok ? r.data : [];
  erro = r.ok ? '' : r.error;
  desenhar();
}

async function pedirDesfazer(e: EntradaHistorico): Promise<void> {
  const lista = entradas ?? [];
  const posicao = lista.findIndex((x) => x.id === e.id);
  const depois = lista.slice(0, posicao).filter((x) => x.arquivo === e.arquivo);
  if (depois.length) {
    const ok = await openConfirmModal({
      title: e.tipo === 'desfazer' ? 'Refazer' : 'Desfazer esta alteração',
      message: `${e.modulo} volta ao que era antes de “${textoDaEntrada(e)}”. ${
        depois.length === 1 ? 'A alteração feita depois' : `As ${depois.length} alterações feitas depois`
      } em ${e.modulo} também ${depois.length === 1 ? 'é desfeita' : 'são desfeitas'}: ${depois.map(textoDaEntrada).join('; ')}.`,
      confirmText: depois.length === 1 ? 'Desfazer as duas' : `Desfazer as ${depois.length + 1}`,
      danger: false,
    });
    if (!ok) return;
  }
  await desfazer(e.id);
  await recarregar();
}

function buildLinha(e: EntradaHistorico): HTMLElement {
  const linha = el('div', `aj-hist-linha is-${e.tipo}`);
  const icone = el('span', 'aj-hist-icone');
  icone.innerHTML = svg(ICONES_TIPO[e.tipo], 14);
  const textos = el('div', 'aj-hist-textos');
  const titulo = el('strong', undefined, e.rotulo);
  textos.appendChild(titulo);
  if (e.detalhe) textos.appendChild(el('span', 'aj-hist-detalhe', `“${e.detalhe}”`));
  const meta = el('span', 'aj-hist-meta', `${e.modulo} · ${hora(e.atualizadaEm)}`);
  meta.title = tempoRelativo(e.atualizadaEm);
  textos.appendChild(meta);
  const botao = buildBotao(e.tipo === 'desfazer' ? 'Refazer' : 'Desfazer', {
    variante: 'fantasma',
    icone: ICONE_HISTORICO,
    titulo: e.tipo === 'desfazer' ? 'Volta ao que era antes deste desfazer' : `Volta ${e.modulo} ao que era antes desta alteração`,
  });
  botao.addEventListener('click', () => {
    botao.disabled = true;
    void pedirDesfazer(e).finally(() => (botao.disabled = false));
  });
  linha.append(icone, textos, botao);
  return linha;
}

function desenhar(): void {
  if (!raiz) return;
  const filhos: HTMLElement[] = [];

  const dica = el('div', 'aj-hist-dica');
  dica.appendChild(
    el(
      'p',
      undefined,
      `As últimas ${MAX_ENTRADAS_HISTORICO} alterações que você fez — criar, editar, mover, excluir — em qualquer módulo. O que roda sozinho (leads chegando, mensagens do WhatsApp, a agenda publicando) não entra. Para voltar mais longe, use o Backup.`,
    ),
  );
  const combo = comboDe('geral.desfazer');
  if (combo) {
    const tecla = el('p', 'aj-hist-tecla', 'Desfazer a última de qualquer tela: ');
    tecla.appendChild(buildTeclas(combo));
    dica.appendChild(tecla);
  }
  filhos.push(dica);

  if (erro) filhos.push(el('p', 'bk-status is-erro', erro));

  if (entradas === null) {
    filhos.push(el('p', 'aj-hist-meta', 'Carregando…'));
  } else if (!entradas.length) {
    filhos.push(buildVazio(ICONE_HISTORICO, 'Nada no histórico ainda', 'Assim que você criar, editar ou excluir algo, aparece aqui com um botão para desfazer.'));
  } else {
    let diaAtual = '';
    let grupo: HTMLElement | null = null;
    entradas.forEach((e) => {
      const dia = diaLocal(new Date(e.atualizadaEm));
      if (dia !== diaAtual || !grupo) {
        diaAtual = dia;
        filhos.push(el('h4', 'aj-hist-dia', tituloDoDia(e.atualizadaEm)));
        grupo = el('div', 'aj-hist-lista');
        filhos.push(grupo);
      }
      grupo.appendChild(buildLinha(e));
    });

    const limpar = buildBotao('Limpar histórico', { variante: 'fantasma', titulo: 'Apaga a lista e os conteúdos guardados (seus dados atuais não mudam)' });
    limpar.addEventListener('click', () => {
      void openConfirmModal({
        title: 'Limpar histórico',
        message: 'A lista some e as alterações dela não poderão mais ser desfeitas. Seus dados de agora continuam como estão.',
        confirmText: 'Limpar',
      }).then((ok) => {
        if (ok) void window.irisAPI.historico.limpar().then(() => recarregar());
      });
    });
    const rodape = el('div', 'aj-hist-rodape');
    rodape.appendChild(limpar);
    filhos.push(rodape);
  }
  raiz.replaceChildren(...filhos);
}

export function buildSecaoHistorico(painel: HTMLElement): HTMLElement {
  const corpo = el('div', 'aj-corpo aj-hist');
  raiz = corpo;
  push.attach();
  desenhar();
  void recarregar();
  painel.appendChild(corpo);
  return painel;
}

export function destroySecaoHistorico(): void {
  push.detach();
  raiz = null;
  entradas = null;
}
