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

export type AutenticacaoSsh = 'chave' | 'senha';

export interface ServidorSsh extends ServidorBase {
  tipo: 'ssh';
  host: string;
  porta: number;
  usuario: string;
  /** v2: como entra. Arquivo v1 era sempre por chave. */
  autenticacao: AutenticacaoSsh;
  /** Caminho do arquivo de chave privada (.pem / id_rsa). Nunca a chave em si. Vazio com senha. */
  caminhoChave: string;
  /** A passphrase, quando salva, mora no secretStore. */
  temPassphrase: boolean;
  /** A senha, quando salva, mora no secretStore (`servidor.<id>.senha`). */
  temSenha: boolean;
  /**
   * SHA-256 (base64) da chave do host, gravado na primeira conexão que deu certo.
   * Se o servidor responder com outra chave, o Iris recusa: pode ser outra máquina
   * no lugar (ou o servidor foi reinstalado — aí o usuário confia de novo).
   */
  impressaoDigital?: string;
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
  autenticacao: AutenticacaoSsh;
  caminhoChave: string;
  passphrase?: string;
  senha?: string;
  grupo?: string;
  /** A impressão digital vista no "Testar conexão" do cadastro: já nasce confiada. */
  impressaoDigital?: string;
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
  autenticacao?: AutenticacaoSsh;
  caminhoChave?: string;
  /** undefined mantém; '' remove a passphrase salva. */
  passphrase?: string;
  /** undefined mantém; '' remove a senha salva. */
  senha?: string;
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

/**
 * "Testar conexão" do cadastro, antes de salvar. Na edição, `servidorId` deixa o
 * main usar a senha/passphrase já guardada quando o campo vem vazio.
 */
export type TestarConexaoInput =
  | ({ tipo: 'http'; servidorId?: string } & CriarServidorHttpInput)
  | ({ tipo: 'ssh'; servidorId?: string } & CriarServidorSshInput);

export interface ResultadoTesteServidor {
  ok: boolean;
  latenciaMs?: number;
  /** HTTP: o status recebido. */
  status?: number;
  /** SSH: a impressão digital do host e o que o servidor respondeu (uname). */
  impressaoDigital?: string;
  sistema?: string;
  /** SSH: a chave do host mudou desde a última vez (servidor já cadastrado). */
  chaveMudou?: boolean;
  erro?: string;
}

// ---------- Terminal interativo ----------

export interface SessaoTerminal {
  sessaoId: string;
  servidorId: string;
  /** Rótulo da aba: nome do servidor (+ número quando há mais de uma). */
  titulo: string;
  aberta: boolean;
  /** Por que fechou (caiu, saiu, erro), quando fechou. */
  motivo?: string;
  /** Fechou porque a chave do host não é a gravada: a tela oferece "Confiar na nova chave". */
  chaveMudou?: boolean;
  abertaEm: string;
}

export interface AbrirTerminalInput {
  servidorId: string;
  cols: number;
  rows: number;
}

export interface EscreverTerminalInput {
  sessaoId: string;
  dados: string;
}

export interface RedimensionarTerminalInput {
  sessaoId: string;
  cols: number;
  rows: number;
}

/** Push de 'servidores:terminal': saída ao vivo ou o fim da sessão. */
export interface TerminalEvento {
  sessaoId: string;
  dados?: string;
  fim?: string;
  chaveMudou?: boolean;
}
