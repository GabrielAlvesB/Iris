import path from 'node:path';

/**
 * Ícone da janela e das notificações. O Windows usa o .ico (vários tamanhos num
 * arquivo só); o Linux não lê .ico e usa o PNG. Os dois ficam em dist/main/assets.
 */
export function iconeDoApp(): string {
  return path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}
