import type { ModeloIa } from '../../../../shared/types/ia.types';
import {
  TIMEOUT_IMAGEM_MS,
  TIMEOUT_LISTA_MS,
  TIMEOUT_TEXTO_MS,
  chamarJson,
  varias,
  type Adaptador,
  type ContextoProvedor,
  type ImagemEntrada,
} from './comum';

/**
 * Google Gemini (API do AI Studio). Texto e imagem saem do mesmo
 * generateContent; referências vão como inlineData e a imagem gerada volta
 * do mesmo jeito.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ROTULO = 'O Google';

interface RespostaModelos {
  models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  nextPageToken?: string;
}

interface Parte {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

interface RespostaConteudo {
  candidates?: Array<{ content?: { parts?: Parte[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

function cabecalhos(ctx: ContextoProvedor): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.chave };
}

function partesDeImagem(imagens: ImagemEntrada[]): Parte[] {
  return imagens.map((img) => ({ inlineData: { mimeType: img.mime, data: img.dados.toString('base64') } }));
}

function partesDaResposta(r: RespostaConteudo): Parte[] {
  if (r.promptFeedback?.blockReason) {
    throw new Error(`O Gemini bloqueou o pedido (${r.promptFeedback.blockReason}). Reformule o texto.`);
  }
  return r.candidates?.[0]?.content?.parts ?? [];
}

function urlModelo(modelo: string): string {
  const id = modelo.replace(/^models\//, '');
  return `${BASE}/models/${encodeURIComponent(id)}:generateContent`;
}

export const google: Adaptador = {
  async listarModelos(ctx, signal) {
    const modelos: ModeloIa[] = [];
    let token: string | undefined;
    for (let pagina = 0; pagina < 5; pagina++) {
      const url = `${BASE}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
      const r = await chamarJson<RespostaModelos>(ROTULO, url, { headers: cabecalhos(ctx), timeoutMs: TIMEOUT_LISTA_MS, signal });
      (r.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .forEach((m) => {
          const id = m.name.replace(/^models\//, '');
          modelos.push({ id, nome: m.displayName || id, geraImagem: /image/i.test(id) });
        });
      if (!r.nextPageToken) break;
      token = r.nextPageToken;
    }
    return modelos.sort((a, b) => a.id.localeCompare(b.id));
  },

  async gerarTexto(ctx, pedido) {
    const r = await chamarJson<RespostaConteudo>(ROTULO, urlModelo(pedido.modelo), {
      method: 'POST',
      headers: cabecalhos(ctx),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: pedido.sistema }] },
        contents: [{ role: 'user', parts: [{ text: pedido.texto }, ...partesDeImagem(pedido.imagens)] }],
      }),
      timeoutMs: TIMEOUT_TEXTO_MS,
      signal: pedido.signal,
    });
    const texto = partesDaResposta(r)
      .map((p) => p.text ?? '')
      .join('');
    if (!texto.trim()) throw new Error('O Gemini devolveu uma resposta vazia.');
    return texto;
  },

  async gerarImagem(ctx, pedido) {
    return varias(pedido.quantidade, async () => {
      const r = await chamarJson<RespostaConteudo>(ROTULO, urlModelo(pedido.modelo), {
        method: 'POST',
        headers: cabecalhos(ctx),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: pedido.prompt }, ...partesDeImagem(pedido.referencias)] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: pedido.proporcao },
          },
        }),
        timeoutMs: TIMEOUT_IMAGEM_MS,
        signal: pedido.signal,
      });
      const partes = partesDaResposta(r);
      const imagens = partes.filter((p) => p.inlineData?.data).map((p) => Buffer.from(p.inlineData!.data!, 'base64'));
      if (!imagens.length) {
        const explicacao = partes.map((p) => p.text ?? '').join(' ').trim();
        throw new Error(
          explicacao
            ? `O Gemini respondeu sem imagem: "${explicacao.slice(0, 240)}"`
            : 'O Gemini não devolveu imagem. Use um modelo de imagem (ex.: gemini-2.5-flash-image).',
        );
      }
      return imagens;
    });
  },
};
