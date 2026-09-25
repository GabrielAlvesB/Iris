import { broadcast, broadcastErro } from '../../core/broadcast';
import * as videosService from '../videos/videos.service';
import * as imagensService from '../imagens/imagens.service';
import type { TipoPostagem } from '../../../shared/types/postagens.types';

/**
 * Percurso automático da distribuição: a postagem agendada vira publicada
 * quando chega o horário marcado. Roda no main para valer com a tela de
 * Postagens fechada; na abertura do app, publica o que venceu enquanto ele
 * estava fechado.
 */

const PUBLICADORES: Record<TipoPostagem, () => Promise<number>> = {
  video: videosService.publicarAgendadasVencidas,
  imagem: imagensService.publicarAgendadasVencidas,
};

export async function publicarVencidas(signal: AbortSignal): Promise<void> {
  for (const [tipo, publicar] of Object.entries(PUBLICADORES) as Array<[TipoPostagem, () => Promise<number>]>) {
    if (signal.aborted) return;
    try {
      if ((await publicar()) > 0) broadcast('postagens:mudou', { tipo });
    } catch (error) {
      // Um tipo com arquivo problemático não impede os outros de publicar.
      broadcastErro('postagens:agenda', error);
    }
  }
}
