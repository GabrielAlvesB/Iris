import { registerTask, setTaskInterval, startTask, stopAll, stopTask } from './scheduler';
import * as servidoresService from '../modules/servidores/servidores.service';
import * as n8nService from '../modules/n8n/n8n.service';
import * as githubService from '../modules/github/github.service';
import * as exploradorService from '../modules/explorador/explorador.service';

/**
 * Raiz de composição das tarefas de fundo — mantém o main.ts sem precisar
 * conhecer cada serviço.
 */

export const TAREFA_HEALTH = 'servidores:health';
export const TAREFA_N8N = 'n8n:poll';
export const TAREFA_GITHUB = 'github:poll';

export async function startBackgroundServices(): Promise<void> {
  registerTask(TAREFA_HEALTH, 60_000, (signal) => servidoresService.runHealthCycle(signal));
  registerTask(TAREFA_N8N, 120_000, (signal) => n8nService.pollOnce(signal));
  registerTask(TAREFA_GITHUB, 600_000, (signal) => githubService.pollOnce(signal));

  const health = servidoresService.getHealthConfig();
  setTaskInterval(TAREFA_HEALTH, health.intervaloMs);
  // Atraso inicial: deixa a janela abrir antes de disparar a primeira rodada.
  if (health.ativo) startTask(TAREFA_HEALTH, 3_000);

  const n8n = n8nService.getPollConfig();
  setTaskInterval(TAREFA_N8N, n8n.intervaloMs);
  if (n8n.ativo && n8n.temBaseUrl) startTask(TAREFA_N8N, 5_000);

  const github = githubService.getPollConfig();
  setTaskInterval(TAREFA_GITHUB, github.intervaloMs);
  if (github.ativo && github.temToken) startTask(TAREFA_GITHUB, 8_000);

  exploradorService.iniciarWatchers();
}

/** Chamado quando a configuração muda na UI, para não exigir reinício do app. */
export function reaplicarAgendamentos(): void {
  const health = servidoresService.getHealthConfig();
  setTaskInterval(TAREFA_HEALTH, health.intervaloMs);
  if (health.ativo) {
    startTask(TAREFA_HEALTH, 1_000);
  } else {
    stopTask(TAREFA_HEALTH);
  }

  const n8n = n8nService.getPollConfig();
  setTaskInterval(TAREFA_N8N, n8n.intervaloMs);
  if (n8n.ativo && n8n.temBaseUrl) {
    startTask(TAREFA_N8N, 1_000);
  } else {
    stopTask(TAREFA_N8N);
  }

  const github = githubService.getPollConfig();
  setTaskInterval(TAREFA_GITHUB, github.intervaloMs);
  if (github.ativo && github.temToken) {
    startTask(TAREFA_GITHUB, 1_000);
  } else {
    stopTask(TAREFA_GITHUB);
  }
}

export function stopBackgroundServices(): void {
  stopAll();
  exploradorService.pararWatchers();
}
