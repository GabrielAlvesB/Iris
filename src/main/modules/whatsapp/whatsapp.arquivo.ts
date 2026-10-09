import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import { soDigitos } from '../../../shared/types/brasil';
import {
  CAMINHO_ENVIO_N8N_PADRAO,
  LIMITE_TEXTO_WA,
  STATUS_MENSAGEM_WA,
  VERSAO_API_META_PADRAO,
  isProvedorWa,
  type DestinoLote,
  type LoteWa,
  type MensagemWa,
  type ModeloMetaWa,
  type ModeloWa,
  type SituacaoDestino,
  type StatusMensagemWa,
  type WhatsappConfig,
  type WhatsappFile,
} from '../../../shared/types/whatsapp.types';
import { isRef } from '../contatos/contatos.arquivo';

/**
 * Leitura e gravação de whatsapp.json. Tudo que entra — do disco, da tela, de
 * um webhook ou de um backup — passa por estas funções.
 *
 * O texto de uma mensagem nunca é aparado nem reescrito: é o que saiu (ou
 * chegou), byte a byte. Só a quebra de linha do Windows vira "\n", como o
 * WhatsApp guarda.
 */

export const FILE_NAME = 'whatsapp.json';
export const SCHEMA_VERSION = 1;
/** Conversas inteiras ficam; o teto só evita um arquivo que o app não consiga mais abrir. */
const MAX_MENSAGENS = 50_000;
const MAX_LOTES = 200;

export function nowIso(): string {
  return new Date().toISOString();
}

function texto(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Mensagem: sem trim — espaço e quebra de linha no começo ou no fim fazem parte do que foi escrito. */
export function textoExato(v: unknown, max = LIMITE_TEXTO_WA): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').slice(0, max) : '';
}

function idValido(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : randomUUID();
}

function iso(v: unknown, padrao: string): string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : padrao;
}

function inteiro(v: unknown, min: number, max: number, padrao: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao;
}

function hora(v: unknown, padrao: string): string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : padrao;
}

/** Sem barra no fim; só http(s). */
export function normalizarBaseUrl(v: unknown): string {
  const t = texto(v, 300).replace(/\/+$/, '');
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : '';
}

// ---------- Configuração ----------

export function migrateConfig(raw: unknown): WhatsappConfig {
  const c = (raw ?? {}) as Partial<WhatsappConfig>;
  const meta = (c.meta ?? {}) as Partial<WhatsappConfig['meta']>;
  const evolution = (c.evolution ?? {}) as Partial<WhatsappConfig['evolution']>;
  const waha = (c.waha ?? {}) as Partial<WhatsappConfig['waha']>;
  const n8n = (c.n8n ?? {}) as Partial<WhatsappConfig['n8n']>;
  const envio = (c.envio ?? {}) as Partial<WhatsappConfig['envio']>;
  const min = inteiro(envio.intervaloMinSeg, 5, 3600, 30);
  const max = inteiro(envio.intervaloMaxSeg, 5, 7200, 90);
  const de = hora(envio.horarioDe, '08:00');
  const ate = hora(envio.horarioAte, '20:00');
  return {
    provedor: isProvedorWa(c.provedor) ? c.provedor : 'link',
    meta: {
      phoneNumberId: soDigitos(texto(meta.phoneNumberId, 40)),
      wabaId: soDigitos(texto(meta.wabaId, 40)),
      versaoApi: /^v\d{1,3}\.\d$/.test(texto(meta.versaoApi, 10)) ? texto(meta.versaoApi, 10) : VERSAO_API_META_PADRAO,
    },
    evolution: { baseUrl: normalizarBaseUrl(evolution.baseUrl), instancia: texto(evolution.instancia, 120) },
    waha: { baseUrl: normalizarBaseUrl(waha.baseUrl), sessao: texto(waha.sessao, 120) || 'default' },
    n8n: { caminhoEnviar: texto(n8n.caminhoEnviar, 120).replace(/^\/+|\/+$/g, '') || CAMINHO_ENVIO_N8N_PADRAO },
    link: { abrirEm: (c.link as Partial<WhatsappConfig['link']> | undefined)?.abrirEm === 'web' ? 'web' : 'app' },
    envio: {
      // Mínimo maior que o máximo: os dois se trocam em vez de travar o lote.
      intervaloMinSeg: Math.min(min, max),
      intervaloMaxSeg: Math.max(min, max),
      limiteDiario: inteiro(envio.limiteDiario, 1, 10_000, 200),
      horarioDe: de < ate ? de : '08:00',
      horarioAte: de < ate ? ate : '20:00',
    },
    permitirTlsInseguro: c.permitirTlsInseguro === true,
    notificar: c.notificar !== false,
  };
}

