import { randomUUID } from 'node:crypto';
import type * as Ssh2 from 'ssh2';
import { broadcast } from '../../core/broadcast';
import type { ServidorSsh, SessaoTerminal } from '../../../shared/types/servidores.types';
import { novoCliente, prepararConexao, responderSenha, traduzirErro, type Preparo, type SegredosSsh } from './servidores.conexao';

/**
 * Terminal interativo: um shell de verdade no servidor (pty `xterm-256color`), com
 * a tela desenhada pelo xterm.js no renderer.
 *
 * As sessões moram aqui, não na tela: trocar de módulo e voltar reencontra o
 * terminal como estava (o buffer guarda a saída recente para redesenhar). Fecham
 * no "sair", no X da aba, quando o servidor é removido ou quando o app fecha.
 */

/** Saída guardada por sessão para reanexar a tela — um `htop` redesenha tudo em segundos, isto basta. */
const MAX_BUFFER = 200_000;
/**
 * A saída sai em lotes: um `cat` de arquivo grande chegaria em milhares de
 * pedaços, um push cada, e o IPC engasgaria. ~1 quadro de espera não se nota.
 */
const LOTE_MS = 16;
/** Sessões fechadas continuam listadas (com "Reconectar") até o usuário fechar a aba. */
const MAX_SESSOES = 12;

interface Sessao {
  info: SessaoTerminal;
  conn: Ssh2.Client;
  stream: Ssh2.ClientChannel | null;
  buffer: string;
  pendente: string;
  timer: NodeJS.Timeout | null;
  cols: number;
  rows: number;
}

const sessoes = new Map<string, Sessao>();

const CINZA = '\x1b[2m';
const NORMAL = '\x1b[0m';

function anexar(s: Sessao, texto: string): void {
  s.buffer += texto;
  if (s.buffer.length > MAX_BUFFER) s.buffer = s.buffer.slice(-MAX_BUFFER);
  s.pendente += texto;
  if (!s.timer) {
    s.timer = setTimeout(() => {
      s.timer = null;
      const dados = s.pendente;
      s.pendente = '';
      if (dados) broadcast('servidores:terminal', { sessaoId: s.info.sessaoId, dados });
    }, LOTE_MS);
  }
}

function encerrar(s: Sessao, motivo: string, chaveMudou = false): void {
  if (!s.info.aberta && s.info.motivo) return;
  s.info.aberta = false;
  s.info.motivo = motivo;
  if (chaveMudou) s.info.chaveMudou = true;
  anexar(s, `\r\n${CINZA}— ${motivo}${NORMAL}\r\n`);
  try {
    s.conn.end();
  } catch {
    // já fechada
  }
  // O "fim" vai depois do último lote de saída.
  setTimeout(() => broadcast('servidores:terminal', { sessaoId: s.info.sessaoId, fim: motivo, chaveMudou: s.info.chaveMudou }), LOTE_MS * 2);
}

function tituloPara(servidor: ServidorSsh): string {
  const doMesmo = [...sessoes.values()].filter((s) => s.info.servidorId === servidor.id).length;
  return doMesmo === 0 ? servidor.nome : `${servidor.nome} (${doMesmo + 1})`;
}

function podarFechadas(): void {
  if (sessoes.size < MAX_SESSOES) return;
  for (const [id, s] of sessoes) {
    if (!s.info.aberta) {
      sessoes.delete(id);
      if (sessoes.size < MAX_SESSOES) return;
    }
  }
}

/**
 * Abre a sessão e devolve o id na hora; a conexão anda pelo push (a primeira linha
 * é "Conectando…"). `aoConectar` recebe a impressão digital vista, para o service
 * gravar a primeira.
 */
