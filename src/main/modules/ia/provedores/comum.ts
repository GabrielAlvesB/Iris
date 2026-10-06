import { net } from 'electron';
import { isFalha, request, type HttpOptions } from '../../../core/httpClient';
import type { ModeloIa, QualidadeImagem } from '../../../../shared/types/ia.types';

/**
 * Contrato comum dos provedores. Cada adaptador traduz o pedido do Iris para
 * a API do seu provedor; o resto do módulo não sabe qual está falando.
 */

export interface ImagemEntrada {
  dados: Buffer;
  mime: string;
  nome: string;
}

export interface ContextoProvedor {
  /** Vazia só no "compatível" sem chave (servidor local). */
  chave: string;
  baseUrl: string;
}

export interface PedidoTextoIa {
  modelo: string;
  sistema: string;
  texto: string;
  imagens: ImagemEntrada[];
  /**
   * Teto da resposta. Sem ele o OpenRouter reserva o máximo do modelo (65 mil
   * tokens) no saldo e recusa o pedido de quem tem pouco crédito — mesmo que
   * a resposta real fosse de 300 tokens.
   */
  maxTokens: number;
  signal?: AbortSignal;
}

export interface PedidoImagemIa {
  modelo: string;
  prompt: string;
  referencias: ImagemEntrada[];
  /** Tamanho final desejado; o adaptador pede o mais próximo que o modelo aceita. */
  largura: number;
  altura: number;
  /** "16:9", "9:16"… */
  proporcao: string;
  quantidade: number;
  qualidade?: QualidadeImagem;
  signal?: AbortSignal;
}

export interface Adaptador {
  listarModelos(ctx: ContextoProvedor, signal?: AbortSignal): Promise<ModeloIa[]>;
  gerarTexto(ctx: ContextoProvedor, pedido: PedidoTextoIa): Promise<string>;
  /** Ausente em quem não gera imagem (Claude). */
  gerarImagem?(ctx: ContextoProvedor, pedido: PedidoImagemIa): Promise<Buffer[]>;
}

export const TIMEOUT_LISTA_MS = 20_000;
export const TIMEOUT_TEXTO_MS = 180_000;
export const TIMEOUT_IMAGEM_MS = 240_000;

/**
 * Falha HTTP do provedor. Guarda o status e o texto original para os
 * adaptadores decidirem se dá para ajustar o pedido e tentar de novo; a
 * `message` já vem em português para a tela.
 */
/**
 * O endereço não respondeu (servidor desligado, porta errada, sem internet).
 * Separado dos outros erros para os provedores locais trocarem a mensagem por
 * "abra o Ollama", que é quase sempre a causa.
 */
export class ErroSemConexao extends Error {}

export class ErroProvedor extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    /** O texto que o provedor mandou, sem tradução. */
    readonly detalhe: string,
    /** O parâmetro que o provedor apontou como culpado, quando aponta. */
    readonly parametro: string | undefined,
  ) {
    super(mensagem);
  }
}

/** A mensagem de erro que o provedor mandou, nos formatos que eles usam. */
function lerErroDoProvedor(corpo: string): { mensagem: string; parametro?: string } {
  type CorpoErro = {
    error?: string | { message?: string; param?: string | null; metadata?: { raw?: unknown } };
    message?: string;
  };
  try {
    const json = JSON.parse(corpo) as CorpoErro | CorpoErro[];
    // O Google às vezes devolve o erro dentro de uma lista.
    const obj: CorpoErro = (Array.isArray(json) ? json[0] : json) ?? {};
    if (typeof obj.error === 'string') return { mensagem: obj.error };
    const erro = obj.error;
    // O OpenRouter repassa o erro do provedor de verdade em metadata.raw.
    const raw = erro?.metadata?.raw;
    const bruto = raw ? ` (${(typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 400)})` : '';
    return { mensagem: `${erro?.message ?? obj.message ?? ''}${bruto}`, parametro: erro?.param ?? undefined };
  } catch {
    return { mensagem: corpo.slice(0, 300) };
  }
}

/**
 * Traduz o erro em uma frase que diga o que fazer. Os textos dos provedores
 * são checados antes do status porque o mesmo status cobre causas diferentes
 * (o Google responde 400 para chave inválida e 429 para "sem cota gratuita").
 */
