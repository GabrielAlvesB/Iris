import type { ModeloIa } from '../../../../shared/types/ia.types';
import {
  TIMEOUT_IMAGEM_MS,
  TIMEOUT_LISTA_MS,
  TIMEOUT_TEXTO_MS,
  ErroProvedor,
  ajustarTeto,
  baixarImagem,
  chamarJson,
  enviarTolerante,
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

interface ErroNoCorpo {
  message?: string;
  code?: number | string;
}

interface RespostaChat {
  choices?: Array<{ message?: MensagemChat; finish_reason?: string; error?: ErroNoCorpo }>;
  /** O OpenRouter às vezes responde 200 com o erro do provedor aqui. */
  error?: ErroNoCorpo;
}

/**
 * O que cada modelo devolve, lido da listagem. Modelos só de imagem (Flux,
 * Riverflow…) recusam `modalities: ['image','text']`; os que escrevem junto
 * (Gemini Image, GPT Image) precisam dele.
 */
const saidas = new Map<string, string[]>();

async function saidasDe(ctx: ContextoProvedor, modelo: string, signal?: AbortSignal): Promise<string[] | undefined> {
  if (!saidas.has(modelo)) {
    try {
      await listarTodos(ctx, signal);
    } catch {
      // Sem a lista, vai o par padrão; o ajuste por erro ainda cobre.
    }
  }
  return saidas.get(modelo);
}

async function listarTodos(ctx: ContextoProvedor, signal?: AbortSignal): Promise<RespostaModelos> {
  const r = await chamarJson<RespostaModelos>(ROTULO, `${BASE}/models`, { headers: cabecalhos(ctx), timeoutMs: TIMEOUT_LISTA_MS, signal });
  (r.data ?? []).forEach((m) => {
    if (typeof m.id === 'string') saidas.set(m.id, m.architecture?.output_modalities ?? []);
  });
  return r;
}

/** Erro que veio com HTTP 200 vira o mesmo erro de um HTTP de falha. */
function conferirErro(r: RespostaChat): void {
  const e = r.error ?? r.choices?.[0]?.error;
  if (!e) return;
  const status = typeof e.code === 'number' ? e.code : 400;
  const detalhe = e.message ?? '';
  throw new ErroProvedor(`${ROTULO}: o provedor do modelo recusou o pedido.${detalhe ? ` Detalhe: ${detalhe}` : ''}`, status, detalhe, undefined);
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
    const r = await listarTodos(ctx, signal);
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
    const r = await enviarTolerante(
      {
        model: pedido.modelo,
        messages: [
          { role: 'system', content: pedido.sistema },
          { role: 'user', content: conteudo },
        ],
        max_tokens: pedido.maxTokens,
      },
      async (c) => {
        const resposta = await chamarJson<RespostaChat>(ROTULO, `${BASE}/chat/completions`, {
          method: 'POST',
          headers: cabecalhos(ctx),
          body: JSON.stringify(c),
          timeoutMs: TIMEOUT_TEXTO_MS,
          signal: pedido.signal,
        });
        conferirErro(resposta);
        return resposta;
      },
      // Pouco saldo: o OpenRouter diz quanto cabe ("can only afford N") e o pedido vai com esse teto.
      (c, erro) => ajustarTeto(c, erro, ['max_tokens']),
    );
    const escolha = r.choices?.[0];
    const texto = textoDe(escolha?.message);
    if (!texto.trim()) {
      if (escolha?.finish_reason === 'length') throw new Error('O modelo gastou o limite de resposta raciocinando e não chegou a escrever. Tente de novo ou use um modelo mais leve.');
      throw new Error('O OpenRouter devolveu uma resposta vazia. Tente de novo ou use outro modelo.');
    }
    return texto;
  },

  async gerarImagem(ctx, pedido) {
    const instrucao = `${pedido.prompt}

Proporção da imagem: ${pedido.proporcao}.`;
    const conteudo = [
      { type: 'text', text: instrucao },
      ...pedido.referencias.map((img) => ({ type: 'image_url', image_url: { url: paraDataUrl(img) } })),
    ];
    const saida = await saidasDe(ctx, pedido.modelo, pedido.signal);
    if (saida && !saida.includes('image')) {
      throw new Error(`O modelo "${pedido.modelo}" não gera imagens. Escolha um modelo de imagem em Ajustes › Inteligência artificial (os que geram vêm marcados).`);
    }
    const modalidades = saida && !saida.includes('text') ? ['image'] : ['image', 'text'];
    return varias(pedido.quantidade, async () => {
      const r = await enviarTolerante(
        {
          model: pedido.modelo,
          messages: [{ role: 'user', content: conteudo }],
          modalities: modalidades,
          image_config: { aspect_ratio: pedido.proporcao },
          // Imagem também sai do chat e conta como tokens de saída; sem teto,
          // o OpenRouter reservaria o máximo do modelo no saldo.
          max_tokens: MAX_TOKENS_IMAGEM,
        },
        async (c) => {
          const resposta = await chamarJson<RespostaChat>(ROTULO, `${BASE}/chat/completions`, {
            method: 'POST',
            headers: cabecalhos(ctx),
            body: JSON.stringify(c),
            timeoutMs: TIMEOUT_IMAGEM_MS,
            signal: pedido.signal,
          });
          conferirErro(resposta);
          return resposta;
        },
        (c, erro) => {
          // Um modelo só de imagem que a listagem não descreveu direito.
          if (/modalit/i.test(erro.detalhe) && Array.isArray(c.modalities) && c.modalities.includes('text')) {
            c.modalities = ['image'];
            return true;
          }
          // Uma imagem cabe em ~1.300 tokens: abaixo disso, não adianta tentar.
          return ajustarTeto(c, erro, ['max_tokens'], 1_500);
        },
      );
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
