// .js: importado em runtime pelo renderer (ESM nativo).
import { CORES_DESTAQUE, type Destaque } from './ajustes.types.js';

/**
 * Cor de destaque: só o matiz (h) e a saturação (c, croma do OKLCH) vêm da
 * escolha do usuário. A luminosidade é a de cada tema (base.css) — é ela que
 * decide o contraste com o texto e o fundo, e em OKLCH é perceptual: qualquer
 * matiz na mesma luminosidade fica tão legível quanto o violeta original.
 * Puro, usado pelos dois lados (o main manda a cor inicial para a janela).
 */

export interface Acento {
  h: number;
  c: number;
}

/** Acima disso, no tema claro (que multiplica o croma), boa parte dos matizes sai do sRGB. */
export const CROMA_MAXIMO = 0.16;

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

/** "#rrggbb" → OKLCH, pelas fórmulas do OKLab (Björn Ottosson). */
export function hexParaOklch(hex: string): { l: number; c: number; h: number } {
  const canal = (i: number): number => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = canal(1);
  const g = canal(3);
  const b = canal(5);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function arredondar(n: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

export function acentoDoDestaque(d: Destaque): Acento {
  if (d.id === 'livre' && isHex(d.hex)) {
    const { c, h } = hexParaOklch(d.hex);
    return { h: arredondar(h, 1), c: arredondar(Math.min(c, CROMA_MAXIMO), 3) };
  }
  const pronta = CORES_DESTAQUE.find((x) => x.id === d.id) ?? CORES_DESTAQUE[0];
  return { h: pronta.h, c: pronta.c };
}

/** Para o seletor de cor livre abrir na cor de agora (uma pronta vira o hex dela no tema escuro). */
export function hexDoAcento({ h, c }: Acento, l = 0.7): string {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${lin
    .map((v) => {
      const x = Math.min(1, Math.max(0, v));
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/**
 * Tinta legível sobre um papel de cor (#rrggbb) — post-its dos Pensamentos e a
 * lembrança da Home. A cor é do usuário, então o contraste é decidido pela
 * luminância em vez de assumir papel claro.
 */
export function tintaPara(cor: string): string {
  const canal = (i: number): number => {
    const v = parseInt(cor.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return luminancia > 0.36 ? '#1f1d1a' : '#f7f7f8';
}
