import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import { readStore, writeStore } from '../../storage/jsonStore';
import { getSecret, hasSecret, setSecret } from '../../storage/secretStore';
import { requestJson } from '../../core/httpClient';
import { broadcast } from '../../core/broadcast';
import { lerRepoRemoto, lerResumoDoRepo } from '../../core/gitClient';
import type {
  GithubConfig,
  GithubFile,
  GithubSnapshot,
  PastaDeProjetos,
  RepoLocal,
  RepoRemoto,
  RepoUnificado,
  SalvarGithubConfigInput,
} from '../../../shared/types/github.types';
import type { CommitResumo } from '../../../shared/types/explorador.types';

const FILE_NAME = 'github.json';
const SCHEMA_VERSION = 1;
const SECRET_KEY = 'github.token';
const API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;

/**
 * Buscar commits custa uma chamada POR repositório, então só os mais ativos
 * recebem esse tratamento. O endpoint de eventos públicos cobriria todos numa
 * chamada só, mas o PushEvent não traz as mensagens de commit — verificado.
 */
const REPOS_COM_COMMITS = 10;
const COMMITS_POR_REPO = 5;

/** Profundidade da varredura por pastas com .git dentro das pastas cadastradas. */
const PROFUNDIDADE_VARREDURA = 2;
const IGNORAR_PASTAS = new Set(['node_modules', '.git', 'dist', 'build', 'release', 'vendor', '.next']);

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultFile(): GithubFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso(),
    usuario: null,
    pollAtivo: false,
    pollIntervaloSeg: 600,
    pastas: [],
  };
}

function migrate(raw: unknown): GithubFile {
  const candidate = (raw ?? {}) as Partial<GithubFile>;
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: candidate.updatedAt ?? nowIso(),
    usuario: typeof candidate.usuario === 'string' ? candidate.usuario : null,
    pollAtivo: Boolean(candidate.pollAtivo),
    pollIntervaloSeg:
      typeof candidate.pollIntervaloSeg === 'number' && candidate.pollIntervaloSeg >= 60
        ? candidate.pollIntervaloSeg
        : 600,
    pastas: Array.isArray(candidate.pastas)
      ? candidate.pastas.filter((p): p is PastaDeProjetos => Boolean(p) && typeof p.caminho === 'string')
      : [],
    ultimoSnapshot: candidate.ultimoSnapshot,
  };
}

function loadFile(): GithubFile {
  return readStore(FILE_NAME, createDefaultFile, migrate);
}

async function saveFile(file: GithubFile): Promise<void> {
  file.updatedAt = nowIso();
  await writeStore(FILE_NAME, file);
}

export async function getConfig(): Promise<GithubConfig> {
  const file = loadFile();
  return {
    temToken: hasSecret(SECRET_KEY),
    usuario: file.usuario,
    pollAtivo: file.pollAtivo,
    pollIntervaloSeg: file.pollIntervaloSeg,
    pastas: file.pastas,
  };
}

export async function salvarConfig(input: SalvarGithubConfigInput): Promise<GithubConfig> {
  const file = loadFile();
  file.pollAtivo = input.pollAtivo;
  // Piso de 60s: cada ciclo gasta ~11 chamadas do orçamento da API.
  file.pollIntervaloSeg = Math.max(60, Math.round(input.pollIntervaloSeg));
  await saveFile(file);

  if (input.token !== undefined) {
    await setSecret(SECRET_KEY, input.token);
  }

  return getConfig();
}

function exigirToken(): string {
  const token = getSecret(SECRET_KEY);
  if (!token) {
    throw new Error('Configure o token do GitHub em Ajustes. Veja o passo a passo na aba Tutorial.');
  }
  return token;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // A API do GitHub recusa requisição sem User-Agent.
    'User-Agent': 'Iris-App',
  };
}

// ---------- Pastas de projeto ----------

