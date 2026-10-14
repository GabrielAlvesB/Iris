import { textoDuracao, totalMinutos, type EstadoPomodoro, type SessaoFoco, type TarefaFoco } from '../../shared/types/pomodoro.types.js';
import type {} from '../../shared/types/preload-api.types';
import { ligarAtalhos } from './atalhos.js';
import { abrirAlvo, moduloAtual } from './navegacao.js';
import { svg } from '../ui/pagina.js';
import { openAvisoModal } from '../ui/modal.js';

/**
 * O Pomodoro na tela: um contador fixo no canto, visível em qualquer módulo
 * enquanto há foco ou pausa. O tempo de verdade é do main (pomodoro.service);
 * aqui só se conta o relógio até `terminaEm` e se mandam os comandos.
 */

const ICONE_FOCO = '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/>';
const ICONE_PAUSAR = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
const ICONE_CONTINUAR = '<path d="m7 4 13 8-13 8z"/>';
const ICONE_PARAR = '<rect x="6" y="6" width="12" height="12" rx="2"/>';

let estado: EstadoPomodoro | null = null;
let caixa: HTMLElement | null = null;
let relogio: ReturnType<typeof setInterval> | null = null;
const ouvintes = new Set<(e: EstadoPomodoro) => void>();

function falhou(erro: unknown): void {
  void openAvisoModal('Pomodoro', erro instanceof Error ? erro.message : String(erro), { erro: true });
}

async function comando(fazer: () => ReturnType<typeof window.irisAPI.pomodoro.parar>): Promise<void> {
  try {
    const r = await fazer();
    if (!r.ok) throw new Error(r.error);
    receber(r.data);
  } catch (e) {
    falhou(e);
  }
}

export function iniciarFoco(tarefa: TarefaFoco): void {
  void comando(() => window.irisAPI.pomodoro.iniciar(tarefa));
}

export function pausarOuRetomar(): void {
  void comando(() => window.irisAPI.pomodoro.pausarOuRetomar());
}

export function pararFoco(): void {
  void comando(() => window.irisAPI.pomodoro.parar());
}

export function estadoAtual(): EstadoPomodoro | null {
  return estado;
}

/** O painel do card e o cartão da checklist redesenham o botão quando o foco muda. */
export function onPomodoro(cb: (e: EstadoPomodoro) => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

function restanteMs(e: EstadoPomodoro): number {
  if (e.restanteMs !== undefined) return e.restanteMs;
  return e.terminaEm ? Math.max(0, Date.parse(e.terminaEm) - Date.now()) : 0;
}

function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function desenhar(): void {
  const e = estado;
  if (!e || e.fase === 'parado' || !e.tarefa) {
    caixa?.remove();
    caixa = null;
    if (relogio) clearInterval(relogio);
    relogio = null;
    return;
  }
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.className = 'pm-caixa';
    caixa.setAttribute('role', 'timer');
    document.body.appendChild(caixa);
  }
  const pausado = e.restanteMs !== undefined;
  caixa.className = `pm-caixa is-${e.fase}${pausado ? ' is-pausado' : ''}`;
  caixa.replaceChildren();

  const tarefa = e.tarefa;
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'pm-abrir';
  abrir.title = `Abrir “${tarefa.titulo}”`;
  abrir.innerHTML = svg(ICONE_FOCO, 15);
  const textos = document.createElement('span');
  textos.className = 'pm-textos';
  const tempo = document.createElement('strong');
  tempo.className = 'pm-tempo';
  tempo.textContent = mmss(restanteMs(e));
  const rotulo = document.createElement('span');
  rotulo.className = 'pm-rotulo';
  rotulo.textContent = `${e.fase === 'foco' ? 'Foco' : 'Pausa'}${pausado ? ' (pausado)' : ''} · ${tarefa.titulo}`;
  textos.append(tempo, rotulo);
  abrir.appendChild(textos);
  abrir.addEventListener('click', () => abrirAlvo(tarefa.tipo === 'card' ? { modulo: 'kanban', id: tarefa.id } : { modulo: 'todo', id: tarefa.id }));

  const pausar = document.createElement('button');
  pausar.type = 'button';
  pausar.className = 'pm-acao';
  pausar.title = pausado ? 'Continuar' : 'Pausar';
  pausar.setAttribute('aria-label', pausar.title);
  pausar.innerHTML = svg(pausado ? ICONE_CONTINUAR : ICONE_PAUSAR, 13, 2.2);
  pausar.addEventListener('click', () => pausarOuRetomar());

  const parar = document.createElement('button');
  parar.type = 'button';
  parar.className = 'pm-acao';
  parar.title = e.fase === 'foco' ? 'Parar e guardar o tempo feito' : 'Encerrar a pausa';
  parar.setAttribute('aria-label', parar.title);
  parar.innerHTML = svg(ICONE_PARAR, 13, 2.2);
  parar.addEventListener('click', () => pararFoco());

  // Barra fina do quanto da fase já passou.
  const barra = document.createElement('span');
  barra.className = 'pm-barra';
  const feito = e.duracaoMs ? 1 - restanteMs(e) / e.duracaoMs : 0;
  barra.style.setProperty('--pm-feito', String(Math.min(1, Math.max(0, feito))));

  caixa.append(abrir, pausar, parar, barra);

  if (!relogio) {
    relogio = setInterval(() => {
      if (!estado || !caixa) return;
      const t = caixa.querySelector<HTMLElement>('.pm-tempo');
      if (t) t.textContent = mmss(restanteMs(estado));
      const b = caixa.querySelector<HTMLElement>('.pm-barra');
      if (b && estado.duracaoMs) b.style.setProperty('--pm-feito', String(Math.min(1, 1 - restanteMs(estado) / estado.duracaoMs)));
    }, 1000);
  }
}

