import fs from 'node:fs';
import type * as Ssh2 from 'ssh2';
import { broadcast } from '../../core/broadcast';
import type { ComandoSalvo, ServidorSsh } from '../../../shared/types/servidores.types';

/**
 * Execução de comandos SSH, só com chave privada.
 *
 * Abre a conexão, roda um comando, fecha. Sem sessão persistente e sem shell
 * interativo: o objetivo é conferir estado (uptime, docker ps, tail), não
 * substituir um terminal.
 */

const TIMEOUT_CONEXAO_MS = 15_000;
const TIMEOUT_COMANDO_MS = 60_000;
/** Teto de saída por execução: um `tail` distraído não pode estourar o IPC. */
const MAX_SAIDA_BYTES = 200_000;

/**
 * ssh2 só é carregado no primeiro comando: sozinho ele custa ~1 s de require
 * (cripto, cpu-features), e estava pesando na abertura do app para todo mundo,
 * mesmo quem nunca abre Servidores.
 */
let ssh2: typeof Ssh2 | null = null;
function carregarSsh2(): typeof Ssh2 {
  ssh2 ??= require('ssh2') as typeof Ssh2;
  return ssh2;
}

function emitir(
  servidorId: string,
  comandoId: string,
  stream: 'stdout' | 'stderr' | 'fim',
  texto: string,
  exitCode?: number,
): void {
  broadcast('servidores:saida', { servidorId, comandoId, stream, texto, exitCode });
}

export function rodarComandoSsh(
  servidor: ServidorSsh,
  comando: ComandoSalvo,
  passphrase?: string,
): Promise<void> {
  return new Promise((resolve) => {
    let privateKey: Buffer;
    try {
      privateKey = fs.readFileSync(servidor.caminhoChave);
    } catch (error) {
      emitir(
        servidor.id,
        comando.id,
        'fim',
        `Não foi possível ler a chave privada em ${servidor.caminhoChave}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        1,
      );
      resolve();
      return;
    }

    const conn = new (carregarSsh2().Client)();
    let enviados = 0;
    let encerrado = false;
    let timerComando: NodeJS.Timeout | null = null;

    function finalizar(mensagem: string, exitCode: number): void {
      if (encerrado) return;
      encerrado = true;
      if (timerComando) clearTimeout(timerComando);
      emitir(servidor.id, comando.id, 'fim', mensagem, exitCode);
      try {
        conn.end();
      } catch {
        // A conexão já pode ter caído; nada a fazer.
      }
      resolve();
    }

    /** Corta a saída no teto para não estourar o structured clone do IPC. */
    function enviarSaida(stream: 'stdout' | 'stderr', pedaco: Buffer): void {
      if (encerrado || enviados >= MAX_SAIDA_BYTES) return;

      const restante = MAX_SAIDA_BYTES - enviados;
      const texto = pedaco.toString('utf-8').slice(0, restante);
      enviados += texto.length;

      emitir(servidor.id, comando.id, stream, texto);

      if (enviados >= MAX_SAIDA_BYTES) {
        emitir(servidor.id, comando.id, 'stderr', '\n[saída truncada pelo Iris]\n');
      }
    }

    conn.on('ready', () => {
      conn.exec(comando.comando, (err, stream) => {
        if (err) {
          finalizar(`Falha ao executar: ${err.message}`, 1);
          return;
        }

        timerComando = setTimeout(() => {
          finalizar(`Comando passou de ${TIMEOUT_COMANDO_MS / 1000}s e foi interrompido.`, 124);
        }, TIMEOUT_COMANDO_MS);

        stream.on('data', (pedaco: Buffer) => enviarSaida('stdout', pedaco));
        stream.stderr.on('data', (pedaco: Buffer) => enviarSaida('stderr', pedaco));

        stream.on('close', (code: number | null) => {
          const saida = code ?? 0;
          finalizar(saida === 0 ? 'Concluído.' : `Terminou com código ${saida}.`, saida);
        });
      });
    });

    conn.on('error', (error) => {
      // Mensagens do ssh2 são curtas demais para o usuário agir; traduzimos as
      // causas comuns de falha por chave.
      const bruta = error.message || String(error);
      const amigavel = /passphrase/i.test(bruta)
        ? 'A chave privada exige passphrase — configure-a no servidor.'
        : /All configured authentication methods failed/i.test(bruta)
          ? 'O servidor recusou a chave. Confira o usuário e se a chave pública está em authorized_keys.'
          : /ENOTFOUND|EAI_AGAIN/i.test(bruta)
            ? `Host "${servidor.host}" não encontrado.`
            : /ECONNREFUSED/i.test(bruta)
              ? `Conexão recusada em ${servidor.host}:${servidor.porta}.`
              : bruta;
      finalizar(amigavel, 1);
    });

    try {
      conn.connect({
        host: servidor.host,
        port: servidor.porta,
        username: servidor.usuario,
        privateKey,
        passphrase,
        readyTimeout: TIMEOUT_CONEXAO_MS,
      });
    } catch (error) {
      finalizar(error instanceof Error ? error.message : String(error), 1);
    }
  });
}
