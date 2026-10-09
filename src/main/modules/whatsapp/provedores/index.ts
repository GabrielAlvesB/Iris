import { app, shell } from 'electron';
import type { AbrirWhatsappEm, ProvedorWa } from '../../../../shared/types/whatsapp.types';
import { ok, type AdaptadorWa } from './comum';
import { evolution } from './evolution';
import { meta } from './meta';
import { n8n } from './n8n';
import { waha } from './waha';

/**
 * O aplicativo que o Windows abre para whatsapp:// — "WhatsApp" ou "WhatsApp
 * Beta" (os dois da Microsoft Store atendem o mesmo protocolo). Vazio = nenhum.
 *
 * Pelo nome, não por `getApplicationInfoForProtocol`: app da Store não tem
 * caminho de exe que o Windows entregue, e o "info" falha mesmo com ele
 * instalado (a chave `HKCR\whatsapp` sem comando é normal nesse caso — quem
 * atende é o pacote).
 */
export function appDoWhatsapp(): string {
  try {
    return app.getApplicationNameForProtocol('whatsapp://').trim();
  } catch {
    return '';
  }
}

/**
 * "Abrir no WhatsApp": não envia, abre a conversa com o texto escrito. No
 * aplicativo do PC quando há um e o usuário não escolheu o Web; senão, o
 * WhatsApp Web (não `wa.me`, que para numa página de "abrir o app").
 */
export function enderecoNoWhatsapp(numero: string, texto: string, abrirEm: AbrirWhatsappEm): string {
  const t = encodeURIComponent(texto);
  return abrirEm === 'app' && appDoWhatsapp() ? `whatsapp://send?phone=${numero}&text=${t}` : `https://web.whatsapp.com/send?phone=${numero}&text=${t}`;
}

export async function abrirNoWhatsapp(numero: string, texto: string, abrirEm: AbrirWhatsappEm): Promise<void> {
  await shell.openExternal(enderecoNoWhatsapp(numero, texto, abrirEm));
}

const link: AdaptadorWa = {
  falta: () => undefined,
  // Sem número: o app abre a escolha de conversa com o texto, e nada sai sem o usuário.
  testar: async (ctx) => {
    const nome = appDoWhatsapp();
    const noApp = ctx.config.link.abrirEm === 'app' && nome;
    const url = noApp ? `whatsapp://send?text=${encodeURIComponent('Teste do Iris')}` : 'https://web.whatsapp.com/';
    await shell.openExternal(url);
    return ok(noApp ? `Pedi ao ${nome} para abrir. Se a janela dele apareceu (com "Teste do Iris" para escolher a conversa), está funcionando — não precisa enviar.` : 'Abri o WhatsApp Web no navegador. Se ele já está conectado ao seu celular, está funcionando.');
  },
  enviarTexto: async () => ({}),
};

export const ADAPTADORES: Record<ProvedorWa, AdaptadorWa> = { meta, evolution, waha, n8n, link };
