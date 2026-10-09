import { normalizarCombo, passoFuncionaDigitando, type Combo } from '../../shared/types/atalhos.types.js';
import { haModalAberto } from '../ui/modal.js';
import { CATALOGO_ATALHOS, definicaoDe, type DefinicaoAtalho } from './atalhos.catalogo.js';
import { moduloAtual } from './navegacao.js';

/**
 * Atalhos de teclado: um ouvinte só, na janela, para o app inteiro. As
 * definições (o que existe e a tecla padrão) estão em atalhos.catalogo.ts; as
 * trocas do usuário vêm do ajustes.json; quem executa é ligado por id —
 * globais na abertura do app, os de um módulo no mount dele.
 *
 * Antes cada tela tinha o seu keydown, cada um com a sua regra de "estou
 * digitando?" e "tem modal aberto?". Agora a regra é uma:
 * - com uma janela por cima (modal, busca rápida), nenhum atalho dispara;
 * - com o foco num campo de texto, só os com Ctrl/Alt e as teclas F;
 * - sequências ("G K"): o primeiro passo fica esperando 1,2 s pelo segundo.
 */

type Executor = (e: KeyboardEvent) => void;

let trocas: Record<string, Combo> = {};
const executores = new Map<string, Executor>();
const ouvintes = new Set<() => void>();
let instalado = false;
/** Ajustes › Atalhos capturando uma combinação nova: o despacho para. */
let pausado = false;

let pendente: string | null = null;
let tempoPendente: number | null = null;
let aviso: HTMLElement | null = null;
const ESPERA_SEQUENCIA = 1200;

// ---------- Teclas ----------

const NOMES_DE_TECLA: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Del: 'Delete',
};

