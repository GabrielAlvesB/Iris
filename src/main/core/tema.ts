import { BrowserWindow, nativeTheme } from 'electron';
import type { Tema } from '../../shared/types/ajustes.types';

/**
 * Tema da janela. O claro/escuro da tela é CSS (data-tema no <html>); aqui
 * ficam as duas coisas que o CSS não alcança: a cor de fundo da janela — o
 * primeiro quadro, antes do renderer pintar, e a cor que o salvarPdfDaJanela
 * restaura — e o `themeSource`, que faz o prefers-color-scheme do renderer
 * seguir o Windows quando o tema é "sistema".
 */

/** Os --bg do base.css, um por tema. */
const FUNDO = { escuro: '#0c0d12', claro: '#f5f6f8' } as const;

let temaAtual: Tema = 'escuro';
let ouvindoSistema = false;

export function corDeFundo(tema: Tema = temaAtual): string {
  if (tema === 'sistema') return nativeTheme.shouldUseDarkColors ? FUNDO.escuro : FUNDO.claro;
  return FUNDO[tema];
}

export function aplicarTema(tema: Tema): void {
  temaAtual = tema;
  nativeTheme.themeSource = tema === 'escuro' ? 'dark' : tema === 'claro' ? 'light' : 'system';
  BrowserWindow.getAllWindows().forEach((j) => j.setBackgroundColor(corDeFundo()));
  if (!ouvindoSistema) {
    ouvindoSistema = true;
    // O Windows trocou de tema com o Iris em "sistema": a cor da janela acompanha.
    nativeTheme.on('updated', () => {
      if (temaAtual === 'sistema') BrowserWindow.getAllWindows().forEach((j) => j.setBackgroundColor(corDeFundo()));
    });
  }
}
