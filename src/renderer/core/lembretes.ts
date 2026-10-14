import { abrirAlvo, abrirHoje } from './navegacao.js';
import { executarAcao } from './atalhos.js';

/**
 * Clique numa notificação de lembrete (main › lembretes.service): vivo a
 * sessão toda, para levar ao item de qualquer tela em que o app esteja.
 */
export function iniciarLembretes(): void {
  window.irisAPI.events.on('lembretes:abrir', ({ alvo, tela }) => {
    if (alvo) abrirAlvo(alvo);
    else abrirHoje(tela === 'semana' ? 'semana' : 'dia');
  });
  // Menu da bandeja ("Novo card…"): o mesmo caminho da paleta de comandos.
  window.irisAPI.events.on('app:executar', ({ acao }) => void executarAcao(acao));
}
