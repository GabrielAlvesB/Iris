import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerAllIpcHandlers } from './ipc';

// Renderer TS compiles to ES modules; ES module scripts require a CORS-capable
// origin and are blocked when loaded from plain file:// URLs. Serving the
// renderer through a privileged custom scheme avoids needing a bundler.
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const APP_SCHEME = 'app';

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

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
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(`${APP_SCHEME}://app/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerAppProtocol();
  registerAllIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
