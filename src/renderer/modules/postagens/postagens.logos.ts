import type { LogoRede, RedeSocial } from '../../../shared/types/videos.types.js';

/**
 * Logos das redes, desenhados à mão em SVG simplificado — a CSP do app não
 * permite imagens de fora e o Iris não embute arquivos de marca. Cada glifo é
 * branco sobre a cor da rede (o Snapchat, amarelo, usa glifo escuro).
 */

interface Glifo {
  /** Conteúdo do <svg viewBox="0 0 24 24">. */
  svg: string;
}

const traco = (d: string, largura = 2.2): string =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${largura}" stroke-linecap="round" stroke-linejoin="round"/>`;
const cheio = (d: string): string => `<path d="${d}" fill="currentColor"/>`;
const texto = (t: string, tamanho = 11, peso = 800): string =>
  `<text x="12" y="12" dy="0.36em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${tamanho}" font-weight="${peso}" fill="currentColor">${t}</text>`;

const GLIFOS: Record<LogoRede, Glifo> = {
  instagram: {
    svg:
      '<rect x="4" y="4" width="16" height="16" rx="4.8" fill="none" stroke="currentColor" stroke-width="2.1"/>' +
      '<circle cx="12" cy="12" r="3.7" fill="none" stroke="currentColor" stroke-width="2.1"/>' +
      '<circle cx="16.9" cy="7.1" r="1.25" fill="currentColor"/>',
  },
  youtube: {
    svg: cheio('M9.8 8.2v7.6l6.5-3.8z'),
  },
  'youtube-shorts': {
    svg:
      traco('M14.8 4.6 8.2 8.1a3.4 3.4 0 0 0 .3 6.1l.9.4-.9.5a3.4 3.4 0 0 0 3.2 6l6.6-3.5a3.4 3.4 0 0 0-.3-6.1l-.9-.4.9-.5a3.4 3.4 0 0 0-3.2-6z', 1.9) +
      cheio('M10.6 9.6v4.8l4-2.4z'),
  },
  tiktok: {
    svg: traco('M13.5 4v10.6a3.4 3.4 0 1 1-3.4-3.4') + traco('M13.5 4c.4 2.4 2 3.9 4.6 4.1'),
  },
  facebook: {
    svg: cheio('M13.4 20v-6.3h2.1l.4-2.6h-2.5V9.5c0-.8.3-1.3 1.4-1.3h1.2V5.9a15 15 0 0 0-1.9-.1c-2 0-3.3 1.2-3.3 3.4v1.9H8.6v2.6h2.2V20z'),
  },
  kwai: {
    svg:
      '<rect x="4" y="7" width="11" height="10" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.1"/>' +
      traco('m15 11 4.6-2.6v7.2L15 13', 2.1),
  },
  linkedin: {
    svg: texto('in', 12.5, 800),
  },
  x: {
    svg: cheio('M5 5h3.6l10.4 14h-3.6z') + traco('M18.6 5 13.3 11M5.4 19l5.3-6', 1.9),
  },
  threads: {
    svg: texto('@', 14, 700),
  },
  pinterest: {
    svg: texto('P', 14, 900),
  },
  snapchat: {
    svg: cheio(
      'M12 4.3c2.6 0 4.3 2 4.3 4.3v2l1.6.4c.3.1.3.5 0 .7l-1.3.5c.6 1.4 1.7 2.4 3 2.8.3.1.3.5 0 .6l-1.6.5-.3 1.1-1.6-.1c-.7.8-1.8 1.6-4.1 1.6s-3.4-.8-4.1-1.6l-1.6.1-.3-1.1-1.6-.5c-.3-.1-.3-.5 0-.6 1.3-.4 2.4-1.4 3-2.8l-1.3-.5c-.3-.2-.3-.6 0-.7l1.6-.4v-2c0-2.3 1.7-4.3 4.3-4.3z',
    ),
  },
  twitch: {
    svg: traco('M6 4.5 4.8 7.8v10h3.4V20h2l2.2-2.2h2.8L19.2 13V4.5z', 1.9) + traco('M11 8.5v3.8M15 8.5v3.8', 2),
  },
  vimeo: {
    svg: traco('M4 9.2c1.2-.9 2-1.4 2.7-.5.8 1 1.8 7.4 3 7.4 1.4 0 4.6-5.2 5-7.3.4-2-1.6-2.3-3-1.3 1-3.3 7.5-3.7 5.8 1.6-1.1 3.4-5.3 9.7-8 9.7-2.4 0-3.1-7.2-4.1-8.4', 1.9),
  },
};

/**
 * Marca da rede: o logo quando existe, senão a sigla. `forma` escolhe o
 * recorte (círculo no calendário, quadrado arredondado nos badges).
 */
export function buildLogoRede(rede: Pick<RedeSocial, 'nome' | 'sigla' | 'cor' | 'logo'>, tamanho = 18, forma: 'circulo' | 'quadrado' = 'quadrado'): HTMLElement {
  const marca = document.createElement('span');
  marca.className = `vd-logo is-${forma}${rede.logo ? ` is-${rede.logo}` : ' is-sigla'}`;
  marca.style.setProperty('--cor', rede.cor);
  marca.style.setProperty('--tam', `${tamanho}px`);
  marca.title = rede.nome;
  marca.setAttribute('aria-label', rede.nome);
  marca.setAttribute('role', 'img');
  const glifo = rede.logo ? GLIFOS[rede.logo] : undefined;
  if (glifo) {
    marca.innerHTML = `<svg viewBox="0 0 24 24" width="${Math.round(tamanho * 0.74)}" height="${Math.round(tamanho * 0.74)}" aria-hidden="true">${glifo.svg}</svg>`;
  } else {
    marca.textContent = rede.sigla.slice(0, 3);
  }
  return marca;
}
