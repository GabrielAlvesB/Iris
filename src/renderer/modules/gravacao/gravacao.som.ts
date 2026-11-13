/**
 * Bipes da contagem e da claquete, gerados na hora (WebAudio): nada de
 * arquivo de som, e o tom puro de 1 kHz é fácil de achar na forma de onda
 * quando se alinha o áudio na edição.
 */

let contexto: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    contexto ??= new AudioContext();
    // Criado antes de um gesto do usuário, nasce suspenso.
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  } catch {
    return null;
  }
}

export function bipe(frequencia: number, duracaoMs: number, volume = 0.35): void {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const ganho = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequencia;
  const t0 = c.currentTime;
  const fim = t0 + duracaoMs / 1000;
  // Rampas curtas nas pontas: sem elas o corte seco faz um estalo.
  ganho.gain.setValueAtTime(0, t0);
  ganho.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  ganho.gain.setValueAtTime(volume, fim - 0.005);
  ganho.gain.linearRampToValueAtTime(0, fim);
  osc.connect(ganho).connect(c.destination);
  osc.start(t0);
  osc.stop(fim + 0.01);
}

export const bipeContagem = (): void => bipe(660, 90, 0.25);
export const bipeClaquete = (): void => bipe(1000, 160, 0.5);

/** Acorda o áudio num gesto do usuário, para o primeiro bipe não atrasar. */
export function prepararSom(): void {
  ctx();
}