export async function adicionarPasta(caminho: string): Promise<GithubConfig> {
  const file = loadFile();
  const resolvido = path.resolve(caminho);

  if (!fs.existsSync(resolvido) || !fs.statSync(resolvido).isDirectory()) {
    throw new Error('A pasta escolhida não existe.');
  }
  if (file.pastas.some((p) => path.resolve(p.caminho) === resolvido)) {
    throw new Error('Esta pasta já está na lista.');
  }

  const timestamp = nowIso();
  file.pastas.push({
    id: randomUUID(),
    caminho: resolvido,
    nome: path.basename(resolvido) || resolvido,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await saveFile(file);
  return getConfig();
}

export async function removerPasta(pastaId: string): Promise<GithubConfig> {
  const file = loadFile();
  file.pastas = file.pastas.filter((p) => p.id !== pastaId);
  await saveFile(file);
  return getConfig();
}

/** Encontra os diretórios que contêm .git, varrendo poucos níveis. */
function varrerRepos(dir: string, profundidade: number, encontrados: string[]): void {
  if (profundidade > PROFUNDIDADE_VARREDURA || encontrados.length >= 200) return;

  if (fs.existsSync(path.join(dir, '.git'))) {
    encontrados.push(dir);
    return; // não desce mais: submódulos não interessam aqui
  }

  let entradas: fs.Dirent[];
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;
    if (entrada.name.startsWith('.') || IGNORAR_PASTAS.has(entrada.name)) continue;
    varrerRepos(path.join(dir, entrada.name), profundidade + 1, encontrados);
  }
}

async function lerReposLocais(file: GithubFile): Promise<RepoLocal[]> {
  const caminhos: string[] = [];
  file.pastas.forEach((pasta) => varrerRepos(pasta.caminho, 0, caminhos));

  const locais = await Promise.all(
    caminhos.map(async (caminho): Promise<RepoLocal | null> => {
      const git = await lerResumoDoRepo(caminho);
      if (!git) return null;
      return {
        caminho,
        nome: path.basename(caminho),
        remoto: await lerRepoRemoto(caminho),
        git,
      };
    }),
  );

  return locais.filter((repo): repo is RepoLocal => repo !== null);
}

// ---------- API do GitHub ----------

function lerRepo(raw: unknown): RepoRemoto | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.full_name !== 'string') return null;

  return {
    id: typeof r.id === 'number' ? r.id : 0,
    nome: typeof r.name === 'string' ? r.name : r.full_name,
    nomeCompleto: r.full_name,
    privado: Boolean(r.private),
    descricao: typeof r.description === 'string' ? r.description : null,
    linguagem: typeof r.language === 'string' ? r.language : null,
    url: typeof r.html_url === 'string' ? r.html_url : `https://github.com/${r.full_name}`,
    atualizadoEm: typeof r.updated_at === 'string' ? r.updated_at : '',
    enviadoEm: typeof r.pushed_at === 'string' ? r.pushed_at : '',
    estrelas: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
    fork: Boolean(r.fork),
  };
}

function lerCommit(raw: unknown): CommitResumo | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const sha = typeof c.sha === 'string' ? c.sha : null;
  if (!sha) return null;

  const commit = (c.commit ?? {}) as Record<string, unknown>;
  const autor = (commit.author ?? {}) as Record<string, unknown>;
  const mensagem = typeof commit.message === 'string' ? commit.message : '';

  return {
    hash: sha.slice(0, 7),
    // A mensagem completa traz corpo depois de uma linha em branco.
    mensagem: mensagem.split('\n')[0] ?? '',
    autor: typeof autor.name === 'string' ? autor.name : '',
    data: typeof autor.date === 'string' ? autor.date : '',
  };
}

