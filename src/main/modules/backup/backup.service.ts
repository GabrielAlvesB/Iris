import fs from 'node:fs';
import path from 'node:path';
import { readStore, writeStore, aguardarEscritas } from '../../storage/jsonStore';
import { registerTask, startTask, stopTask } from '../../core/scheduler';
import { broadcast } from '../../core/broadcast';
import * as exportService from '../export/export.service';
import {
  INTERVALOS_BACKUP,
  INTERVALO_BACKUP_PADRAO,
  MANTER_BACKUPS_MAX,
  MANTER_BACKUPS_MIN,
  MANTER_BACKUPS_PADRAO,
  PREFIXO_BACKUP_AUTO,
  type BackupAutoFile,
  type BackupNaPasta,
  type EstadoBackupAuto,
  type MudancaBackupAuto,
} from '../../../shared/types/backup.types';
import type { PreviaImportacao } from '../../../shared/types/export.types';

const FILE_NAME = 'backup-auto.json';
const SCHEMA_VERSION = 1;

export const TAREFA_BACKUP = 'backup:auto';
/**
 * A tarefa só confere se já venceu: assim um app que ficou fechado dias faz o
 * backup logo depois de abrir, e um que fica aberto não depende de um timer de 24 h.
 */
const CONFERIR_A_CADA_MS = 30 * 60_000;

const NOME_VALIDO = new RegExp(`^${PREFIXO_BACKUP_AUTO}\\d{4}-\\d{2}-\\d{2}_\\d{6}(-\\d+)?\\.json$`);

function createDefaultFile(): BackupAutoFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    ativo: false,
    pasta: '',
    intervaloHoras: INTERVALO_BACKUP_PADRAO,
    manter: MANTER_BACKUPS_PADRAO,
    ultimoEm: '',
    ultimoErro: '',
  };
}

function intervaloValido(v: unknown): number {
  return INTERVALOS_BACKUP.some((i) => i.horas === v) ? (v as number) : INTERVALO_BACKUP_PADRAO;
}

function manterValido(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : MANTER_BACKUPS_PADRAO;
  return Math.min(MANTER_BACKUPS_MAX, Math.max(MANTER_BACKUPS_MIN, n));
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function migrate(raw: unknown): BackupAutoFile {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    ativo: r.ativo === true,
    pasta: texto(r.pasta),
    intervaloHoras: intervaloValido(r.intervaloHoras),
    manter: manterValido(r.manter),
    ultimoEm: Number.isNaN(Date.parse(texto(r.ultimoEm))) ? '' : texto(r.ultimoEm),
    ultimoErro: texto(r.ultimoErro),
  };
}

function loadFile(): BackupAutoFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

let fazendo: Promise<EstadoBackupAuto> | null = null;

function pastaExiste(pasta: string): boolean {
  try {
    return !!pasta && fs.statSync(pasta).isDirectory();
  } catch {
    return false;
  }
}

function proximoEm(f: BackupAutoFile): string {
  if (!f.ativo || !f.pasta) return '';
  const ultimo = Date.parse(f.ultimoEm);
  if (Number.isNaN(ultimo)) return new Date().toISOString();
  return new Date(ultimo + f.intervaloHoras * 3_600_000).toISOString();
}

function estadoDe(f: BackupAutoFile): EstadoBackupAuto {
  return {
    ativo: f.ativo,
    pasta: f.pasta,
    pastaExiste: pastaExiste(f.pasta),
    intervaloHoras: f.intervaloHoras,
    manter: f.manter,
    ultimoEm: f.ultimoEm,
    ultimoErro: f.ultimoErro,
    proximoEm: proximoEm(f),
    fazendo: fazendo !== null,
  };
}

function avisar(f: BackupAutoFile): EstadoBackupAuto {
  const estado = estadoDe(f);
  broadcast('backup:estado', estado);
  return estado;
}

export function getEstado(): EstadoBackupAuto {
  return estadoDe(loadFile());
}

