import { variaveisDoCorpo } from '../../../../shared/types/whatsapp.campos';
import { explicarErroWa } from '../../../../shared/types/whatsapp.eventos';
import type { TemplateMeta } from '../../../../shared/types/whatsapp.types';
import { ErroWa, campo, chamar, ok, testarCom, textoDe, type AdaptadorWa, type ContextoWa, type Enviado } from './comum';

/**
 * WhatsApp Business Platform (Cloud API), direto na Graph API da Meta.
 * O token é o permanente de um usuário do sistema (o temporário do painel
 * vence em 24 h). Webhooks da Meta exigem https público: o recebimento vai
 * pela caixa na nuvem ou pelo n8n, nunca direto no PC.
 */

const GRAPH = 'https://graph.facebook.com';

function base(ctx: ContextoWa): string {
  return `${GRAPH}/${ctx.config.meta.versaoApi}`;
}

function cabecalhos(ctx: ContextoWa): Record<string, string> {
  return { Authorization: `Bearer ${ctx.chave}` };
}

const QUEM = 'a API da Meta';
const RECUSOU = 'A Meta recusou o token: ele pode ter vencido (o temporário dura 24 h) ou não ter a permissão whatsapp_business_messaging.';

async function enviar(ctx: ContextoWa, corpo: Record<string, unknown>): Promise<Enviado> {
  try {
    const r = await chamar(`${base(ctx)}/${ctx.config.meta.phoneNumberId}/messages`, {
      method: 'POST',
      headers: cabecalhos(ctx),
      json: { messaging_product: 'whatsapp', recipient_type: 'individual', ...corpo },
      quem: QUEM,
      recusou: RECUSOU,
      naoAchou: 'A Meta não achou esse Phone Number ID. Confira o número de identificação (não é o telefone).',
      signal: ctx.signal,
    });
    const id = textoDe(campo(r, 'messages', '0', 'id'));
    return id ? { idExterno: id } : {};
  } catch (erro) {
    if (erro instanceof ErroWa) throw new ErroWa(explicarErroWa(erro.message), erro.status, erro.detalhe);
    throw erro;
  }
}

export const meta: AdaptadorWa = {
  falta(ctx) {
    if (!ctx.config.meta.phoneNumberId) return 'Falta o Phone Number ID (no painel da Meta, em WhatsApp › Configuração da API).';
    if (!ctx.chave) return 'Falta o token de acesso.';
    return undefined;
  },

  testar(ctx) {
    return testarCom(async () => {
      const r = await chamar(`${base(ctx)}/${ctx.config.meta.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
        headers: cabecalhos(ctx),
        quem: QUEM,
        recusou: RECUSOU,
        naoAchou: 'A Meta não achou esse Phone Number ID.',
        signal: ctx.signal,
      });
      const numero = textoDe(campo(r, 'display_phone_number'));
      const nome = textoDe(campo(r, 'verified_name'));
      const qualidade = textoDe(campo(r, 'quality_rating'));
      const detalhes = [
        nome ? `Nome verificado: ${nome}` : '',
        qualidade ? `Qualidade do número: ${qualidade === 'GREEN' ? 'boa' : qualidade === 'YELLOW' ? 'média' : qualidade === 'RED' ? 'baixa' : qualidade}` : '',
        ctx.config.meta.wabaId ? '' : 'Sem o ID da conta (WABA), os modelos aprovados não aparecem no Iris.',
      ].filter(Boolean);
      return ok(`Conectado ao número ${numero || ctx.config.meta.phoneNumberId}.`, detalhes);
    });
  },

  enviarTexto(ctx, numero, texto) {
    return enviar(ctx, { to: numero, type: 'text', text: { preview_url: false, body: texto } });
  },

  enviarTemplate(ctx, numero, template, parametros) {
    return enviar(ctx, {
      to: numero,
      type: 'template',
      template: {
        name: template.nome,
        language: { code: template.idioma },
        components: parametros.length ? [{ type: 'body', parameters: parametros.map((t) => ({ type: 'text', text: t })) }] : [],
      },
    });
  },

  async listarTemplates(ctx) {
    if (!ctx.config.meta.wabaId) throw new ErroWa('Informe o ID da conta do WhatsApp Business (WABA) para listar os modelos aprovados.');
    const r = await chamar(`${base(ctx)}/${ctx.config.meta.wabaId}/message_templates?fields=name,language,status,category,components&limit=200`, {
      headers: cabecalhos(ctx),
      quem: QUEM,
      recusou: RECUSOU,
      naoAchou: 'A Meta não achou essa conta (WABA ID).',
      signal: ctx.signal,
    });
    const lista = campo(r, 'data');
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((t) => textoDe(campo(t, 'status')) === 'APPROVED')
      .map((t): TemplateMeta => {
        const componentes = campo(t, 'components');
        const corpo = Array.isArray(componentes) ? textoDe(campo(componentes.find((c) => textoDe(campo(c, 'type')) === 'BODY'), 'text')) : '';
        return { nome: textoDe(campo(t, 'name')), idioma: textoDe(campo(t, 'language')), categoria: textoDe(campo(t, 'category')), corpo, variaveis: variaveisDoCorpo(corpo) };
      })
      .filter((t) => t.nome);
  },
};