/** O passo de um evento ("Ctrl+P", "G", "Shift+?"), ou null se só um modificador foi apertado. */
export function passoDoEvento(e: KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified', 'Process'].includes(e.key)) return null;
  // AltGr no Windows chega como Ctrl+Alt: é um caractere (o "/" do ABNT2), não um atalho.
  if (e.ctrlKey && e.altKey && !e.metaKey) return null;
  const tecla = NOMES_DE_TECLA[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  const partes: string[] = [];
  // No Windows, a tecla Windows chega como metaKey: tratada como Ctrl para não sumir.
  if (e.ctrlKey || e.metaKey) partes.push('Ctrl');
  if (e.altKey) partes.push('Alt');
  if (e.shiftKey) partes.push('Shift');
  partes.push(tecla);
  return normalizarCombo(partes.join('+'));
}

/** Foco num campo onde as letras são texto. */
export function estaDigitando(): boolean {
  const ativo = document.activeElement as HTMLElement | null;
  if (!ativo) return false;
  if (ativo.isContentEditable) return true;
  if (ativo.tagName === 'TEXTAREA' || ativo.tagName === 'SELECT') return true;
  if (ativo.tagName !== 'INPUT') return false;
  const tipo = (ativo as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(tipo);
}

const NOME_LEGIVEL: Record<string, string> = { Left: '←', Right: '→', Up: '↑', Down: '↓', Space: 'Espaço' };

/** "G K" → "G depois K"; "Alt+Left" → "Alt+←". Para dicas (title), onde não cabem teclas desenhadas. */
export function textoDoCombo(combo: Combo): string {
  return combo
    .split(' ')
    .map((passo) => passo.split('+').map((t) => NOME_LEGIVEL[t] ?? t).join('+'))
    .join(' depois ');
}

/** "Busca rápida (Ctrl+P)" — ou só o texto, se a ação ficou sem atalho. */
export function comAtalho(texto: string, id: string): string {
  const combo = comboDe(id);
  return combo ? `${texto} (${textoDoCombo(combo)})` : texto;
}

// ---------- Trocas do usuário ----------

export function comboDe(id: string): Combo {
  return trocas[id] ?? definicaoDe(id)?.padrao ?? '';
}

export function foiTrocado(id: string): boolean {
  return id in trocas && trocas[id] !== definicaoDe(id)?.padrao;
}

export function trocasAtuais(): Record<string, Combo> {
  return { ...trocas };
}

/** Lido do ajustes.json na abertura e depois de cada gravação. */
export function aplicarTrocas(novas: Record<string, string>): void {
  const limpas: Record<string, Combo> = {};
  Object.entries(novas).forEach(([id, combo]) => {
    const n = normalizarCombo(combo);
    // Trocar de volta para o padrão = não ter troca.
    if (n !== null && n !== definicaoDe(id)?.padrao) limpas[id] = n;
  });
  trocas = limpas;
  ouvintes.forEach((cb) => cb());
}

/** Grava as trocas (só as diferentes do padrão) e aplica. */
export async function salvarTrocas(novas: Record<string, Combo>): Promise<void> {
  const r = await window.irisAPI.ajustes.setAtalhos(novas);
  if (!r.ok) throw new Error(r.error);
  aplicarTrocas(r.data.atalhos);
}

/** Avisado quando uma tecla muda (a ajuda, a busca rápida e o Tutorial redesenham). */
export function onAtalhosMudaram(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

// ---------- Conflitos ----------

/** Dois atalhos podem estar ativos ao mesmo tempo: um global, ou os dois do mesmo módulo. */
function convivem(a: DefinicaoAtalho, b: DefinicaoAtalho): boolean {
  return !a.escopo || !b.escopo || a.escopo === b.escopo;
}

/** "G" sozinho e "G K" também brigam: o primeiro dispararia antes do segundo passo. */
function combosBrigam(a: Combo, b: Combo): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [a1, a2] = a.split(' ');
  const [b1, b2] = b.split(' ');
  return (!a2 && a1 === b1 && Boolean(b2)) || (!b2 && b1 === a1 && Boolean(a2));
}

/** As ações que já usam (ou brigam com) esta combinação, se ela fosse dada a `id`. */
export function conflitosDe(id: string, combo: Combo, comTrocas: Record<string, Combo> = trocas): DefinicaoAtalho[] {
  const definicao = definicaoDe(id);
  if (!definicao || !combo) return [];
  return CATALOGO_ATALHOS.filter((outra) => {
    if (outra.id === id || !convivem(definicao, outra)) return false;
    const dela = comTrocas[outra.id] ?? outra.padrao;
    return combosBrigam(combo, dela);
  });
}

// ---------- Executores ----------

/**
 * Liga quem executa cada ação. Devolve a função que desliga — no destroy do
 * módulo. Desligar só remove o que ele mesmo ligou: entrar e sair do módulo
 * várias vezes não deixa executor velho nem apaga o novo.
 */
export function ligarAtalhos(mapa: Record<string, Executor>): () => void {
  Object.entries(mapa).forEach(([id, fn]) => executores.set(id, fn));
  return () => {
    Object.entries(mapa).forEach(([id, fn]) => {
      if (executores.get(id) === fn) executores.delete(id);
    });
  };
}

export function pausarAtalhos(sim: boolean): void {
  pausado = sim;
  limparPendente();
}

function ativa(d: DefinicaoAtalho): boolean {
  return executores.has(d.id) && (!d.escopo || d.escopo === moduloAtual());
}

function acharAcao(combo: Combo): DefinicaoAtalho | undefined {
  return CATALOGO_ATALHOS.find((d) => ativa(d) && comboDe(d.id) === combo);
}

function comecaSequencia(passo: string): boolean {
  return CATALOGO_ATALHOS.some((d) => ativa(d) && comboDe(d.id).startsWith(`${passo} `));
}

function limparPendente(): void {
  pendente = null;
  if (tempoPendente !== null) window.clearTimeout(tempoPendente);
  tempoPendente = null;
  aviso?.remove();
  aviso = null;
}

/** "G…" no canto: a pessoa vê que o app está esperando a segunda tecla. */
function mostrarPendente(passo: string): void {
  aviso?.remove();
  aviso = document.createElement('div');
  aviso.className = 'at-pendente';
  aviso.setAttribute('role', 'status');
  const tecla = document.createElement('kbd');
  tecla.className = 'pg-kbd';
  tecla.textContent = passo;
  aviso.append(tecla, ' … aperte a próxima tecla');
  document.body.appendChild(aviso);
}

function executar(d: DefinicaoAtalho, e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  executores.get(d.id)?.(e);
}

function aoTeclar(e: KeyboardEvent): void {
  if (pausado || e.isComposing) return;
  const passo = passoDoEvento(e);
  if (!passo) return;

  if (pendente) {
    const primeiro = pendente;
    limparPendente();
    const acao = acharAcao(`${primeiro} ${passo}`);
    if (acao && !haModalAberto()) executar(acao, e);
    else if (passo !== 'Esc') e.preventDefault();
    return;
  }

  // Ctrl+P do Chromium é "imprimir": aqui nunca faz sentido, nem com modal aberto.
  if (passo === 'Ctrl+P') e.preventDefault();
  if (haModalAberto()) return;
  if (estaDigitando() && !passoFuncionaDigitando(passo)) return;

  const acao = acharAcao(passo);
  if (acao) {
    executar(acao, e);
    return;
  }
  if (comecaSequencia(passo)) {
    e.preventDefault();
    pendente = passo;
    mostrarPendente(passo);
    tempoPendente = window.setTimeout(limparPendente, ESPERA_SEQUENCIA);
  }
}

/** Uma vez, na abertura do app. */
export function instalarAtalhos(iniciais: Record<string, string>): void {
  aplicarTrocas(iniciais);
  if (instalado) return;
  instalado = true;
  window.addEventListener('keydown', aoTeclar);
  window.addEventListener('blur', limparPendente);
}
