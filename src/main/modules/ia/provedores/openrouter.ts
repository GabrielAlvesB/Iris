import type { ModeloIa } from '../../../../shared/types/ia.types';
import {
  TIMEOUT_IMAGEM_MS,
  TIMEOUT_LISTA_MS,
  TIMEOUT_TEXTO_MS,
  baixarImagem,
  chamarJson,
  paraDataUrl,
  varias,
  type Adaptador,
  type ContextoProvedor,
} from './comum';

/**
 * OpenRouter: API no formato da OpenAI, mas a imagem sai do próprio chat
 * (`modalities: ['image','text']`) e volta em `message.images` como data URL.
 * Uma imagem por chamada — várias viram chamadas em paralelo.
 */

const BASE = 'https://openrouter.ai/api/v1';
const ROTULO = 'O OpenRouter';
/** Uma imagem do Gemini Image são ~1.300 tokens; sobra para o texto que vem junto. */
const MAX_TOKENS_IMAGEM = 8_192;

interface RespostaModelos {
  data?: Array<{
    id: string;
    name?: string;
    description?: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    architecture?: { output_modalities?: string[] };
  }>;
}

/** O OpenRouter informa US$ por token; a tela mostra por 1 milhão. */
function porMilhao(valor: string | undefined): number | undefined {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000 * 1000) / 1000 : undefined;
}

interface MensagemChat {
  content?: string | Array<{ type: string; text?: string }> | null;
  images?: Array<{ image_url?: { url?: string } }>;
}

interface RespostaChat {
  choices?: Array<{ message?: MensagemChat }>;
}

function cabecalhos(ctx: ContextoProvedor): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ctx.chave}`,
    // Identificação opcional do app no painel do OpenRouter.
    'HTTP-Referer': 'https://github.com/GabrielAlvesB/Iris',
    'X-Title': 'Iris',
  };
}

function textoDe(m: MensagemChat | undefined): string {
  const c = m?.content;
  return typeof c === 'string' ? c : (c ?? []).map((p) => p.text ?? '').join('');
}

export const openrouter: Adaptador = {
  async listarModelos(ctx, signal) {
    // A listagem é pública; a chave é conferida à parte, para o teste dizer se ela vale.
    await chamarJson<unknown>(ROTULO, `${BASE}/key`, { headers: cabecalhos(ctx), timeoutMs: TIMEOUT_LISTA_MS, signal });
    const r = await chamarJson<RespostaModelos>(ROTULO, `${BASE}/models`, { headers: cabecalhos(ctx), timeoutMs: TIMEOUT_LISTA_MS, signal });
    return (r.data ?? [])
      .filter((m) => typeof m.id === 'string')
      .map((m): ModeloIa => ({
        id: m.id,
        nome: m.name || m.id,
        geraImagem: (m.architecture?.output_modalities ?? []).includes('image'),
        descricao: m.description?.slice(0, 280),
        contexto: m.context_length,
        precoEntrada: porMilhao(m.pricing?.prompt),
        precoSaida: porMilhao(m.pricing?.completion),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  async gerarTexto(ctx, pedido) {
    const conteudo = pedido.imagens.length
      ? [{ type: 'text', text: pedido.texto }, ...pedido.imagens.map((img) => ({ type: 'image_url', image_url: { url: paraDataUrl(img) } }))]
      : pedido.texto;
    const r = await chamarJson<RespostaChat>(ROTULO, `${BASE}/chat/completions`, {
      method: 'POST',
      headers: cabecalhos(ctx),
      body: JSON.stringify({
        model: pedido.modelo,
        messages: [
          { role: 'system', content: pedido.sistema },
          { role: 'user', content: conteudo },
        ],
        max_tokens: pedido.maxTokens,
      }),
      timeoutMs: TIMEOUT_TEXTO_MS,
      signal: pedido.signal,
    });
    const texto = textoDe(r.choices?.[0]?.message);
    if (!texto.trim()) throw new Error('O OpenRouter devolveu uma resposta vazia.');
    return texto;
  },

  async gerarImagem(ctx, pedido) {
    const instrucao = `${pedido.prompt}\n\nProporção da imagem: ${pedido.proporcao}.`;
    const conteudo = [
      { type: 'text', text: instrucao },
      ...pedido.referencias.map((img) => ({ type: 'image_url', image_url: { url: paraDataUrl(img) } })),
    ];
    return varias(pedido.quantidade, async () => {
      const r = await chamarJson<RespostaChat>(ROTULO, `${BASE}/chat/completions`, {
        method: 'POST',
        headers: cabecalhos(ctx),
        body: JSON.stringify({
          model: pedido.modelo,
          messages: [{ role: 'user', content: conteudo }],
          modalities: ['image', 'text'],
          image_config: { aspect_ratio: pedido.proporcao },
          // Imagem também sai do chat e conta como tokens de saída; sem teto,
          // o OpenRouter reservaria o máximo do modelo no saldo.
          max_tokens: MAX_TOKENS_IMAGEM,
        }),
        timeoutMs: TIMEOUT_IMAGEM_MS,
        signal: pedido.signal,
      });
      const mensagem = r.choices?.[0]?.message;
      const urls = (mensagem?.images ?? []).map((i) => i.image_url?.url).filter((u): u is string => Boolean(u));
      if (!urls.length) {
        const explicacao = textoDe(mensagem).trim();
        throw new Error(
          explicacao
            ? `O modelo respondeu sem imagem: "${explicacao.slice(0, 240)}"`
            : 'O modelo não devolveu imagem. Confira se ele gera imagens (em Ajustes, os que geram vêm marcados).',
        );
      }
      return Promise.all(urls.map((u) => baixarImagem(u, pedido.signal)));
    });
  },
};
