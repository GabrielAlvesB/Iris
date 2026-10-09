/**
 * O código da caixa na nuvem (Cloudflare Worker), como texto: a aba API
 * mostra e copia, e a pessoa cola no painel da Cloudflare — sem terminal.
 *
 * Por que guardar o lead lá e o Iris buscar: o Iris é 100% local, e um
 * formulário na internet não alcança o PC (que ainda pode estar desligado).
 * A caixa recebe a qualquer hora e o Iris esvazia a cada minuto.
 *
 * O plano grátis do KV permite 1.000 listagens por dia; uma busca por minuto
 * daria 1.440. Por isso cada envio grava também a chave "ultimo" e a busca só
 * lista quando chegou algo nos últimos minutos (o Iris manda `desde`). A folga
 * de 3 min cobre o KV, que leva até um minuto para mostrar o que foi gravado.
 *
 * A validação daqui é só uma barreira; a de verdade é a do Iris (validarLead).
 *
 * v2: a mesma caixa recebe o WhatsApp (webhooks da Meta, Evolution, WAHA e do
 * n8n) em /v1/whatsapp/<origem>/<CHAVE_WHATSAPP>, guarda com o prefixo "wa:"
 * e o Iris esvazia junto com os leads. A Meta exige https público — é por
 * aqui que a API oficial chega ao PC.
 * String.raw: as barras invertidas das expressões regulares chegam intactas.
 */

export const VERSAO_WORKER = 2;

