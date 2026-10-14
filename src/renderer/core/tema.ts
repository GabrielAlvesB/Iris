import type { Destaque, Tema } from '../../shared/types/ajustes.types.js';
import { acentoDoDestaque, type Acento } from '../../shared/types/cor.js';

/**
 * Tema claro/escuro. Quem pinta é o CSS (`@media (prefers-color-scheme: light)`
 * no base.css); quem decide é o main, pelo `nativeTheme.themeSource` — por isso
 * não há atributo para marcar nem flash na abertura. Aqui fica só o que a tela
 * precisa: saber o tema que está valendo, trocar e ouvir a troca (inclusive a
 * do Windows, com o Iris em "Igual ao Windows").
 */

const consulta = window.matchMedia('(prefers-color-scheme: light)');

/** O tema que está na tela agora — "sistema" já resolvido. */
export function temaEfetivo(): 'claro' | 'escuro' {
  return consulta.matches ? 'claro' : 'escuro';
}

export async function definirTema(tema: Tema): Promise<Tema> {
  const r = await window.irisAPI.ajustes.setTema(tema);
  if (!r.ok) throw new Error(r.error);
  return r.data.tema;
}

/** O botão do trilho e o atalho: troca para o oposto do que está na tela. */
export function alternarTema(): Promise<Tema> {
  return definirTema(temaEfetivo() === 'escuro' ? 'claro' : 'escuro');
}

export function onTemaMudou(cb: (tema: 'claro' | 'escuro') => void): () => void {
  const ouvir = (): void => cb(temaEfetivo());
  consulta.addEventListener('change', ouvir);
  return () => consulta.removeEventListener('change', ouvir);
}

// ---------- Cor de destaque ----------

/**
 * Põe matiz e croma no <html>: o base.css monta --accent e companhia a partir
 * deles, com a luminosidade de cada tema. Estilo inline no :root ganha da folha.
 */
export function aplicarAcento({ h, c }: Acento): void {
  const raiz = document.documentElement.style;
  raiz.setProperty('--acento-h', String(h));
  raiz.setProperty('--acento-c', String(c));
}

/** Grava e já pinta: a troca vale na hora, em todas as telas. */
export async function definirDestaque(destaque: Destaque): Promise<Destaque> {
  aplicarAcento(acentoDoDestaque(destaque));
  const r = await window.irisAPI.ajustes.setDestaque(destaque);
  if (!r.ok) throw new Error(r.error);
  aplicarAcento(acentoDoDestaque(r.data.destaque));
  return r.data.destaque;
}
