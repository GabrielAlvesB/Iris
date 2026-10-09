import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import {
  CAMPO_CHAVE,
  CAMPO_REDIRECIONAR,
  LIMITE_BYTES,
  LIMITE_POR_MINUTO,
  type EstadoServidorLocal,
  type LeadsConfig,
} from '../../../shared/types/leads.types';
import { loadFile } from './contatos.arquivo';
import { receberLead } from './contatos.leads';
import { chaveWebhookConfere, receberCorpo } from '../whatsapp/whatsapp.receber';
import type { OrigemEventoWa } from '../../../shared/types/whatsapp.eventos';

/**
 * O servidor de leads dentro do Iris: para testar, para o n8n e para
 * formulários na mesma rede. Um site na internet não alcança o PC — para isso
 * existe a caixa na nuvem (leads.worker.ts). Mesmas rotas e respostas dela.
 *
 * Escuta só em 127.0.0.1; "aceitar da rede local" passa a 0.0.0.0. Liga e
 * desliga sem reiniciar (reaplicarAgendamentos) e fecha no before-quit.
 */

let servidor: http.Server | null = null;
let aplicado: LeadsConfig['servidor'] | null = null;
let estado: EstadoServidorLocal = { ativo: false, ouvindo: false, endereco: '' };
/** Envios por IP no último minuto. */
const envios = new Map<string, number[]>();

export function estadoServidor(): EstadoServidorLocal {
  return { ...estado };
}

function ipDaRede(): string | undefined {
  for (const lista of Object.values(os.networkInterfaces())) {
    const ip = lista?.find((i) => i.family === 'IPv4' && !i.internal);
    if (ip) return ip.address;
  }
  return undefined;
}

function excedeuLimite(ip: string): boolean {
  const agora = Date.now();
  const lista = (envios.get(ip) ?? []).filter((t) => agora - t < 60_000);
  lista.push(agora);
  envios.set(ip, lista);
  if (envios.size > 5000) envios.clear();
  return lista.length > LIMITE_POR_MINUTO;
}

