import { broadcast } from '../../core/broadcast';
import type { ComandoSalvo, ServidorSsh } from '../../../shared/types/servidores.types';
import { novoCliente, prepararConexao, responderSenha, traduzirErro, type Preparo, type SegredosSsh } from './servidores.conexao';

/**
 * Comandos salvos: abre a conexão, roda um comando, fecha. Para mexer no servidor
 * de verdade há o terminal (servidores.terminal.ts); aqui é conferir estado
 * (uptime, docker ps, tail) com um clique.
 */

const TIMEOUT_COMANDO_MS = 60_000;
/** Teto de saída por execução: um `tail` distraído não pode estourar o IPC. */
const MAX_SAIDA_BYTES = 200_000;

function emitir(
  servidorId: string,
  comandoId: string,
  stream: 'stdout' | 'stderr' | 'fim',
  texto: string,
  exitCode?: number,
): void {
  broadcast('servidores:saida', { servidorId, comandoId, stream, texto, exitCode });
}

/** Resolve com a impressão digital vista quando a conexão abriu (para o service gravar a primeira). */
export function rodarComandoSsh(
  servidor: ServidorSsh,
  comando: ComandoSalvo,
  segredos: SegredosSsh,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let preparo: Preparo;
    try {
      preparo = prepararConexao(servidor, segredos);
    } catch (error) {
      emitir(servidor.id, comando.id, 'fim', error instanceof Error ? error.message : String(error), 1);
      resolve(undefined);
      return;
    }

    const conn = novoCliente();
    responderSenha(conn, segredos.senha);
    let enviados = 0;
    let encerrado = false;
    let conectou = false;
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
      resolve(conectou ? preparo.vista() : undefined);
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
      conectou = true;
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

    conn.on('error', (error) => finalizar(traduzirErro(error, servidor, preparo), 1));

    try {
      conn.connect(preparo.config);
    } catch (error) {
      finalizar(traduzirErro(error, servidor, preparo), 1);
    }
  });
}

/**
 * "Testar conexão": conecta, pergunta o sistema (`uname -sr`) e fecha. Nunca grava
 * nada — quem chama decide o que fazer com a impressão digital.
 */
export function testarSsh(
  alvo: Parameters<typeof prepararConexao>[0],
  segredos: SegredosSsh,
): Promise<{ ok: boolean; latenciaMs?: number; impressaoDigital?: string; sistema?: string; chaveMudou?: boolean; erro?: string }> {
  return new Promise((resolve) => {
    let preparo: Preparo;
    try {
      preparo = prepararConexao(alvo, segredos);
    } catch (error) {
      resolve({ ok: false, erro: error instanceof Error ? error.message : String(error) });
      return;
    }
    const inicio = Date.now();
    const conn = novoCliente();
    responderSenha(conn, segredos.senha);
    let pronto = false;
    const terminar = (r: Awaited<ReturnType<typeof testarSsh>>): void => {
      if (pronto) return;
      pronto = true;
      try {
        conn.end();
      } catch {
        // já fechada
      }
      resolve(r);
    };

    conn.on('ready', () => {
      const latenciaMs = Date.now() - inicio;
      conn.exec('uname -sr 2>/dev/null || ver', (err, stream) => {
        if (err) {
          terminar({ ok: true, latenciaMs, impressaoDigital: preparo.vista() });
          return;
        }
        let saida = '';
        stream.on('data', (p: Buffer) => {
          saida += p.toString('utf-8');
        });
        stream.stderr.on('data', () => undefined);
        stream.on('close', () => terminar({ ok: true, latenciaMs, impressaoDigital: preparo.vista(), sistema: saida.trim().slice(0, 120) || undefined }));
      });
      setTimeout(() => terminar({ ok: true, latenciaMs, impressaoDigital: preparo.vista() }), 5000);
    });
    conn.on('error', (error) =>
      terminar({ ok: false, erro: traduzirErro(error, alvo, preparo), chaveMudou: preparo.mudou(), impressaoDigital: preparo.vista() }),
    );
    try {
      conn.connect(preparo.config);
    } catch (error) {
      terminar({ ok: false, erro: traduzirErro(error, alvo, preparo) });
    }
  });
}