async function salvar(f: BackupAutoFile): Promise<EstadoBackupAuto> {
  await writeStore(FILE_NAME, f);
  aplicarAgendamento();
  return avisar(f);
}

export async function mudarConfig(mudanca: MudancaBackupAuto): Promise<EstadoBackupAuto> {
  const f = loadFile();
  const m = mudanca && typeof mudanca === 'object' ? mudanca : {};
  if (typeof m.ativo === 'boolean') {
    if (m.ativo && !f.pasta) throw new Error('Escolha a pasta dos backups antes de ligar.');
    f.ativo = m.ativo;
  }
  if (m.intervaloHoras !== undefined) f.intervaloHoras = intervaloValido(m.intervaloHoras);
  if (m.manter !== undefined) {
    f.manter = manterValido(m.manter);
    // Diminuir o "manter" vale na hora, não só no próximo backup.
    if (pastaExiste(f.pasta)) podar(f.pasta, f.manter);
  }
  return salvar(f);
}

/**
 * O caminho vem só do diálogo do main. Guardado canônico: uma junction ou um
 * atalho de rede mudando de letra não deixa o app gravando em outro lugar.
 */
export async function definirPasta(escolhida: string): Promise<EstadoBackupAuto> {
  let pasta: string;
  try {
    pasta = fs.realpathSync(escolhida);
  } catch {
    throw new Error('Não deu para abrir essa pasta.');
  }
  if (!fs.statSync(pasta).isDirectory()) throw new Error('Escolha uma pasta, não um arquivo.');
  try {
    fs.accessSync(pasta, fs.constants.W_OK);
  } catch {
    throw new Error(`Sem permissão para gravar em ${pasta}.`);
  }
  const f = loadFile();
  const mudou = f.pasta !== pasta;
  f.pasta = pasta;
  f.ultimoErro = '';
  // Pasta nova começa do zero: o próximo backup sai já, não daqui a um dia.
  if (mudou) f.ultimoEm = '';
  return salvar(f);
}

function carimbo(d: Date): string {
  // Hora local no nome: é o que o usuário reconhece ao abrir a pasta.
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** A data vem do nome, não do mtime: copiar a pasta para outro disco muda o mtime. */
function dataDoNome(nome: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(nome);
  if (!m) return null;
  const [, a, me, d, h, mi, se] = m.map(Number) as [number, number, number, number, number, number, number];
  const data = new Date(a, me - 1, d, h, mi, se);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function nomesNaPasta(pasta: string): string[] {
  return fs
    .readdirSync(pasta)
    .filter((n) => NOME_VALIDO.test(n))
    .sort();
}

/** Só arquivos que o próprio Iris criou (pelo nome): o resto da pasta nunca é tocado. */
function podar(pasta: string, manter: number): void {
  nomesNaPasta(pasta)
    .reverse()
    .slice(manter)
    .forEach((n) => {
      try {
        fs.rmSync(path.join(pasta, n), { force: true });
      } catch (erro) {
        console.error(`[backup] não deu para apagar ${n}`, erro);
      }
    });
}

function mensagemDeFalha(erro: unknown, pasta: string): string {
  const codigo = (erro as NodeJS.ErrnoException | null)?.code;
  if (codigo === 'ENOENT') return `A pasta ${pasta} não foi encontrada. Conecte o disco ou escolha outra pasta.`;
  if (codigo === 'EACCES' || codigo === 'EPERM') return `Sem permissão para gravar em ${pasta}.`;
  if (codigo === 'ENOSPC') return `Não há espaço livre em ${pasta}.`;
  return erro instanceof Error ? erro.message : String(erro);
}

async function gravarBackup(): Promise<EstadoBackupAuto> {
  const f = loadFile();
  if (!f.pasta) throw new Error('Escolha a pasta dos backups primeiro.');
  try {
    if (!pastaExiste(f.pasta)) throw Object.assign(new Error('pasta ausente'), { code: 'ENOENT' });
    // Uma edição ainda na fila de gravação precisa estar no disco antes da leitura.
    await aguardarEscritas();
    const bundle = await exportService.buildExportBundle();
    const agora = new Date();
    let nome = `${PREFIXO_BACKUP_AUTO}${carimbo(agora)}.json`;
    // Dois "Fazer agora" no mesmo segundo não podem sobrescrever um ao outro.
    for (let i = 2; fs.existsSync(path.join(f.pasta, nome)); i++) nome = `${PREFIXO_BACKUP_AUTO}${carimbo(agora)}-${i}.json`;
    const destino = path.join(f.pasta, nome);
    const tmp = `${destino}.tmp`;
    // .tmp + renomear: queda no meio deixa um .tmp, nunca um backup truncado com cara de bom.
    fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2), 'utf-8');
    fs.renameSync(tmp, destino);
    podar(f.pasta, f.manter);
    f.ultimoEm = agora.toISOString();
    f.ultimoErro = '';
  } catch (erro) {
    f.ultimoErro = mensagemDeFalha(erro, f.pasta);
    console.error('[backup] falhou', erro);
  }
  await writeStore(FILE_NAME, f);
  return estadoDe(f);
}

