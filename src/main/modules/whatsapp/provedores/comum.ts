import { isFalha, request, setHostsInseguros, type HttpOptions } from '../../../core/httpClient';
import type { EventoWa } from '../../../../shared/types/whatsapp.eventos';
import type { ConferenciaNumero, ModeloMetaWa, ResultadoTeste, TemplateMeta, WhatsappConfig } from '../../../../shared/types/whatsapp.types';

/**
 * Contrato comum dos caminhos de envio. Cada adaptador traduz o pedido do
 * Iris para a API do seu provedor; o resto do módulo não sabe qual está
 * falando (o mesmo desenho dos provedores de IA).
 */

export interface ContextoWa {
  config: WhatsappConfig;
  /** Token da Meta ou apikey da Evolution/WAHA; vazio no n8n e no link. */
  chave: string;
  signal?: AbortSignal;
}

export interface Enviado {
  idExterno?: string;
}

export interface AdaptadorWa {
  /** O que falta configurar, em português; undefined = pronto. */
  falta(ctx: ContextoWa): string | undefined;
  testar(ctx: ContextoWa): Promise<ResultadoTeste>;
  enviarTexto(ctx: ContextoWa, numero: string, texto: string): Promise<Enviado>;
  /** Só a API oficial: template aprovado, para fora da janela de 24 h. */
  enviarTemplate?(ctx: ContextoWa, numero: string, template: ModeloMetaWa, parametros: string[]): Promise<Enviado>;
  conferirNumero?(ctx: ContextoWa, numero: string): Promise<ConferenciaNumero>;
  listarTemplates?(ctx: ContextoWa): Promise<TemplateMeta[]>;
  /** Liga o webhook do provedor ao endereço do Iris (Evolution e WAHA deixam fazer pela API). */
  configurarWebhook?(ctx: ContextoWa, url: string): Promise<void>;
  /** As últimas mensagens de uma conversa, para completar o que chegou com o Iris fechado. */
  buscarConversa?(ctx: ContextoWa, numero: string, limite: number): Promise<EventoWa[]>;
}

export const TIMEOUT_MS = 20_000;

/** A falha já em português; `status` 0 = não alcançou. */
export class ErroWa extends Error {
  constructor(
    mensagem: string,
    readonly status = 0,
    readonly detalhe = '',
  ) {
    super(mensagem);
  }
}

function lerJson(corpo: string): unknown {
  try {
    return JSON.parse(corpo) as unknown;
  } catch {
    return undefined;
  }
}

/** O texto de erro que cada provedor manda, onde ele mandar. */
function mensagemDoProvedor(corpo: unknown): string {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const erro = c.error as Record<string, unknown> | string | undefined;
  if (typeof erro === 'string') return erro;
  if (erro && typeof erro.message === 'string') {
    const detalhe = (erro.error_data as Record<string, unknown> | undefined)?.details;
    return typeof detalhe === 'string' && detalhe !== erro.message ? `${erro.message} (${detalhe})` : erro.message;
  }
  const resposta = c.response as Record<string, unknown> | undefined;
  const mensagem = resposta?.message ?? c.message;
  if (Array.isArray(mensagem)) return mensagem.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' ');
  if (typeof mensagem === 'string') return mensagem;
  return '';
}

/** Política de certificado só para os hosts do WhatsApp que o usuário marcou. */
export function aplicarTls(config: WhatsappConfig): void {
  const hosts = config.permitirTlsInseguro
    ? [config.evolution.baseUrl, config.waha.baseUrl].filter(Boolean).map((u) => {
        try {
          return new URL(u).hostname;
        } catch {
          return '';
        }
      })
    : [];
  setHostsInseguros(hosts.filter(Boolean), 'whatsapp');
}

export interface PedidoWa extends HttpOptions {
  /** Corpo em JSON (vira `body` com o Content-Type certo). */
  json?: unknown;
  /** "a Evolution", "a API da Meta": entra nas mensagens de erro. */
  quem: string;
  /** Mensagem para 404 (instância/sessão/endpoint). */
  naoAchou?: string;
  /** Mensagem para 401/403. */
  recusou?: string;
}

/**
 * Uma chamada a um provedor. Lança `ErroWa` em português — a tela mostra a
 * mensagem como está e o histórico da mensagem guarda o motivo.
 */
export async function chamar(url: string, p: PedidoWa): Promise<unknown> {
  const { json, quem, naoAchou, recusou, ...opcoes } = p;
  const resposta = await request(url, {
    timeoutMs: TIMEOUT_MS,
    ...opcoes,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) } } : {}),
  });
  if (isFalha(resposta)) {
    if (resposta.motivo === 'timeout') throw new ErroWa(`${maiuscula(quem)} demorou demais para responder.`);
    if (resposta.motivo === 'abortado') throw new ErroWa('Envio interrompido.');
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      // Fica a URL inteira.
    }
    throw new ErroWa(`Não foi possível alcançar ${quem} em ${host}: ${resposta.mensagem}`);
  }
  const corpo = lerJson(resposta.body);
  if (resposta.ok) return corpo;
  const doProvedor = mensagemDoProvedor(corpo) || resposta.body.slice(0, 300);
  const sufixo = doProvedor ? ` Resposta: ${doProvedor}` : '';
  if (resposta.status === 401 || resposta.status === 403) throw new ErroWa(`${recusou ?? `${maiuscula(quem)} recusou a credencial.`}${sufixo}`, resposta.status, doProvedor);
  if (resposta.status === 404) throw new ErroWa(`${naoAchou ?? `${maiuscula(quem)} não achou esse endereço.`}${sufixo}`, resposta.status, doProvedor);
  if (resposta.status === 429) throw new ErroWa(`${maiuscula(quem)} pediu para esperar: envios demais em pouco tempo.${sufixo}`, resposta.status, doProvedor);
  if (resposta.status >= 500) throw new ErroWa(`${maiuscula(quem)} teve um erro interno (HTTP ${resposta.status}).${sufixo}`, resposta.status, doProvedor);
  throw new ErroWa(`${maiuscula(quem)} recusou o pedido (HTTP ${resposta.status}).${sufixo}`, resposta.status, doProvedor);
}

function maiuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function campo(v: unknown, ...caminho: string[]): unknown {
  return caminho.reduce<unknown>((atual, k) => (atual && typeof atual === 'object' ? (atual as Record<string, unknown>)[k] : undefined), v);
}

export function textoDe(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

export function ok(mensagem: string, detalhes: string[] = []): ResultadoTeste {
  return { ok: true, mensagem, detalhes };
}

export function falhou(mensagem: string, detalhes: string[] = []): ResultadoTeste {
  return { ok: false, mensagem, detalhes };
}

/** Testes nunca lançam: o erro vira o resultado. */
export async function testarCom(fazer: () => Promise<ResultadoTeste>): Promise<ResultadoTeste> {
  try {
    return await fazer();
  } catch (erro) {
    return falhou(erro instanceof Error ? erro.message : String(erro));
  }
}
