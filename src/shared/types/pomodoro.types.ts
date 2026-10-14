/**
 * Pomodoro ligado a uma tarefa (card do Kanban ou checklist do To-do): cada
 * sessão de foco terminada (ou interrompida depois de 1 minuto) fica gravada
 * na própria tarefa. O total nunca é gravado — é sempre a soma das sessões.
 * Puro, usado pelos dois lados.
 */

export interface SessaoFoco {
  /** ISO do começo e do fim. */
  inicio: string;
  fim: string;
  /** Minutos de foco de verdade (as pausas no meio não contam). */
  minutos: number;
}

export type TipoTarefaFoco = 'card' | 'checklist';

export interface TarefaFoco {
  tipo: TipoTarefaFoco;
  id: string;
  titulo: string;
}

export type FasePomodoro = 'parado' | 'foco' | 'pausa';

export interface EstadoPomodoro {
  fase: FasePomodoro;
  tarefa: TarefaFoco | null;
  /** ISO de quando a fase termina; ausente com o tempo pausado. */
  terminaEm?: string;
  /** Pausado no meio: quanto faltava. */
  restanteMs?: number;
  /** Duração total da fase atual, para a barra de progresso. */
  duracaoMs?: number;
  focoMin: number;
  pausaMin: number;
}

export interface DuracoesPomodoro {
  focoMin: number;
  pausaMin: number;
}

export const DURACOES_FOCO = [15, 25, 45, 50] as const;
export const DURACOES_PAUSA = [5, 10, 15] as const;
/** Menos que isso parado no meio não vira sessão (foi engano ou teste). */
export const MINIMO_PARA_GRAVAR_MIN = 1;
/** Uma tarefa guarda as últimas N sessões; o resto já fez seu papel na estimativa. */
export const MAX_SESSOES = 200;

/** Leitura tolerante: entra só o que tem início, fim e minutos válidos. */
export function migrarSessoes(raw: unknown): SessaoFoco[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ok = raw
    .filter((s): s is SessaoFoco => {
      const x = s as Partial<SessaoFoco> | null;
      return !!x && typeof x.inicio === 'string' && typeof x.fim === 'string' && typeof x.minutos === 'number' && x.minutos > 0 && x.minutos < 24 * 60;
    })
    .map((s) => ({ inicio: s.inicio, fim: s.fim, minutos: Math.round(s.minutos) }));
  return ok.length ? ok.slice(-MAX_SESSOES) : undefined;
}

export function totalMinutos(sessoes: readonly SessaoFoco[] | undefined): number {
  return (sessoes ?? []).reduce((n, s) => n + s.minutos, 0);
}

/** 75 → "1 h 15 min"; 40 → "40 min". */
export function textoDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Lista de ids sem repetição nem lixo (arquivos da Biblioteca nos cartões). */
export function migrarIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && !!x))];
  return ids.length ? ids : undefined;
}
