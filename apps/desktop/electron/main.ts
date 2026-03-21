import { app, BrowserWindow, Notification, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    workspaceId: string;
  };
  workspace?: {
    id?: string;
    name: string;
    slug: string;
    companyName?: string;
  };
};

let mainWindow: BrowserWindow | null = null;

const DEFAULT_DEV_WEB_URL = 'http://localhost:3000';
const DEFAULT_PROD_WEB_URL = 'https://autoszap.com';

const DEBUG_LOGS = process.env.DESKTOP_DEBUG === 'true';
function debugLog(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_LOGS) {
    return;
  }

  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  // eslint-disable-next-line no-console
  console.log(`[desktop] ${message}${payload}`);
}

function getWindowIconPath() {
  if (process.platform !== 'win32') {
    return undefined;
  }

  if (app.isPackaged) {
    return undefined;
  }

  const candidate = join(app.getAppPath(), '../../frontend/public/brand/autoszap-icon.png');
  return existsSync(candidate) ? candidate : undefined;
}

function getDesktopWebUrl() {
  const configured = process.env.DESKTOP_WEB_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  return app.isPackaged ? DEFAULT_PROD_WEB_URL : DEFAULT_DEV_WEB_URL;
}

function getSessionPath() {
  return join(app.getPath('userData'), 'session.json');
}

function readSession() {
  const filePath = getSessionPath();

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as StoredSession;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null) {
  const filePath = getSessionPath();
  mkdirSync(app.getPath('userData'), { recursive: true });

  if (!session) {
    rmSync(filePath, { force: true });
    return;
  }

  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

async function createWindow() {
  const icon = getWindowIconPath();
  debugLog('createWindow', { icon, isPackaged: app.isPackaged, appPath: app.getAppPath() });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#03101f',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    icon,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    debugLog('mainWindow closed');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!mainWindow) {
      return;
    }

    const currentUrl = mainWindow.webContents.getURL();
    const currentOrigin = currentUrl ? new URL(currentUrl).origin : null;
    const nextOrigin = new URL(targetUrl).origin;

    if (currentOrigin && currentOrigin !== nextOrigin) {
      event.preventDefault();
      void shell.openExternal(targetUrl);
    }
  });

  const targetUrl = getDesktopWebUrl();
  debugLog('loadURL', { targetUrl });

  try {
    await mainWindow.loadURL(targetUrl);
  } catch {
    await mainWindow.loadFile(join(__dirname, '../dist-renderer/index.html'));
  }
}

function setupAutoUpdates() {
  if (!app.isPackaged) {
    return;
  }

  try {
    void autoUpdater.checkForUpdatesAndNotify();
  } catch {
    // Falhas de auto update nao devem impedir o uso do app.
  }
}

app.whenReady().then(async () => {
  debugLog('app ready');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.autoszap.desktop');
  }

  ipcMain.handle('session:get', () => readSession());
  ipcMain.handle('session:set', (_event, session: StoredSession) => {
    writeSession(session);
    return true;
  });
  ipcMain.handle('session:clear', () => {
    writeSession(null);
    return true;
  });
  ipcMain.handle(
    'desktop:notify',
    (_event, payload: { title: string; body: string; linkHref?: string }) => {
      const notification = new Notification({
        title: payload.title,
        body: payload.body,
      });

      notification.on('click', () => {
        if (!mainWindow) {
          return;
        }

        mainWindow.focus();
        mainWindow.webContents.send('desktop:open-link', payload.linkHref ?? null);
      });

      notification.show();
      return true;
    },
  );
  ipcMain.handle('desktop:get-version', () => app.getVersion());
  ipcMain.handle('desktop:open-external', (_event, target: string) =>
    shell.openExternal(target),
  );

  await createWindow();
  setupAutoUpdates();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  debugLog('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
