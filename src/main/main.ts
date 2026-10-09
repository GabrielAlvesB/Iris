// Primeiro import: o marco de início fica antes de todos os requires do main.
import { marcar, ouvirPrimeiraTela } from './core/abertura';
import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerAllIpcHandlers } from './ipc';
import { startBackgroundServices, stopBackgroundServices } from './core/backgroundServices';
import { iconeDoApp } from './core/icone';
import { aplicarTema, corDeFundo } from './core/tema';
import { getTema } from './modules/ajustes/ajustes.service';
import { migrarEmpresas } from './modules/relatorios/relatorios.service';
import { recuperarInterrompidas } from './modules/whatsapp/whatsapp.service';

// Renderer TS compiles to ES modules; ES module scripts require a CORS-capable
// origin and are blocked when loaded from plain file:// URLs. Serving the
// renderer through a privileged custom scheme avoids needing a bundler.
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const APP_SCHEME = 'app';

// codeCache: sem ele o Chromium não guarda o bytecode dos scripts de um esquema
// próprio, e todo o JS do renderer era compilado de novo a cada abertura.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
]);

// Os dois contornos abaixo são de bugs do Chromium no Windows; no Linux a GPU
// fica ligada (pinta mais rápido) e a oclusão nativa nem existe.
if (process.platform === 'win32') {
  // Works around a known Electron/Chromium bug on Windows (especially hybrid-GPU
  // laptops) where the compositor desyncs and the window stops routing mouse
  // clicks while still rendering fine — only a forced repaint (e.g. Print Screen)
  // "unsticks" it. Disabling GPU acceleration avoids the desync entirely.
  app.disableHardwareAcceleration();

  // Chromium's Native Window Occlusion tracking (Windows-only) can misjudge the
  // window as occluded while it's actually focused and on-screen, throttling
  // input handling until something (like taking a screenshot) forces Windows to
  // recompute occlusion. Disabling it stops input from getting "stuck".
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

marcar('main.js carregado');

let mainWindow: BrowserWindow | null = null;
let servicosIniciados = false;
/** As migrações da abertura (whenReady). A fila do WhatsApp não pode rodar antes delas. */
let dadosProntos: Promise<unknown> = Promise.resolve();

function iniciarServicosUmaVez(): void {
  if (servicosIniciados) return;
  servicosIniciados = true;
  void dadosProntos.then(() => startBackgroundServices());
}

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname || '/index.html');
    const resolvedPath = path.normalize(path.join(RENDERER_ROOT, relativePath));

    if (!resolvedPath.startsWith(RENDERER_ROOT)) {
      return Promise.resolve(new Response('Forbidden', { status: 403 }));
    }

    return net.fetch(pathToFileURL(resolvedPath).toString());
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // A cor do tema (--bg do base.css) desde o primeiro quadro: sem o clarão
    // de outra cor enquanto o renderer ainda carrega.
    backgroundColor: corDeFundo(),
    icon: iconeDoApp(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  marcar('janela criada');
  mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);
  mainWindow.webContents.once('did-start-loading', () => marcar('did-start-loading'));
  mainWindow.webContents.once('did-navigate', () => marcar('did-navigate'));
  mainWindow.webContents.once('dom-ready', () => marcar('dom-ready'));
  mainWindow.webContents.once('did-finish-load', () => marcar('did-finish-load'));

  // Watchers da Biblioteca e primeiros polls só depois da primeira tela: na
  // abertura eles disputavam disco e CPU com o carregamento do renderer.
  // O teto de 5 s cobre uma carga que falhe e nunca dispare o evento.
  const iniciar = (): void => iniciarServicosUmaVez();
  mainWindow.webContents.once('did-finish-load', () => setTimeout(iniciar, 800));
  setTimeout(iniciar, 5000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  marcar('ready');
  ouvirPrimeiraTela();
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.iris.app');
  }
  registerAppProtocol();
  // Antes de qualquer dado chegar à tela: as empresas migradas (depois da primeira
  // vez é só uma leitura do arquivo, sem escrita) e o WhatsApp que ficou "enviando"
  // ao fechar — com a tela já usando o arquivo, seria impossível distinguir de um
  // envio que acabou de começar. A janela não espera: o IPC espera (ipc/index.ts).
  dadosProntos = Promise.allSettled([
    migrarEmpresas().catch((erro: unknown) => console.error('[iris] migração de empresas falhou', erro)),
    recuperarInterrompidas().catch((erro: unknown) => console.error('[whatsapp] recuperar envios', erro)),
  ]);
  registerAllIpcHandlers(dadosProntos);
  aplicarTema(getTema());
  marcar('IPC registrado');
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Aborta fetches em voo e fecha os watchers antes do processo morrer, para
// nenhum callback disparar em um app já se desmontando.
app.on('before-quit', () => {
  stopBackgroundServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
