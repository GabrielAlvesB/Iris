// Gera os ícones do app a partir de marca/icone.svg: `npm run icones`.
//
// Roda dentro do Electron (não do Node) porque é o Chromium que desenha o SVG —
// assim não entra dependência nova só para rasterizar. O .ico leva um PNG por
// tamanho: o Windows escolhe o mais próximo para a bandeja (16/20/24), a barra
// de tarefas (32/40/48) e o Iniciar (256), em vez de reduzir o de 256 e borrar.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const svg = readFileSync(path.join(raiz, 'marca', 'icone.svg'), 'utf8');
const svgPequeno = readFileSync(path.join(raiz, 'marca', 'icone-pequeno.svg'), 'utf8');
const TAMANHOS_ICO = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

async function rasterizar(janela, tamanho) {
  const fonte = tamanho <= 24 ? svgPequeno : svg;
  const url = await janela.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(fonte).toString('base64'))};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = ${tamanho};
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, ${tamanho}, ${tamanho});
    return c.toDataURL('image/png');
  })()`);
  return Buffer.from(url.split(',')[1], 'base64');
}

function montarIco(pngs) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(pngs.length, 4);
  const entradas = [];
  let deslocamento = 6 + 16 * pngs.length;
  for (const { tamanho, dados } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(dados.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += dados.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecalho, ...entradas, ...pngs.map((p) => p.dados)]);
}

app.whenReady().then(async () => {
  const janela = new BrowserWindow({ show: false });
  await janela.loadURL('data:text/html,<!doctype html><title>icones</title>');

  const pngs = [];
  for (const tamanho of TAMANHOS_ICO) pngs.push({ tamanho, dados: await rasterizar(janela, tamanho) });
  writeFileSync(path.join(raiz, 'src', 'main', 'assets', 'icon.ico'), montarIco(pngs));
  // Linux (janela, notificações, .deb e AppImage): o electron-builder pede 512 para o tema de ícones.
  writeFileSync(path.join(raiz, 'src', 'main', 'assets', 'icon.png'), await rasterizar(janela, 512));
  writeFileSync(path.join(raiz, 'src', 'renderer', 'assets', 'icon-64.png'), await rasterizar(janela, 64));
  // Só para conferir de olho; não entra no app.
  writeFileSync(path.join(raiz, 'marca', 'previa-1024.png'), await rasterizar(janela, 1024));

  console.log('Ícones gerados:', TAMANHOS_ICO.join(', '), '+ 512 (Linux) + 64 (favicon)');
  app.quit();
});
