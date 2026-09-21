import fs from 'node:fs';
import path from 'node:path';
import { broadcast, broadcastErro } from '../../core/broadcast';

/**
 * Watchers das pastas monitoradas.
 *
 * Usa fs.watch nativo em vez de chokidar: o alvo é Windows, onde o modo
 * recursivo é nativo (ReadDirectoryChangesW), e o projeto já vai gastar o
 * orçamento de risco de empacotamento com o ssh2.
 */

/** Salvar um arquivo grande dispara dezenas de eventos; só emitimos no fim da rajada. */
const DEBOUNCE_MS = 250;
const MAX_RAIZES = 8;

interface RaizVigiada {
  raizId: string;
  caminho: string;
  watcher: fs.FSWatcher;
  timer: NodeJS.Timeout | null;
  pendentes: Set<string>;
}

const vigiadas = new Map<string, RaizVigiada>();

function emitir(entrada: RaizVigiada): void {
  entrada.timer = null;
  const pastasAfetadas = Array.from(entrada.pendentes);
  entrada.pendentes.clear();
  if (pastasAfetadas.length === 0) return;

  broadcast('explorador:mudou', { raizId: entrada.raizId, pastasAfetadas });
}

function aoMudar(entrada: RaizVigiada, nomeRelativo: string | null): void {
  // No Windows o filename vem relativo à raiz, mas em rajadas pode vir null —
  // aí sinalizamos a própria raiz e a tela re-lista o diretório aberto.
  const dirRelativo = nomeRelativo ? path.dirname(nomeRelativo) : '.';
  entrada.pendentes.add(dirRelativo === '.' ? '' : dirRelativo.split(path.sep).join('/'));

  if (entrada.timer) clearTimeout(entrada.timer);
  entrada.timer = setTimeout(() => emitir(entrada), DEBOUNCE_MS);
}

export function iniciarWatch(raizId: string, caminho: string): void {
  if (vigiadas.has(raizId)) return;

  if (vigiadas.size >= MAX_RAIZES) {
    broadcastErro('explorador', new Error(`Limite de ${MAX_RAIZES} pastas monitoradas atingido.`));
    return;
  }

  try {
    const watcher = fs.watch(caminho, { recursive: true, persistent: true });
    const entrada: RaizVigiada = {
      raizId,
      caminho,
      watcher,
      timer: null,
      pendentes: new Set(),
    };

    watcher.on('change', (_tipo, filename) => {
      aoMudar(entrada, typeof filename === 'string' ? filename : null);
    });

    watcher.on('error', (error) => {
      // Pendrive removido, pasta apagada, permissão perdida.
      pararWatch(raizId);
      broadcastErro('explorador', error);
    });

    vigiadas.set(raizId, entrada);
  } catch (error) {
    broadcastErro('explorador', error);
  }
}

export function pararWatch(raizId: string): void {
  const entrada = vigiadas.get(raizId);
  if (!entrada) return;

  if (entrada.timer) clearTimeout(entrada.timer);
  entrada.watcher.close();
  vigiadas.delete(raizId);
}

export function pararTodosOsWatchers(): void {
  Array.from(vigiadas.keys()).forEach(pararWatch);
}
