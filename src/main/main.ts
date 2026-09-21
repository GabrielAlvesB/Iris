import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerAllIpcHandlers } from './ipc';
import { startBackgroundServices, stopBackgroundServices } from './core/backgroundServices';

// Renderer TS compiles to ES modules; ES module scripts require a CORS-capable
// origin and are blocked when loaded from plain file:// URLs. Serving the
// renderer through a privileged custom scheme avoids needing a bundler.
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const APP_SCHEME = 'app';

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

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

let mainWindow: BrowserWindow | null = null;

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
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.iris.app');
  }
  registerAppProtocol();
  registerAllIpcHandlers();
  createMainWindow();
  void startBackgroundServices();

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
