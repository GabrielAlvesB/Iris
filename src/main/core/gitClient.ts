import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { InfoGit, StatusGit } from '../../shared/types/explorador.types';

/**
 * Execução de comandos git.
 *
 * Sempre execFile com array de argumentos, NUNCA exec com string montada:
 * caminhos de projeto têm espaço e acento, e concatenar em shell seria
 * injeção de comando esperando acontecer.
 */

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 6_000;
/** Repositório com muitos untracked estoura o buffer padrão de 1 MB. */
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Sem estas variáveis, um repositório com credential helper interativo
 * pendura o processo até o timeout na primeira operação que toque a rede.
 * GIT_OPTIONAL_LOCKS=0 evita disputar o index.lock com a IDE aberta.
 */
const ENV_GIT = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo',
  GCM_INTERACTIVE: 'never',
  GIT_OPTIONAL_LOCKS: '0',
};

/** Fica true assim que um comando falha por ausência do binário. */
let gitAusente = false;

export function isGitAusente(): boolean {
  return gitAusente;
}

interface ResultadoGit {
  ok: boolean;
  stdout: string;
}

async function git(cwd: string, args: string[]): Promise<ResultadoGit> {
  if (gitAusente) return { ok: false, stdout: '' };

  // core.quotepath=false faz caminhos com acento saírem verbatim, em vez de
  // escapados em octal — e os projetos aqui têm acento e espaço.
  const argv = ['--no-optional-locks', '-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args];

  try {
    const { stdout } = await execFileAsync('git', argv, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      encoding: 'utf-8',
      shell: false,
      env: { ...process.env, ...ENV_GIT },
    });
    return { ok: true, stdout };
  } catch (error) {
    // No app empacotado o PATH pode não ter git; registrar evita tentar de novo
    // a cada navegação de pasta.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      gitAusente = true;
      console.error('[gitClient] git não encontrado no PATH.');
    }
    // "not a git repository", sem upstream e repo sem commits são respostas
    // normais aqui, não erros a propagar.
    return { ok: false, stdout: '' };
  }
}

/** Raiz do repositório que contém o diretório, ou null se não for um repo. */
export async function acharRaizDoRepo(dir: string): Promise<string | null> {
  const resultado = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!resultado.ok) return null;

  const raiz = resultado.stdout.trim();
  return raiz ? path.normalize(raiz) : null;
}

async function lerBranch(dir: string): Promise<string> {
  const resultado = await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = resultado.stdout.trim();
  // Repositório recém-criado, ainda sem commit, responde "HEAD".
  return branch && branch !== 'HEAD' ? branch : '(sem commits)';
}

async function lerUltimoCommit(dir: string): Promise<InfoGit['ultimoCommit']> {
  // Separador NUL: mensagens de commit contêm espaço, vírgula e quebra.
  const resultado = await git(dir, ['log', '-1', '--format=%h%x00%s%x00%an%x00%aI']);
  if (!resultado.ok) return undefined;

  const [hash, mensagem, autor, data] = resultado.stdout.trim().split('\0');
  if (!hash) return undefined;

  return {
    hash,
    mensagem: mensagem ?? '',
    autor: autor ?? '',
    data: data ?? '',
  };
}

