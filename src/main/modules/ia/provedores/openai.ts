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
  type PedidoImagemIa,
  type PedidoTextoIa,
} from './comum';

/**
 * API da OpenAI — e de todo serviço "compatível" (Groq, DeepSeek, Ollama,
 * LM Studio…), que só troca o endereço base. Por isso é uma fábrica.
 */

interface RespostaModelos {
  data?: Array<{ id: string }>;
}

interface RespostaChat {
  choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
}

interface RespostaImagens {
  data?: Array<{ b64_json?: string; url?: string }>;
}

/** Modelos da listagem que não servem para conversa (áudio, embeddings…). */
const NAO_TEXTO = /embed|whisper|tts|audio|realtime|moderation|transcribe|davinci|babbage|search/i;

function geraImagem(id: string): boolean {
  return /gpt-image|dall-e|image/i.test(id);
}

function cabecalhos(ctx: ContextoProvedor, json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (ctx.chave) h.Authorization = `Bearer ${ctx.chave}`;
  return h;
}

/**
 * Tamanhos aceitos: gpt-image (1024², 1536×1024, 1024×1536) e dall-e-3
 * (1024², 1792×1024, 1024×1792). O corte exato para o formato é feito depois.
 */
function tamanhoPara(modelo: string, largura: number, altura: number): string {
  const razao = largura / altura;
  const dalle3 = /dall-e-3/i.test(modelo);
  if (razao > 1.15) return dalle3 ? '1792x1024' : '1536x1024';
  if (razao < 0.87) return dalle3 ? '1024x1792' : '1024x1536';
  return '1024x1024';
}

const QUALIDADE = { baixa: 'low', media: 'medium', alta: 'high' } as const;

/**
 * `campoLimite`: a OpenAI oficial só aceita `max_completion_tokens` nos modelos
 * novos; os serviços compatíveis (Groq, Ollama…) entendem `max_tokens`.
 */
export function criarOpenAi(rotulo: string, basePadrao: string, campoLimite: 'max_completion_tokens' | 'max_tokens' = 'max_tokens'): Adaptador {
  const base = (ctx: ContextoProvedor): string => (ctx.baseUrl || basePadrao).replace(/\/+$/, '');

  async function lerImagens(resposta: RespostaImagens, signal?: AbortSignal): Promise<Buffer[]> {
    const itens = resposta.data ?? [];
    const imagens = await Promise.all(
      itens.map((d) => (d.b64_json ? Promise.resolve(Buffer.from(d.b64_json, 'base64')) : d.url ? baixarImagem(d.url, signal) : Promise.resolve(null))),
    );
    const validas = imagens.filter((b): b is Buffer => b !== null);
    if (!validas.length) throw new Error(`${rotulo} não devolveu nenhuma imagem.`);
    return validas;
  }

  return {
    async listarModelos(ctx, signal) {
      const r = await chamarJson<RespostaModelos>(rotulo, `${base(ctx)}/models`, {
        headers: cabecalhos(ctx),
        timeoutMs: TIMEOUT_LISTA_MS,
        signal,
      });
      return (r.data ?? [])
        .filter((m) => typeof m.id === 'string')
        .map((m): ModeloIa => ({ id: m.id, nome: m.id, geraImagem: geraImagem(m.id) }))
        .filter((m) => m.geraImagem || !NAO_TEXTO.test(m.id))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async gerarTexto(ctx, pedido: PedidoTextoIa) {
      const conteudo = pedido.imagens.length
        ? [{ type: 'text', text: pedido.texto }, ...pedido.imagens.map((img) => ({ type: 'image_url', image_url: { url: paraDataUrl(img) } }))]
        : pedido.texto;
      const r = await chamarJson<RespostaChat>(rotulo, `${base(ctx)}/chat/completions`, {
        method: 'POST',
        headers: cabecalhos(ctx),
        body: JSON.stringify({
          model: pedido.modelo,
          messages: [
            { role: 'system', content: pedido.sistema },
            { role: 'user', content: conteudo },
          ],
          [campoLimite]: pedido.maxTokens,
        }),
        timeoutMs: TIMEOUT_TEXTO_MS,
        signal: pedido.signal,
      });
      const c = r.choices?.[0]?.message?.content;
      const texto = typeof c === 'string' ? c : (c ?? []).map((p) => p.text ?? '').join('');
      if (!texto.trim()) throw new Error(`${rotulo} devolveu uma resposta vazia.`);
      return texto;
    },

    async gerarImagem(ctx, pedido: PedidoImagemIa) {
      const size = tamanhoPara(pedido.modelo, pedido.largura, pedido.altura);
      const gptImage = /gpt-image/i.test(pedido.modelo);
      // dall-e-3 só gera uma por chamada.
      const porChamada = /dall-e-3/i.test(pedido.modelo) ? 1 : pedido.quantidade;

      if (!pedido.referencias.length) {
        const uma = async (n: number): Promise<Buffer[]> => {
          const corpo: Record<string, unknown> = { model: pedido.modelo, prompt: pedido.prompt, size, n };
          if (gptImage && pedido.qualidade) corpo.quality = QUALIDADE[pedido.qualidade];
          if (!gptImage) corpo.response_format = 'b64_json';
          const r = await chamarJson<RespostaImagens>(rotulo, `${base(ctx)}/images/generations`, {
            method: 'POST',
            headers: cabecalhos(ctx),
            body: JSON.stringify(corpo),
            timeoutMs: TIMEOUT_IMAGEM_MS,
            signal: pedido.signal,
          });
          return lerImagens(r, pedido.signal);
        };
        return porChamada === pedido.quantidade ? uma(pedido.quantidade) : varias(pedido.quantidade, () => uma(1));
      }

      // Com referências: /images/edits é multipart, com um campo image[] por arquivo.
      const form = new FormData();
      form.append('model', pedido.modelo);
      form.append('prompt', pedido.prompt);
      form.append('size', size);
      form.append('n', String(pedido.quantidade));
      if (gptImage && pedido.qualidade) form.append('quality', QUALIDADE[pedido.qualidade]);
      pedido.referencias.forEach((img, i) => {
        form.append('image[]', new Blob([new Uint8Array(img.dados)], { type: img.mime }), img.nome || `referencia-${i + 1}.png`);
      });
      const r = await chamarJson<RespostaImagens>(rotulo, `${base(ctx)}/images/edits`, {
        method: 'POST',
        headers: cabecalhos(ctx, false),
        body: form,
        timeoutMs: TIMEOUT_IMAGEM_MS,
        signal: pedido.signal,
      });
      return lerImagens(r, pedido.signal);
    },
  };
}
