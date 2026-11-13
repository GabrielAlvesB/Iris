import { aoGravarQualquer } from '../../storage/jsonStore';
import { registerTask, startTask, stopTask } from '../../core/scheduler';
import { broadcast } from '../../core/broadcast';
import { REGRAS_NUVEM } from '../../../shared/types/nuvem.types';
import type { ChaveBundle } from '../../../shared/types/export.types';
import { loadFile } from './nuvem.arquivo';
import { estaSincronizando, sincronizar } from './nuvem.motor';

/**
 * A sincronização automática: uma rodada a cada minuto (busca o que os outros
 * mudaram) e outra poucos segundos depois de qualquer gravação daqui (envia logo).
 *
 * Nada aqui lança: sem internet, a rodada falha, o erro fica guardado para a
 * tela e a próxima tenta de novo — como o backup automático.
 */

export const TAREFA_NUVEM = 'nuvem:sync';
const A_CADA_MS = 60_000;
/** Espera depois da última gravação: quem digita grava a cada pausa, e uma rodada por tecla seria desperdício. */
const DEPOIS_DE_GRAVAR_MS = 5_000;

let timer: ReturnType<typeof setTimeout> | null = null;

async function rodada(): Promise<void> {
  let conectado = false;
  try {
    conectado = loadFile().conectado;
  } catch {
    return;
  }
  if (!conectado) return;
  try {
    const r = await sincronizar();
    // Chegou dado de outro computador: a tela aberta precisa reler (core/nuvem.ts do renderer).
    if (r.recebidos) broadcast('nuvem:chegou', { recebidos: r.recebidos });
  } catch (erro) {
    // Já está em `ultimoErro` (o motor grava). No console para quem estiver depurando.
    console.error('[nuvem] a rodada falhou:', erro instanceof Error ? erro.message : erro);
  }
}

function sincroniza(arquivo: string): boolean {
  const chave = arquivo.replace(/\.json$/, '');
  return Object.prototype.hasOwnProperty.call(REGRAS_NUVEM, chave) && REGRAS_NUVEM[chave as ChaveBundle].sincroniza;
}

function aoGravar(arquivo: string): void {
  // As gravações do próprio motor (aplicar o que chegou) também passam aqui; a rodada
  // seguinte não acha diferença e não grava nada, então isto não vira laço.
  if (!sincroniza(arquivo) || estaSincronizando()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void rodada();
  }, DEPOIS_DE_GRAVAR_MS);
}

export function iniciarNuvemAuto(): void {
  registerTask(TAREFA_NUVEM, A_CADA_MS, () => rodada());
  aoGravarQualquer(aoGravar);
  // Depois da primeira tela e das outras tarefas de abertura.
  aplicarNuvemAuto(8_000);
}

/** Liga a tarefa se este computador está num espaço; desliga se saiu. */
export function aplicarNuvemAuto(atrasoMs = 2_000): void {
  try {
    stopTask(TAREFA_NUVEM);
    if (loadFile().conectado) startTask(TAREFA_NUVEM, atrasoMs);
  } catch (erro) {
    console.error('[nuvem] não deu para aplicar a configuração', erro);
  }
}