async function lerAheadBehind(dir: string): Promise<{ ahead: number; behind: number } | undefined> {
  const resultado = await git(dir, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
  if (!resultado.ok) return undefined; // branch sem upstream configurado

  const [ahead, behind] = resultado.stdout.trim().split(/\s+/).map(Number);
  if (Number.isNaN(ahead) || Number.isNaN(behind)) return undefined;

  return { ahead: ahead ?? 0, behind: behind ?? 0 };
}

/** Traduz o código de duas letras do porcelain para o status que a tela usa. */
function traduzirCodigo(codigo: string): StatusGit {
  if (codigo === '??') return 'novo';
  if (codigo.includes('D')) return 'apagado';
  if (codigo.includes('A')) return 'novo';
  if (codigo.includes('R')) return 'modificado';
  if (codigo.includes('M')) return 'modificado';
  if (codigo === '!!') return 'ignorado';
  return 'modificado';
}

/**
 * Status dos itens de UM diretório, com os caminhos já resolvidos.
 * Escopar ao diretório aberto mantém o custo constante mesmo em repo grande.
 */
async function lerStatusDoDiretorio(
  raizRepo: string,
  dir: string,
  incluirIgnorados: boolean,
): Promise<Map<string, StatusGit>> {
  const args = ['status', '--porcelain=v1'];
  // O modo padrão de --ignored agrupa diretórios (mostra "node_modules/" em vez
  // de cada arquivo), o que evita percorrer árvores gigantes.
  if (incluirIgnorados) args.push('--ignored');
  args.push('--', dir);

  const resultado = await git(raizRepo, args);
  const mapa = new Map<string, StatusGit>();
  if (!resultado.ok) return mapa;

  for (const linha of resultado.stdout.split('\n')) {
    if (linha.length < 4) continue;

    const codigo = linha.slice(0, 2).trim() || linha.slice(0, 2);
    let caminhoRelativo = linha.slice(3).trim();

    // Renomeios vêm como "antigo -> novo"; o que importa é o destino.
    const seta = caminhoRelativo.indexOf(' -> ');
    if (seta !== -1) caminhoRelativo = caminhoRelativo.slice(seta + 4);

    // O git cita caminhos com espaço ou acento entre aspas.
    if (caminhoRelativo.startsWith('"') && caminhoRelativo.endsWith('"')) {
      caminhoRelativo = caminhoRelativo.slice(1, -1);
    }

    // Entrada de diretório ignorado ("dist/"): marca a pasta em si.
    const semBarra = caminhoRelativo.endsWith('/')
      ? caminhoRelativo.slice(0, -1)
      : caminhoRelativo;

    const absoluto = path.normalize(path.join(raizRepo, semBarra));
    mapa.set(absoluto, traduzirCodigo(codigo));
  }

  return mapa;
}

export interface InfoGitCompleta {
  info: InfoGit;
  /** Caminho absoluto normalizado → status, para casar com os itens listados. */
  statusPorCaminho: Map<string, StatusGit>;
}

/**
 * Reúne tudo que a tela do Explorador precisa para um diretório.
 * Devolve null quando o diretório não está dentro de um repositório git.
 */
export async function lerInfoDoDiretorio(
  dir: string,
  incluirIgnorados = true,
): Promise<InfoGitCompleta | null> {
  const raizRepo = await acharRaizDoRepo(dir);
  if (!raizRepo) return null;

  const [branch, ultimoCommit, aheadBehind, statusPorCaminho] = await Promise.all([
    lerBranch(dir),
    lerUltimoCommit(dir),
    lerAheadBehind(dir),
    lerStatusDoDiretorio(raizRepo, dir, incluirIgnorados),
  ]);

  // Só conta alterações reais: ignorados não são pendência.
  const alteracoes = Array.from(statusPorCaminho.values()).filter(
    (status) => status !== 'ignorado',
  ).length;

  return {
    info: {
      raizRepo,
      branch,
      ultimoCommit,
      ahead: aheadBehind?.ahead,
      behind: aheadBehind?.behind,
      alteracoes,
    },
    statusPorCaminho,
  };
}

/** Resumo do repositório inteiro, usado pela área GitHub. */
export async function lerResumoDoRepo(dir: string): Promise<InfoGit | null> {
  const raizRepo = await acharRaizDoRepo(dir);
  if (!raizRepo) return null;

  const [branch, ultimoCommit, aheadBehind, status] = await Promise.all([
    lerBranch(raizRepo),
    lerUltimoCommit(raizRepo),
    lerAheadBehind(raizRepo),
    git(raizRepo, ['status', '--porcelain=v1']),
  ]);

  const alteracoes = status.stdout.split('\n').filter((linha) => linha.trim() !== '').length;

  return {
    raizRepo,
    branch,
    ultimoCommit,
    ahead: aheadBehind?.ahead,
    behind: aheadBehind?.behind,
    alteracoes,
  };
}

/**
 * URL do remoto "origin", normalizada para a chave "usuario/repo".
 * Aceita tanto git@github.com:User/Repo.git quanto https://github.com/User/Repo.git.
 */
export async function lerRepoRemoto(dir: string): Promise<string | null> {
  const resultado = await git(dir, ['remote', 'get-url', 'origin']);
  if (!resultado.ok) return null;

  return normalizarRemoto(resultado.stdout.trim());
}

export function normalizarRemoto(url: string): string | null {
  if (!url) return null;

  const semSufixo = url.trim().replace(/\.git$/i, '');
  const ssh = /^git@github\.com:(.+)$/i.exec(semSufixo);
  if (ssh?.[1]) return ssh[1].toLowerCase();

  const https = /^https?:\/\/(?:[^@]+@)?github\.com\/(.+)$/i.exec(semSufixo);
  if (https?.[1]) return https[1].toLowerCase();

  return null;
}
