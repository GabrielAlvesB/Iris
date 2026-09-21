import type { BaseEntity } from './common.types';

/** Uma pasta que o usuário colocou sob monitoramento. */
export interface RaizMonitorada extends BaseEntity {
  nome: string;
  caminho: string;
  /** false quando fs.watch não é confiável ali (ex.: caminho de rede UNC). */
  monitoravel: boolean;
}

/** Estado de um arquivo perante o git, para a marca de cor na listagem. */
export type StatusGit = 'novo' | 'modificado' | 'apagado' | 'ignorado';

export interface CommitResumo {
  hash: string;
  mensagem: string;
  autor: string;
  data: string;
}

export interface InfoGit {
  /** Raiz do repositório que contém a pasta aberta. */
  raizRepo: string;
  branch: string;
  ultimoCommit?: CommitResumo;
  /** Ausentes quando o branch não tem upstream configurado. */
  ahead?: number;
  behind?: number;
  /** Alterações pendentes na pasta aberta, sem contar os ignorados. */
  alteracoes: number;
}

export interface ItemDoDiretorio {
  nome: string;
  caminho: string;
  tipo: 'arquivo' | 'pasta';
  tamanho: number;
  modificadoEm: string;
  statusGit?: StatusGit;
}

export interface ExploradorListagem {
  raizId: string;
  /** Caminho absoluto do diretório listado. */
  caminho: string;
  /** Caminho relativo à raiz, com '/' como separador; '' é a própria raiz. */
  relativo: string;
  itens: ItemDoDiretorio[];
  /** true quando a pasta passou do teto de entradas e foi cortada. */
  truncado: boolean;
  /** Ausente quando a pasta não está dentro de um repositório git. */
  git?: InfoGit;
}

export interface ExploradorFile {
  schemaVersion: number;
  updatedAt: string;
  raizes: RaizMonitorada[];
}

export interface ListarDiretorioInput {
  raizId: string;
  /** Relativo à raiz; '' lista a própria raiz. */
  relativo: string;
}

export interface CriarInput {
  raizId: string;
  /** Diretório de destino, relativo à raiz. */
  relativo: string;
  nome: string;
  tipo: 'arquivo' | 'pasta';
}

export interface RenomearInput {
  raizId: string;
  caminho: string;
  novoNome: string;
}

export interface MoverInput {
  raizId: string;
  caminho: string;
  /** Diretório de destino, relativo à raiz. */
  destinoRelativo: string;
}

export interface ExcluirInput {
  raizId: string;
  caminho: string;
}
