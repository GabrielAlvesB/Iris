import { soDigitos } from './brasil.js';
import type { StatusMensagemWa } from './whatsapp.types';

/**
 * O que chega dos provedores (webhooks) traduzido para um formato só. Puro:
 * o main usa ao receber, e os testes rodam os mesmos tradutores com payloads
 * reais de cada provedor.
 *
 * Tudo aqui é tolerante: um campo que não existe numa versão do provedor não
 * derruba o resto — o evento que não dá para entender é ignorado.
 */

export type EventoWa =
  | {
      tipo: 'mensagem';
      numero: string;
      texto: string;
      idExterno: string;
      /** ISO. */
      em: string;
      /** Mandada do próprio número (pelo celular, ou o eco do que o Iris enviou). */
      deMim: boolean;
      /** Nome do perfil no WhatsApp, quando vem. */
      nome?: string;
    }
  | { tipo: 'status'; idExterno: string; status: StatusMensagemWa; em: string; erro?: string };

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
}

function txt(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** Segundos (string ou número) ou ISO → ISO; sem data válida, agora. */
function quando(v: unknown): string {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
    const n = Number(v);
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** "5511987654321@s.whatsapp.net" / "@c.us" → dígitos. Grupo, lista de transmissão e status: vazio (ignorado). */
function numeroDoJid(jid: string): string {
  if (!jid || /@(g\.us|broadcast|newsletter|lid)$/i.test(jid) || jid.startsWith('status@')) return '';
  return soDigitos(jid.split('@')[0]!.split(':')[0]!);
}

/** Id curto: os provedores às vezes prefixam ("true_5511…@c.us_3EB0…"); a parte final é a mesma nas duas pontas. */
export function idCurto(id: string): string {
  const partes = id.split('_');
  return partes[partes.length - 1] ?? id;
}

export function mesmoIdExterno(a: string, b: string): boolean {
  return a === b || idCurto(a) === idCurto(b);
}

/**
 * Os erros que mais aparecem, ditos do jeito que dá para agir. O texto
 * original continua no fim, para conferir no painel do provedor.
 */
export function explicarErroWa(texto: string): string {
  const t = texto.toLowerCase();
  if (/re-?engagement|131047|more than 24 hours/.test(t)) return `Fora da janela de 24 h: o contato não escreve há mais de um dia, e a API oficial só aceita um modelo aprovado agora. (${texto})`;
  if (/131026|undeliverable|not a valid whatsapp|does not exist|not on whatsapp/.test(t)) return `Este número não tem WhatsApp, ou não pôde receber. (${texto})`;
  if (/131030|not in allowed list|recipient phone number not in allowed/.test(t)) return `Número de teste: na conta de teste da Meta, só os números cadastrados em "Para" recebem. (${texto})`;
  if (/131056|pair rate limit/.test(t)) return `Mensagens demais para este número em pouco tempo. Espere alguns minutos. (${texto})`;
  if (/132001|template.*(not exist|does not exist)/.test(t)) return `O modelo não existe na Meta com esse nome e idioma. (${texto})`;
  if (/132000|number of parameters/.test(t)) return `O modelo da Meta espera outra quantidade de campos {{n}}. (${texto})`;
  return texto;
}

// ---------- API oficial (Meta) ----------

const STATUS_META: Record<string, StatusMensagemWa> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };

/** O que não é texto vira uma descrição curta: a conversa fica legível no Iris sem baixar mídia. */
function descreverMidia(tipo: string, legenda: string, extra = ''): string {
  const nomes: Record<string, string> = {
    image: 'Imagem',
    imageMessage: 'Imagem',
    video: 'Vídeo',
    videoMessage: 'Vídeo',
    audio: 'Áudio',
    audioMessage: 'Áudio',
    ptt: 'Áudio',
    voice: 'Áudio',
    document: 'Documento',
    documentMessage: 'Documento',
    sticker: 'Figurinha',
    stickerMessage: 'Figurinha',
    location: 'Localização',
    locationMessage: 'Localização',
    contacts: 'Contato',
    contactMessage: 'Contato',
  };
  const rotulo = nomes[tipo] ?? 'Mensagem';
  return [`[${rotulo}${extra ? `: ${extra}` : ''}]`, legenda].filter(Boolean).join(' ');
}

function textoMeta(m: Obj): string {
  const tipo = txt(m.type);
  if (tipo === 'text') return txt(obj(m.text).body);
  if (tipo === 'button') return txt(obj(m.button).text);
  if (tipo === 'interactive') {
    const i = obj(m.interactive);
    return txt(obj(i.button_reply).title) || txt(obj(i.list_reply).title);
  }
  if (tipo === 'reaction') return '';
  const midia = obj(m[tipo]);
  return descreverMidia(tipo, txt(midia.caption), txt(midia.filename));
}

export function eventosDaMeta(corpo: unknown): EventoWa[] {
  const eventos: EventoWa[] = [];
  lista(obj(corpo).entry).forEach((entrada) => {
    lista(obj(entrada).changes).forEach((mudanca) => {
      const valor = obj(obj(mudanca).value);
      const nomes = new Map(lista(valor.contacts).map((c) => [txt(obj(c).wa_id), txt(obj(obj(c).profile).name)] as const));
      lista(valor.messages).forEach((raw) => {
        const m = obj(raw);
        const numero = soDigitos(txt(m.from));
        const texto = textoMeta(m);
        const id = txt(m.id);
        if (!numero || !id || !texto) return;
        const nome = nomes.get(txt(m.from));
        eventos.push({ tipo: 'mensagem', numero, texto, idExterno: id, em: quando(m.timestamp), deMim: false, ...(nome ? { nome } : {}) });
      });
      lista(valor.statuses).forEach((raw) => {
        const s = obj(raw);
        const status = STATUS_META[txt(s.status)];
        const id = txt(s.id);
        if (!status || !id) return;
        const erro = lista(s.errors)
          .map((e) => txt(obj(obj(e).error_data).details) || txt(obj(e).message) || txt(obj(e).title))
          .filter(Boolean)
          .join(' ');
        eventos.push({ tipo: 'status', idExterno: id, status, em: quando(s.timestamp), ...(erro ? { erro: explicarErroWa(erro) } : {}) });
      });
    });
  });
  return eventos;
}

// ---------- Evolution API ----------

/** v2 manda texto ("DELIVERY_ACK"); a v1, número (1 pendente … 5 tocado). */
function statusEvolution(v: unknown): StatusMensagemWa | undefined {
  const s = txt(v).toUpperCase();
  if (s === 'SERVER_ACK' || s === '2') return 'enviada';
  if (s === 'DELIVERY_ACK' || s === '3') return 'entregue';
  if (s === 'READ' || s === 'PLAYED' || s === '4' || s === '5') return 'lida';
  if (s === 'ERROR' || s === '0') return 'falhou';
  return undefined;
}

function textoEvolution(mensagem: Obj, tipo: string): string {
  const conversa = txt(mensagem.conversation) || txt(obj(mensagem.extendedTextMessage).text);
  if (conversa) return conversa;
  const botao = txt(obj(mensagem.buttonsResponseMessage).selectedDisplayText) || txt(obj(mensagem.listResponseMessage).title);
  if (botao) return botao;
  const chave = tipo || Object.keys(mensagem).find((k) => k.endsWith('Message')) || '';
  if (!chave || chave === 'reactionMessage' || chave === 'protocolMessage') return '';
  const midia = obj(mensagem[chave]);
  return descreverMidia(chave, txt(midia.caption), txt(midia.fileName));
}

function nomeDoEvento(v: unknown): string {
  return txt(v).toLowerCase().replace(/_/g, '.');
}

export function eventosDaEvolution(corpo: unknown): EventoWa[] {
  const c = obj(corpo);
  const evento = nomeDoEvento(c.event);
  const eventos: EventoWa[] = [];
  if (evento === 'messages.upsert') {
    lista(c.data).forEach((raw) => {
      const d = obj(raw);
      const chave = obj(d.key);
      // Contas com o identificador novo (@lid) trazem o número em outro campo.
      const numero = numeroDoJid(txt(chave.remoteJid)) || numeroDoJid(txt(chave.remoteJidAlt)) || numeroDoJid(txt(chave.senderPn)) || numeroDoJid(txt(d.senderPn));
      const id = txt(chave.id);
      const texto = textoEvolution(obj(d.message), txt(d.messageType));
      if (!numero || !id || !texto) return;
      const nome = txt(d.pushName);
      eventos.push({ tipo: 'mensagem', numero, texto, idExterno: id, em: quando(d.messageTimestamp), deMim: chave.fromMe === true, ...(nome && chave.fromMe !== true ? { nome } : {}) });
    });
  } else if (evento === 'messages.update' || evento === 'send.message') {
    lista(c.data).forEach((raw) => {
      const d = obj(raw);
      const id = txt(d.keyId) || txt(obj(d.key).id) || txt(d.messageId) || txt(d.id);
      const status = statusEvolution(d.status ?? obj(d.update).status);
      if (!id || !status) return;
      eventos.push({ tipo: 'status', idExterno: id, status, em: quando(d.dateTime ?? d.messageTimestamp) });
    });
  }
  return eventos;
}

// ---------- WAHA ----------

function statusWaha(ack: unknown, nome: unknown): StatusMensagemWa | undefined {
  const n = txt(nome).toUpperCase();
  if (n === 'SERVER') return 'enviada';
  if (n === 'DEVICE') return 'entregue';
  if (n === 'READ' || n === 'PLAYED') return 'lida';
  if (n === 'ERROR') return 'falhou';
  const v = Number(ack);
  if (v === 1) return 'enviada';
  if (v === 2) return 'entregue';
  if (v === 3 || v === 4) return 'lida';
  if (v === -1) return 'falhou';
  return undefined;
}

/** O id da WAHA pode vir como texto ou como objeto `{ _serialized }` (motor WEBJS). */
export function idDaWaha(v: unknown): string {
  return typeof v === 'string' ? v : txt(obj(v)._serialized) || txt(obj(v).id);
}

export function eventosDoWaha(corpo: unknown): EventoWa[] {
  const c = obj(corpo);
  const evento = txt(c.event);
  const p = obj(c.payload);
  const id = idDaWaha(p.id);
  if (!id) return [];
  if (evento === 'message.ack') {
    const status = statusWaha(p.ack, p.ackName);
    return status ? [{ tipo: 'status', idExterno: id, status, em: quando(p.timestamp) }] : [];
  }
  if (evento === 'message' || evento === 'message.any') {
    const deMim = p.fromMe === true;
    const numero = numeroDoJid(txt(deMim ? p.to : p.from));
    const corpoTexto = txt(p.body);
    const texto = corpoTexto || (p.hasMedia === true ? descreverMidia(txt(obj(p.media).mimetype).split('/')[0] === 'image' ? 'image' : 'document', '') : '');
    if (!numero || !texto) return [];
    const nome = txt(obj(p._data).notifyName);
    return [{ tipo: 'mensagem', numero, texto, idExterno: id, em: quando(p.timestamp), deMim, ...(nome && !deMim ? { nome } : {}) }];
  }
  return [];
}

// ---------- Formato do Iris (o fluxo do n8n manda assim) ----------

const STATUS_IRIS = new Set<StatusMensagemWa>(['enviada', 'entregue', 'lida', 'falhou']);

/**
 * `{ eventos: [...] }` ou um evento solto:
 * `{ tipo: "mensagem", numero, texto, idExterno, em?, deMim?, nome? }` ou
 * `{ tipo: "status", idExterno, status: "enviada|entregue|lida|falhou", erro? }`.
 * Sem `idExterno` numa mensagem, o Iris cria um a partir do conteúdo (para repetir não duplicar).
 */
export function eventosDoIris(corpo: unknown): EventoWa[] {
  const c = obj(corpo);
  const itens = Array.isArray(c.eventos) ? c.eventos : [c];
  const eventos: EventoWa[] = [];
  itens.forEach((raw) => {
    const e = obj(raw);
    const tipo = txt(e.tipo);
    if (tipo === 'status') {
      const status = txt(e.status) as StatusMensagemWa;
      const id = txt(e.idExterno);
      if (id && STATUS_IRIS.has(status)) eventos.push({ tipo: 'status', idExterno: id, status, em: quando(e.em), ...(txt(e.erro) ? { erro: txt(e.erro).slice(0, 500) } : {}) });
      return;
    }
    const numero = soDigitos(txt(e.numero));
    const texto = txt(e.texto);
    if (numero.length < 10 || !texto) return;
    const em = quando(e.em);
    const id = txt(e.idExterno) || `iris-${numero}-${em}-${texto.length}`;
    const nome = txt(e.nome);
    eventos.push({ tipo: 'mensagem', numero, texto, idExterno: id, em, deMim: e.deMim === true, ...(nome ? { nome: nome.slice(0, 120) } : {}) });
  });
  return eventos;
}

export type OrigemEventoWa = 'meta' | 'evolution' | 'waha' | 'iris';

export function traduzirEventos(origem: OrigemEventoWa, corpo: unknown): EventoWa[] {
  if (origem === 'meta') return eventosDaMeta(corpo);
  if (origem === 'evolution') return eventosDaEvolution(corpo);
  if (origem === 'waha') return eventosDoWaha(corpo);
  return eventosDoIris(corpo);
}

export function isOrigemEventoWa(v: unknown): v is OrigemEventoWa {
  return v === 'meta' || v === 'evolution' || v === 'waha' || v === 'iris';
}