export function abrirTerminal(
  servidor: ServidorSsh,
  segredos: SegredosSsh,
  cols: number,
  rows: number,
  aoConectar: (impressao: string | undefined) => void,
): SessaoTerminal {
  podarFechadas();
  if ([...sessoes.values()].filter((s) => s.info.aberta).length >= MAX_SESSOES) {
    throw new Error(`Já há ${MAX_SESSOES} terminais abertos. Feche algum antes de abrir outro.`);
  }

  const info: SessaoTerminal = {
    sessaoId: randomUUID(),
    servidorId: servidor.id,
    titulo: tituloPara(servidor),
    aberta: true,
    abertaEm: new Date().toISOString(),
  };
  const conn = novoCliente();
  const s: Sessao = { info, conn, stream: null, buffer: '', pendente: '', timer: null, cols: limitar(cols, 20, 500), rows: limitar(rows, 5, 200) };
  sessoes.set(info.sessaoId, s);
  anexar(s, `${CINZA}Conectando a ${servidor.usuario}@${servidor.host}:${servidor.porta}…${NORMAL}\r\n`);

  let preparo: Preparo;
  try {
    preparo = prepararConexao(servidor, segredos);
  } catch (error) {
    encerrar(s, error instanceof Error ? error.message : String(error));
    return { ...info };
  }
  responderSenha(conn, segredos.senha);

  conn.on('ready', () => {
    aoConectar(preparo.vista());
    conn.shell({ term: 'xterm-256color', cols: s.cols, rows: s.rows }, (err, stream) => {
      if (err) {
        encerrar(s, `O servidor não abriu um shell: ${err.message}`);
        return;
      }
      s.stream = stream;
      stream.on('data', (p: Buffer) => anexar(s, p.toString('utf-8')));
      stream.stderr.on('data', (p: Buffer) => anexar(s, p.toString('utf-8')));
      stream.on('close', () => encerrar(s, 'Sessão encerrada.'));
    });
  });
  conn.on('error', (error) => encerrar(s, traduzirErro(error, servidor, preparo), preparo.mudou()));
  conn.on('close', () => encerrar(s, 'Conexão fechada.'));

  try {
    conn.connect(preparo.config);
  } catch (error) {
    encerrar(s, traduzirErro(error, servidor, preparo));
  }
  return { ...info };
}

function limitar(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}

function achar(sessaoId: string): Sessao {
  const s = sessoes.get(sessaoId);
  if (!s) throw new Error('Este terminal já foi fechado.');
  return s;
}

export function escreverTerminal(sessaoId: string, dados: string): void {
  const s = achar(sessaoId);
  if (typeof dados !== 'string' || !s.stream || !s.info.aberta) return;
  s.stream.write(dados);
}

export function redimensionarTerminal(sessaoId: string, cols: number, rows: number): void {
  const s = achar(sessaoId);
  s.cols = limitar(cols, 20, 500);
  s.rows = limitar(rows, 5, 200);
  // setWindow(linhas, colunas, altura px, largura px) — px zerados: o servidor usa as células.
  s.stream?.setWindow(s.rows, s.cols, 0, 0);
}

/** Fecha a conexão e tira a aba. */
export function fecharTerminal(sessaoId: string): void {
  const s = sessoes.get(sessaoId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  s.info.aberta = false;
  s.info.motivo ??= 'Fechado.';
  try {
    s.conn.end();
  } catch {
    // já fechada
  }
  sessoes.delete(sessaoId);
}

export function listarSessoes(): SessaoTerminal[] {
  return [...sessoes.values()].map((s) => ({ ...s.info }));
}

/**
 * Só o que já saiu pelo push: o lote pendente chega logo depois pelo canal de
 * sempre, e entregá-lo aqui também o escreveria duas vezes.
 */
export function lerBuffer(sessaoId: string): string {
  const s = sessoes.get(sessaoId);
  if (!s) return '';
  return s.pendente.length >= s.buffer.length ? '' : s.buffer.slice(0, s.buffer.length - s.pendente.length);
}

/** O servidor foi removido: as sessões dele fecham junto. */
export function fecharDoServidor(servidorId: string): void {
  for (const s of [...sessoes.values()]) {
    if (s.info.servidorId === servidorId) fecharTerminal(s.info.sessaoId);
  }
}

/** before-quit: fecha tudo sem esperar. */
export function fecharTodos(): void {
  for (const id of [...sessoes.keys()]) fecharTerminal(id);
}
