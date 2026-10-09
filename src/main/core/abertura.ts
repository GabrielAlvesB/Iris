import { app, ipcMain } from 'electron';
import { APP_CHANNELS } from '../../shared/ipcChannels';

/**
 * Tempo de abertura, para medir antes de otimizar. Desligado por padrão:
 * - IRIS_MEDIR_ABERTURA=1 imprime os marcos no console (segundos desde o início do processo);
 * - IRIS_SAIR_APOS_ABRIR=1 fecha o app quando a primeira tela aparece — o teste
 *   de fumaça do Linux no GitHub Actions usa isto para saber que o app abriu.
 */

const medir = process.env.IRIS_MEDIR_ABERTURA === '1';
const sairAposAbrir = process.env.IRIS_SAIR_APOS_ABRIR === '1';
const marcos: Array<[string, number]> = [];
if (medir || sairAposAbrir) marcos.push(['main.js começou', process.uptime()]);

export function marcar(nome: string): void {
  if (medir || sairAposAbrir) marcos.push([nome, process.uptime()]);
}

/** O renderer avisa quando a primeira tela tem conteúdo (app.ts, depois do primeiro mount). */
export function ouvirPrimeiraTela(): void {
  ipcMain.on(APP_CHANNELS.primeiraTela, (_event, msNoRenderer: unknown) => {
    marcar('primeira tela');
    if (medir || sairAposAbrir) {
      const linhas = marcos.map(([nome, t]) => `  ${t.toFixed(3).padStart(7)} s  ${nome}`);
      const noRenderer = typeof msNoRenderer === 'number' ? ` (renderer: ${Math.round(msNoRenderer)} ms desde a navegação)` : '';
      console.log(`[abertura]${noRenderer}\n${linhas.join('\n')}`);
    }
    if (sairAposAbrir) setTimeout(() => app.quit(), 300);
  });
}