export const CODIGO_WORKER = String.raw`// Caixa de leads do Iris — Cloudflare Worker (versão 2)
// Variáveis: CHAVE_FORMULARIO, CHAVE_IRIS e, se quiser, ORIGENS
// (domínios que podem enviar, separados por vírgula: https://seusite.com.br).
// WhatsApp (opcional): CHAVE_WHATSAPP (a chave do WhatsApp do Iris) e, para a
// API oficial, META_APP_SECRET (a chave secreta do app da Meta).
// KV ligado ao Worker com o nome LEADS.

const TRINTA_DIAS = 60 * 60 * 24 * 30;
const LIMITE_BYTES = 32 * 1024;
const LIMITE_POR_MINUTO = 20;
const FOLGA_MS = 3 * 60 * 1000;
const LIMITE_BYTES_WA = 512 * 1024;
const ROTA_WA = /^\/v1\/whatsapp\/(meta|evolution|waha|iris)\/([A-Za-z0-9_-]{8,200})$/;
// Por instância do Worker: uma barreira contra rajadas, não uma contabilidade exata.
const envios = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = cabecalhosCors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === '/v1/status' && request.method === 'GET') return status(request, env, url, cors);
      if (url.pathname === '/v1/leads' && request.method === 'POST') return await receber(request, env, cors);
      if (url.pathname === '/v1/leads' && request.method === 'GET') return await listar(request, env, url, cors);
      if (url.pathname === '/v1/leads/confirmar' && request.method === 'POST') return await confirmar(request, env, cors);
      if (url.pathname === '/v1/whatsapp' && request.method === 'GET') return await listarWa(request, env, url, cors);
      if (url.pathname === '/v1/whatsapp/confirmar' && request.method === 'POST') return await confirmarWa(request, env, cors);
      const wa = ROTA_WA.exec(url.pathname);
      if (wa && request.method === 'GET') return verificarWa(env, url, wa[1], wa[2], cors);
      if (wa && request.method === 'POST') return await receberWa(request, env, wa[1], wa[2], cors);
      return json({ ok: false, erro: 'Rota não encontrada.' }, 404, cors);
    } catch (erro) {
      return json({ ok: false, erro: 'Erro interno da caixa.' }, 500, cors);
    }
  },
};

function json(dados, status, cors) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: Object.assign({}, cors, { 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

function origensPermitidas(env) {
  return String(env.ORIGENS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function cabecalhosCors(request, env) {
  const origem = request.headers.get('Origin') || '';
  const permitidas = origensPermitidas(env);
  const liberada = !permitidas.length ? '*' : permitidas.includes(origem) ? origem : permitidas[0];
  return {
    'Access-Control-Allow-Origin': liberada,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Iris-Chave, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function autorizadoIris(request, env) {
  const cabecalho = request.headers.get('Authorization') || '';
  return Boolean(env.CHAVE_IRIS) && cabecalho === 'Bearer ' + env.CHAVE_IRIS;
}

function status(request, env, url, cors) {
  // O Iris manda a chave pública do formulário para conferir se é a mesma da variável.
  const formulario = url.searchParams.get('formulario');
  return json(
    {
      ok: true,
      servico: 'iris-leads',
      versao: 2,
      whatsapp: Boolean(env.CHAVE_WHATSAPP),
      segredoMeta: Boolean(env.META_APP_SECRET),
      kv: Boolean(env.LEADS),
      chaveFormulario: Boolean(env.CHAVE_FORMULARIO),
      chaveIris: Boolean(env.CHAVE_IRIS),
      autorizado: autorizadoIris(request, env),
      formularioConfere: formulario ? formulario === env.CHAVE_FORMULARIO : null,
    },
    200,
    cors,
  );
}

function excedeuLimite(ip) {
  const agora = Date.now();
  const lista = (envios.get(ip) || []).filter((t) => agora - t < 60000);
  lista.push(agora);
  envios.set(ip, lista);
  if (envios.size > 5000) envios.clear();
  return lista.length > LIMITE_POR_MINUTO;
}

async function lerCorpo(request) {
  const tipo = request.headers.get('Content-Type') || '';
  const texto = await request.text();
  if (texto.length > LIMITE_BYTES) return { grande: true };
  if (/application\/json/i.test(tipo)) {
    try {
      const dados = JSON.parse(texto || '{}');
      return { dados: dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {} };
    } catch (erro) {
      return { invalido: true };
    }
  }
  if (/multipart\/form-data/i.test(tipo)) {
    const form = await new Response(texto, { headers: { 'Content-Type': tipo } }).formData();
    const dados = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') dados[k] = v;
    return { dados };
  }
  return { dados: Object.fromEntries(new URLSearchParams(texto)) };
}

function campo(dados, nomes) {
  for (const n of nomes) {
    const v = dados[n];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function respostaOk(redirecionar, cors) {
  if (typeof redirecionar === 'string' && /^https?:\/\//i.test(redirecionar)) {
    return new Response(null, { status: 303, headers: Object.assign({}, cors, { Location: redirecionar }) });
  }
  return json({ ok: true }, 201, cors);
}

async function receber(request, env, cors) {
  if (!env.LEADS) return json({ ok: false, erro: 'A caixa ainda não tem o KV LEADS ligado.' }, 500, cors);
  const origem = request.headers.get('Origin');
  const permitidas = origensPermitidas(env);
  if (origem && permitidas.length && !permitidas.includes(origem)) {
    return json({ ok: false, erro: 'Este site não está na lista ORIGENS da caixa.' }, 403, cors);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  if (excedeuLimite(ip)) return json({ ok: false, erro: 'Envios demais. Tente de novo em um minuto.' }, 429, cors);
  if (Number(request.headers.get('Content-Length') || 0) > LIMITE_BYTES) {
    return json({ ok: false, erro: 'Envio grande demais (máximo 32 KB).' }, 413, cors);
  }
  const corpo = await lerCorpo(request);
  if (corpo.grande) return json({ ok: false, erro: 'Envio grande demais (máximo 32 KB).' }, 413, cors);
  if (corpo.invalido) return json({ ok: false, erros: { corpo: 'O JSON enviado não é válido.' } }, 400, cors);
  const dados = corpo.dados;

  const chave = request.headers.get('X-Iris-Chave') || campo(dados, ['_chave']);
  if (!env.CHAVE_FORMULARIO || chave !== env.CHAVE_FORMULARIO) {
    return json({ ok: false, erro: 'Chave do formulário inválida.' }, 401, cors);
  }
  const redirecionar = campo(dados, ['_redirecionar']);
  // Isca preenchida: é robô. Responde como sucesso para ele não tentar outro jeito.
  if (campo(dados, ['_site'])) return respostaOk(redirecionar, cors);

  const erros = {};
  const nome = campo(dados, ['nome', 'name']);
  const email = campo(dados, ['email', 'e-mail', 'mail']);
  const telefone = campo(dados, ['telefone', 'phone', 'celular', 'whatsapp']);
  if (!nome) erros.nome = 'Informe o nome.';
  if (!email) erros.email = 'Informe o e-mail.';
  else if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) erros.email = 'E-mail inválido.';
  if (!telefone) erros.telefone = 'Informe o telefone.';
  else if (telefone.replace(/\D/g, '').length < 10) erros.telefone = 'Telefone inválido — use DDD + número.';
  if (Object.keys(erros).length) return json({ ok: false, erros }, 400, cors);

  delete dados._chave;
  delete dados._site;
  delete dados._redirecionar;
  const id = Date.now().toString(36) + '-' + crypto.randomUUID();
  const lead = { id, recebidoEm: new Date().toISOString(), dados };
  await env.LEADS.put('lead:' + id, JSON.stringify(lead), { expirationTtl: TRINTA_DIAS });
  await env.LEADS.put('ultimo', String(Date.now()));
  return respostaOk(redirecionar, cors);
}

async function listar(request, env, url, cors) {
  if (!autorizadoIris(request, env)) return json({ ok: false, erro: 'Chave do Iris inválida.' }, 401, cors);
  if (!env.LEADS) return json({ ok: false, erro: 'A caixa ainda não tem o KV LEADS ligado.' }, 500, cors);
  const agora = Date.now();
  const desde = Number(url.searchParams.get('desde') || 0);
  if (desde > 0) {
    const ultimo = Number((await env.LEADS.get('ultimo')) || 0);
    if (!ultimo || ultimo < desde - FOLGA_MS) return json({ ok: true, agora, leads: [] }, 200, cors);
  }
  const lista = await env.LEADS.list({ prefix: 'lead:', limit: 100 });
  const leads = [];
  for (const k of lista.keys) {
    const valor = await env.LEADS.get(k.name);
    if (!valor) continue;
    try {
      leads.push(JSON.parse(valor));
    } catch (erro) {
      // Valor estragado não trava a fila: fica até expirar.
    }
  }
  return json({ ok: true, agora, leads, mais: !lista.list_complete }, 200, cors);
}

async function confirmar(request, env, cors) {
  if (!autorizadoIris(request, env)) return json({ ok: false, erro: 'Chave do Iris inválida.' }, 401, cors);
  const corpo = await lerCorpo(request);
  const lista = corpo.dados && Array.isArray(corpo.dados.ids) ? corpo.dados.ids : [];
  const ids = lista.filter((id) => typeof id === 'string' && id.length < 120).slice(0, 200);
  await Promise.all(ids.map((id) => env.LEADS.delete('lead:' + id)));
  return json({ ok: true, apagados: ids.length }, 200, cors);
}

// ---------- WhatsApp ----------

function chaveWaConfere(env, chave) {
  return Boolean(env.CHAVE_WHATSAPP) && chave === env.CHAVE_WHATSAPP;
}

// A Meta confirma o endereço com um GET: devolver o hub.challenge quando o token é a chave.
function verificarWa(env, url, origem, chave, cors) {
  if (!chaveWaConfere(env, chave)) return json({ ok: false, erro: 'Chave do WhatsApp inválida.' }, 403, cors);
  if (origem === 'meta' && url.searchParams.get('hub.mode') === 'subscribe') {
    if (url.searchParams.get('hub.verify_token') !== chave) return json({ ok: false, erro: 'Token de verificação diferente da chave.' }, 403, cors);
    return new Response(url.searchParams.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return json({ ok: true, servico: 'iris-whatsapp' }, 200, cors);
}

async function assinaturaMetaConfere(env, corpo, cabecalho) {
  if (!env.META_APP_SECRET) return true;
  const esperado = String(cabecalho || '').replace(/^sha256=/, '');
  if (!esperado) return false;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.META_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  const hex = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < hex.length; i += 1) diferenca |= hex.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferenca === 0;
}

async function receberWa(request, env, origem, chave, cors) {
  if (!env.LEADS) return json({ ok: false, erro: 'A caixa ainda não tem o KV LEADS ligado.' }, 500, cors);
  if (!chaveWaConfere(env, chave)) return json({ ok: false, erro: 'Chave do WhatsApp inválida.' }, 401, cors);
  const texto = await request.text();
  if (texto.length > LIMITE_BYTES_WA) return json({ ok: false, erro: 'Envio grande demais.' }, 413, cors);
  if (origem === 'meta' && !(await assinaturaMetaConfere(env, texto, request.headers.get('X-Hub-Signature-256')))) {
    return json({ ok: false, erro: 'Assinatura da Meta não confere (META_APP_SECRET).' }, 401, cors);
  }
  let corpo;
  try {
    corpo = JSON.parse(texto || '{}');
  } catch (erro) {
    return json({ ok: false, erro: 'O corpo não é JSON.' }, 400, cors);
  }
  const id = Date.now().toString(36) + '-' + crypto.randomUUID();
  await env.LEADS.put('wa:' + id, JSON.stringify({ id, origem, recebidoEm: new Date().toISOString(), corpo }), { expirationTtl: TRINTA_DIAS });
  await env.LEADS.put('ultimo-wa', String(Date.now()));
  return json({ ok: true }, 200, cors);
}

async function listarWa(request, env, url, cors) {
  if (!autorizadoIris(request, env)) return json({ ok: false, erro: 'Chave do Iris inválida.' }, 401, cors);
  if (!env.LEADS) return json({ ok: false, erro: 'A caixa ainda não tem o KV LEADS ligado.' }, 500, cors);
  const agora = Date.now();
  const desde = Number(url.searchParams.get('desde') || 0);
  if (desde > 0) {
    const ultimo = Number((await env.LEADS.get('ultimo-wa')) || 0);
    if (!ultimo || ultimo < desde - FOLGA_MS) return json({ ok: true, agora, eventos: [] }, 200, cors);
  }
  const lista = await env.LEADS.list({ prefix: 'wa:', limit: 100 });
  const eventos = [];
  for (const k of lista.keys) {
    const valor = await env.LEADS.get(k.name);
    if (!valor) continue;
    try {
      eventos.push(JSON.parse(valor));
    } catch (erro) {
      // Valor estragado não trava a fila: fica até expirar.
    }
  }
  return json({ ok: true, agora, eventos, mais: !lista.list_complete }, 200, cors);
}

async function confirmarWa(request, env, cors) {
  if (!autorizadoIris(request, env)) return json({ ok: false, erro: 'Chave do Iris inválida.' }, 401, cors);
  const corpo = await lerCorpo(request);
  const lista = corpo.dados && Array.isArray(corpo.dados.ids) ? corpo.dados.ids : [];
  const ids = lista.filter((id) => typeof id === 'string' && id.length < 160).slice(0, 200);
  await Promise.all(ids.map((id) => env.LEADS.delete('wa:' + id)));
  return json({ ok: true, apagados: ids.length }, 200, cors);
}
`;
