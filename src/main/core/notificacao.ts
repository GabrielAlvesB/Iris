import { BrowserWindow, Notification } from 'electron';
import { iconeDoApp } from './icone';

/**
 * Notificação do sistema com clique que funciona. Usada pelos lembretes, pelo
 * Pomodoro e pela bandeja (os leads e o WhatsApp têm a sua, mais antiga, com a
 * mesma regra). Nunca lança: sem suporte a notificação, só não aparece.
 */

/** Sem referência viva, o coletor de lixo leva a notificação e o clique se perde. */
const vivas = new Set<Notification>();

export function janelaPrincipal(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
}

/** Traz a janela para a frente — também quando está escondida na bandeja. */
export function focarJanela(): void {
  const janela = janelaPrincipal();
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

export function notificacaoDisponivel(): boolean {
  try {
    return Notification.isSupported();
  } catch {
    return false;
  }
}

export function notificar(titulo: string, corpo: string, aoClicar?: () => void): void {
  if (!notificacaoDisponivel()) return;
  try {
    const n = new Notification({ title: titulo, body: corpo, icon: iconeDoApp() });
    vivas.add(n);
    const soltar = (): void => {
      vivas.delete(n);
    };
    n.on('click', () => {
      soltar();
      focarJanela();
      aoClicar?.();
    });
    n.on('close', soltar);
    n.show();
    // Uma notificação que ninguém clicou some da central sozinha; não guardar para sempre.
    setTimeout(soltar, 10 * 60_000);
  } catch (erro) {
    console.error('[notificacao] não deu para mostrar', erro);
  }
}
