import type { ModeloIa } from '../../../../shared/types/ia.types';
import {
  TIMEOUT_IMAGEM_MS,
  TIMEOUT_LISTA_MS,
  TIMEOUT_TEXTO_MS,
  chamarJson,
  enviarTolerante,
  varias,
  type Adaptador,
  type ContextoProvedor,
  type ImagemEntrada,
  type PedidoImagemIa,
} from './comum';

/**
 * Google Gemini (API do AI Studio). Texto e imagem saem do mesmo
 * generateContent; referências vão como inlineData e a imagem gerada volta
 * do mesmo jeito. A família Imagen é outra rota (`:predict`).
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ROTULO = 'O Google';

interface RespostaModelos {
  models?: Array<{ name: string; displayName?: string; description?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }>;
  nextPageToken?: string;
}

interface Parte {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType?: string; data?: string };
}

interface RespostaConteudo {
  candidates?: Array<{ content?: { parts?: Parte[] }; finishReason?: string; finishMessage?: string }>;
  promptFeedback?: { blockReason?: string };
}

interface RespostaImagen {
  predictions?: Array<{ bytesBase64Encoded?: string; raiFilteredReason?: string }>;
}

/**
 * Modelos que respondem a generateContent mas não servem para escrever texto
 * nem gerar imagem por aqui: voz, áudio ao vivo, embeddings, agentes que
 * exigem ferramentas próprias (computer use, robótica), vídeo e música.
 */
const NAO_SERVE = /embed|aqa|tts|audio|live|computer-use|robotics|veo|lyria|music/i;

/** Pelo nome: a API não informa a saída do modelo. "nano-banana" é o apelido do Gemini Image. */
function geraImagem(id: string): boolean {
  return /image|imagen|nano-banana/i.test(id);
}

function ehImagen(modelo: string): boolean {
  return /^(models\/)?imagen/i.test(modelo);
}

function cabecalhos(ctx: ContextoProvedor): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.chave };
}

function partesDeImagem(imagens: ImagemEntrada[]): Parte[] {
  return imagens.map((img) => ({ inlineData: { mimeType: img.mime, data: img.dados.toString('base64') } }));
}

/** Por que o Gemini parou sem entregar, em português. */
const MOTIVOS: Record<string, string> = {
  SAFETY: 'o filtro de segurança do Google bloqueou o conteúdo',
  IMAGE_SAFETY: 'o filtro de segurança do Google bloqueou a imagem',
  PROHIBITED_CONTENT: 'o Google considerou o conteúdo proibido',
  IMAGE_PROHIBITED_CONTENT: 'o Google considerou a imagem proibida',
  BLOCKLIST: 'o pedido tem termos bloqueados pelo Google',
  SPII: 'o pedido parece conter dados pessoais sensíveis',
  RECITATION: 'o resultado ficaria parecido demais com conteúdo protegido',
  IMAGE_RECITATION: 'a imagem ficaria parecida demais com conteúdo protegido',
  NO_IMAGE: 'o modelo não conseguiu gerar a imagem deste pedido',
  IMAGE_OTHER: 'o modelo não conseguiu gerar a imagem deste pedido',
  MAX_TOKENS: 'a resposta passou do tamanho máximo',
  MALFORMED_FUNCTION_CALL: 'o modelo tentou usar uma ferramenta em vez de responder',
};

function partesDaResposta(r: RespostaConteudo): { partes: Parte[]; motivo?: string } {
  if (r.promptFeedback?.blockReason) {
    throw new Error(`O Gemini bloqueou o pedido (${MOTIVOS[r.promptFeedback.blockReason] ?? r.promptFeedback.blockReason}). Reformule o texto.`);
  }
  const c = r.candidates?.[0];
  const fim = c?.finishReason && c.finishReason !== 'STOP' ? MOTIVOS[c.finishReason] ?? `motivo ${c.finishReason}` : undefined;
  // Partes de raciocínio ("thought") não são resposta.
  return { partes: (c?.content?.parts ?? []).filter((p) => !p.thought), motivo: fim };
}

