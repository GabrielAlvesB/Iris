import dgram from 'node:dgram';
import type { EstadoRelogio } from '../../../shared/types/gravacao.types';

/**
 * Confere o relógio deste PC contra um servidor de hora (SNTP, o mesmo
 * protocolo que o Windows usa para acertar a hora). Gravando a dois, cada Iris
 * conta até o mesmo instante pelo próprio relógio — e o relógio do Windows só
 * se acerta de tempos em tempos, então pode estar um ou dois segundos fora.
 * Somando a diferença medida aqui, os dois bipes saem juntos (dezenas de ms).
 *
 * O pedido leva só 48 bytes fixos ("que horas são?"); nada da gravação sai do PC.
 * Sem resposta, vale o relógio do PC (e a tela avisa).
 */

/** ntp.br primeiro (o app é brasileiro), depois o servidor do próprio Windows e o pool mundial. */
const SERVIDORES = ['a.st1.ntp.br', 'time.windows.com', 'pool.ntp.org'];
const TIMEOUT_MS = 1500;
const AMOSTRAS = 4;
/** O relógio do PC não anda tanto em 10 min: conferir de novo seria só demora. */
const VALIDADE_MS = 10 * 60_000;
/** Segundos entre 1900 (época do NTP) e 1970 (época do JavaScript). */
const NTP_1970 = 2_208_988_800;

let ultimo: EstadoRelogio | null = null;
let emAndamento: Promise<EstadoRelogio> | null = null;

function lerTempoNtp(buf: Buffer, pos: number): number {
  const segundos = buf.readUInt32BE(pos) - NTP_1970;
  const fracao = buf.readUInt32BE(pos + 4) / 2 ** 32;
  return (segundos + fracao) * 1000;
}

function umaAmostra(host: string): Promise<{ diferencaMs: number; rttMs: number }> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const pedido = Buffer.alloc(48);
    // LI = 0, versão 4, modo 3 (cliente).
    pedido[0] = 0x23;
    let t0 = 0;
    const tempo = setTimeout(() => {
      socket.close();
      reject(new Error('sem resposta'));
    }, TIMEOUT_MS);
    socket.once('error', (e) => {
      clearTimeout(tempo);
      socket.close();
      reject(e);
    });
    socket.once('message', (msg) => {
      const t3 = Date.now();
      clearTimeout(tempo);
      socket.close();
      if (msg.length < 48) {
        reject(new Error('resposta curta'));
        return;
      }
      const t1 = lerTempoNtp(msg, 32);
      const t2 = lerTempoNtp(msg, 40);
      resolve({ diferencaMs: (t1 - t0 + (t2 - t3)) / 2, rttMs: t3 - t0 - (t2 - t1) });
    });
    t0 = Date.now();
    socket.send(pedido, 123, host, (e) => {
      if (!e) return;
      clearTimeout(tempo);
      socket.close();
      reject(e);
    });
  });
}

async function medir(): Promise<EstadoRelogio> {
  for (const servidor of SERVIDORES) {
    const amostras: Array<{ diferencaMs: number; rttMs: number }> = [];
    for (let i = 0; i < AMOSTRAS; i += 1) {
      try {
        amostras.push(await umaAmostra(servidor));
      } catch {
        // Uma perdida não invalida as outras; sem nenhuma, tenta o próximo servidor.
      }
    }
    if (amostras.length) {
      // A de menor ida e volta é a menos distorcida pela rede.
      amostras.sort((a, b) => a.rttMs - b.rttMs);
      const melhor = amostras[0]!;
      return { diferencaMs: Math.round(melhor.diferencaMs), rttMs: Math.round(melhor.rttMs), servidor, conferidoEm: Date.now() };
    }
  }
  return { diferencaMs: 0, conferidoEm: Date.now() };
}

/** `forcar` mede de novo mesmo com uma medida recente (botão "Conferir de novo"). */
export function conferirRelogio(forcar = false): Promise<EstadoRelogio> {
  if (!forcar && ultimo?.servidor && Date.now() - ultimo.conferidoEm < VALIDADE_MS) return Promise.resolve(ultimo);
  emAndamento ??= medir()
    .then((r) => {
      ultimo = r;
      return r;
    })
    .finally(() => {
      emAndamento = null;
    });
  return emAndamento;
}

/** Hora certa agora (epoch ms), pela última medida. */
export function agoraCerto(): number {
  return Date.now() + (ultimo?.diferencaMs ?? 0);
}