// ---------- Modelos ----------

export function migrateMeta(raw: unknown): ModeloMetaWa | undefined {
  const c = (raw ?? {}) as Partial<ModeloMetaWa>;
  const nome = texto(c.nome, 512);
  if (!nome || !/^[a-z0-9_]+$/.test(nome)) return undefined;
  return {
    nome,
    idioma: /^[a-z]{2,3}(_[A-Z]{2})?$/.test(texto(c.idioma, 10)) ? texto(c.idioma, 10) : 'pt_BR',
    corpo: textoExato(c.corpo, 1024),
    variaveis: Array.isArray(c.variaveis) ? c.variaveis.map((v) => textoExato(v, 500)).slice(0, 20) : [],
  };
}

export function migrateModelo(raw: unknown): ModeloWa | null {
  const c = (raw ?? {}) as Partial<ModeloWa>;
  const nome = texto(c.nome, 120);
  if (!nome) return null;
  const agora = nowIso();
  const meta = migrateMeta(c.metaTemplate);
  return {
    id: idValido(c.id),
    nome,
    texto: textoExato(c.texto),
    ...(meta ? { metaTemplate: meta } : {}),
    criadoEm: iso(c.criadoEm, agora),
    atualizadoEm: iso(c.atualizadoEm, agora),
  };
}

// ---------- Mensagens ----------

const STATUS_VALIDOS = new Set<string>(STATUS_MENSAGEM_WA.map((s) => s.id));

export function migrateMensagem(raw: unknown): MensagemWa | null {
  const c = (raw ?? {}) as Partial<MensagemWa>;
  const numero = soDigitos(texto(c.numero, 30));
  const corpo = textoExato(c.texto);
  if (numero.length < 8 || !corpo) return null;
  const direcao = c.direcao === 'entrada' ? 'entrada' : 'saida';
  const agora = nowIso();
  const criadaEm = iso(c.criadaEm, agora);
  const modelo = (c.modelo ?? {}) as Partial<NonNullable<MensagemWa['modelo']>>;
  // "enviando" fica como está aqui (a leitura acontece no meio de um envio); quem fechou
  // o app no meio é tratado uma vez na abertura (recuperarInterrompidas).
  const statusLido = STATUS_VALIDOS.has(c.status as string) ? (c.status as StatusMensagemWa) : direcao === 'entrada' ? 'recebida' : 'falhou';
  return {
    id: idValido(c.id),
    ...(isRef(c.contato) ? { contato: { tipo: c.contato.tipo, id: c.contato.id } } : {}),
    numero,
    direcao,
    texto: corpo,
    provedor: isProvedorWa(c.provedor) ? c.provedor : 'link',
    status: direcao === 'entrada' ? 'recebida' : statusLido === 'recebida' ? 'enviada' : statusLido,
    ...(texto(c.idExterno, 200) ? { idExterno: texto(c.idExterno, 200) } : {}),
    ...(texto(modelo.id, 120) && texto(modelo.nome, 120)
      ? { modelo: { id: texto(modelo.id, 120), nome: texto(modelo.nome, 120), ...(texto(modelo.template, 512) ? { template: texto(modelo.template, 512) } : {}) } }
      : {}),
    ...(texto(c.erro, 500) ? { erro: texto(c.erro, 500) } : {}),
    ...(texto(c.loteId, 120) ? { loteId: texto(c.loteId, 120) } : {}),
    ...(direcao === 'entrada' && texto(c.nomePerfil, 120) ? { nomePerfil: texto(c.nomePerfil, 120) } : {}),
    vista: direcao === 'saida' ? true : c.vista === true,
    criadaEm,
    statusEm: iso(c.statusEm, criadaEm),
  };
}