function cors(req: IncomingMessage): Record<string, string> {
  return {
    // Sem lista de origens aqui: o servidor local só é alcançável deste PC (ou da rede da casa) e a chave protege.
    'Access-Control-Allow-Origin': typeof req.headers.origin === 'string' ? req.headers.origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Iris-Chave, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function responder(req: IncomingMessage, res: ServerResponse, status: number, dados?: unknown, extras: Record<string, string> = {}): void {
  if (res.headersSent) return;
  const corpo = dados === undefined ? '' : JSON.stringify(dados);
  res.writeHead(status, { ...cors(req), ...(dados === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...extras });
  res.end(corpo);
}

/** Lê o corpo com teto: passou do limite (32 KB nos leads), para de ler e devolve null. */
function lerCorpo(req: IncomingMessage, limite = LIMITE_BYTES): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on('data', (parte: Buffer) => {
      total += parte.length;
      if (total > limite) {
        resolve(null);
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

/** JSON, urlencoded (o <form> sem JavaScript) ou multipart (o FormData do fetch). */
async function interpretar(corpo: Buffer, tipo: string): Promise<Record<string, unknown> | 'invalido'> {
  if (/application\/json/i.test(tipo)) {
    try {
      const v = JSON.parse(corpo.toString('utf-8') || '{}') as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : 'invalido';
    } catch {
      return 'invalido';
    }
  }
  if (/multipart\/form-data/i.test(tipo)) {
    try {
      const form = await new Response(new Uint8Array(corpo), { headers: { 'Content-Type': tipo } }).formData();
      const dados: Record<string, unknown> = {};
      form.forEach((v, k) => {
        if (typeof v === 'string') dados[k] = v;
      });
      return dados;
    } catch {
      return 'invalido';
    }
  }
  return Object.fromEntries(new URLSearchParams(corpo.toString('utf-8')));
}

async function receber(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = req.socket.remoteAddress ?? 'desconhecido';
  if (excedeuLimite(ip)) return responder(req, res, 429, { ok: false, erro: 'Envios demais. Tente de novo em um minuto.' });
  if (Number(req.headers['content-length'] ?? 0) > LIMITE_BYTES) {
    responder(req, res, 413, { ok: false, erro: 'Envio grande demais (máximo 32 KB).' }, { Connection: 'close' });
    req.destroy();
    return;
  }
  const corpo = await lerCorpo(req);
  if (!corpo) return responder(req, res, 413, { ok: false, erro: 'Envio grande demais (máximo 32 KB).' }, { Connection: 'close' });
  const dados = await interpretar(corpo, String(req.headers['content-type'] ?? ''));
  if (dados === 'invalido') return responder(req, res, 400, { ok: false, erros: { corpo: 'O corpo enviado não é válido.' } });

  const chaveCabecalho = req.headers['x-iris-chave'];
  const chave = (typeof chaveCabecalho === 'string' ? chaveCabecalho : '') || (typeof dados[CAMPO_CHAVE] === 'string' ? (dados[CAMPO_CHAVE] as string) : '');
  const esperada = loadFile().leadsConfig.chaveFormulario;
  if (!esperada || chave.trim() !== esperada) return responder(req, res, 401, { ok: false, erro: 'Chave do formulário inválida.' });

  const resultado = await receberLead(dados, 'local');
  if (resultado.tipo === 'invalido') return responder(req, res, 400, { ok: false, erros: resultado.erros });
  // Isca preenchida cai aqui também: responder como sucesso não ensina o robô a contornar.
  const destino = dados[CAMPO_REDIRECIONAR];
  if (typeof destino === 'string' && /^https?:\/\//i.test(destino.trim())) return responder(req, res, 303, undefined, { Location: destino.trim() });
  responder(req, res, 201, { ok: true });
}

// ---------- WhatsApp ----------

/** /v1/whatsapp/<origem>/<chave>: a chave no caminho funciona com qualquer provedor (nem todos mandam cabeçalho). */
const ROTA_WHATSAPP = /^\/v1\/whatsapp\/(meta|evolution|waha|iris)\/([A-Za-z0-9_-]{8,200})$/;
/** Eventos do WhatsApp podem trazer vários de uma vez; mídia não vem (base64 desligado no webhook). */
const LIMITE_WHATSAPP = 512 * 1024;

async function receberWhatsapp(req: IncomingMessage, res: ServerResponse, origem: OrigemEventoWa, chave: string, url: URL): Promise<void> {
  // Verificação de webhook da Meta (GET com hub.challenge): responde o desafio se o token é a chave.
  if (req.method === 'GET') {
    if (origem === 'meta' && url.searchParams.get('hub.mode') === 'subscribe' && chaveWebhookConfere(chave) && url.searchParams.get('hub.verify_token') === chave) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(url.searchParams.get('hub.challenge') ?? '');
      return;
    }
    return responder(req, res, chaveWebhookConfere(chave) ? 200 : 403, { ok: chaveWebhookConfere(chave), servico: 'iris-whatsapp' });
  }
  if (!chaveWebhookConfere(chave)) return responder(req, res, 401, { ok: false, erro: 'Chave do WhatsApp inválida.' });
  const corpo = await lerCorpo(req, LIMITE_WHATSAPP);
  if (!corpo) return responder(req, res, 413, { ok: false, erro: 'Envio grande demais.' }, { Connection: 'close' });
  let dados: unknown;
  try {
    dados = JSON.parse(corpo.toString('utf-8') || '{}');
  } catch {
    return responder(req, res, 400, { ok: false, erro: 'O corpo não é JSON.' });
  }
  const r = await receberCorpo(origem, dados);
  responder(req, res, 200, { ok: true, novas: r.novas, status: r.status });
}

function tratar(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://iris.local');
  const rota = url.pathname.replace(/\/+$/, '');
  if (req.method === 'OPTIONS') return responder(req, res, 204);
  const wa = ROTA_WHATSAPP.exec(rota);
  if (wa && (req.method === 'POST' || req.method === 'GET')) {
    receberWhatsapp(req, res, wa[1] as OrigemEventoWa, wa[2]!, url).catch((erro: unknown) => {
      console.error('[whatsapp] servidor local', erro);
      responder(req, res, 500, { ok: false, erro: 'Erro interno do Iris.' });
    });
    return;
  }
  if (rota === '/v1/status' && req.method === 'GET') return responder(req, res, 200, { ok: true, servico: 'iris-leads', canal: 'local', versao: 1 });
  if (rota === '/v1/leads' && req.method === 'POST') {
    receber(req, res).catch((erro: unknown) => {
      console.error('[leads] servidor local', erro);
      responder(req, res, 500, { ok: false, erro: 'Erro interno do Iris.' });
    });
    return;
  }
  responder(req, res, 404, { ok: false, erro: 'Rota não encontrada.' });
}

function fechar(): Promise<void> {
  const s = servidor;
  servidor = null;
  aplicado = null;
  if (!s) return Promise.resolve();
  return new Promise((resolve) => {
    s.close(() => resolve());
    // Conexões keep-alive seguram o close; derruba para a porta liberar já.
    s.closeAllConnections();
  });
}

let fila: Promise<void> = Promise.resolve();

/**
 * Liga, desliga ou reinicia (porta/rede mudou) conforme a configuração. Nunca
 * lança. Em fila: duas chamadas juntas (salvar + reaplicarAgendamentos) não
 * podem tentar abrir a mesma porta ao mesmo tempo.
 */
export function aplicarServidor(config: LeadsConfig['servidor']): Promise<void> {
  fila = fila.then(() => aplicarAgora(config)).catch((erro: unknown) => console.error('[leads] servidor local', erro));
  return fila;
}

async function aplicarAgora(config: LeadsConfig['servidor']): Promise<void> {
  if (!config.ativo) {
    await fechar();
    estado = { ativo: false, ouvindo: false, endereco: '' };
    return;
  }
  if (servidor && aplicado && aplicado.porta === config.porta && aplicado.rede === config.rede) return;
  await fechar();
  const host = config.rede ? '0.0.0.0' : '127.0.0.1';
  const endereco = `http://127.0.0.1:${config.porta}`;
  const s = http.createServer(tratar);
  s.requestTimeout = 15_000;
  s.headersTimeout = 10_000;
  await new Promise<void>((resolve) => {
    s.once('error', (erro: NodeJS.ErrnoException) => {
      const mensagem =
        erro.code === 'EADDRINUSE'
          ? `A porta ${config.porta} já está em uso por outro programa. Escolha outra.`
          : erro.code === 'EACCES'
            ? `O Windows não deixou usar a porta ${config.porta}. Escolha outra.`
            : `O servidor não ligou: ${erro.message}`;
      estado = { ativo: true, ouvindo: false, endereco, erro: mensagem };
      resolve();
    });
    s.listen(config.porta, host, () => {
      servidor = s;
      aplicado = { ...config };
      const ipRede = config.rede ? ipDaRede() : undefined;
      estado = { ativo: true, ouvindo: true, endereco, ...(ipRede ? { enderecoRede: `http://${ipRede}:${config.porta}` } : {}) };
      resolve();
    });
  });
}

/** before-quit: fecha na hora, sem esperar. */
export function pararServidor(): void {
  void fechar();
  estado = { ...estado, ouvindo: false };
}
