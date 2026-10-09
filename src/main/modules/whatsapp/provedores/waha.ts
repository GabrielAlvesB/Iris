import { eventosDoWaha, idDaWaha } from '../../../../shared/types/whatsapp.eventos';
import { campo, chamar, falhou, ok, testarCom, textoDe, type AdaptadorWa, type ContextoWa } from './comum';

/**
 * WAHA (WhatsApp HTTP API). A apikey é opcional — WAHA sem WHATSAPP_API_KEY
 * aceita sem cabeçalho. O chatId de uma pessoa é "<número>@c.us".
 */

const QUEM = 'o WAHA';

function pedido(ctx: ContextoWa): { headers: Record<string, string>; quem: string; recusou: string; naoAchou: string; signal?: AbortSignal; permitirTlsInseguro: boolean } {
  return {
    headers: ctx.chave ? { 'X-Api-Key': ctx.chave } : {},
    quem: QUEM,
    recusou: 'O WAHA recusou a apikey (WHATSAPP_API_KEY).',
    naoAchou: `O WAHA não achou a sessão "${ctx.config.waha.sessao}" (ou esse endereço não é do WAHA).`,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    permitirTlsInseguro: ctx.config.permitirTlsInseguro,
  };
}

function sessao(ctx: ContextoWa): string {
  return encodeURIComponent(ctx.config.waha.sessao);
}

export const waha: AdaptadorWa = {
  falta(ctx) {
    if (!ctx.config.waha.baseUrl) return 'Falta o endereço do WAHA (ex.: http://localhost:3000).';
    return undefined;
  },

  testar(ctx) {
    return testarCom(async () => {
      const r = await chamar(`${ctx.config.waha.baseUrl}/api/sessions/${sessao(ctx)}`, pedido(ctx));
      const status = textoDe(campo(r, 'status'));
      const quem = textoDe(campo(r, 'me', 'pushName'));
      if (status === 'WORKING') return ok(`Sessão "${ctx.config.waha.sessao}" conectada${quem ? ` como ${quem}` : ''}.`, ctx.chave ? [] : ['Sem apikey: confira se o WAHA está protegido (WHATSAPP_API_KEY) antes de expor na internet.']);
      if (status === 'SCAN_QR_CODE') return falhou('A sessão está esperando o QR code. Abra o painel do WAHA e leia com o WhatsApp.');
      if (status === 'STARTING') return falhou('A sessão está iniciando. Tente de novo em alguns segundos.');
      return falhou(`A sessão não está funcionando${status ? ` (${status})` : ''}. Inicie no painel do WAHA.`);
    });
  },

  async enviarTexto(ctx, numero, texto) {
    const r = await chamar(`${ctx.config.waha.baseUrl}/api/sendText`, { ...pedido(ctx), method: 'POST', json: { session: ctx.config.waha.sessao, chatId: `${numero}@c.us`, text: texto } });
    const id = idDaWaha(campo(r, 'id')) || idDaWaha(campo(r, 'key', 'id'));
    return id ? { idExterno: id } : {};
  },

  async conferirNumero(ctx, numero) {
    const r = await chamar(`${ctx.config.waha.baseUrl}/api/contacts/check-exists?phone=${numero}&session=${sessao(ctx)}`, pedido(ctx));
    const existe = campo(r, 'numberExists') === true;
    const chatId = textoDe(campo(r, 'chatId'));
    const numeroWa = chatId ? chatId.split('@')[0] : undefined;
    return { existe, ...(numeroWa ? { numeroWa } : {}), mensagem: existe ? 'Este número tem WhatsApp.' : 'Este número não tem WhatsApp.' };
  },

  async configurarWebhook(ctx, endereco) {
    // Trocar a config da sessão substitui os webhooks: lê os que existem e só acrescenta o do Iris.
    const atual = await chamar(`${ctx.config.waha.baseUrl}/api/sessions/${sessao(ctx)}`, pedido(ctx));
    const config = (campo(atual, 'config') ?? {}) as Record<string, unknown>;
    const existentes = Array.isArray(config.webhooks) ? (config.webhooks as Array<Record<string, unknown>>) : [];
    const outros = existentes.filter((w) => !textoDe(w.url).includes('/v1/whatsapp/'));
    const webhooks = [...outros, { url: endereco, events: ['message', 'message.ack'] }];
    await chamar(`${ctx.config.waha.baseUrl}/api/sessions/${sessao(ctx)}`, { ...pedido(ctx), method: 'PUT', json: { config: { ...config, webhooks } } });
  },

  async buscarConversa(ctx, numero, limite) {
    const r = await chamar(`${ctx.config.waha.baseUrl}/api/${sessao(ctx)}/chats/${encodeURIComponent(`${numero}@c.us`)}/messages?limit=${limite}&downloadMedia=false`, pedido(ctx));
    return Array.isArray(r) ? r.flatMap((m) => eventosDoWaha({ event: 'message', payload: m })) : [];
  },
};
