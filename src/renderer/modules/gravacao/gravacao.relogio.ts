import type { EstadoRelogio } from '../../../shared/types/gravacao.types.js';

/**
 * A hora certa na tela: o relógio do PC mais a diferença que o main mediu num
 * servidor de hora. Toda contagem do palco usa isto — a dois, é o que faz os
 * dois Iris chegarem ao zero juntos.
 */

let estado: EstadoRelogio = { diferencaMs: 0, conferidoEm: 0 };
let pedido: Promise<EstadoRelogio> | null = null;

export function agoraCerto(): number {
  return Date.now() + estado.diferencaMs;
}

export function estadoRelogio(): EstadoRelogio {
  return estado;
}

export function conferir(forcar = false): Promise<EstadoRelogio> {
  if (pedido && !forcar) return pedido;
  pedido = window.irisAPI.gravacao
    .relogio(forcar)
    .then((r) => {
      if (r.ok) estado = r.data;
      return estado;
    })
    .catch(() => estado)
    .finally(() => {
      pedido = null;
    });
  return pedido;
}

/** "Hora conferida (±0,03 s)" ou o aviso de que vale o relógio do PC. */
export function textoDoRelogio(e: EstadoRelogio = estado): { texto: string; ok: boolean } {
  if (!e.servidor) return { texto: 'Não deu para conferir a hora pela internet: vale o relógio deste computador.', ok: false };
  const incerteza = Math.max(0.01, (e.rttMs ?? 0) / 2000);
  const diferenca = Math.abs(e.diferencaMs) / 1000;
  const ajuste = diferenca >= 0.1 ? ` · o relógio do PC estava ${diferenca.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s ${e.diferencaMs > 0 ? 'atrasado' : 'adiantado'} (já corrigido)` : '';
  return { texto: `Hora conferida (±${incerteza.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s)${ajuste}`, ok: true };
}
