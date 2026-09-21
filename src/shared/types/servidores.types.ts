import type { BaseEntity } from './common.types';

export type ServidorTipo = 'http' | 'ssh';

export interface ComandoSalvo {
  id: string;
  rotulo: string;
  comando: string;
}

export interface Checagem {
  em: string;
  ok: boolean;
  /** Código HTTP; ausente em falha de rede. */
  status?: number;
  latenciaMs?: number;
  erro?: string;
}

interface ServidorBase extends BaseEntity {
  nome: string;
  tipo: ServidorTipo;
  grupo?: string;
  /** 0 = só sob demanda. */
  intervaloSegundos: number;
  /** Mantido curto no disco; ver LIMITE_HISTORICO no service. */
  historico: Checagem[];
}

export interface ServidorHttp extends ServidorBase {
  tipo: 'http';
  url: string;
  metodo: 'GET' | 'HEAD';
  statusEsperado: number;
  timeoutMs: number;
  permitirTlsInseguro: boolean;
}

export interface ServidorSsh extends ServidorBase {
  tipo: 'ssh';
  host: string;
  porta: number;
  usuario: string;
  /** Caminho do arquivo de chave privada (.pem / id_rsa). Nunca a chave em si. */
  caminhoChave: string;
  /** A passphrase, quando salva, mora no secretStore. */
  temPassphrase: boolean;
  comandos: ComandoSalvo[];
}

export type Servidor = ServidorHttp | ServidorSsh;

export interface ServidoresFile {
  schemaVersion: number;
  updatedAt: string;
  servidores: Servidor[];
  healthAtivo: boolean;
  healthIntervaloSeg: number;
}

/** Pedaço de saída de um comando SSH, empurrado ao vivo para a tela. */
export interface SshSaidaChunk {
  servidorId: string;
  comandoId: string;
  stream: 'stdout' | 'stderr' | 'fim';
  texto: string;
  exitCode?: number;
}

export interface CriarServidorHttpInput {
  nome: string;
  url: string;
  metodo: 'GET' | 'HEAD';
  statusEsperado: number;
  timeoutMs: number;
  permitirTlsInseguro: boolean;
  intervaloSegundos: number;
  grupo?: string;
}

export interface CriarServidorSshInput {
  nome: string;
  host: string;
  porta: number;
  usuario: string;
  caminhoChave: string;
  passphrase?: string;
  grupo?: string;
}

export interface AtualizarServidorInput {
  servidorId: string;
  nome?: string;
  grupo?: string;
  intervaloSegundos?: number;
  url?: string;
  metodo?: 'GET' | 'HEAD';
  statusEsperado?: number;
  timeoutMs?: number;
  permitirTlsInseguro?: boolean;
  host?: string;
  porta?: number;
  usuario?: string;
  caminhoChave?: string;
  /** undefined mantém; '' remove a passphrase salva. */
  passphrase?: string;
}

export interface SalvarComandoInput {
  servidorId: string;
  /** Ausente cria um comando novo. */
  comandoId?: string;
  rotulo: string;
  comando: string;
}

export interface RemoverComandoInput {
  servidorId: string;
  comandoId: string;
}

export interface RodarComandoInput {
  servidorId: string;
  comandoId: string;
  /** Usado quando o servidor está configurado para perguntar sempre. */
  passphrase?: string;
}

export interface ConfigHealthInput {
  healthAtivo: boolean;
  healthIntervaloSeg: number;
}
