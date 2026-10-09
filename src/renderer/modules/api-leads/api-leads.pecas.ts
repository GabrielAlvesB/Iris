import type { ContatosFile, SalvarLeadsConfigInput } from '../../../shared/types/contatos.types.js';
import type { ResultadoTeste, StatusLeads } from '../../../shared/types/leads.types.js';
import type { SecaoApiLeads } from '../../core/navegacao.js';
import { buildBotao, buildSelo, svg } from '../../ui/pagina.js';
import { mostrarToast } from '../../ui/toast.js';
import * as contatosState from '../contatos/contatos.state.js';
import { ICONES_CONTATO, el, quandoChegou } from '../contatos/contatos.ui.js';

/**
 * Peças comuns das seções de API e n8n: o status vindo do main (servidor
 * local, caixa na nuvem — nunca a chave do Iris), cartões, blocos de código,
 * valores para copiar e a caixa de resultado de um teste.
 */

export interface CtxApi {
  file: ContatosFile;
  /** Redesenha a seção atual com o arquivo e o status de agora. */
  redesenhar: () => void;
  falhou: (erro: unknown) => void;
  /** Vai para outra seção do módulo. */
  irPara: (secao: SecaoApiLeads) => void;
}

export let status: StatusLeads | null = null;
let statusEm = 0;
let carregando = false;
/** Quem redesenha quando o status muda (a view, enquanto o módulo está aberto). */
let aoMudarStatus: (() => void) | null = null;

export function definirStatus(novo: StatusLeads): void {
  status = novo;
  statusEm = Date.now();
}

export function acompanharStatus(cb: (() => void) | null): void {
  aoMudarStatus = cb;
}

/** Lead chegou ou a busca mudou de situação: a próxima pintura pede o status de novo. */
export function invalidarStatusApi(): void {
  statusEm = 0;
}

export function statusVelho(): boolean {
  return !status || Date.now() - statusEm > 3000;
}

export function carregarStatus(): void {
  if (carregando) return;
  carregando = true;
  void contatosState
    .leadsStatus()
    .then((novo) => {
      const mudou = JSON.stringify(novo) !== JSON.stringify(status);
      definirStatus(novo);
      // Redesenhar no meio da digitação derrubaria o foco: espera o campo perder o foco.
      const digitando = document.activeElement?.closest('.la-view') && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (mudou && !digitando) aoMudarStatus?.();
    })
    .catch(() => undefined)
    .finally(() => {
      carregando = false;
    });
}

export function copiar(texto: string, aviso: string): void {
  window.irisAPI.system.copyToClipboard(texto);
  mostrarToast(aviso, [], 2500);
}

export function cartao(id: string, icone: string, titulo: string, subtitulo?: string): { cartao: HTMLElement; corpo: HTMLElement; cab: HTMLElement } {
  const c = el('section', 'la-cartao');
  c.id = `api-${id}`;
  const cab = el('header', 'la-cab');
  const marca = el('span', 'la-icone');
  marca.innerHTML = svg(icone, 17);
  const textos = el('div', 'la-cab-textos');
  textos.appendChild(el('h3', undefined, titulo));
  if (subtitulo) textos.appendChild(el('p', undefined, subtitulo));
  cab.append(marca, textos);
  c.appendChild(cab);
  const corpo = el('div', 'la-corpo');
  c.appendChild(corpo);
  return { cartao: c, corpo, cab };
}

export function codigo(texto: string, rotuloCopiar: string, aviso: string): HTMLElement {
  const bloco = el('div', 'la-codigo');
  const pre = el('pre');
  pre.appendChild(el('code', undefined, texto));
  const botao = buildBotao(rotuloCopiar, { variante: 'secundario', icone: ICONES_CONTATO.copiar });
  botao.classList.add('la-codigo-copiar');
  botao.addEventListener('click', () => copiar(texto, aviso));
  bloco.append(botao, pre);
  return bloco;
}

export function valorCopiavel(valor: string, aviso: string, mascarado = false): HTMLElement {
  const linha = el('div', 'la-valor');
  linha.appendChild(el('code', mascarado ? 'is-mascarado' : undefined, valor || '—'));
  if (valor && !mascarado) {
    const b = el('button', 'ct-icone-btn');
    b.type = 'button';
    b.title = 'Copiar';
    b.setAttribute('aria-label', 'Copiar');
    b.innerHTML = svg(ICONES_CONTATO.copiar, 14);
    b.addEventListener('click', () => copiar(valor, aviso));
    linha.appendChild(b);
  }
  return linha;
}

export function resultado(r: ResultadoTeste | null): HTMLElement | null {
  if (!r) return null;
  const caixa = el('div', `la-resultado is-${r.ok ? 'ok' : 'erro'}`);
  caixa.setAttribute('role', 'status');
  caixa.appendChild(buildSelo(r.ok ? 'Deu certo' : 'Precisa de atenção', r.ok ? 'ok' : 'erro'));
  caixa.appendChild(el('p', undefined, r.mensagem));
  if (r.detalhes.length) {
    const ul = el('ul');
    r.detalhes.forEach((d) => ul.appendChild(el('li', d.startsWith('✗') ? 'is-erro' : undefined, d)));
    caixa.appendChild(ul);
  }
  if (r.status !== undefined && r.corpo !== undefined) {
    caixa.appendChild(el('span', 'la-resposta-rotulo', `Resposta: HTTP ${r.status}`));
    caixa.appendChild(el('pre', 'la-resposta', r.corpo || '(vazia)'));
  }
  return caixa;
}

export function campoLinha(rotulo: string, controle: HTMLElement, dica?: string): HTMLElement {
  const wrap = el('label', 'ct-campo');
  wrap.appendChild(el('span', 'ct-campo-rotulo', rotulo));
  wrap.appendChild(controle);
  if (dica) wrap.appendChild(el('span', 'ct-campo-dica', dica));
  return wrap;
}

export async function salvarConfig(ctx: CtxApi, input: SalvarLeadsConfigInput, aviso?: string): Promise<boolean> {
  try {
    await contatosState.salvarLeadsConfig(input);
    invalidarStatusApi();
    carregarStatus();
    if (aviso) mostrarToast(aviso, [], 2500);
    return true;
  } catch (e) {
    ctx.falhou(e);
    return false;
  }
}

export function ultimoLead(ctx: CtxApi, canal: 'nuvem' | 'local'): string {
  const ultimo = ctx.file.pessoas
    .map((p) => p.entrada)
    .filter((e) => e?.canal === canal)
    .map((e) => e!.ultimoEnvioEm ?? e!.recebidoEm)
    .sort()
    .pop();
  return ultimo ? quandoChegou(ultimo) : 'nenhum ainda';
}