/** Um de cada vez: a tarefa e o botão "Fazer agora" podem coincidir. */
export function fazerBackupAgora(): Promise<EstadoBackupAuto> {
  if (!fazendo) {
    fazendo = gravarBackup().finally(() => {
      fazendo = null;
      avisar(loadFile());
    });
    // Depois da atribuição: o aviso já sai com "fazendo".
    avisar(loadFile());
  }
  return fazendo;
}

async function conferir(): Promise<void> {
  const f = loadFile();
  if (!f.ativo || !f.pasta) return;
  if (Date.parse(proximoEm(f)) > Date.now()) return;
  await fazerBackupAgora();
}

export function iniciarBackupAuto(): void {
  registerTask(TAREFA_BACKUP, CONFERIR_A_CADA_MS, () => conferir());
  // Depois da primeira tela e das outras tarefas de abertura.
  aplicarAgendamento(15_000);
}

export function aplicarAgendamento(atrasoMs = 2_000): void {
  try {
    const f = loadFile();
    stopTask(TAREFA_BACKUP);
    if (f.ativo && f.pasta) startTask(TAREFA_BACKUP, atrasoMs);
  } catch (erro) {
    console.error('[backup] não deu para aplicar a configuração', erro);
  }
}

export function listarBackups(): BackupNaPasta[] {
  const f = loadFile();
  if (!pastaExiste(f.pasta)) return [];
  return nomesNaPasta(f.pasta)
    .reverse()
    .map((arquivo) => {
      const st = fs.statSync(path.join(f.pasta, arquivo));
      return { arquivo, criadoEm: dataDoNome(arquivo) ?? st.mtime.toISOString(), tamanho: st.size };
    });
}

/**
 * A tela manda só o nome; o caminho é montado aqui, dentro da pasta configurada,
 * e o nome tem de ser um que o próprio Iris gera. Daí em diante é a importação
 * de sempre: prévia, escolha dos módulos e cópia do estado atual antes.
 */
export function prepararRestauracao(arquivo: unknown): PreviaImportacao {
  const f = loadFile();
  if (typeof arquivo !== 'string' || path.basename(arquivo) !== arquivo || !NOME_VALIDO.test(arquivo)) {
    throw new Error('Backup inválido.');
  }
  if (!pastaExiste(f.pasta)) throw new Error(mensagemDeFalha({ code: 'ENOENT' }, f.pasta));
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(f.pasta, arquivo), 'utf-8'));
  } catch {
    throw new Error('Não deu para ler esse backup: o arquivo sumiu ou está danificado.');
  }
  return exportService.prepararImportacao(raw);
}

export function pastaAtual(): string {
  const f = loadFile();
  if (!pastaExiste(f.pasta)) throw new Error('A pasta dos backups não foi encontrada.');
  return f.pasta;
}
