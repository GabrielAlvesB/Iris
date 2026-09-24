import type { TipoPostagem } from '../../../shared/types/postagens.types.js';
import type { Fonte } from './postagens.fonte.js';
import { montarFonteImagens } from './imagens/imagens.fonte.js';
import * as imagensPainel from './imagens/imagens.painel.js';
import * as imagensState from './imagens/imagens.state.js';
import { montarFonteVideos } from './videos/videos.fonte.js';
import * as videosPainel from './videos/videos.painel.js';
import * as videosState from './videos/videos.state.js';

/**
 * Registro dos tipos de postagem do renderer. É um Record por TipoPostagem:
 * um tipo novo em postagens.types.ts não compila até ganhar a sua entrada aqui.
 *
 * O catálogo (tags, redes, exibição) mora em videos.json, por isso todo tipo
 * precisa do state de vídeos carregado para montar a sua Fonte.
 */
export interface TipoRegistrado {
  fonte(): Fonte | null;
  carregar(): Promise<unknown>;
  ouvir(aoMudar: () => void): void;
  parar(): void;
  fecharPainel(): void;
  /** Redesenha as seções derivadas do painel aberto (se houver) após uma mudança. */
  sincronizarPainel(): void;
}

export const TIPOS: Record<TipoPostagem, TipoRegistrado> = {
  video: {
    fonte: () => {
      const file = videosState.getCurrentState();
      return file ? montarFonteVideos(file) : null;
    },
    carregar: () => videosState.load(),
    ouvir: (aoMudar) => videosState.onStateChange(aoMudar),
    parar: () => videosState.offStateChange(),
    fecharPainel: () => videosPainel.fecharPainel(),
    sincronizarPainel: () => {
      const file = videosState.getCurrentState();
      if (file) videosPainel.sincronizarPainel(file);
    },
  },
  imagem: {
    fonte: () => {
      const catalogo = videosState.getCurrentState();
      const file = imagensState.getCurrentState();
      return catalogo && file ? montarFonteImagens(file, catalogo) : null;
    },
    carregar: () => imagensState.load(),
    ouvir: (aoMudar) => imagensState.onStateChange(aoMudar),
    parar: () => imagensState.offStateChange(),
    fecharPainel: () => imagensPainel.fecharPainel(),
    sincronizarPainel: () => {
      const catalogo = videosState.getCurrentState();
      const file = imagensState.getCurrentState();
      if (catalogo && file) imagensPainel.sincronizarPainel(file, catalogo);
    },
  },
};
