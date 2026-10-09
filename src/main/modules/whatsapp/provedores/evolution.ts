import { eventosDaEvolution } from '../../../../shared/types/whatsapp.eventos';
import { ErroWa, campo, chamar, falhou, ok, testarCom, textoDe, type AdaptadorWa, type ContextoWa } from './comum';

/**
 * Evolution API (v2; a v1 é aceita onde o formato muda). Servidor do próprio
 * usuário, ligado ao WhatsApp dele por QR code. Cabeçalho `apikey` (a global
 * ou a da instância — as duas funcionam nas rotas de mensagem).
 */

const QUEM = 'a Evolution API';

function url(ctx: ContextoWa, rota: string): string {
  return `${ctx.config.evolution.baseUrl}${rota}/${encodeURIComponent(ctx.config.evolution.instancia)}`;
}

function pedido(ctx: ContextoWa): { headers: Record<string, string>; quem: string; recusou: string; naoAchou: string; signal?: AbortSignal; permitirTlsInseguro: boolean } {
  return {
    headers: { apikey: ctx.chave },
    quem: QUEM,
    recusou: 'A Evolution recusou a apikey. Use a global (AUTHENTICATION_API_KEY) ou a da instância.',
    naoAchou: `A Evolution não achou a instância "${ctx.config.evolution.instancia}" (ou esse endereço não é da Evolution).`,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    permitirTlsInseguro: ctx.config.permitirTlsInseguro,
  };
}

/** A v1 pede `textMessage.text`; a v2, `text`. Começa pela v2 e só cai na v1 se ela reclamar desse campo. */
function pedeFormatoV1(erro: unknown): boolean {
  return erro instanceof ErroWa && erro.status === 400 && /textMessage/i.test(erro.detalhe);
}

export const evolution: AdaptadorWa = {
  falta(ctx) {
    if (!ctx.config.evolution.baseUrl) return 'Falta o endereço da Evolution (ex.: https://evolution.seudominio.com).';
    if (!ctx.config.evolution.instancia) return 'Falta o nome da instância.';
    if (!ctx.chave) return 'Falta a apikey.';
    return undefined;
  },

  testar(ctx) {
    return testarCom(async () => {
      const r = await chamar(url(ctx, '/instance/connectionState'), pedido(ctx));
      const estado = textoDe(campo(r, 'instance', 'state')) || textoDe(campo(r, 'state'));
      if (estado === 'open') return ok(`Instância "${ctx.config.evolution.instancia}" conectada ao WhatsApp.`);
      if (estado === 'connecting') return falhou('A instância está conectando. Se o QR code ainda não foi lido, leia no painel da Evolution (WhatsApp › Aparelhos conectados).');
      return falhou(`A instância está desconectada${estado ? ` (${estado})` : ''}. Abra o painel da Evolution e leia o QR code com o WhatsApp.`);
    });
  },

  async enviarTexto(ctx, numero, texto) {
    let r: unknown;
    try {
      r = await chamar(url(ctx, '/message/sendText'), { ...pedido(ctx), method: 'POST', json: { number: numero, text: texto } });
    } catch (erro) {
      if (!pedeFormatoV1(erro)) throw erro;
      r = await chamar(url(ctx, '/message/sendText'), { ...pedido(ctx), method: 'POST', json: { number: numero, textMessage: { text: texto } } });
    }
    const id = textoDe(campo(r, 'key', 'id'));
    return id ? { idExterno: id } : {};
  },

  async conferirNumero(ctx, numero) {
    const r = await chamar(url(ctx, '/chat/whatsappNumbers'), { ...pedido(ctx), method: 'POST', json: { numbers: [numero] } });
    const item = Array.isArray(r) ? r[0] : undefined;
    const existe = campo(item, 'exists') === true;
    const jid = textoDe(campo(item, 'jid'));
    const numeroWa = jid ? jid.split('@')[0] : undefined;
    return { existe, ...(numeroWa ? { numeroWa } : {}), mensagem: existe ? 'Este número tem WhatsApp.' : 'Este número não tem WhatsApp.' };
  },

  async configurarWebhook(ctx, endereco) {
    const eventos = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'];
    try {
      await chamar(url(ctx, '/webhook/set'), {
        ...pedido(ctx),
        method: 'POST',
        json: { webhook: { enabled: true, url: endereco, webhookByEvents: false, webhookBase64: false, events: eventos } },
      });
    } catch (erro) {
      // v1: os campos vão soltos, sem o objeto "webhook".
      if (!(erro instanceof ErroWa) || erro.status !== 400) throw erro;
      await chamar(url(ctx, '/webhook/set'), { ...pedido(ctx), method: 'POST', json: { enabled: true, url: endereco, webhook_by_events: false, events: eventos } });
    }
  },

  async buscarConversa(ctx, numero, limite) {
    const r = await chamar(url(ctx, '/chat/findMessages'), {
      ...pedido(ctx),
      method: 'POST',
      json: { where: { key: { remoteJid: `${numero}@s.whatsapp.net` } }, limit: limite, page: 1, offset: limite },
    });
    // v2 devolve { messages: { records } }; versões anteriores, a lista direto.
    const registros = campo(r, 'messages', 'records') ?? campo(r, 'messages') ?? r;
    return Array.isArray(registros) ? eventosDaEvolution({ event: 'messages.upsert', data: registros.slice(0, limite) }) : [];
  },
};