function urlModelo(modelo: string, metodo = 'generateContent'): string {
  const id = modelo.replace(/^models\//, '');
  return `${BASE}/models/${encodeURIComponent(id)}:${metodo}`;
}

/** O Gemma (e outros abertos servidos pelo Google) não aceita instrução de sistema. */
function aceitaSistema(modelo: string): boolean {
  return !/gemma/i.test(modelo);
}

/** Junta a instrução de sistema ao texto do usuário, para quem não aceita systemInstruction. */
function semSistema(corpo: Record<string, unknown>): boolean {
  const sistema = corpo.systemInstruction as { parts?: Parte[] } | undefined;
  if (!sistema) return false;
  delete corpo.systemInstruction;
  const conteudo = (corpo.contents as Array<{ parts: Parte[] }>)[0]!;
  const texto = (sistema.parts ?? []).map((p) => p.text ?? '').join('\n');
  conteudo.parts = [{ text: `${texto}\n\n${conteudo.parts[0]?.text ?? ''}` }, ...conteudo.parts.slice(1)];
  return true;
}

/** Proporções que o Imagen aceita; as outras vão para a mais próxima (o recorte final acerta). */
function proporcaoImagen(proporcao: string): string {
  const [l, a] = proporcao.split(':').map(Number);
  const razao = l && a ? l / a : 1;
  const opcoes: Array<[string, number]> = [['1:1', 1], ['3:4', 0.75], ['4:3', 4 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9]];
  return opcoes.reduce((melhor, o) => (Math.abs(o[1] - razao) < Math.abs(melhor[1] - razao) ? o : melhor))[0];
}

async function gerarComImagen(ctx: ContextoProvedor, pedido: PedidoImagemIa): Promise<Buffer[]> {
  if (pedido.referencias.length) {
    throw new Error('O Imagen não usa imagens de referência. Para editar ou usar referência, escolha um modelo Gemini de imagem (ex.: gemini-2.5-flash-image).');
  }
  const corpo: Record<string, unknown> = {
    instances: [{ prompt: pedido.prompt }],
    parameters: { sampleCount: Math.min(4, pedido.quantidade), aspectRatio: proporcaoImagen(pedido.proporcao) },
  };
  const r = await enviarTolerante(corpo, (c) =>
    chamarJson<RespostaImagen>(ROTULO, urlModelo(pedido.modelo, 'predict'), {
      method: 'POST',
      headers: cabecalhos(ctx),
      body: JSON.stringify(c),
      timeoutMs: TIMEOUT_IMAGEM_MS,
      signal: pedido.signal,
    }),
  );
  const previsoes = r.predictions ?? [];
  const imagens = previsoes.filter((p) => p.bytesBase64Encoded).map((p) => Buffer.from(p.bytesBase64Encoded!, 'base64'));
  if (!imagens.length) {
    const motivo = previsoes.find((p) => p.raiFilteredReason)?.raiFilteredReason;
    throw new Error(motivo ? `O Imagen bloqueou o pedido: ${motivo.slice(0, 240)}` : 'O Imagen não devolveu imagem. Reformule o pedido.');
  }
  return imagens;
}

export const google: Adaptador = {
  async listarModelos(ctx, signal) {
    const modelos: ModeloIa[] = [];
    let token: string | undefined;
    for (let pagina = 0; pagina < 5; pagina++) {
      const url = `${BASE}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
      const r = await chamarJson<RespostaModelos>(ROTULO, url, { headers: cabecalhos(ctx), timeoutMs: TIMEOUT_LISTA_MS, signal });
      (r.models ?? []).forEach((m) => {
        const id = m.name.replace(/^models\//, '');
        const metodos = m.supportedGenerationMethods ?? [];
        const usavel = metodos.includes('generateContent') || (ehImagen(id) && metodos.includes('predict'));
        if (!usavel || NAO_SERVE.test(id)) return;
        modelos.push({ id, nome: m.displayName || id, geraImagem: geraImagem(id), descricao: m.description?.slice(0, 280), contexto: m.inputTokenLimit });
      });
      if (!r.nextPageToken) break;
      token = r.nextPageToken;
    }
    return modelos.sort((a, b) => a.id.localeCompare(b.id));
  },

  async gerarTexto(ctx, pedido) {
    const corpo: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: pedido.sistema }] },
      contents: [{ role: 'user', parts: [{ text: pedido.texto }, ...partesDeImagem(pedido.imagens)] }],
    };
    if (!aceitaSistema(pedido.modelo)) semSistema(corpo);
    const r = await enviarTolerante(
      corpo,
      (c) =>
        chamarJson<RespostaConteudo>(ROTULO, urlModelo(pedido.modelo), {
          method: 'POST',
          headers: cabecalhos(ctx),
          body: JSON.stringify(c),
          timeoutMs: TIMEOUT_TEXTO_MS,
          signal: pedido.signal,
        }),
      // "Developer instruction is not enabled": modelo sem instrução de sistema que o nome não denuncia.
      (c, erro) => /developer instruction|system_?instruction/i.test(erro.detalhe) && semSistema(c),
    );
    const { partes, motivo } = partesDaResposta(r);
    const texto = partes.map((p) => p.text ?? '').join('');
    if (!texto.trim()) {
      throw new Error(motivo ? `O Gemini não respondeu: ${motivo}.` : 'O Gemini devolveu uma resposta vazia. Tente de novo ou use outro modelo.');
    }
    return texto;
  },

  async gerarImagem(ctx, pedido) {
    if (ehImagen(pedido.modelo)) return gerarComImagen(ctx, pedido);
    return varias(pedido.quantidade, async () => {
      const corpo: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: pedido.prompt }, ...partesDeImagem(pedido.referencias)] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: pedido.proporcao },
        },
      };
      const r = await enviarTolerante(
        corpo,
        (c) =>
          chamarJson<RespostaConteudo>(ROTULO, urlModelo(pedido.modelo), {
            method: 'POST',
            headers: cabecalhos(ctx),
            body: JSON.stringify(c),
            timeoutMs: TIMEOUT_IMAGEM_MS,
            signal: pedido.signal,
          }),
        (c, erro) => {
          const config = c.generationConfig as { responseModalities?: string[]; imageConfig?: unknown };
          // Modelo que só devolve imagem recusa o par TEXT+IMAGE.
          if (/modalit/i.test(erro.detalhe) && config.responseModalities?.includes('TEXT')) {
            config.responseModalities = ['IMAGE'];
            return true;
          }
          // Modelos mais antigos não conhecem imageConfig; o prompt já diz o formato e o recorte final acerta.
          if (/image_?config|aspect_?ratio/i.test(erro.detalhe) && config.imageConfig) {
            delete config.imageConfig;
            return true;
          }
          return false;
        },
      );
      const { partes, motivo } = partesDaResposta(r);
      const imagens = partes.filter((p) => p.inlineData?.data).map((p) => Buffer.from(p.inlineData!.data!, 'base64'));
      if (!imagens.length) {
        const explicacao = partes.map((p) => p.text ?? '').join(' ').trim();
        if (motivo) throw new Error(`O Gemini não gerou a imagem: ${motivo}. Reformule o pedido ou troque a referência.`);
        throw new Error(
          explicacao
            ? `O Gemini respondeu sem imagem: "${explicacao.slice(0, 240)}"`
            : 'O Gemini não devolveu imagem. Confira se o modelo escolhido gera imagens (os que geram vêm marcados em "Escolher").',
        );
      }
      return imagens;
    });
  },
};
