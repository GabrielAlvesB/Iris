/// <reference path="../../types/xterm-global.d.ts" />
import type { Terminal as TerminalXterm } from '@xterm/xterm';
import type { FitAddon as FitXterm } from '@xterm/addon-fit';
import type { SessaoTerminal, TerminalEvento } from '../../../shared/types/servidores.types';
import { onTemaMudou, temaEfetivo } from '../../core/tema.js';
import * as servidoresState from './servidores.state.js';

/**
 * Os terminais na tela. A sessão (a conexão SSH) mora no main; aqui fica só o
 * desenho — um xterm por sessão, guardado fora do DOM da tela para sobreviver aos
 * redesenhos (a tela redesenha a cada checagem de saúde). Trocar de módulo
 * descarta os xterm; voltar recria e repinta com o buffer guardado no main.
 */

interface Vista {
  sessao: SessaoTerminal;
  term: TerminalXterm;
  fit: FitXterm;
  /** O nó que o xterm desenha; movido para dentro da tela a cada redesenho. */
  host: HTMLElement;
  observador: ResizeObserver;
  /**
   * Até a primeira pintura com o buffer do main, o push é ignorado: tudo o que ele
   * trouxe antes da resposta já está no buffer (mesmo canal, mesma ordem).
   */
  pintada: boolean;
}

const vistas = new Map<string, Vista>();
let aoMudar: (() => void) | null = null;
let desligarTema: (() => void) | null = null;

// ---------- Carregar o xterm só quando o primeiro terminal abre ----------

let carregando: Promise<void> | null = null;

function carregarScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
    document.head.appendChild(s);
  });
}

/**
 * ~300 KB de JS que quase ninguém usa: fora do index.html para não pesar na
 * abertura do app. CSP 'self' — vem de dist/renderer/vendor/xterm.
 */
function carregarXterm(): Promise<void> {
  carregando ??= (async () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = './vendor/xterm/xterm.css';
    document.head.appendChild(css);
    await carregarScript('./vendor/xterm/xterm.js');
    await carregarScript('./vendor/xterm/addon-fit.js');
    if (!window.Terminal || !window.FitAddon) throw new Error('O terminal não carregou.');
  })().catch((erro: unknown) => {
    carregando = null;
    throw erro;
  });
  return carregando;
}

// ---------- Tema a partir dos tokens ----------

/** O xterm entende hex; os tokens são oklch. Um canvas de 1 px converte qualquer cor CSS. */
function paraHex(cor: string, reserva: string): string {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx || !cor) return reserva;
  ctx.fillStyle = reserva;
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * As 16 cores ANSI são fixas (é o que o servidor pinta: `ls --color`, git, htop).
 * No claro, o amarelo e o branco padrão sumiriam no fundo — por isso outra paleta.
 */
const ANSI_ESCURO = {
  black: '#2a2d36', red: '#ff6b6b', green: '#5fd38d', yellow: '#f2c94c', blue: '#6aa8ff', magenta: '#d48cff', cyan: '#4fd1d9', white: '#d7dae0',
  brightBlack: '#6b7080', brightRed: '#ff8f8f', brightGreen: '#86e3a8', brightYellow: '#ffe08a', brightBlue: '#94c0ff', brightMagenta: '#e3b0ff', brightCyan: '#7fe3e9', brightWhite: '#ffffff',
};
const ANSI_CLARO = {
  black: '#1f2228', red: '#c62828', green: '#1b7f3b', yellow: '#8a6100', blue: '#1f5fbf', magenta: '#8e3cb0', cyan: '#0d7480', white: '#5b606b',
  brightBlack: '#6b7080', brightRed: '#d84343', brightGreen: '#23964a', brightYellow: '#9c7000', brightBlue: '#2f6fd6', brightMagenta: '#a24fc4', brightCyan: '#13858f', brightWhite: '#2a2d36',
};

function temaXterm(): NonNullable<ConstructorParameters<typeof TerminalXterm>[0]>['theme'] {
  const css = getComputedStyle(document.documentElement);
  const v = (nome: string): string => css.getPropertyValue(nome).trim();
  const fundo = paraHex(v('--bg'), '#0c0d12');
  const acento = paraHex(v('--accent'), '#8a7dff');
  return {
    background: fundo,
    foreground: paraHex(v('--text'), '#e6e6e6'),
    cursor: acento,
    cursorAccent: fundo,
    selectionBackground: `${acento}55`,
    ...(temaEfetivo() === 'claro' ? ANSI_CLARO : ANSI_ESCURO),
  };
}

function aplicarTemaEmTodos(): void {
  const tema = temaXterm();
  vistas.forEach((v) => {
    v.term.options.theme = tema;
  });
}

// ---------- Sessões ----------

function chegou(evento: TerminalEvento): void {
  const v = vistas.get(evento.sessaoId);
  if (!v) return;
  if (evento.dados && v.pintada) v.term.write(evento.dados);
  if (evento.fim !== undefined) {
    v.sessao = { ...v.sessao, aberta: false, motivo: evento.fim, chaveMudou: evento.chaveMudou };
    aoMudar?.();
  }
}

