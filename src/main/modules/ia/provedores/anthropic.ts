import type { ModeloIa } from '../../../../shared/types/ia.types';
import { TIMEOUT_LISTA_MS, TIMEOUT_TEXTO_MS, chamarJson, type Adaptador, type ContextoProvedor } from './comum';

/**
 * Anthropic (Claude) pela API REST de Messages. Fica em HTTP direto, e não no
 * SDK, porque todo tráfego do Iris sai pelo httpClient (herda o proxy do
 * sistema) e o projeto evita dependência nova. Claude lê imagens, mas não as
 * gera: não há gerarImagem aqui.
 */

const BASE = 'https://api.anthropic.com/v1';
const ROTULO = 'A Anthropic';
const VERSAO_API = '2023-06-01';

interface RespostaModelos {
  data?: Array<{ id: string; display_name?: string }>;
  has_more?: boolean;
  last_id?: string;
}

interface RespostaMensagem {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

function cabecalhos(ctx: ContextoProvedor): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': ctx.chave,
    'anthropic-version': VERSAO_API,
  };
}

/** Tipos de imagem que a API aceita em base64. */
const MIME_ACEITO = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const anthropic: Adaptador = {
  async listarModelos(ctx, signal) {
    const modelos: ModeloIa[] = [];
    let depois: string | undefined;
    // Paginação por after_id; poucas páginas na prática.
    for (let pagina = 0; pagina < 5; pagina++) {
      const url = `${BASE}/models?limit=100${depois ? `&after_id=${encodeURIComponent(depois)}` : ''}`;
      const r = await chamarJson<RespostaModelos>(ROTULO, url, { headers: cabecalhos(ctx), timeoutMs: TIMEOUT_LISTA_MS, signal });
      (r.data ?? []).forEach((m) => modelos.push({ id: m.id, nome: m.display_name || m.id, geraImagem: false }));
      if (!r.has_more || !r.last_id) break;
      depois = r.last_id;
    }
    return modelos;
  },

  async gerarTexto(ctx, pedido) {
    const imagens = pedido.imagens
      .filter((img) => MIME_ACEITO.has(img.mime))
      .map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.dados.toString('base64') } }));
    const r = await chamarJson<RespostaMensagem>(ROTULO, `${BASE}/messages`, {
      method: 'POST',
      headers: cabecalhos(ctx),
      body: JSON.stringify({
        model: pedido.modelo,
        max_tokens: 16000,
        system: pedido.sistema,
        // Imagens antes do texto, como a documentação recomenda.
        messages: [{ role: 'user', content: [...imagens, { type: 'text', text: pedido.texto }] }],
      }),
      timeoutMs: TIMEOUT_TEXTO_MS,
      signal: pedido.signal,
    });
    if (r.stop_reason === 'refusal') throw new Error('O Claude recusou este pedido. Reformule o texto e tente de novo.');
    // Só os blocos de texto: os de raciocínio (thinking) não vão para a tela.
    const texto = (r.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    if (!texto.trim()) throw new Error('O Claude devolveu uma resposta vazia.');
    return texto;
  },
};
