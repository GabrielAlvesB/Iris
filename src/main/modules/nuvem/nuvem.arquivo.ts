import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from '../../storage/jsonStore';
import { getSecret, hasSecret } from '../../storage/secretStore';
import {
  MAX_CONFLITOS_GUARDADOS,
  MAX_NOME_DISPOSITIVO,
  type ConflitoNuvem,
  type NuvemFile,
  type ProvedorNuvem,
} from '../../../shared/types/nuvem.types';
import type { BaseNuvem } from '../../../shared/types/nuvem.sync';
import type { AdaptadorNuvem } from './provedores/comum';
import { criarSupabase } from './provedores/supabase';

/**
 * Os dois arquivos da Nuvem, ambos deste computador e FORA do backup (como
 * backup-auto.json): restaurar um backup de outra máquina não pode trocar a
 * identidade desta nem fingir que ela já sincronizou.
 *
 * - `nuvem.json`: quem é este dispositivo, a qual espaço pertence e a conexão
 *   (sem a chave, que fica no cofre).
 * - `nuvem-base.json`: o hash de cada registro na última sincronização. É o
 *   terceiro lado da comparação — sem ele não dá para saber quem mudou.
 */

const FILE_NAME = 'nuvem.json';
const BASE_FILE = 'nuvem-base.json';
const SCHEMA_VERSION = 1;
/** Um espaço só por padrão: quem conecta dois computadores ao mesmo banco já vê os mesmos dados. */
export const ESPACO_PADRAO = 'principal';
export const ESPACO_VALIDO = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const SEGREDO_SUPABASE = 'nuvem.supabase.chave';

function nomeDaMaquina(): string {
  return (os.hostname() || 'Este computador').slice(0, MAX_NOME_DISPOSITIVO);
}

function createDefaultFile(): NuvemFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    dispositivo: { id: randomUUID(), nome: nomeDaMaquina() },
    espaco: ESPACO_PADRAO,
    provedor: '',
    supabase: { url: '' },
    conectado: false,
    principal: true,
    rev: 0,
    ultimaSyncEm: '',
    ultimoErro: '',
    conflitos: [],
  };
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function migrarConflito(raw: unknown): ConflitoNuvem | null {
  const r = objeto(raw);
  if (Number.isNaN(Date.parse(texto(r.quando)))) return null;
  return {
    quando: texto(r.quando),
    modulo: texto(r.modulo),
    item: texto(r.item),
    venceu: r.venceu === 'local' ? 'local' : 'remoto',
    dispositivo: texto(r.dispositivo),
  };
}

function migrate(raw: unknown): NuvemFile {
  const r = objeto(raw);
  const d = objeto(r.dispositivo);
  const espaco = texto(r.espaco).toLowerCase();
  const provedor: ProvedorNuvem | '' = r.provedor === 'supabase' ? 'supabase' : '';
  const rev = typeof r.rev === 'number' && Number.isFinite(r.rev) && r.rev > 0 ? Math.floor(r.rev) : 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    dispositivo: {
      // O id nunca muda depois de criado: é por ele que a nuvem sabe de quem veio cada mudança.
      id: texto(d.id) || randomUUID(),
      nome: texto(d.nome).trim().slice(0, MAX_NOME_DISPOSITIVO) || nomeDaMaquina(),
    },
    espaco: ESPACO_VALIDO.test(espaco) ? espaco : ESPACO_PADRAO,
    provedor,
    supabase: { url: texto(objeto(r.supabase).url) },
    conectado: r.conectado === true && provedor !== '',
    principal: r.principal !== false,
    rev,
    ultimaSyncEm: Number.isNaN(Date.parse(texto(r.ultimaSyncEm))) ? '' : texto(r.ultimaSyncEm),
    ultimoErro: texto(r.ultimoErro),
    conflitos: (Array.isArray(r.conflitos) ? r.conflitos : [])
      .map(migrarConflito)
      .filter((c): c is ConflitoNuvem => c !== null)
      .slice(0, MAX_CONFLITOS_GUARDADOS),
  };
}

/**
 * Um arquivo mexido à mão, sem id, ganharia um id novo a cada leitura (a `migrate`
 * cria um). O primeiro id lido vale pela sessão e vai para o disco na próxima gravação.
 */
let idDaSessao: string | null = null;

export function loadFile(): NuvemFile {
  const f = readStore(FILE_NAME, createDefaultFile, migrate);
  idDaSessao ??= f.dispositivo.id;
  f.dispositivo.id = idDaSessao;
  return f;
}

export function saveFile(f: NuvemFile): Promise<void> {
  return writeStore(FILE_NAME, f);
}

/**
 * Este computador pode fazer as tarefas que não podem rodar em dobro? Fora de um espaço, sempre
 * (é o único). Usado pelas tarefas de leads e do WhatsApp; nunca lança, para não derrubar a tarefa.
 */
export function ehPrincipal(): boolean {
  try {
    const f = loadFile();
    return !f.conectado || f.principal;
  } catch {
    return true;
  }
}

// ---------- A base ----------

interface BaseFile {
  schemaVersion: number;
  /** De qual banco e espaço é esta base: trocou um dos dois, ela não vale mais. */
  de: string;
  arquivos: Record<string, BaseNuvem>;
}

/** Identifica o destino: a base de um banco não serve para outro. */
export function destinoDe(f: NuvemFile): string {
  return `${f.provedor}|${f.supabase.url}|${f.espaco}`;
}

function migrarBase(raw: unknown): BaseFile {
  const r = objeto(raw);
  const arquivos: Record<string, BaseNuvem> = {};
  for (const [chave, valor] of Object.entries(objeto(r.arquivos))) {
    const base: BaseNuvem = {};
    for (const [k, h] of Object.entries(objeto(valor))) if (typeof h === 'string') base[k] = h;
    arquivos[chave] = base;
  }
  return { schemaVersion: SCHEMA_VERSION, de: texto(r.de), arquivos };
}

/** A base do destino atual; vazia se ela é de outro banco ou espaço. */
export function loadBase(f: NuvemFile): Record<string, BaseNuvem> {
  const b = readStore(BASE_FILE, () => ({ schemaVersion: SCHEMA_VERSION, de: '', arquivos: {} }), migrarBase);
  return b.de === destinoDe(f) ? b.arquivos : {};
}

export function saveBase(f: NuvemFile, arquivos: Record<string, BaseNuvem>): Promise<void> {
  const b: BaseFile = { schemaVersion: SCHEMA_VERSION, de: destinoDe(f), arquivos };
  return writeStore(BASE_FILE, b);
}

// ---------- O adaptador do serviço configurado ----------

/** O que falta para conectar; '' = nada. */
export function oQueFalta(f: NuvemFile): string {
  if (f.provedor !== 'supabase') return 'Escolha o serviço e preencha a conexão.';
  if (!f.supabase.url) return 'Falta o endereço do projeto do Supabase.';
  if (!hasSecret(SEGREDO_SUPABASE)) return 'Falta a chave secreta do Supabase.';
  return '';
}

export function criarAdaptador(f: NuvemFile): AdaptadorNuvem {
  const falta = oQueFalta(f);
  if (falta) throw new Error(falta);
  const chave = getSecret(SEGREDO_SUPABASE);
  if (!chave) throw new Error('A chave do Supabase não pôde ser lida do cofre. Cole de novo em Nuvem › Conexão.');
  return criarSupabase(f.supabase.url, chave);
}