function criarVista(sessao: SessaoTerminal): Vista {
  const Terminal = window.Terminal!;
  const FitAddon = window.FitAddon!.FitAddon;
  const term = new Terminal({
    fontFamily: "'IBM Plex Mono', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: false,
    theme: temaXterm(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const host = document.createElement('div');
  host.className = 'sv-xterm';
  // O despacho global de atalhos ignora o foco aqui dentro (core/atalhos.ts).
  host.dataset.capturaTeclado = '';
  term.open(host);

  term.onData((dados) => {
    if (vistas.get(sessao.sessaoId)?.sessao.aberta) servidoresState.escreverTerminal(sessao.sessaoId, dados);
  });
  term.onResize(({ cols, rows }) => {
    if (vistas.get(sessao.sessaoId)?.sessao.aberta) servidoresState.redimensionarTerminal(sessao.sessaoId, cols, rows);
  });

  // Ctrl+C com texto selecionado copia (sem seleção, vai para o shell como interrupção);
  // Ctrl+Shift+C/V e Ctrl+V copiam e colam como nos terminais do Linux e do Windows.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const tecla = e.key.toLowerCase();
    if (e.ctrlKey && tecla === 'c' && (e.shiftKey || term.hasSelection())) {
      // Pelo preload: o navigator.clipboard falha quando a janela não tem foco.
      if (term.hasSelection()) window.irisAPI.system.copyToClipboard(term.getSelection());
      term.clearSelection();
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && tecla === 'v') {
      // Deixa o navegador disparar o "paste" que o xterm já trata (respeita o modo colchete do bash).
      return false;
    }
    return true;
  });
  host.addEventListener('contextmenu', (e) => {
    // Botão direito cola, como no Terminal do Windows e no PuTTY.
    e.preventDefault();
    if (term.hasSelection()) {
      window.irisAPI.system.copyToClipboard(term.getSelection());
      term.clearSelection();
      return;
    }
    void navigator.clipboard.readText().then((texto) => texto && term.paste(texto)).catch(() => undefined);
  });

  const observador = new ResizeObserver(() => {
    if (host.isConnected && host.clientWidth > 0 && host.clientHeight > 0) {
      try {
        fit.fit();
      } catch {
        // medida no meio de uma troca de tela; a próxima acerta
      }
    }
  });
  observador.observe(host);

  const vista: Vista = { sessao, term, fit, host, observador, pintada: false };
  vistas.set(sessao.sessaoId, vista);
  return vista;
}

function descartar(v: Vista): void {
  v.observador.disconnect();
  v.term.dispose();
  v.host.remove();
  vistas.delete(v.sessao.sessaoId);
}

/** A primeira pintura: o buffer do main; dali em diante, o push. */
function repintar(v: Vista, buffer: string): void {
  if (buffer) v.term.write(buffer);
  v.pintada = true;
}

/** No mount: reencontra as sessões que continuam vivas no main. */
export async function reanexar(cb: () => void): Promise<void> {
  aoMudar = cb;
  servidoresState.onTerminal(chegou);
  desligarTema ??= onTemaMudou(() => aplicarTemaEmTodos());
  const sessoes = await servidoresState.listarSessoes();
  if (sessoes.length === 0) return;
  await carregarXterm();
  for (const s of sessoes) {
    if (vistas.has(s.sessaoId)) continue;
    const v = criarVista(s);
    repintar(v, await servidoresState.lerBufferTerminal(s.sessaoId));
  }
  aoMudar?.();
}

/** Abre um terminal novo no servidor; devolve o id da sessão. */
export async function abrir(servidorId: string): Promise<string> {
  await carregarXterm();
  // Tamanho provisório; o fit acerta assim que o nó entra na tela (e o main recebe o resize).
  const sessao = await servidoresState.abrirTerminal(servidorId, 100, 30);
  const v = vistas.get(sessao.sessaoId) ?? criarVista(sessao);
  // A primeira linha ("Conectando…") pode ter chegado antes do xterm existir.
  repintar(v, await servidoresState.lerBufferTerminal(sessao.sessaoId));
  aoMudar?.();
  return sessao.sessaoId;
}

/** Sessão caiu: abre outra no mesmo servidor, no lugar da aba antiga. */
export async function reconectar(sessaoId: string): Promise<string> {
  const v = vistas.get(sessaoId);
  if (!v) throw new Error('Este terminal já foi fechado.');
  const servidorId = v.sessao.servidorId;
  await fechar(sessaoId);
  return abrir(servidorId);
}

export async function fechar(sessaoId: string): Promise<void> {
  const v = vistas.get(sessaoId);
  if (v) descartar(v);
  await servidoresState.fecharTerminal(sessaoId).catch(() => undefined);
  aoMudar?.();
}

export function sessoes(): SessaoTerminal[] {
  return [...vistas.values()].map((v) => v.sessao);
}

export function sessao(sessaoId: string): SessaoTerminal | undefined {
  return vistas.get(sessaoId)?.sessao;
}

/** Põe o xterm da sessão dentro de `alvo` (movendo o nó, sem recriar). */
export function montarEm(sessaoId: string, alvo: HTMLElement, focar: boolean): void {
  const v = vistas.get(sessaoId);
  if (!v) return;
  alvo.appendChild(v.host);
  requestAnimationFrame(() => {
    try {
      v.fit.fit();
    } catch {
      // ainda sem tamanho
    }
    if (focar) v.term.focus();
  });
}

/** Digita um comando salvo na sessão (com Enter). */
export function digitar(sessaoId: string, texto: string): void {
  const v = vistas.get(sessaoId);
  if (!v?.sessao.aberta) return;
  servidoresState.escreverTerminal(sessaoId, `${texto}\r`);
  v.term.focus();
}

export function focar(sessaoId: string): void {
  vistas.get(sessaoId)?.term.focus();
}

/** destroy do módulo: descarta os desenhos, as sessões continuam no main. */
export function desmontar(): void {
  [...vistas.values()].forEach(descartar);
  servidoresState.onTerminal(null);
  desligarTema?.();
  desligarTema = null;
  aoMudar = null;
}
