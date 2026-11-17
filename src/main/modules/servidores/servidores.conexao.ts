import crypto from 'node:crypto';
import fs from 'node:fs';
import type * as Ssh2 from 'ssh2';
import type { AutenticacaoSsh } from '../../../shared/types/servidores.types';

/**
 * O que os comandos salvos, o terminal e o "Testar conexão" têm em comum: montar
 * a conexão (chave ou senha), conferir a chave do host e traduzir os erros.
 */

export const TIMEOUT_CONEXAO_MS = 15_000;

/**
 * ssh2 só é carregado no primeiro uso: sozinho ele custa ~1 s de require
 * (cripto, cpu-features), e estava pesando na abertura do app para todo mundo,
 * mesmo quem nunca abre Servidores.
 */
let ssh2: typeof Ssh2 | null = null;
export function novoCliente(): Ssh2.Client {
  ssh2 ??= require('ssh2') as typeof Ssh2;
  return new ssh2.Client();
}

/** Os campos do servidor que a conexão usa — o teste do cadastro ainda não tem id. */
export interface AlvoSsh {
  host: string;
  porta: number;
  usuario: string;
  autenticacao: AutenticacaoSsh;
  caminhoChave: string;
  impressaoDigital?: string;
}

export interface SegredosSsh {
  passphrase?: string;
  senha?: string;
}

/** O formato do OpenSSH ("SHA256:…", base64 sem "="), para bater com o `ssh-keygen -lf`. */
export function impressaoDe(chave: Buffer): string {
  return `SHA256:${crypto.createHash('sha256').update(chave).digest('base64').replace(/=+$/, '')}`;
}

export interface Preparo {
  config: Ssh2.ConnectConfig;
  /** A impressão que o servidor apresentou (depois do handshake). */
  vista(): string | undefined;
  /** A impressão vista não é a gravada: a conexão foi recusada por isso. */
  mudou(): boolean;
}

/**
 * Monta a configuração do ssh2. Lança com mensagem pronta para a tela quando falta
 * algo que se sabe antes de conectar (arquivo de chave sumiu, senha não salva).
 */
export function prepararConexao(alvo: AlvoSsh, segredos: SegredosSsh): Preparo {
  let vista: string | undefined;
  let mudou = false;

  const config: Ssh2.ConnectConfig = {
    host: alvo.host,
    port: alvo.porta,
    username: alvo.usuario,
    readyTimeout: TIMEOUT_CONEXAO_MS,
    keepaliveInterval: 30_000,
    // Sem hostHash, o ssh2 entrega a chave crua — a impressão sai no formato do OpenSSH.
    hostVerifier: (chave: Buffer) => {
      vista = impressaoDe(chave);
      if (alvo.impressaoDigital && alvo.impressaoDigital !== vista) {
        mudou = true;
        return false;
      }
      return true;
    },
  };

  if (alvo.autenticacao === 'senha') {
    if (!segredos.senha) throw new Error('Nenhuma senha salva para este servidor — edite-o e informe a senha.');
    config.password = segredos.senha;
    // Muitos servidores pedem a senha por "keyboard-interactive" em vez de "password".
    config.tryKeyboard = true;
  } else {
    try {
      config.privateKey = fs.readFileSync(alvo.caminhoChave);
    } catch (error) {
      throw new Error(
        `Não foi possível ler a chave privada em ${alvo.caminhoChave}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (segredos.passphrase) config.passphrase = segredos.passphrase;
  }

  return { config, vista: () => vista, mudou: () => mudou };
}

/** Responde ao "keyboard-interactive" com a senha (um prompt por pergunta). */
export function responderSenha(conn: Ssh2.Client, senha: string | undefined): void {
  if (!senha) return;
  conn.on('keyboard-interactive', (_nome, _instrucoes, _idioma, perguntas, terminar) => {
    terminar(perguntas.map(() => senha));
  });
}

/** Mensagens do ssh2 são curtas demais para o usuário agir; traduzimos as causas comuns. */
export function traduzirErro(error: unknown, alvo: AlvoSsh, preparo?: Preparo): string {
  if (preparo?.mudou()) {
    return `A chave deste servidor mudou (antes ${alvo.impressaoDigital}, agora ${preparo.vista()}). Pode ser outra máquina no lugar — ou o servidor foi reinstalado. Se tiver certeza, use "Confiar na nova chave".`;
  }
  const bruta = error instanceof Error ? error.message : String(error);
  if (/passphrase/i.test(bruta)) return 'A chave privada exige passphrase — informe-a na edição do servidor.';
  if (/All configured authentication methods failed/i.test(bruta)) {
    return alvo.autenticacao === 'senha'
      ? 'O servidor recusou o usuário ou a senha.'
      : 'O servidor recusou a chave. Confira o usuário e se a chave pública está em authorized_keys.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(bruta)) return `Host "${alvo.host}" não encontrado.`;
  if (/ECONNREFUSED/i.test(bruta)) return `Conexão recusada em ${alvo.host}:${alvo.porta} — o SSH está rodando nessa porta?`;
  if (/Timed out while waiting for handshake|ETIMEDOUT/i.test(bruta)) {
    return `Sem resposta de ${alvo.host}:${alvo.porta} em ${TIMEOUT_CONEXAO_MS / 1000} s.`;
  }
  if (/Cannot parse privateKey|Unsupported key format/i.test(bruta)) {
    return 'O arquivo escolhido não é uma chave privada que o Iris entenda (OpenSSH ou PEM). Chaves .ppk do PuTTY precisam ser convertidas no PuTTYgen.';
  }
  return bruta;
}
