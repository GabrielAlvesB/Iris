import type { ModeloIa } from '../../../../shared/types/ia.types';
import {
  ErroProvedor,
  TIMEOUT_IMAGEM_MS,
  TIMEOUT_LISTA_MS,
  TIMEOUT_TEXTO_MS,
  ajustarTeto,
  baixarImagem,
  chamarJson,
  enviarTolerante,
  paraDataUrl,
  parametroRecusado,
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
  choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> | null; refusal?: string | null }; finish_reason?: string }>;
}

interface RespostaResponses {
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>;
  incomplete_details?: { reason?: string } | null;
}

interface RespostaImagens {
  data?: Array<{ b64_json?: string; url?: string }>;
}

/**
 * Modelos da listagem que não servem para conversa nem imagem por aqui:
 * áudio, embeddings, moderação, vídeo (sora), os que exigem ferramenta
 * própria (computer use) e os de completion antigo (instruct, davinci).
 */
const NAO_SERVE = /embed|whisper|tts|audio|realtime|moderation|transcribe|davinci|babbage|search|sora|computer-use|instruct/i;

function geraImagem(id: string): boolean {
  return /gpt-image|dall-e|image/i.test(id);
}

/** Modelos que raciocinam antes de responder: o raciocínio gasta o mesmo teto da resposta. */
function raciocina(modelo: string): boolean {
  return /^(o\d|gpt-5)/i.test(modelo.replace(/^.*\//, ''));
}

/** Resposta de "este modelo só funciona em /v1/responses" (os -pro, codex, deep-research…). */
function soResponses(erro: unknown): boolean {
  return erro instanceof ErroProvedor && /v1\/responses|not a chat model|not supported in the v1\/chat\/completions/i.test(erro.detalhe);
}

function cabecalhos(ctx: ContextoProvedor, json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (ctx.chave) h.Authorization = `Bearer ${ctx.chave}`;
  return h;
}

/**
 * Tamanhos aceitos: gpt-image (1024², 1536×1024, 1024×1536), dall-e-3
 * (1024², 1792×1024, 1024×1792) e dall-e-2 (só quadrado). O corte exato para
 * o formato é feito depois.
 */
function tamanhoPara(modelo: string, largura: number, altura: number): string {
  if (/dall-e-2/i.test(modelo)) return '1024x1024';
  const razao = largura / altura;
  const dalle3 = /dall-e-3/i.test(modelo);
  if (razao > 1.15) return dalle3 ? '1792x1024' : '1536x1024';
  if (razao < 0.87) return dalle3 ? '1024x1792' : '1024x1536';
  return '1024x1024';
}

const QUALIDADE = { baixa: 'low', media: 'medium', alta: 'high' } as const;

/**
 * `campoLimite`: a OpenAI oficial só aceita `max_completion_tokens` nos modelos
 * novos; os serviços compatíveis (Groq, Ollama…) entendem `max_tokens`. Se o
 * modelo recusar o campo, o pedido troca pelo outro sozinho.
 */
export function criarOpenAi(rotulo: string, basePadrao: string, campoLimite: 'max_completion_tokens' | 'max_tokens' = 'max_tokens'): Adaptador {
  const base = (ctx: ContextoProvedor): string => (ctx.baseUrl || basePadrao).replace(/\/+$/, '');
  const oficial = campoLimite === 'max_completion_tokens';

  async function lerImagens(resposta: RespostaImagens, signal?: AbortSignal): Promise<Buffer[]> {
    const itens = resposta.data ?? [];
    const imagens = await Promise.all(
      itens.map((d) => (d.b64_json ? Promise.resolve(Buffer.from(d.b64_json, 'base64')) : d.url ? baixarImagem(d.url, signal) : Promise.resolve(null))),
    );
    const validas = imagens.filter((b): b is Buffer => b !== null);
    if (!validas.length) throw new Error(`${rotulo} não devolveu nenhuma imagem.`);
    return validas;
  }

  /** Troca o nome do teto de saída quando o modelo recusa um deles. */
  function trocarCampoLimite(corpo: Record<string, unknown>, erro: ErroProvedor): boolean {
    const recusado = parametroRecusado(erro);
    const outro = recusado === 'max_tokens' ? 'max_completion_tokens' : recusado === 'max_completion_tokens' ? 'max_tokens' : null;
    if (!outro || !(recusado! in corpo) || outro in corpo) return false;
    corpo[outro] = corpo[recusado!];
    delete corpo[recusado!];
    return true;
  }

  async function viaChat(ctx: ContextoProvedor, pedido: PedidoTextoIa): Promise<string> {
    const conteudo = pedido.imagens.length
      ? [{ type: 'text', text: pedido.texto }, ...pedido.imagens.map((img) => ({ type: 'image_url', image_url: { url: paraDataUrl(img) } }))]
      : pedido.texto;
    const corpo: Record<string, unknown> = {
      model: pedido.modelo,
      messages: [
        { role: 'system', content: pedido.sistema },
        { role: 'user', content: conteudo },
      ],
      [campoLimite]: pedido.maxTokens,
    };
    // Raciocínio curto: sem isso o modelo pode gastar o teto inteiro pensando e devolver vazio.
    if (oficial && raciocina(pedido.modelo)) corpo.reasoning_effort = 'low';
    const r = await enviarTolerante(
      corpo,
      (c) =>
        chamarJson<RespostaChat>(rotulo, `${base(ctx)}/chat/completions`, {
          method: 'POST',
          headers: cabecalhos(ctx),
          body: JSON.stringify(c),
          timeoutMs: TIMEOUT_TEXTO_MS,
          signal: pedido.signal,
        }),
      (c, erro) => trocarCampoLimite(c, erro) || ajustarTeto(c, erro, ['max_tokens', 'max_completion_tokens']),
    );
    const escolha = r.choices?.[0];
    const c = escolha?.message?.content;
    const texto = typeof c === 'string' ? c : (c ?? []).map((p) => p.text ?? '').join('');
    if (!texto.trim()) {
      if (escolha?.message?.refusal) throw new Error(`${rotulo} recusou o pedido: ${escolha.message.refusal.slice(0, 240)}`);
      if (escolha?.finish_reason === 'length') throw new Error(`${rotulo}: o modelo gastou o limite de resposta raciocinando e não chegou a escrever. Tente de novo ou use um modelo mais leve.`);
      throw new Error(`${rotulo} devolveu uma resposta vazia. Tente de novo ou use outro modelo.`);
    }
    return texto;
  }

  /** A API Responses, para os modelos que não atendem pelo chat. */
  async function viaResponses(ctx: ContextoProvedor, pedido: PedidoTextoIa): Promise<string> {
    const corpo: Record<string, unknown> = {
      model: pedido.modelo,
      instructions: pedido.sistema,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: pedido.texto }, ...pedido.imagens.map((img) => ({ type: 'input_image', image_url: paraDataUrl(img) }))],
        },
      ],
      max_output_tokens: pedido.maxTokens,
    };
    if (raciocina(pedido.modelo)) corpo.reasoning = { effort: 'low' };
    const r = await enviarTolerante(
      corpo,
      (c) =>
        chamarJson<RespostaResponses>(rotulo, `${base(ctx)}/responses`, {
          method: 'POST',
          headers: cabecalhos(ctx),
          body: JSON.stringify(c),
          // Os modelos "pro" levam minutos.
          timeoutMs: TIMEOUT_TEXTO_MS * 2,
          signal: pedido.signal,
        }),
      (c, erro) => ajustarTeto(c, erro, ['max_output_tokens']),
    );
    const blocos = (r.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    const texto = blocos.map((b) => (b.type === 'output_text' ? b.text ?? '' : '')).join('');
    if (!texto.trim()) {
      const recusa = blocos.find((b) => b.refusal)?.refusal;
      if (recusa) throw new Error(`${rotulo} recusou o pedido: ${recusa.slice(0, 240)}`);
      if (r.incomplete_details?.reason === 'max_output_tokens') throw new Error(`${rotulo}: o modelo gastou o limite de resposta raciocinando e não chegou a escrever. Use um modelo mais leve.`);
      throw new Error(`${rotulo} devolveu uma resposta vazia. Tente de novo ou use outro modelo.`);
    }
    return texto;
  }

  /** Campos do pedido de imagem que valem para o modelo, conforme a família. */
  function corpoDeImagem(pedido: PedidoImagemIa, n: number): Record<string, unknown> {
    const dalle = /dall-e/i.test(pedido.modelo);
    const corpo: Record<string, unknown> = { model: pedido.modelo, prompt: pedido.prompt, size: tamanhoPara(pedido.modelo, pedido.largura, pedido.altura), n };
    // O gpt-image sempre devolve base64 e recusa response_format; o DALL·E devolve URL se não pedir.
    if (dalle) corpo.response_format = 'b64_json';
    else if (pedido.qualidade) corpo.quality = QUALIDADE[pedido.qualidade];
    return corpo;
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
        .filter((m) => m.geraImagem || !NAO_SERVE.test(m.id))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async gerarTexto(ctx, pedido) {
      try {
        return await viaChat(ctx, pedido);
      } catch (erro) {
        if (soResponses(erro)) return viaResponses(ctx, pedido);
        throw erro;
      }
    },

    async gerarImagem(ctx, pedido) {
      // dall-e-3 só gera uma por chamada.
      const porChamada = /dall-e-3/i.test(pedido.modelo) ? 1 : pedido.quantidade;

      if (!pedido.referencias.length) {
        const uma = (n: number): Promise<Buffer[]> =>
          enviarTolerante(corpoDeImagem(pedido, n), async (c) => {
            const r = await chamarJson<RespostaImagens>(rotulo, `${base(ctx)}/images/generations`, {
              method: 'POST',
              headers: cabecalhos(ctx),
              body: JSON.stringify(c),
              timeoutMs: TIMEOUT_IMAGEM_MS,
              signal: pedido.signal,
            });
            return lerImagens(r, pedido.signal);
          });
        return porChamada === pedido.quantidade ? uma(pedido.quantidade) : varias(pedido.quantidade, () => uma(1));
      }

      if (/dall-e-3/i.test(pedido.modelo)) throw new Error('O dall-e-3 não usa imagens de referência. Use o gpt-image para editar ou partir de uma imagem.');
      // Com referências: /images/edits é multipart, com um campo image[] por arquivo.
      return enviarTolerante(corpoDeImagem(pedido, pedido.quantidade), async (c) => {
        const form = new FormData();
        Object.entries(c).forEach(([k, v]) => form.append(k, String(v)));
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
      });
    },
  };
}