/**
 * A sessão é gravada no main, por fora do state da tela: com o Kanban ou o
 * To-do aberto, relê o arquivo para o "⏱" do card aparecer na hora.
 */
function releTelaDaTarefa(anterior: EstadoPomodoro | null, novo: EstadoPomodoro): void {
  if (anterior?.fase !== 'foco' || novo.fase === 'foco' || !anterior.tarefa) return;
  const modulo = moduloAtual();
  if (anterior.tarefa.tipo === 'card' && modulo === 'kanban') void import('../modules/kanban/kanban.state.js').then((s) => s.loadBoard()).catch(() => undefined);
  if (anterior.tarefa.tipo === 'checklist' && modulo === 'todo') void import('../modules/todo/todo.state.js').then((s) => s.load()).catch(() => undefined);
}

function receber(e: EstadoPomodoro): void {
  releTelaDaTarefa(estado, e);
  estado = e;
  desenhar();
  ouvintes.forEach((cb) => cb(e));
}

/** Chamado uma vez no bootstrap: o contador dura a vida da janela. */
export function iniciarPomodoro(): void {
  window.irisAPI.events.on('pomodoro:estado', receber);
  void window.irisAPI.pomodoro.getEstado().then((r) => {
    if (r.ok) receber(r.data);
  });
  ligarAtalhos({
    'pomodoro.pausar': () => pausarOuRetomar(),
    'pomodoro.parar': () => pararFoco(),
  });
}

/**
 * "▶ Foco" de uma tarefa + o total já gasto nela. Com o foco dela rodando, vira
 * "Em foco" (parar). Redesenha sozinho quando o estado do Pomodoro muda.
 */
export function buildBotaoFoco(tarefa: TarefaFoco, sessoes: readonly SessaoFoco[] | undefined): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pm-tarefa';
  const desenharBotao = (): void => {
    if (!wrap.isConnected && wrap.childElementCount) {
      parar?.();
      return;
    }
    wrap.replaceChildren();
    const e = estado;
    const nesta = !!e && e.fase !== 'parado' && e.tarefa?.tipo === tarefa.tipo && e.tarefa.id === tarefa.id;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = `pm-botao${nesta ? ' is-ativo' : ''}`;
    botao.innerHTML = svg(nesta ? ICONE_PARAR : ICONE_CONTINUAR, 12, 2.2);
    const span = document.createElement('span');
    span.textContent = nesta ? (e!.fase === 'foco' ? 'Em foco · parar' : 'Em pausa · encerrar') : `Foco de ${e?.focoMin ?? 25} min`;
    botao.appendChild(span);
    botao.title = nesta ? 'Para e guarda o tempo feito nesta tarefa' : 'Começa um Pomodoro nesta tarefa; o tempo fica guardado nela';
    botao.addEventListener('click', () => (nesta ? pararFoco() : iniciarFoco(tarefa)));
    wrap.appendChild(botao);
    const total = totalMinutos(sessoes);
    if (total > 0) {
      const t = document.createElement('span');
      t.className = 'pm-total';
      const n = sessoes?.length ?? 0;
      t.textContent = `${textoDuracao(total)} no total · ${n} ${n === 1 ? 'sessão' : 'sessões'}`;
      wrap.appendChild(t);
    }
  };
  const parar = onPomodoro(() => desenharBotao());
  desenharBotao();
  return wrap;
}
