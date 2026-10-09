import { readStore, writeStore } from '../../storage/jsonStore';
import { isEncryptionAvailable } from '../../storage/secretStore';
import {
  isFormatoAssinatura,
  isTema,
  type AjustesFile,
  type AjustesInfo,
  type AssinaturaRelatorio,
  type ModuloInicial,
  type PerfilUsuario,
  type Tema,
} from '../../../shared/types/ajustes.types';
import { MAX_TROCAS_ATALHOS, isIdAtalho, normalizarCombo } from '../../../shared/types/atalhos.types';
import { enderecoVazio, formatarDocumento, formatarTelefone, lerEndereco } from '../../../shared/types/brasil';
import { MODULO_PADRAO, isModuloId } from '../../../shared/types/modulos.types';

const FILE_NAME = 'ajustes.json';
const SCHEMA_VERSION = 5;

/** Ids de módulo que mudaram de nome: o módulo inicial salvo acompanha. */
const MODULOS_RENOMEADOS: Record<string, ModuloInicial> = { videos: 'postagens' };

const MAX_LINHAS_ASSINATURA = 4;

function nowIso(): string {
  return new Date().toISOString();
}

function assinaturaPadrao(): AssinaturaRelatorio {
  return { nome: '', linhas: [], formato: 'com-linha', mostrarData: true };
}

function perfilPadrao(): PerfilUsuario {
  return {
    tipo: 'pf',
    nome: '',
    nomeFantasia: '',
    documento: '',
    representante: '',
    representanteCpf: '',
    email: '',
    telefone: '',
    endereco: enderecoVazio(),
    cidadeForo: '',
  };
}

function createDefaultFile(): AjustesFile {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: nowIso(), moduloInicial: MODULO_PADRAO, assinatura: assinaturaPadrao(), perfil: perfilPadrao(), atalhos: {}, tema: 'escuro' };
}

function texto(v: unknown, max = 160): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function migratePerfil(raw: unknown): PerfilUsuario {
  const c = (raw ?? {}) as Partial<PerfilUsuario>;
  return {
    tipo: c.tipo === 'pj' ? 'pj' : 'pf',
    nome: texto(c.nome),
    nomeFantasia: texto(c.nomeFantasia),
    documento: formatarDocumento(texto(c.documento, 24)),
    representante: texto(c.representante),
    representanteCpf: formatarDocumento(texto(c.representanteCpf, 24)),
    email: texto(c.email),
    telefone: formatarTelefone(texto(c.telefone, 30)),
    endereco: lerEndereco(c.endereco),
    cidadeForo: texto(c.cidadeForo, 80),
  };
}

function migrateAssinatura(raw: unknown): AssinaturaRelatorio {
  const c = (raw ?? {}) as Partial<AssinaturaRelatorio>;
  const padrao = assinaturaPadrao();
  return {
    nome: typeof c.nome === 'string' ? c.nome.trim().slice(0, 120) : padrao.nome,
    linhas: Array.isArray(c.linhas)
      ? c.linhas
          .filter((l): l is string => typeof l === 'string')
          .map((l) => l.trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, MAX_LINHAS_ASSINATURA)
      : padrao.linhas,
    formato: isFormatoAssinatura(c.formato) ? c.formato : padrao.formato,
    mostrarData: typeof c.mostrarData === 'boolean' ? c.mostrarData : padrao.mostrarData,
  };
}

/**
 * Trocas de atalho: combinação mal formada sai; id que esta versão não conhece
 * fica (pode ser de uma versão mais nova, e voltar a ela não pode perder a troca).
 */
function migrateAtalhos(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const saida: Record<string, string> = {};
  for (const [id, valor] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_TROCAS_ATALHOS)) {
    const combo = normalizarCombo(valor);
    if (isIdAtalho(id) && combo !== null) saida[id] = combo;
  }
  return saida;
}

function migrate(raw: unknown): AjustesFile {
  const candidate = (raw ?? {}) as Partial<AjustesFile>;
  const bruto = candidate.moduloInicial as unknown;
  const modulo = typeof bruto === 'string' && MODULOS_RENOMEADOS[bruto] ? MODULOS_RENOMEADOS[bruto] : bruto;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    // Um módulo removido em versão futura não pode deixar o app abrindo no vazio.
    moduloInicial: isModuloId(modulo) ? modulo : MODULO_PADRAO,
    assinatura: migrateAssinatura(candidate.assinatura),
    perfil: migratePerfil(candidate.perfil),
    atalhos: migrateAtalhos(candidate.atalhos),
    tema: isTema(candidate.tema) ? candidate.tema : 'escuro',
  };
}

function loadFile(): AjustesFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: AjustesFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getAjustes(): Promise<AjustesInfo> {
  const file = loadFile();
  return {
    moduloInicial: file.moduloInicial,
    criptografiaDisponivel: isEncryptionAvailable(),
    assinatura: file.assinatura,
    perfil: file.perfil,
    atalhos: file.atalhos,
    tema: file.tema,
  };
}

export async function setModuloInicial(modulo: ModuloInicial): Promise<AjustesInfo> {
  if (!isModuloId(modulo)) {
    throw new Error('Módulo inicial inválido.');
  }

  const file = loadFile();
  file.moduloInicial = modulo;
  await saveFile(file);

  return getAjustes();
}

export async function setAssinatura(assinatura: AssinaturaRelatorio): Promise<AjustesInfo> {
  const file = loadFile();
  file.assinatura = migrateAssinatura(assinatura);
  await saveFile(file);
  return getAjustes();
}

export async function setPerfil(perfil: PerfilUsuario): Promise<AjustesInfo> {
  const file = loadFile();
  file.perfil = migratePerfil(perfil);
  await saveFile(file);
  return getAjustes();
}

export async function setAtalhos(atalhos: unknown): Promise<AjustesInfo> {
  const file = loadFile();
  file.atalhos = migrateAtalhos(atalhos);
  await saveFile(file);
  return getAjustes();
}

export async function setTema(tema: Tema): Promise<AjustesInfo> {
  if (!isTema(tema)) throw new Error('Tema inválido.');
  const file = loadFile();
  file.tema = tema;
  await saveFile(file);
  return getAjustes();
}

/** Lido pelo main.ts antes de criar a janela (cor do primeiro quadro). */
export function getTema(): Tema {
  return loadFile().tema;
}

/** Lido pelos contratos no main (o texto gravado é preenchido aqui). */
export function getPerfil(): PerfilUsuario {
  return loadFile().perfil;
}

/** Lida pelo gerador de relatórios; nunca atravessa o IPC sozinha. */
export function getAssinatura(): AssinaturaRelatorio {
  return loadFile().assinatura;
}

export async function getFullFile(): Promise<AjustesFile> {
  return loadFile();
}

export async function replaceFile(file: unknown): Promise<AjustesFile> {
  // Um backup antigo entra normalizado (sem assinatura, com id de módulo antigo).
  const normalizado = migrate(file);
  await saveFile(normalizado);
  return normalizado;
}
