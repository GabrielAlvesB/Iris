import { randomUUID, timingSafeEqual } from 'node:crypto';
import { BrowserWindow, Notification } from 'electron';
import { broadcast } from '../../core/broadcast';
import { isFalha, request } from '../../core/httpClient';
import * as secretStore from '../../storage/secretStore';
import { acharContato, nomeDoContato, type RefContato } from '../../../shared/types/contatos.types';
import { mesmoIdExterno, traduzirEventos, type EventoWa, type OrigemEventoWa } from '../../../shared/types/whatsapp.eventos';
import { contatoDoNumero, formatarNumeroWa, mesmoNumeroWa, numeroWhatsapp, telefonesWhatsappDe } from '../../../shared/types/whatsapp.numero';
import { statusSeguinte, type MensagemWa, type ProvedorWa } from '../../../shared/types/whatsapp.types';
import { isRef, loadFile as loadContatos } from '../contatos/contatos.arquivo';
import { SEGREDO_CHAVE_IRIS } from '../contatos/contatos.leads';
import { loadFile, nowIso, saveFile, textoExato } from './whatsapp.arquivo';
import { ADAPTADORES } from './provedores';
import { SEGREDO_WEBHOOK, avisarMudanca, contextoDo, faltaNo } from './whatsapp.service';
import { iconeDoApp } from '../../core/icone';

/**
 * Tudo o que chega — webhook no servidor local, caixa na nuvem, n8n, ou a
 * sincronização ao abrir a conversa — termina em `receberEventos`: mesma
 * deduplicação, mesmo casamento de número, mesmo aviso.
 */

const PROVEDOR_DA_ORIGEM: Record<OrigemEventoWa, ProvedorWa> = { meta: 'meta', evolution: 'evolution', waha: 'waha', iris: 'n8n' };
/** Eco de uma mensagem que o Iris acabou de mandar: mesma conversa, mesmo texto, poucos minutos. */
const JANELA_ECO_MS = 5 * 60_000;

