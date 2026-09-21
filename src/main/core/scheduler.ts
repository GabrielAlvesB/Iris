/**
 * Agendador de tarefas de fundo do processo principal.
 *
 * Usa setTimeout encadeado em vez de setInterval de propósito: um ciclo de
 * health check que demore 30s não pode sobrepor o seguinte e empilhar sockets.
 *
 * Timers do processo principal nunca sofreram throttling, então as tarefas
 * continuam rodando com a janela minimizada — que é o ponto: o histórico de
 * disponibilidade só vale se não tiver buracos.
 */

type Runner = (signal: AbortSignal) => Promise<void>;

interface Tarefa {
  id: string;
  intervaloMs: number;
  run: Runner;
  timer: NodeJS.Timeout | null;
  controller: AbortController | null;
  rodando: boolean;
  parada: boolean;
}

const tarefas = new Map<string, Tarefa>();
let encerrando = false;

export function registerTask(id: string, intervaloMs: number, run: Runner): void {
  stopTask(id);
  tarefas.set(id, {
    id,
    intervaloMs,
    run,
    timer: null,
    controller: null,
    rodando: false,
    parada: true,
  });
}

function agendar(tarefa: Tarefa, atrasoMs: number): void {
  if (tarefa.parada || encerrando || tarefa.intervaloMs <= 0) return;
  tarefa.timer = setTimeout(() => void executar(tarefa), atrasoMs);
}

async function executar(tarefa: Tarefa): Promise<void> {
  tarefa.timer = null;
  if (tarefa.rodando || tarefa.parada || encerrando) return;

  tarefa.rodando = true;
  tarefa.controller = new AbortController();

  try {
    await tarefa.run(tarefa.controller.signal);
  } catch (error) {
    // Uma falha não pode matar o agendamento: registra e reprograma.
    console.error(`[scheduler] tarefa "${tarefa.id}" falhou`, error);
  } finally {
    tarefa.rodando = false;
    tarefa.controller = null;
    agendar(tarefa, tarefa.intervaloMs);
  }
}

/** atrasoInicialMs escalona os primeiros disparos e evita rajada em t=0. */
export function startTask(id: string, atrasoInicialMs = 0): void {
  const tarefa = tarefas.get(id);
  if (!tarefa || encerrando) return;

  tarefa.parada = false;
  if (tarefa.timer || tarefa.rodando) return;
  agendar(tarefa, atrasoInicialMs);
}

export function stopTask(id: string): void {
  const tarefa = tarefas.get(id);
  if (!tarefa) return;

  tarefa.parada = true;
  if (tarefa.timer) {
    clearTimeout(tarefa.timer);
    tarefa.timer = null;
  }
  tarefa.controller?.abort();
}

export function setTaskInterval(id: string, intervaloMs: number): void {
  const tarefa = tarefas.get(id);
  if (!tarefa) return;

  tarefa.intervaloMs = intervaloMs;
  if (tarefa.parada) return;

  if (tarefa.timer) clearTimeout(tarefa.timer);
  tarefa.timer = null;
  agendar(tarefa, 0);
}

/** Disparo manual: botão "Atualizar agora" e mount do módulo. */
export function runNow(id: string): void {
  const tarefa = tarefas.get(id);
  if (!tarefa || tarefa.rodando || encerrando) return;

  if (tarefa.timer) {
    clearTimeout(tarefa.timer);
    tarefa.timer = null;
  }
  tarefa.parada = false;
  void executar(tarefa);
}

export function isTaskRunning(id: string): boolean {
  const tarefa = tarefas.get(id);
  return Boolean(tarefa && !tarefa.parada);
}

/** Chamado no before-quit: aborta fetches em voo e limpa todos os timers. */
export function stopAll(): void {
  encerrando = true;
  tarefas.forEach((tarefa) => stopTask(tarefa.id));
}
