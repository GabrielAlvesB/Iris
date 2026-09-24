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

/** Agrupamento livre da Biblioteca (Roteiros, Thumbnails, Templates…). */
export interface Colecao {
  id: string;
  nome: string;
  /** Hex (#rrggbb); a coleção sempre aparece com o nome, a cor só reforça. */
  cor: string;
  order: number;
}

/**
 * Arquivo ou pasta que o usuário marcou como importante. Guarda só o caminho e
 * a curadoria (coleção, tags, nota) — nunca uma cópia do arquivo. O caminho
 * precisa estar dentro de uma pasta monitorada para poder ser aberto.
 */
export interface Recurso extends BaseEntity {
  caminho: string;
  nome: string;
  tipo: 'arquivo' | 'pasta';
  colecaoId?: string;
  tags: string[];
  nota: string;
  fixado: boolean;
}

export interface Recente {
  caminho: string;
  em: string;
}

export interface ExploradorFile {
  schemaVersion: number;
  updatedAt: string;
  raizes: RaizMonitorada[];
  colecoes: Colecao[];
  recursos: Recurso[];
  recentes: Recente[];
}

/**
 * Situação derivada na leitura, nunca gravada: `ausente` quando o arquivo foi
 * movido ou apagado fora do app; `fora` quando a pasta monitorada que o
 * continha foi removida.
 */
export type SituacaoRecurso = 'ok' | 'ausente' | 'fora';

export interface RecursoDetalhado extends Recurso {
  situacao: SituacaoRecurso;
  tamanho: number;
  modificadoEm?: string;
  /** Pasta monitorada que contém o recurso, para exibir o caminho relativo. */
  raizNome?: string;
  relativo?: string;
}

export interface RecenteDetalhado extends Recente {
  nome: string;
  tipo: 'arquivo' | 'pasta';
  situacao: SituacaoRecurso;
  recursoId?: string;
}

export interface BibliotecaInfo {
  colecoes: Colecao[];
  recursos: RecursoDetalhado[];
  recentes: RecenteDetalhado[];
  temRaizes: boolean;
}

export interface AdicionarRecursoInput {
  caminho: string;
  colecaoId?: string;
}

export interface AtualizarRecursoInput {
  recursoId: string;
  nome?: string;
  /** '' tira da coleção. */
  colecaoId?: string;
  tags?: string[];
  nota?: string;
  fixado?: boolean;
}

export interface SalvarColecaoInput {
  id?: string;
  nome: string;
  cor: string;
}

export interface BuscarInput {
  termo: string;
  /** Vazio = todas as pastas monitoradas. */
  raizIds?: string[];
}

export interface ResultadoBuscaItem extends ItemDoDiretorio {
  raizId: string;
  raizNome: string;
  /** Pasta que contém o item, relativa à raiz ('' = a própria raiz). */
  pastaRelativa: string;
}

export interface ResultadoBusca {
  termo: string;
  itens: ResultadoBuscaItem[];
  /** true quando bateu no teto de resultados ou de itens visitados. */
  truncado: boolean;
  /** Descartada porque uma busca mais nova começou. */
  obsoleta: boolean;
}

export interface AdicionarRecursosResult {
  biblioteca: BibliotecaInfo;
  adicionados: number;
  /** Caminhos recusados por estarem fora das pastas monitoradas. */
  recusados: string[];
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