/** A chave que vem no caminho do webhook confere com a do cofre? (comparação em tempo constante) */
export function chaveWebhookConfere(recebida: string): boolean {
  const esperada = secretStore.getSecret(SEGREDO_WEBHOOK);
  if (!esperada || !recebida) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ResultadoRecebimento {
  novas: number;
  status: number;
}

/**
 * Uma leitura e uma gravação por lote, sem `await` entre elas (a regra de
 * receberLeads): duas chegadas juntas não se atropelam.
 */
export async function receberEventos(origem: OrigemEventoWa, eventos: EventoWa[], opcoes: { silencioso?: boolean } = {}): Promise<ResultadoRecebimento> {
  if (!eventos.length) return { novas: 0, status: 0 };
  const file = loadFile();
  const contatos = loadContatos();
  const jaRecebidos = new Set(file.idsRecebidos);
  const chegaram: MensagemWa[] = [];
  let status = 0;
  let mudou = false;
  const provedor = PROVEDOR_DA_ORIGEM[origem];

  eventos.forEach((e) => {
    if (e.tipo === 'status') {
      const m = file.mensagens.find((x) => x.direcao === 'saida' && x.idExterno && mesmoIdExterno(x.idExterno, e.idExterno));
      if (!m) return;
      const novo = statusSeguinte(m.status, e.status);
      if (novo === m.status && !(e.erro && novo === 'falhou' && m.erro !== e.erro)) return;
      m.status = novo;
      if (novo === 'falhou' && e.erro) m.erro = e.erro;
      m.statusEm = nowIso();
      status += 1;
      mudou = true;
      return;
    }

    const chaveId = `${e.deMim ? 's' : 'e'}:${e.idExterno}`;
    if (jaRecebidos.has(chaveId) || file.mensagens.some((x) => x.idExterno && mesmoIdExterno(x.idExterno, e.idExterno))) {
      // Eco do que o Iris enviou chegando depois da resposta: já está gravado, só confirma "enviada".
      const m = file.mensagens.find((x) => x.idExterno && mesmoIdExterno(x.idExterno, e.idExterno) && x.direcao === 'saida');
      if (m && e.deMim && m.status !== statusSeguinte(m.status, 'enviada')) {
        m.status = statusSeguinte(m.status, 'enviada');
        m.statusEm = nowIso();
        mudou = true;
      }
      return;
    }
    jaRecebidos.add(chaveId);
    file.idsRecebidos.push(chaveId);
    mudou = true;

    if (e.deMim) {
      // O eco pode chegar antes da resposta do envio (sem idExterno ainda): casa pelo número e pelo texto.
      const eco = file.mensagens.find(
        (x) => x.direcao === 'saida' && !x.idExterno && x.texto === e.texto && mesmoNumeroWa(x.numero, e.numero) && Math.abs(Date.parse(x.criadaEm) - Date.parse(e.em)) < JANELA_ECO_MS,
      );
      if (eco) {
        eco.idExterno = e.idExterno;
        eco.status = statusSeguinte(eco.status, 'enviada');
        eco.statusEm = nowIso();
        return;
      }
    }

    const ref = contatoDoNumero(contatos, e.numero);
    const m: MensagemWa = {
      id: randomUUID(),
      ...(ref ? { contato: ref } : {}),
      numero: e.numero,
      direcao: e.deMim ? 'saida' : 'entrada',
      texto: textoExato(e.texto),
      provedor,
      // Mandada pelo celular (fora do Iris): entra na conversa como enviada.
      status: e.deMim ? 'enviada' : 'recebida',
      idExterno: e.idExterno,
      ...(!e.deMim && e.nome ? { nomePerfil: e.nome.slice(0, 120) } : {}),
      vista: e.deMim || opcoes.silencioso === true,
      criadaEm: e.em,
      statusEm: e.em,
    };
    file.mensagens.push(m);
    if (!e.deMim) chegaram.push(m);
  });

  if (!mudou) return { novas: 0, status: 0 };
  file.idsRecebidos = file.idsRecebidos.slice(-500);
  file.mensagens.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
  await saveFile(file);
  const unico = chegaram.length ? chegaram[chegaram.length - 1]!.contato : undefined;
  avisarMudanca(file, unico);
  if (chegaram.length && file.config.notificar && !opcoes.silencioso) notificar(chegaram);
  return { novas: chegaram.length, status };
}

export function receberCorpo(origem: OrigemEventoWa, corpo: unknown): Promise<ResultadoRecebimento> {
  return receberEventos(origem, traduzirEventos(origem, corpo));
}

// ---------- Aviso do Windows ----------

const notificacoesVivas = new Set<Notification>();

function focarJanela(): void {
  const janela = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

function mostrar(titulo: string, corpo: string, ref?: RefContato, numero?: string): void {
  // Sem referência viva, o coletor de lixo leva a notificação e o clique se perde.
  const n = new Notification({ title: titulo, body: corpo, icon: iconeDoApp() });
  notificacoesVivas.add(n);
  const soltar = (): void => {
    notificacoesVivas.delete(n);
  };
  n.on('click', () => {
    soltar();
    focarJanela();
    broadcast('whatsapp:abrir', { ...(ref ? { ref } : {}), ...(numero ? { numero } : {}) });
  });
  n.on('close', soltar);
  n.show();
  setTimeout(soltar, 10 * 60_000);
}

function notificar(chegaram: MensagemWa[]): void {
  try {
    if (!Notification.isSupported()) return;
    const contatos = loadContatos();
    const quem = (m: MensagemWa): string => {
      const c = m.contato ? acharContato(contatos, m.contato) : undefined;
      return c ? nomeDoContato(c) : m.nomePerfil ? `${m.nomePerfil} (${formatarNumeroWa(m.numero)})` : formatarNumeroWa(m.numero);
    };
    const conversas = new Set(chegaram.map((m) => m.numero));
    if (conversas.size > 3) {
      mostrar(`${chegaram.length} mensagens no WhatsApp`, `De ${conversas.size} conversas — abra o WhatsApp do Iris`);
      return;
    }
    [...conversas].forEach((numero) => {
      const daqui = chegaram.filter((m) => m.numero === numero);
      const ultima = daqui[daqui.length - 1]!;
      const corpo = daqui.length > 1 ? `${daqui.length} mensagens · ${ultima.texto}` : ultima.texto;
      mostrar(`WhatsApp: ${quem(ultima)}`, corpo.slice(0, 180), ultima.contato, ultima.contato ? undefined : ultima.numero);
    });
  } catch (erro) {
    // Aviso é extra: falhar aqui não desfaz o que já foi gravado.
    console.error('[whatsapp] notificação falhou', erro);
  }
}

// ---------- Caixa na nuvem ----------

interface EventoDaCaixa {
  id: string;
  origem: OrigemEventoWa;
  corpo: unknown;
}

let desdeNuvem = 0;
let buscando: Promise<void> | null = null;

function lerJson(corpo: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(corpo) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Esvazia a parte do WhatsApp da caixa na nuvem (o mesmo Worker dos leads).
 * Roda junto da busca de leads; um Worker antigo, sem a rota, responde 404 e
 * a busca para em silêncio até a pessoa colar o código novo.
 */
async function buscarUmaVez(signal?: AbortSignal): Promise<void> {
  const url = loadContatos().leadsConfig.nuvem.url;
  const chave = secretStore.getSecret(SEGREDO_CHAVE_IRIS);
  if (!url || !chave) return;
  const cabecalhos = { Authorization: `Bearer ${chave}` };
  for (let rodada = 0; rodada < 5; rodada += 1) {
    const desde = rodada > 0 ? 0 : desdeNuvem;
    const r = await request(`${url}/v1/whatsapp${desde ? `?desde=${desde}` : ''}`, { headers: cabecalhos, signal, timeoutMs: 15_000 });
    if (isFalha(r) || !r.ok) return;
    const corpo = lerJson(r.body);
    if (!corpo || corpo.ok !== true || !Array.isArray(corpo.eventos)) return;
    const itens = (corpo.eventos as unknown[])
      .map((x) => (x ?? {}) as Partial<EventoDaCaixa>)
      .filter((x): x is EventoDaCaixa => typeof x.id === 'string' && x.id.length < 160 && (x.origem === 'meta' || x.origem === 'evolution' || x.origem === 'waha' || x.origem === 'iris'));
    for (const item of itens) await receberCorpo(item.origem, item.corpo);
    let confirmou = true;
    if (itens.length) {
      const c = await request(`${url}/v1/whatsapp/confirmar`, {
        method: 'POST',
        headers: { ...cabecalhos, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: itens.map((i) => i.id) }),
        signal,
        timeoutMs: 15_000,
      });
      confirmou = !isFalha(c) && c.ok;
    }
    desdeNuvem = confirmou && typeof corpo.agora === 'number' ? corpo.agora : 0;
    if (corpo.mais !== true) break;
  }
}

export function buscarNuvem(signal?: AbortSignal): Promise<void> {
  if (!buscando) {
    buscando = buscarUmaVez(signal)
      .catch((erro: unknown) => console.error('[whatsapp] busca na nuvem', erro))
      .finally(() => {
        buscando = null;
      });
  }
  return buscando;
}

// ---------- Sincronizar ao abrir a conversa ----------

/**
 * Evolution e WAHA guardam a conversa: ao abrir, o Iris busca as últimas e
 * completa o que chegou com o PC desligado ou sem webhook. Nunca lança —
 * é um extra; sem conexão, a conversa mostra o que já tinha.
 */
export async function sincronizarConversa(ref: unknown): Promise<{ novas: number; erro?: string }> {
  if (!isRef(ref)) return { novas: 0 };
  const file = loadFile();
  const provedor = file.config.provedor;
  if ((provedor !== 'evolution' && provedor !== 'waha') || faltaNo(provedor, file)) return { novas: 0 };
  const c = acharContato(loadContatos(), ref);
  if (!c) return { novas: 0 };
  const numeros = new Set(telefonesWhatsappDe(c).map((t) => numeroWhatsapp(t.numero)).filter((n): n is string => Boolean(n)));
  let novas = 0;
  try {
    for (const n of numeros) {
      const eventos = await ADAPTADORES[provedor].buscarConversa!(contextoDo(provedor), n, 50);
      // Quem está abrindo a conversa já está vendo: o que vier entra visto e sem aviso.
      novas += (await receberEventos(provedor, eventos, { silencioso: true })).novas;
    }
    return { novas };
  } catch (erro) {
    return { novas, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
