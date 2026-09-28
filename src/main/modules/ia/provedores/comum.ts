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

/** A mensagem de erro que o provedor mandou, nos formatos que eles usam. */
function mensagemDoProvedor(corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { error?: { message?: string } | string; message?: string };
    if (typeof json.error === 'string') return json.error;
    return json.error?.message ?? json.message ?? '';
  } catch {
    return corpo.slice(0, 300);
  }
}

/**
 * Chama e devolve o JSON; qualquer falha vira um Error com mensagem em
 * português que a tela mostra do jeito que veio.
 */
export async function chamarJson<T>(rotulo: string, url: string, opcoes: HttpOptions): Promise<T> {
  const resposta = await request(url, opcoes);
  if (isFalha(resposta)) {
    if (resposta.motivo === 'abortado') throw new Error('Cancelado.');
    if (resposta.motivo === 'timeout') throw new Error(`${rotulo} demorou demais para responder. Tente de novo ou use outro modelo.`);
    throw new Error(`Sem conexão com ${rotulo} (${resposta.mensagem}).`);
  }
  if (!resposta.ok) {
    const detalhe = mensagemDoProvedor(resposta.body);
    const sufixo = detalhe ? ` Detalhe: ${detalhe}` : '';
    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error(`${rotulo} recusou a chave (HTTP ${resposta.status}). Confira a chave em Ajustes › Inteligência artificial.${sufixo}`);
    }
    if (resposta.status === 402) {
      throw new Error(`${rotulo}: saldo insuficiente para este pedido. Coloque crédito na conta do provedor ou use um modelo mais barato.${sufixo}`);
    }
    if (resposta.status === 429) throw new Error(`${rotulo}: limite de uso atingido ou sem crédito. Espere um pouco ou confira o saldo.${sufixo}`);
    if (resposta.status === 404) throw new Error(`${rotulo}: modelo ou endereço não encontrado (HTTP 404).${sufixo}`);
    throw new Error(`${rotulo} respondeu HTTP ${resposta.status}.${sufixo}`);
  }
  try {
    return JSON.parse(resposta.body) as T;
  } catch {
    throw new Error(`${rotulo} mandou uma resposta que não é JSON. O endereço está certo?`);
  }
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
