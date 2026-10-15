import { BrowserWindow, nativeTheme } from 'electron';
import type { Tema } from '../../shared/types/ajustes.types';
import { acentoDoDestaque, fundoDaJanela } from '../../shared/types/cor';
import { getDestaque, getIntensidade } from '../modules/ajustes/ajustes.service';

/**
 * Tema da janela. O claro/escuro da tela é CSS (data-tema no <html>); aqui
 * ficam as duas coisas que o CSS não alcança: a cor de fundo da janela — o
 * primeiro quadro, antes do renderer pintar, e a cor que o salvarPdfDaJanela
 * restaura — e o `themeSource`, que faz o prefers-color-scheme do renderer
 * seguir o Windows quando o tema é "sistema".
 */

/** Os --bg neutros de antes da 0.4: o recurso se a leitura dos ajustes falhar. */
const FUNDO = { escuro: '#0c0d12', claro: '#f5f6f8' } as const;

let temaAtual: Tema = 'escuro';
let ouvindoSistema = false;

/**
 * Desde a 0.4 o --bg é tingido pela cor de destaque (base.css): a janela nasce
 * na mesma cor, calculada pela mesma conta (fundoDaJanela, cor.ts).
 */
export function corDeFundo(tema: Tema = temaAtual): string {
  const escuro = tema === 'sistema' ? nativeTheme.shouldUseDarkColors : tema === 'escuro';
  try {
    return fundoDaJanela(acentoDoDestaque(getDestaque()), getIntensidade(), escuro);
  } catch {
    return escuro ? FUNDO.escuro : FUNDO.claro;
  }
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