// ---------- Lotes ----------

const SITUACOES_DESTINO = new Set<SituacaoDestino>(['pendente', 'enviado', 'falhou', 'pulado']);

function migrateDestino(raw: unknown): DestinoLote | null {
  const c = (raw ?? {}) as Partial<DestinoLote>;
  if (!isRef(c.contato)) return null;
  return {
    contato: { tipo: c.contato.tipo, id: c.contato.id },
    nome: texto(c.nome, 200) || 'Contato',
    numero: soDigitos(texto(c.numero, 30)),
    situacao: SITUACOES_DESTINO.has(c.situacao as SituacaoDestino) ? (c.situacao as SituacaoDestino) : 'pendente',
    ...(texto(c.mensagemId, 120) ? { mensagemId: texto(c.mensagemId, 120) } : {}),
    ...(texto(c.motivo, 300) ? { motivo: texto(c.motivo, 300) } : {}),
  };
}

export function migrateLote(raw: unknown): LoteWa | null {
  const c = (raw ?? {}) as Partial<LoteWa>;
  const corpo = textoExato(c.texto);
  const meta = migrateMeta(c.metaTemplate);
  if (!corpo && !meta) return null;
  const agora = nowIso();
  const destinos = Array.isArray(c.destinos) ? c.destinos.map(migrateDestino).filter((d): d is DestinoLote => d !== null).slice(0, 5000) : [];
  const situacao = c.situacao === 'pausado' || c.situacao === 'concluido' || c.situacao === 'cancelado' ? c.situacao : 'rodando';
  const modelo = (c.modelo ?? {}) as Partial<NonNullable<LoteWa['modelo']>>;
  return {
    id: idValido(c.id),
    nome: texto(c.nome, 120) || 'Envio para vários',
    texto: corpo,
    ...(texto(modelo.id, 120) ? { modelo: { id: texto(modelo.id, 120), nome: texto(modelo.nome, 120) } } : {}),
    ...(meta ? { metaTemplate: meta } : {}),
    provedor: isProvedorWa(c.provedor) && c.provedor !== 'link' ? c.provedor : 'evolution',
    destinos,
    // Todos tratados = concluído, mesmo que o arquivo diga outra coisa.
    situacao: situacao === 'rodando' && destinos.every((d) => d.situacao !== 'pendente') ? 'concluido' : situacao,
    criadoEm: iso(c.criadoEm, agora),
    atualizadoEm: iso(c.atualizadoEm, agora),
    ...(typeof c.proximoEnvioEm === 'number' && Number.isFinite(c.proximoEnvioEm) ? { proximoEnvioEm: c.proximoEnvioEm } : {}),
  };
}

// ---------- Arquivo ----------

function createDefaultFile(): WhatsappFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), config: migrateConfig({}), mensagens: [], modelos: [], lotes: [], idsRecebidos: [] };
}

function semDuplicar<T extends { id: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((x) => !vistos.has(x.id) && vistos.add(x.id));
}

export function migrate(raw: unknown): WhatsappFile {
  const c = (raw ?? {}) as Partial<WhatsappFile>;
  const mensagens = Array.isArray(c.mensagens) ? semDuplicar(c.mensagens.map(migrateMensagem).filter((m): m is MensagemWa => m !== null)).slice(-MAX_MENSAGENS) : [];
  const ids = Array.isArray(c.idsRecebidos) ? c.idsRecebidos.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 200) : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : nowIso(),
    config: migrateConfig(c.config),
    mensagens,
    modelos: Array.isArray(c.modelos) ? semDuplicar(c.modelos.map(migrateModelo).filter((m): m is ModeloWa => m !== null)) : [],
    lotes: Array.isArray(c.lotes) ? semDuplicar(c.lotes.map(migrateLote).filter((l): l is LoteWa => l !== null)).slice(-MAX_LOTES) : [],
    idsRecebidos: ids.slice(-500),
  };
}

export function loadFile(): WhatsappFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

export async function saveFile(file: WhatsappFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}
