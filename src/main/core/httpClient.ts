import { net, session, type Session } from 'electron';

/**
 * Todo HTTP do Iris sai daqui, no processo principal.
 *
 * A CSP do renderer é `default-src 'self'` e continua assim: o renderer nunca
 * faz requisição. Usar net.fetch (em vez de node:https ou uma lib) ainda herda
 * o proxy do sistema, o que importa para um n8n atrás de proxy corporativo.
 */

/** Sem prefixo "persist:" → sessão em memória, descartada ao sair. */
const PARTICAO_INSEGURA = 'iris-tls-inseguro';

let sessaoInsegura: Session | null = null;
const hostsInseguros = new Set<string>();

/** Atualizado pelos serviços ao carregar as configurações. */
export function setHostsInseguros(hostnames: string[]): void {
  hostsInseguros.clear();
  hostnames.forEach((host) => hostsInseguros.add(host.toLowerCase()));
}

/**
 * net.fetch não aceita rejectUnauthorized por requisição — a política de
 * certificado é por Session. Uma sessão isolada com allow-list de hosts
 * concede a confiança só onde o usuário marcou, e nunca na sessão do renderer.
 */
function getSessaoInsegura(): Session {
  if (!sessaoInsegura) {
    sessaoInsegura = session.fromPartition(PARTICAO_INSEGURA);
    sessaoInsegura.setCertificateVerifyProc((request, callback) => {
      // 0 = aceitar apesar do erro de certificado; -3 = verificação padrão.
      callback(hostsInseguros.has(request.hostname.toLowerCase()) ? 0 : -3);
    });
  }
  return sessaoInsegura;
}

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Só tem efeito se o host estiver em setHostsInseguros(). */
  permitirTlsInseguro?: boolean;
  /** Sinal do agendador, para abortar tudo no stop/quit. */
  signal?: AbortSignal;
  /** true descarta o corpo — usado no health check, que só quer o status. */
  descartarCorpo?: boolean;
}

export interface HttpSucesso {
  ok: boolean;
  status: number;
  latenciaMs: number;
  body: string;
}

export interface HttpFalha {
  ok: false;
  status: 0;
  latenciaMs: number;
  motivo: 'timeout' | 'abortado' | 'rede';
  mensagem: string;
}

export type HttpResposta = HttpSucesso | HttpFalha;

export function isFalha(resposta: HttpResposta): resposta is HttpFalha {
  return resposta.status === 0;
}

/**
 * Nunca lança: a falha é um valor de primeira classe, para o health check
 * distinguir "fora do ar" de "demorou demais" e gravar isso no histórico.
 */
export async function request(url: string, options: HttpOptions = {}): Promise<HttpResposta> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const sinais: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (options.signal) sinais.push(options.signal);
  const signal = AbortSignal.any(sinais);

  const fetchFn = options.permitirTlsInseguro
    ? getSessaoInsegura().fetch.bind(getSessaoInsegura())
    : net.fetch;

  const inicio = Date.now();

  try {
    const resposta = await fetchFn(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal,
    });
    const latenciaMs = Date.now() - inicio;

    if (options.descartarCorpo) {
      // Sem cancelar, o socket fica pendurado até o coletor de lixo passar.
      await resposta.body?.cancel();
      return { ok: resposta.ok, status: resposta.status, latenciaMs, body: '' };
    }

    return { ok: resposta.ok, status: resposta.status, latenciaMs, body: await resposta.text() };
  } catch (error) {
    const latenciaMs = Date.now() - inicio;
    const nome = error instanceof Error ? error.name : '';
    const motivo = nome === 'TimeoutError' ? 'timeout' : nome === 'AbortError' ? 'abortado' : 'rede';

    return {
      ok: false,
      status: 0,
      latenciaMs,
      motivo,
      mensagem: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Variante que lança — usada pelo n8n, que fica atrás de toResult. */
export async function requestJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const resposta = await request(url, options);

  if (isFalha(resposta)) {
    throw new Error(`Falha de rede ao chamar ${url}: ${resposta.mensagem}`);
  }
  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error('Credencial recusada (HTTP ' + resposta.status + '). Confira a API key em Ajustes.');
  }
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao chamar ${url}.`);
  }

  try {
    return JSON.parse(resposta.body) as T;
  } catch {
    throw new Error(`A resposta de ${url} não é JSON válido. A URL base aponta mesmo para o n8n?`);
  }
}
