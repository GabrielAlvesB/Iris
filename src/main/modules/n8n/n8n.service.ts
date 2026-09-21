import { shell } from 'electron';
import { readStore, writeStore } from '../../storage/jsonStore';
import { getSecret, hasSecret, setSecret } from '../../storage/secretStore';
import { isFalha, request, requestJson, setHostsInseguros } from '../../core/httpClient';
import { broadcast } from '../../core/broadcast';
import type {
  DefinirVinculoInput,
  DispararWorkflowInput,
  DispararWorkflowResult,
  N8nConfig,
  N8nExecucao,
  N8nExecucaoStatus,
  N8nFile,
  N8nSnapshot,
  N8nWorkflow,
  SalvarN8nConfigInput,
} from '../../../shared/types/n8n.types';

const FILE_NAME = 'n8n.json';
const SCHEMA_VERSION = 1;
const SECRET_KEY = 'n8n.apiKey';
const MAX_EXECUCOES = 40;
/** O n8n leva alguns segundos para responder quando tem muitos workflows. */
const TIMEOUT_MS = 12_000;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): N8nFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    baseUrl: '',
    pollAtivo: false,
    pollIntervaloSeg: 120,
    permitirTlsInseguro: false,
    vinculos: [],
  };
}

function migrate(raw: unknown): N8nFile {
  const candidate = (raw ?? {}) as Partial<N8nFile>;
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    baseUrl: typeof candidate.baseUrl === 'string' ? candidate.baseUrl : '',
    pollAtivo: Boolean(candidate.pollAtivo),
    pollIntervaloSeg:
      typeof candidate.pollIntervaloSeg === 'number' && candidate.pollIntervaloSeg >= 15
        ? candidate.pollIntervaloSeg
        : 120,
    permitirTlsInseguro: Boolean(candidate.permitirTlsInseguro),
    vinculos: Array.isArray(candidate.vinculos) ? candidate.vinculos : [],
    ultimoSnapshot: candidate.ultimoSnapshot,
  };
}

function loadFile(): N8nFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: N8nFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

/** Tira a barra final para as URLs montadas depois não ficarem com '//'. */
function normalizarBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Mantém o httpClient sabendo quais hosts podem ter certificado inválido. */
function aplicarPoliticaTls(file: N8nFile): void {
  const host = file.permitirTlsInseguro ? hostDe(file.baseUrl) : null;
  setHostsInseguros(host ? [host] : []);
}

export async function getConfig(): Promise<N8nConfig> {
  const file = loadFile();
  return {
    baseUrl: file.baseUrl,
    temApiKey: hasSecret(SECRET_KEY),
    pollAtivo: file.pollAtivo,
    pollIntervaloSeg: file.pollIntervaloSeg,
    permitirTlsInseguro: file.permitirTlsInseguro,
  };
}

export async function salvarConfig(input: SalvarN8nConfigInput): Promise<N8nConfig> {
  const file = loadFile();

  file.baseUrl = normalizarBaseUrl(input.baseUrl);
  file.pollAtivo = input.pollAtivo;
  // Piso de 15s: o jsonStore reescreve o arquivo inteiro a cada ciclo.
  file.pollIntervaloSeg = Math.max(15, Math.round(input.pollIntervaloSeg));
  file.permitirTlsInseguro = input.permitirTlsInseguro;

  await saveFile(file);

  // undefined mantém a key atual; string vazia remove.
  if (input.apiKey !== undefined) {
    await setSecret(SECRET_KEY, input.apiKey);
  }

  aplicarPoliticaTls(file);
  return getConfig();
}

function exigirConexao(file: N8nFile): { baseUrl: string; apiKey: string } {
  if (!file.baseUrl) {
    throw new Error('Configure a URL do n8n em Ajustes antes de usar esta área.');
  }
  const apiKey = getSecret(SECRET_KEY);
  if (!apiKey) {
    throw new Error('Configure a API key do n8n em Ajustes antes de usar esta área.');
  }
  return { baseUrl: file.baseUrl, apiKey };
}

