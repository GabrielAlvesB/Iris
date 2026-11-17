import type { Terminal as TerminalType } from '@xterm/xterm';
import type { FitAddon as FitAddonType } from '@xterm/addon-fit';

/**
 * O xterm.js entra por <script> clássico, carregado sob demanda pelo terminal de
 * Servidores (servidores.terminal.ts): o build UMD define estes globais na janela.
 */
declare global {
  interface Window {
    Terminal?: typeof TerminalType;
    FitAddon?: { FitAddon: typeof FitAddonType };
  }
}

export {};
