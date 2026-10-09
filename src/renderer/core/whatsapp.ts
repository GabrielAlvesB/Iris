import { naoLidas } from '../../shared/types/whatsapp.types.js';
import * as whatsappState from '../modules/whatsapp/whatsapp.state.js';
import { abrirConversaWa, abrirWhatsapp } from './navegacao.js';
import { definirContagem } from './sidebar.js';

/**
 * WhatsApp vivo a sessão inteira (como core/leads.ts): o selo de não lidas no
 * ícone aparece em qualquer tela, e o clique na notificação abre a conversa
 * mesmo com outro módulo aberto.
 */

export function iniciarWhatsapp(): void {
  window.irisAPI.events.on('whatsapp:mudou', ({ naoLidas: n }) => {
    definirContagem('whatsapp', n);
    whatsappState.aoMudarNoMain();
  });
  // Sem ref: número que ainda não está no cadastro — a lista de conversas o mostra em "Sem cadastro".
  window.irisAPI.events.on('whatsapp:abrir', ({ ref }) => {
    if (ref) abrirConversaWa(ref);
    else abrirWhatsapp('conversas');
  });
  whatsappState.assinar((f) => definirContagem('whatsapp', naoLidas(f)));
  // A contagem inicial lê o arquivo uma vez, depois da primeira tela; daí em diante, o push.
  setTimeout(() => void whatsappState.garantir().catch(() => undefined), 3_000);
}