function explicar(rotulo: string, status: number, detalhe: string): string {
  if (/API[_ ]KEY[_ ]INVALID|API key not valid|invalid[_ ]api[_ ]key|Incorrect API key/i.test(detalhe)) {
    return `${rotulo} recusou a chave: ela não é válida. Confira a chave em Ajustes › Inteligência artificial.`;
  }
  if (status === 429 && /free_tier|limit: 0\b/i.test(detalhe)) {
    return `${rotulo}: este modelo não tem uso gratuito na sua conta (o limite do plano grátis para ele é zero). Ative o faturamento da chave no Google AI Studio ou escolha outro modelo — os de imagem mais novos costumam ser só pagos.`;
  }
  if (/location is not supported|not available in your country|unsupported_country/i.test(detalhe)) {
    return `${rotulo} não libera este modelo na sua região. Escolha outro modelo ou outro provedor.`;
  }
  if (/only supported in v1\/responses|not a chat model|not supported in the v1\/chat\/completions/i.test(detalhe)) {
    return `${rotulo}: este modelo não conversa pelo chat (é de uso específico). Escolha outro modelo de texto.`;
  }
  if (status === 401 || status === 403) {
    return `${rotulo} recusou a chave (HTTP ${status}). Confira a chave em Ajustes › Inteligência artificial, e se ela tem acesso a este modelo.`;
  }
  if (status === 402) {
    return `${rotulo}: saldo insuficiente para este pedido. Coloque crédito na conta do provedor ou use um modelo mais barato.`;
  }
  if (status === 429) return `${rotulo}: limite de uso atingido ou sem crédito. Espere um pouco ou confira o saldo.`;
  if (status === 404) return `${rotulo}: modelo não encontrado (HTTP 404). Ele pode ter sido desativado ou renomeado — escolha de novo em Ajustes › Inteligência artificial.`;
  if (status === 400 || status === 422) return `${rotulo} recusou o pedido com este modelo (HTTP ${status}). Tente outro modelo.`;
  if (status >= 500) return `${rotulo} está instável agora (HTTP ${status}). Tente de novo em instantes.`;
  return `${rotulo} respondeu HTTP ${status}.`;
}

/** Sobrecarga momentânea do provedor: vale uma segunda tentativa automática. */
const INSTAVEL = new Set([500, 502, 503, 504, 529]);

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/**
 * Chama e devolve o JSON; qualquer falha vira um Error com mensagem em
 * português que a tela mostra do jeito que veio. A falha HTTP é um
 * `ErroProvedor`, com o texto original junto (depois de " Detalhe: ").
 */
export async function chamarJson<T>(rotulo: string, url: string, opcoes: HttpOptions): Promise<T> {
  let resposta = await request(url, opcoes);
  // Sobrecarga (Gemini e Claude devolvem 503/529 em horário de pico) passa sozinha na maioria das vezes.
  if (!isFalha(resposta) && INSTAVEL.has(resposta.status) && !opcoes.signal?.aborted) {
    await esperar(2_000, opcoes.signal);
    if (!opcoes.signal?.aborted) resposta = await request(url, opcoes);
  }
  if (isFalha(resposta)) {
    if (resposta.motivo === 'abortado') throw new Error('Cancelado.');
    if (resposta.motivo === 'timeout') throw new Error(`${rotulo} demorou demais para responder. Tente de novo ou use outro modelo.`);
    throw new ErroSemConexao(`Sem conexão com ${rotulo} (${resposta.mensagem}).`);
  }
  if (!resposta.ok) {
    const { mensagem, parametro } = lerErroDoProvedor(resposta.body);
    const sufixo = mensagem ? ` Detalhe: ${mensagem}` : '';
    throw new ErroProvedor(`${explicar(rotulo, resposta.status, mensagem)}${sufixo}`, resposta.status, mensagem, parametro);
  }
  try {
    return JSON.parse(resposta.body) as T;
  } catch {
    throw new Error(`${rotulo} mandou uma resposta que não é JSON. O endereço está certo?`);
  }
}

// ---------- Pedido tolerante ----------

/**
 * O parâmetro que o provedor disse não aceitar, pelo campo `param` (OpenAI)
 * ou pelo texto: "Unsupported parameter: 'x'", "Unknown name \"x\"",
 * "x: Extra inputs are not permitted".
 */
