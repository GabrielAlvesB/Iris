import type { BaseEntity } from './common.types';
import type { CommitResumo, InfoGit } from './explorador.types';

/** Pasta onde o Iris procura repositórios locais para cruzar com o GitHub. */
export interface PastaDeProjetos extends BaseEntity {
  caminho: string;
  nome: string;
}

export interface GithubConfig {
  /** O token em si mora no secretStore; aqui só o fato de existir. */
  temToken: boolean;
  /** Login descoberto a partir do token na última sincronização. */
  usuario: string | null;
  pollAtivo: boolean;
  pollIntervaloSeg: number;
  pastas: PastaDeProjetos[];
}

export interface RepoLocal {
  caminho: string;
  nome: string;
  /** Chave "usuario/repo" do remoto origin, quando existe. */
  remoto: string | null;
  git: InfoGit;
}

export interface RepoRemoto {
  id: number;
  nome: string;
  nomeCompleto: string;
  privado: boolean;
  descricao: string | null;
  linguagem: string | null;
  url: string;
  atualizadoEm: string;
  enviadoEm: string;
  estrelas: number;
  fork: boolean;
  /** Preenchido só para os repositórios mais ativos, por causa do rate limit. */
  commits?: CommitResumo[];
}

/** Um repositório como a tela mostra: remoto, local, ou os dois casados. */
export interface RepoUnificado {
  chave: string;
  nome: string;
  remoto?: RepoRemoto;
  local?: RepoLocal;
}

export interface GithubSnapshot {
  conectado: boolean;
  erro?: string;
  atualizadoEm: string;
  usuario: string | null;
  repos: RepoUnificado[];
}

export interface GithubFile {
  schemaVersion: number;
  updatedAt: string;
  usuario: string | null;
  pollAtivo: boolean;
  pollIntervaloSeg: number;
  pastas: PastaDeProjetos[];
  ultimoSnapshot?: GithubSnapshot;
}

export interface SalvarGithubConfigInput {
  /** undefined mantém o token atual; '' remove. */
  token?: string;
  pollAtivo: boolean;
  pollIntervaloSeg: number;
}
