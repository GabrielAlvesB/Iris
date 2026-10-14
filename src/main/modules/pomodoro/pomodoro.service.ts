import { readStore, writeStore } from '../../storage/jsonStore';
import { broadcast } from '../../core/broadcast';
import { notificar } from '../../core/notificacao';
import { definirLinhaExtra } from '../../core/bandeja';
import * as kanbanService from '../kanban/kanban.service';
import * as todoService from '../todo/todo.service';
import {
  DURACOES_FOCO,
  DURACOES_PAUSA,
  MINIMO_PARA_GRAVAR_MIN,
  type DuracoesPomodoro,
  type EstadoPomodoro,
  type SessaoFoco,
  type TarefaFoco,
} from '../../../shared/types/pomodoro.types';

/**
 * O timer mora no main, não na tela: sobrevive à troca de módulo e ao fechar
 * a janela (com a bandeja), e o fim do foco grava a sessão na tarefa mesmo
 * com outra tela aberta. Só as durações escolhidas vão para o disco.
 */

const FILE_NAME = 'pomodoro.json';
const SCHEMA_VERSION = 1;

interface PomodoroFile extends DuracoesPomodoro {
  schemaVersion: number;
}

function migrate(raw: unknown): PomodoroFile {
  const r = (raw ?? {}) as Partial<PomodoroFile>;
  return {
    schemaVersion: SCHEMA_VERSION,
    focoMin: (DURACOES_FOCO as readonly number[]).includes(r.focoMin ?? 0) ? r.focoMin! : 25,
    pausaMin: (DURACOES_PAUSA as readonly number[]).includes(r.pausaMin ?? 0) ? r.pausaMin! : 5,
  };
}

function duracoes(): PomodoroFile {
  return readStore(FILE_NAME, () => migrate({}), migrate);
}

let fase: EstadoPomodoro['fase'] = 'parado';
let tarefa: TarefaFoco | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let terminaEm = 0;
let duracaoMs = 0;
/** Pausado no meio: quanto faltava. */
let restanteMs: number | null = null;
/** Foco de verdade acumulado nos trechos já fechados (pausas no meio não contam). */
let focoAcumuladoMs = 0;
let trechoDesde = 0;
let focoComecouEm = '';

export function getEstado(): EstadoPomodoro {
  const d = duracoes();
  return {
    fase,
    tarefa,
    terminaEm: fase !== 'parado' && restanteMs === null ? new Date(terminaEm).toISOString() : undefined,
    restanteMs: restanteMs ?? undefined,
    duracaoMs: fase !== 'parado' ? duracaoMs : undefined,
    focoMin: d.focoMin,
    pausaMin: d.pausaMin,
  };
}

function hora(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function avisar(): void {
  const estado = getEstado();
  broadcast('pomodoro:estado', estado);
  // A bandeja mostra o foco em curso no topo do menu e na dica.
  if (fase === 'parado' || !tarefa) definirLinhaExtra(null);
  else {
    const t = tarefa;
    const quando = restanteMs !== null ? 'pausado' : `até ${hora(terminaEm)}`;
    definirLinhaExtra({
      rotulo: `${fase === 'foco' ? 'Foco' : 'Pausa'} ${quando} · ${t.titulo}`.slice(0, 80),
      aoClicar: () => broadcast('lembretes:abrir', { alvo: t.tipo === 'card' ? { modulo: 'kanban', id: t.id } : { modulo: 'todo', id: t.id } }),
    });
  }
}

function limparTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function agendar(ms: number, aoTerminar: () => void): void {
  limparTimer();
  terminaEm = Date.now() + ms;
  timer = setTimeout(aoTerminar, ms);
}

/** Grava o foco feito até agora na tarefa; menos de 1 minuto não vira sessão. */
async function gravarFoco(): Promise<number> {
  if (fase !== 'foco' || !tarefa) return 0;
  const agora = Date.now();
  const ms = focoAcumuladoMs + (restanteMs === null ? agora - trechoDesde : 0);
  const minutos = Math.round(ms / 60_000);
  focoAcumuladoMs = 0;
  if (minutos < MINIMO_PARA_GRAVAR_MIN) return 0;
  const sessao: SessaoFoco = { inicio: focoComecouEm, fim: new Date(agora).toISOString(), minutos };
  try {
    if (tarefa.tipo === 'card') await kanbanService.registrarTempo(tarefa.id, sessao);
    else await todoService.registrarTempo(tarefa.id, sessao);
  } catch (erro) {
    console.error('[pomodoro] não deu para gravar a sessão', erro);
  }
  return minutos;
}

async function fimDoFoco(): Promise<void> {
  const minutos = await gravarFoco();
  const d = duracoes();
  fase = 'pausa';
  restanteMs = null;
  duracaoMs = d.pausaMin * 60_000;
  agendar(duracaoMs, () => fimDaPausa());
  avisar();
  notificar(`Foco concluído${minutos ? ` · ${minutos} min` : ''}`, `${tarefa?.titulo ?? ''} — hora da pausa de ${d.pausaMin} min.`);
}

function fimDaPausa(): void {
  limparTimer();
  fase = 'parado';
  restanteMs = null;
  avisar();
  notificar('A pausa acabou', tarefa ? `Começar outro foco em “${tarefa.titulo}”?` : 'Bom momento para o próximo foco.');
}

export async function iniciar(nova: unknown): Promise<EstadoPomodoro> {
  const t = (nova ?? {}) as Partial<TarefaFoco>;
  if ((t.tipo !== 'card' && t.tipo !== 'checklist') || typeof t.id !== 'string' || !t.id) throw new Error('Tarefa inválida.');
  // Trocou de tarefa no meio de um foco: o que já foi feito fica na anterior.
  if (fase === 'foco') await gravarFoco();
  const d = duracoes();
  tarefa = { tipo: t.tipo, id: t.id, titulo: typeof t.titulo === 'string' && t.titulo.trim() ? t.titulo.trim().slice(0, 120) : 'Tarefa' };
  fase = 'foco';
  restanteMs = null;
  focoAcumuladoMs = 0;
  trechoDesde = Date.now();
  focoComecouEm = new Date(trechoDesde).toISOString();
  duracaoMs = d.focoMin * 60_000;
  agendar(duracaoMs, () => void fimDoFoco());
  avisar();
  return getEstado();
}

export function pausarOuRetomar(): EstadoPomodoro {
  if (fase === 'parado') return getEstado();
  if (restanteMs === null) {
    restanteMs = Math.max(0, terminaEm - Date.now());
    if (fase === 'foco') focoAcumuladoMs += Date.now() - trechoDesde;
    limparTimer();
  } else {
    const resto = restanteMs;
    restanteMs = null;
    trechoDesde = Date.now();
    agendar(resto, fase === 'foco' ? () => void fimDoFoco() : () => fimDaPausa());
  }
  avisar();
  return getEstado();
}

export async function parar(): Promise<EstadoPomodoro> {
  await gravarFoco();
  limparTimer();
  fase = 'parado';
  restanteMs = null;
  tarefa = null;
  avisar();
  return getEstado();
}

export async function salvarDuracoes(raw: unknown): Promise<EstadoPomodoro> {
  const d = migrate({ ...(raw as object), schemaVersion: SCHEMA_VERSION });
  await writeStore(FILE_NAME, d);
  avisar();
  return getEstado();
}

/** Ao sair do app no meio de um foco: o que já foi feito fica gravado. */
export async function encerrar(): Promise<void> {
  if (fase !== 'foco') return;
  await gravarFoco();
  limparTimer();
  fase = 'parado';
}

export function emFoco(): boolean {
  return fase === 'foco';
}