async function buscarSnapshot(signal?: AbortSignal): Promise<GithubSnapshot> {
  const token = exigirToken();
  const opcoes = { headers: headers(token), timeoutMs: TIMEOUT_MS, signal };

  const usuarioRaw = await requestJson<Record<string, unknown>>(`${API}/user`, opcoes);
  const usuario = typeof usuarioRaw.login === 'string' ? usuarioRaw.login : null;

  const reposRaw = await requestJson<unknown[]>(
    `${API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator`,
    opcoes,
  );
  const remotos = (Array.isArray(reposRaw) ? reposRaw : [])
    .map(lerRepo)
    .filter((repo): repo is RepoRemoto => repo !== null);

  // Só os mais ativos recebem a chamada extra de commits.
  const maisAtivos = [...remotos]
    .sort((a, b) => (b.enviadoEm || '').localeCompare(a.enviadoEm || ''))
    .slice(0, REPOS_COM_COMMITS);

  await Promise.all(
    maisAtivos.map(async (repo) => {
      try {
        const commitsRaw = await requestJson<unknown[]>(
          `${API}/repos/${repo.nomeCompleto}/commits?per_page=${COMMITS_POR_REPO}`,
          opcoes,
        );
        repo.commits = (Array.isArray(commitsRaw) ? commitsRaw : [])
          .map(lerCommit)
          .filter((c): c is CommitResumo => c !== null);
      } catch {
        // Repositório vazio responde 409; não é motivo para derrubar o ciclo.
        repo.commits = [];
      }
    }),
  );

  const file = loadFile();
  const locais = await lerReposLocais(file);

  return {
    conectado: true,
    atualizadoEm: nowIso(),
    usuario,
    repos: unificar(remotos, locais),
  };
}

/** Casa remoto e local pela chave "usuario/repo", preservando os sem par. */
function unificar(remotos: RepoRemoto[], locais: RepoLocal[]): RepoUnificado[] {
  const porChave = new Map<string, RepoUnificado>();

  remotos.forEach((remoto) => {
    const chave = remoto.nomeCompleto.toLowerCase();
    porChave.set(chave, { chave, nome: remoto.nome, remoto });
  });

  locais.forEach((local) => {
    const chave = local.remoto ?? `local:${local.caminho.toLowerCase()}`;
    const existente = porChave.get(chave);
    if (existente) {
      existente.local = local;
    } else {
      porChave.set(chave, { chave, nome: local.nome, local });
    }
  });

  return Array.from(porChave.values()).sort((a, b) => {
    const dataA = a.remoto?.enviadoEm ?? a.local?.git.ultimoCommit?.data ?? '';
    const dataB = b.remoto?.enviadoEm ?? b.local?.git.ultimoCommit?.data ?? '';
    return dataB.localeCompare(dataA);
  });
}

export async function getSnapshot(): Promise<GithubSnapshot> {
  const file = loadFile();
  return (
    file.ultimoSnapshot ?? {
      conectado: false,
      atualizadoEm: nowIso(),
      usuario: file.usuario,
      repos: [],
    }
  );
}

export async function pollOnce(signal?: AbortSignal): Promise<void> {
  let snapshot: GithubSnapshot;

  try {
    snapshot = await buscarSnapshot(signal);
  } catch (error) {
    const anterior = loadFile().ultimoSnapshot;
    snapshot = {
      conectado: false,
      erro: error instanceof Error ? error.message : String(error),
      atualizadoEm: nowIso(),
      usuario: anterior?.usuario ?? null,
      // Mantém o que já estava na tela em vez de esvaziar por uma falha.
      repos: anterior?.repos ?? [],
    };
  }

  const file = loadFile();
  file.ultimoSnapshot = snapshot;
  if (snapshot.usuario) file.usuario = snapshot.usuario;
  await saveFile(file);

  broadcast('github:snapshot', snapshot);
}

export async function testarConexao(): Promise<string> {
  const token = exigirToken();
  const usuario = await requestJson<Record<string, unknown>>(`${API}/user`, {
    headers: headers(token),
    timeoutMs: TIMEOUT_MS,
  });

  const login = typeof usuario.login === 'string' ? usuario.login : '(desconhecido)';
  return `Conectado como ${login}.`;
}

export async function abrirRepo(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error('URL inválida.');
  await shell.openExternal(url);
}

export function getPollConfig(): { ativo: boolean; intervaloMs: number; temToken: boolean } {
  const file = loadFile();
  return {
    ativo: file.pollAtivo,
    intervaloMs: file.pollIntervaloSeg * 1000,
    temToken: hasSecret(SECRET_KEY),
  };
}

export async function getFullFile(): Promise<GithubFile> {
  return loadFile();
}

export async function replaceFile(file: GithubFile): Promise<GithubFile> {
  await saveFile(file);
  return file;
}
