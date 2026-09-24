import { FORMATOS_IMAGEM, rotuloFormato, type FormatoImagem, type Imagem } from '../../../../shared/types/imagens.types.js';

/**
 * Peças visuais das imagens. Como o Iris não guarda a arte, o card mostra a
 * proporção do formato desenhada (um retângulo na forma certa), não a imagem.
 */

/** Retângulo na proporção do formato; carrossel ganha as "folhas" atrás. */
export function buildMiniaturaFormato(formato: FormatoImagem): HTMLElement {
  const def = FORMATOS_IMAGEM.find((f) => f.id === formato) ?? FORMATOS_IMAGEM[0];
  const [w, h] = def.proporcao;
  const escala = 14 / Math.max(w, h);
  const el = document.createElement('span');
  el.className = `im-miniatura${formato === 'carrossel' ? ' is-carrossel' : ''}`;
  el.style.width = `${Math.round(w * escala)}px`;
  el.style.height = `${Math.round(h * escala)}px`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** Selo do formato para o card: miniatura + rótulo (+ peças do carrossel). */
export function buildSeloFormato(imagem: Pick<Imagem, 'formato' | 'quantidadeSlides'>): HTMLElement {
  const selo = document.createElement('span');
  selo.className = 'im-selo-formato';
  selo.appendChild(buildMiniaturaFormato(imagem.formato));
  const texto =
    imagem.formato === 'carrossel' && imagem.quantidadeSlides ? `Carrossel · ${imagem.quantidadeSlides} peças` : rotuloFormato(imagem.formato);
  selo.append(texto);
  selo.title = `Formato: ${texto}`;
  return selo;
}

export function descreverFormato(imagem: Pick<Imagem, 'formato' | 'quantidadeSlides'>): string {
  return imagem.formato === 'carrossel' && imagem.quantidadeSlides
    ? `Carrossel (${imagem.quantidadeSlides} peças)`
    : rotuloFormato(imagem.formato);
}