function headers(apiKey: string): Record<string, string> {
  return { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' };
}

/**
 * O formato da API muda entre versões do n8n, então lemos campo a campo e
 * toleramos ausências em vez de confiar num shape fixo.
 */
function lerWorkflow(raw: unknown): N8nWorkflow | null {
  const w = (raw ?? {}) as Record<string, unknown>;
  const id = w.id ?? w.workflowId;
  if (id === undefined || id === null) return null;

  const tagsBrutas = Array.isArray(w.tags) ? w.tags : [];
  const tags = tagsBrutas
    .map((tag) => {
      if (typeof tag === 'string') return tag;
      const objeto = (tag ?? {}) as Record<string, unknown>;
      return typeof objeto.name === 'string' ? objeto.name : null;
    })
    .filter((tag): tag is string => Boolean(tag));

  return {
    id: String(id),
    nome: typeof w.name === 'string' ? w.name : `Workflow ${String(id)}`,
    ativo: Boolean(w.active),
    tags,
    atualizadoEm: typeof w.updatedAt === 'string' ? w.updatedAt : undefined,
  };
}

function lerStatus(raw: Record<string, unknown>): N8nExecucaoStatus {
  const status = typeof raw.status === 'string' ? raw.status : '';
  if (status === 'success') return 'sucesso';
  if (status === 'error' || status === 'crashed' || status === 'failed') return 'erro';
  if (status === 'running' || status === 'waiting' || status === 'new') return 'rodando';

  // Versões antigas não têm 'status': derivam de finished + stoppedAt.
  if (raw.finished === true) return 'sucesso';
  if (raw.stoppedAt && raw.finished === false) return 'erro';
  if (raw.stoppedAt === null || raw.stoppedAt === undefined) return 'rodando';
  return 'desconhecido';
}

function lerExecucao(raw: unknown): N8nExecucao | null {
  const e = (raw ?? {}) as Record<string, unknown>;
  if (e.id === undefined || e.id === null) return null;

  const iniciada = typeof e.startedAt === 'string' ? e.startedAt : undefined;
  const parada = typeof e.stoppedAt === 'string' ? e.stoppedAt : undefined;
  const duracaoMs =
    iniciada && parada ? Math.max(0, new Date(parada).getTime() - new Date(iniciada).getTime()) : undefined;

  return {
    id: String(e.id),
    workflowId: e.workflowId !== undefined && e.workflowId !== null ? String(e.workflowId) : '',
    status: lerStatus(e),
    iniciadaEm: iniciada,
    duracaoMs,
    modo: typeof e.mode === 'string' ? e.mode : undefined,
  };
}

/** A API às vezes devolve {data: [...]}, às vezes o array direto. */
function extrairLista(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const objeto = (payload ?? {}) as Record<string, unknown>;
  return Array.isArray(objeto.data) ? objeto.data : [];
}

async function buscarSnapshot(signal?: AbortSignal): Promise<N8nSnapshot> {
  const file = loadFile();
  aplicarPoliticaTls(file);
  const { baseUrl, apiKey } = exigirConexao(file);

  const opcoes = {
    headers: headers(apiKey),
    timeoutMs: TIMEOUT_MS,
    permitirTlsInseguro: file.permitirTlsInseguro,
    signal,
  };

  const workflowsRaw = await requestJson<unknown>(`${baseUrl}/api/v1/workflows`, opcoes);
  const workflows = extrairLista(workflowsRaw)
    .map(lerWorkflow)
    .filter((w): w is N8nWorkflow => w !== null);

  const execucoesRaw = await requestJson<unknown>(
    `${baseUrl}/api/v1/executions?limit=${MAX_EXECUCOES}`,
    opcoes,
  );
  const nomePorId = new Map(workflows.map((w) => [w.id, w.nome]));
  const execucoes = extrairLista(execucoesRaw)
    .map(lerExecucao)
    .filter((e): e is N8nExecucao => e !== null)
    .map((e) => ({ ...e, workflowNome: nomePorId.get(e.workflowId) }));

  return { conectado: true, atualizadoEm: nowIso(), workflows, execucoes };
}

/** Último snapshot salvo, para a tela abrir com conteúdo antes do primeiro poll. */
export async function getSnapshot(): Promise<N8nSnapshot> {
  const file = loadFile();
  return (
    file.ultimoSnapshot ?? {
      conectado: false,
      atualizadoEm: nowIso(),
      workflows: [],
      execucoes: [],
    }
  );
}

/** Um ciclo de polling: busca, grava e empurra para a tela. */
export async function pollOnce(signal?: AbortSignal): Promise<void> {
  let snapshot: N8nSnapshot;

  try {
    snapshot = await buscarSnapshot(signal);
  } catch (error) {
    snapshot = {
      conectado: false,
      erro: error instanceof Error ? error.message : String(error),
      atualizadoEm: nowIso(),
      // Mantém o que já havia na tela em vez de esvaziar tudo por uma falha.
      workflows: loadFile().ultimoSnapshot?.workflows ?? [],
      execucoes: loadFile().ultimoSnapshot?.execucoes ?? [],
    };
  }

  const file = loadFile();
  file.ultimoSnapshot = snapshot;
  await saveFile(file);

  broadcast('n8n:snapshot', snapshot);
}

export async function testarConexao(): Promise<string> {
  const file = loadFile();
  aplicarPoliticaTls(file);
  const { baseUrl, apiKey } = exigirConexao(file);

  const resposta = await request(`${baseUrl}/api/v1/workflows?limit=1`, {
    headers: headers(apiKey),
    timeoutMs: TIMEOUT_MS,
    permitirTlsInseguro: file.permitirTlsInseguro,
    descartarCorpo: true,
  });

  if (isFalha(resposta)) {
    throw new Error(`Não foi possível alcançar ${baseUrl}: ${resposta.mensagem}`);
  }
  if (resposta.status === 401 || resposta.status === 403) {
    throw new Error('A API key foi recusada pelo n8n.');
  }
  if (!resposta.ok) {
    throw new Error(`O n8n respondeu HTTP ${resposta.status}.`);
  }

  return `Conectado a ${baseUrl} em ${resposta.latenciaMs} ms.`;
}

export async function alternarAtivo(workflowId: string, ativar: boolean): Promise<N8nSnapshot> {
  const file = loadFile();
  const { baseUrl, apiKey } = exigirConexao(file);

  const resposta = await request(
    `${baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/${ativar ? 'activate' : 'deactivate'}`,
    {
      method: 'POST',
      headers: headers(apiKey),
      timeoutMs: TIMEOUT_MS,
      permitirTlsInseguro: file.permitirTlsInseguro,
    },
  );

  if (isFalha(resposta)) {
    throw new Error(`Falha ao falar com o n8n: ${resposta.mensagem}`);
  }
  if (!resposta.ok) {
    throw new Error(`O n8n recusou a mudança (HTTP ${resposta.status}).`);
  }

  await pollOnce();
  return getSnapshot();
}

export async function dispararWorkflow(input: DispararWorkflowInput): Promise<DispararWorkflowResult> {
  const file = loadFile();
  const { baseUrl, apiKey } = exigirConexao(file);

  let corpo = '{}';
  if (input.payloadJson && input.payloadJson.trim()) {
    try {
      // Valida antes de enviar: erro de digitação vira mensagem clara aqui,
      // em vez de um 400 opaco vindo do n8n.
      corpo = JSON.stringify(JSON.parse(input.payloadJson));
    } catch {
      throw new Error('O payload não é um JSON válido.');
    }
  }

  const resposta = await request(
    `${baseUrl}/api/v1/workflows/${encodeURIComponent(input.workflowId)}/run`,
    {
      method: 'POST',
      headers: { ...headers(apiKey), 'Content-Type': 'application/json' },
      body: corpo,
      timeoutMs: 30_000,
      permitirTlsInseguro: file.permitirTlsInseguro,
    },
  );

  if (isFalha(resposta)) {
    return { ok: false, mensagem: `Falha de rede: ${resposta.mensagem}` };
  }
  if (resposta.status === 404) {
    return {
      ok: false,
      mensagem:
        'Este n8n não expõe execução manual pela API (HTTP 404). Use um workflow com nó de Webhook e dispare pela URL dele.',
    };
  }
  if (!resposta.ok) {
    return { ok: false, mensagem: `O n8n respondeu HTTP ${resposta.status}.`, respostaBruta: resposta.body };
  }

  void pollOnce();
  return { ok: true, mensagem: 'Workflow disparado.', respostaBruta: resposta.body.slice(0, 4000) };
}

export async function definirVinculo(input: DefinirVinculoInput): Promise<N8nFile> {
  const file = loadFile();
  file.vinculos = file.vinculos.filter((v) => v.workflowId !== input.workflowId);

  if (input.refId) {
    file.vinculos.push({ workflowId: input.workflowId, tipo: input.tipo, refId: input.refId });
  }

  await saveFile(file);
  return file;
}

export async function getFullFile(): Promise<N8nFile> {
  return loadFile();
}

export async function replaceFile(file: N8nFile): Promise<N8nFile> {
  await saveFile(file);
  return file;
}

export async function abrirExecucao(execucaoId: string): Promise<void> {
  const file = loadFile();
  if (!file.baseUrl) throw new Error('Configure a URL do n8n em Ajustes.');
  await shell.openExternal(`${file.baseUrl}/executions/${encodeURIComponent(execucaoId)}`);
}

export function getPollConfig(): { ativo: boolean; intervaloMs: number; temBaseUrl: boolean } {
  const file = loadFile();
  return {
    ativo: file.pollAtivo,
    intervaloMs: file.pollIntervaloSeg * 1000,
    temBaseUrl: Boolean(file.baseUrl),
  };
}