export function parametroRecusado(erro: ErroProvedor): string | undefined {
  if (erro.status !== 400 && erro.status !== 422) return undefined;
  const d = erro.detalhe;
  const m =
    /(?:Unsupported|Unknown|Unrecognized|Invalid) (?:parameter|value|name|argument)s?[:\s]+['"`]?([\w.[\]]+)/i.exec(d) ??
    /['"`]?([\w.]+)['"`]?:? (?:Extra inputs are not permitted|is not supported|isn't supported|not supported with this model)/i.exec(d);
  const nome = erro.parametro || m?.[1];
  // "generation_config.image_config" → a última parte, para achar no corpo.
  return nome?.split('.').pop()?.replace(/\[.*$/, '');
}

/** Maior valor que o provedor disse aceitar para o teto de saída ("at most 8192", "> 4096", "can only afford 5051"). */
export function tetoAceito(erro: ErroProvedor): number | undefined {
  const m =
    /can only afford (\d+)/i.exec(erro.detalhe) ??
    /at most (\d+)/i.exec(erro.detalhe) ??
    /max_(?:completion_)?tokens:? \d+ > (\d+)/i.exec(erro.detalhe) ??
    /maximum (?:allowed |value )?(?:number of |for )?(?:output |completion )?tokens?\D{0,40}?(\d{3,})/i.exec(erro.detalhe);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const camelParaSnake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const snakeParaCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** O que é o pedido em si: um erro que aponte um destes não se resolve tirando o campo. */
const ESSENCIAIS = new Set(['model', 'messages', 'contents', 'prompt', 'input', 'instances', 'parts', 'system', 'instructions', 'systemInstruction']);

/** Tira do objeto (em qualquer nível) a chave com esse nome, em camelCase ou snake_case. */
function removerChave(obj: Record<string, unknown>, nome: string): boolean {
  if (ESSENCIAIS.has(nome) || ESSENCIAIS.has(snakeParaCamel(nome))) return false;
  const alvos = new Set([nome, camelParaSnake(nome), snakeParaCamel(nome)]);
  for (const k of Object.keys(obj)) {
    if (alvos.has(k)) {
      delete obj[k];
      return true;
    }
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && removerChave(v as Record<string, unknown>, nome)) return true;
  }
  return false;
}

/**
 * Cada modelo novo aceita um conjunto um pouco diferente de parâmetros (um
 * recusa `max_tokens`, outro `imageConfig`, outro `response_format`). Manter
 * uma tabela por modelo envelhece a cada lançamento; em vez disso o pedido é
 * enviado e, se o provedor recusar apontando o parâmetro, ele é ajustado e o
 * pedido vai de novo — até 3 vezes, e só quando algo de fato mudou.
 *
 * `ajustar` resolve os casos específicos do adaptador (trocar um parâmetro
 * pelo equivalente, mudar o formato); devolve true se mudou o corpo.
 */
export async function enviarTolerante<T>(
  corpo: Record<string, unknown>,
  enviar: (corpo: Record<string, unknown>) => Promise<T>,
  ajustar?: (corpo: Record<string, unknown>, erro: ErroProvedor) => boolean,
): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await enviar(corpo);
    } catch (erro) {
      if (!(erro instanceof ErroProvedor) || tentativa >= 3) throw erro;
      if (ajustar?.(corpo, erro)) continue;
      const parametro = parametroRecusado(erro);
      if (parametro && removerChave(corpo, parametro)) continue;
      throw erro;
    }
  }
}

/** Ajuste comum dos tetos de saída: baixa para o que o provedor disse aceitar. */
export function ajustarTeto(corpo: Record<string, unknown>, erro: ErroProvedor, campos: string[], minimo = 256): boolean {
  const campo = campos.find((c) => typeof corpo[c] === 'number');
  if (!campo) return false;
  const teto = tetoAceito(erro);
  const atual = corpo[campo] as number;
  // "can only afford" vale para o 402; os outros para 400.
  if (!teto || teto >= atual || teto < minimo) return false;
  if (erro.status !== 402 && erro.status !== 400 && erro.status !== 422) return false;
  corpo[campo] = erro.status === 402 ? Math.floor(teto * 0.95) : teto;
  return true;
}

export function paraDataUrl(img: ImagemEntrada): string {
  return `data:${img.mime};base64,${img.dados.toString('base64')}`;
}

export function deDataUrl(url: string): Buffer | null {
  const m = /^data:[^;,]+;base64,(.+)$/s.exec(url);
  return m?.[1] ? Buffer.from(m[1], 'base64') : null;
}

/** Baixa uma imagem que o provedor devolveu como URL (alguns não mandam base64). */
export async function baixarImagem(url: string, signal?: AbortSignal): Promise<Buffer> {
  const embutida = deDataUrl(url);
  if (embutida) return embutida;
  if (!/^https:\/\//i.test(url)) throw new Error('O provedor devolveu um endereço de imagem inválido.');
  const resposta = await net.fetch(url, { signal });
  if (!resposta.ok) throw new Error(`Não deu para baixar a imagem gerada (HTTP ${resposta.status}).`);
  return Buffer.from(await resposta.arrayBuffer());
}

/** Roda n pedidos de uma imagem em paralelo (para quem só gera uma por chamada). */
export async function varias(quantidade: number, uma: () => Promise<Buffer[]>): Promise<Buffer[]> {
  const lotes = await Promise.all(Array.from({ length: Math.max(1, quantidade) }, () => uma()));
  return lotes.flat();
}
