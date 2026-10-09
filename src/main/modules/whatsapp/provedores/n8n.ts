import { CABECALHO_CHAVE } from '../../../../shared/types/leads.types';
import * as n8nService from '../../n8n/n8n.service';
import { ErroWa, campo, falhou, ok, testarCom, textoDe, type AdaptadorWa } from './comum';

/**
 * Pelo n8n: o Iris chama o webhook de produção do fluxo de envio
 * (whatsapp.n8n.ts) com a chave do WhatsApp no cabeçalho. O fluxo envia
 * pelo nó que o usuário escolheu e responde `{ idExterno }`.
 */

function lerJson(corpo: string): unknown {
  try {
    return JSON.parse(corpo) as unknown;
  } catch {
    return undefined;
  }
}

export const n8n: AdaptadorWa = {
  falta(ctx) {
    if (!n8nService.enderecoN8n().baseUrl) return 'Falta o endereço do n8n (Ajustes › n8n).';
    if (!ctx.config.n8n.caminhoEnviar) return 'Falta o caminho do webhook de envio.';
    if (!ctx.chave) return 'Falta a chave do WhatsApp (Conexão › Recebimento › Gerar chave): o fluxo confere essa chave.';
    return undefined;
  },

  testar(ctx) {
    return testarCom(async () => {
      // Sem a chave, o fluxo certo responde 401 — prova que está ativo e protegido, sem mandar mensagem a ninguém.
      const r = await n8nService.chamarWebhook(ctx.config.n8n.caminhoEnviar, { teste: true });
      if (r.status === 401) return ok('O fluxo de envio está ativo no n8n e recusa pedidos sem a chave do Iris.');
      if (r.status === 404) return falhou('O n8n não achou o webhook: importe o fluxo de envio e ative-o (ou confira o caminho).');
      if (r.status === 0) return falhou(r.mensagem);
      if (r.ok) return falhou('O webhook respondeu sem conferir a chave. Use o fluxo pronto do Iris (ele recusa pedidos sem a chave).');
      return falhou(`O webhook respondeu HTTP ${r.status}. Abra a execução no n8n para ver em qual nó parou.`);
    });
  },

  async enviarTexto(ctx, numero, texto) {
    const r = await n8nService.chamarWebhook(ctx.config.n8n.caminhoEnviar, { numero, texto }, { [CABECALHO_CHAVE]: ctx.chave });
    if (r.status === 0) throw new ErroWa(r.mensagem);
    const corpo = lerJson(r.corpo);
    if (r.status === 401) throw new ErroWa('O fluxo do n8n recusou a chave do Iris. Gere o fluxo de novo (a chave mudou) ou confira o nó "Chave confere?".', 401);
    if (!r.ok) throw new ErroWa(`${r.mensagem}${textoDe(campo(corpo, 'erro')) ? ` (${textoDe(campo(corpo, 'erro'))})` : ''}`, r.status);
    const id = textoDe(campo(corpo, 'idExterno'));
    return id ? { idExterno: id } : {};
  },
};
