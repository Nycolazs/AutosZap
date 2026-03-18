"use strict";

// electron/main.ts
var import_electron = require("electron");
var import_electron_updater = require("electron-updater");
var import_node_fs = require("fs");
var import_node_path = require("path");
var mainWindow = null;
var DEFAULT_DEV_WEB_URL = "http://localhost:3000";
var DEFAULT_PROD_WEB_URL = "https://autoszap.com";
var DEBUG_LOGS = process.env.DESKTOP_DEBUG === "true";
function debugLog(message, extra) {
  if (!DEBUG_LOGS) {
    return;
  }
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[desktop] ${message}${payload}`);
}
function getWindowIconPath() {
  if (process.platform !== "win32") {
    return void 0;
  }
  if (import_electron.app.isPackaged) {
    return void 0;
  }
  const candidate = (0, import_node_path.join)(import_electron.app.getAppPath(), "../../frontend/public/brand/autoszap-icon.png");
  return (0, import_node_fs.existsSync)(candidate) ? candidate : void 0;
}
function getDesktopWebUrl() {
  const configured = process.env.DESKTOP_WEB_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return import_electron.app.isPackaged ? DEFAULT_PROD_WEB_URL : DEFAULT_DEV_WEB_URL;
}
function getSessionPath() {
  return (0, import_node_path.join)(import_electron.app.getPath("userData"), "session.json");
}
function readSession() {
  const filePath = getSessionPath();
  if (!(0, import_node_fs.existsSync)(filePath)) {
    return null;
  }
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeSession(session) {
  const filePath = getSessionPath();
  (0, import_node_fs.mkdirSync)(import_electron.app.getPath("userData"), { recursive: true });
  if (!session) {
    (0, import_node_fs.rmSync)(filePath, { force: true });
    return;
  }
  (0, import_node_fs.writeFileSync)(filePath, JSON.stringify(session, null, 2), "utf-8");
}
async function createWindow() {
  const icon = getWindowIconPath();
  debugLog("createWindow", { icon, isPackaged: import_electron.app.isPackaged, appPath: import_electron.app.getAppPath() });
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#03101f",
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    icon,
    webPreferences: {
      preload: (0, import_node_path.join)(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on("closed", () => {
    debugLog("mainWindow closed");
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void import_electron.shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, targetUrl2) => {
    if (!mainWindow) {
      return;
    }
    const currentUrl = mainWindow.webContents.getURL();
    const currentOrigin = currentUrl ? new URL(currentUrl).origin : null;
    const nextOrigin = new URL(targetUrl2).origin;
    if (currentOrigin && currentOrigin !== nextOrigin) {
      event.preventDefault();
      void import_electron.shell.openExternal(targetUrl2);
    }
  });
  const targetUrl = getDesktopWebUrl();
  debugLog("loadURL", { targetUrl });
  try {
    await mainWindow.loadURL(targetUrl);
  } catch {
    await mainWindow.loadFile((0, import_node_path.join)(__dirname, "../dist-renderer/index.html"));
  }
}
function setupAutoUpdates() {
  if (!import_electron.app.isPackaged || !process.env.DESKTOP_UPDATES_BASE_URL) {
    return;
  }
  try {
    import_electron_updater.autoUpdater.setFeedURL({
      provider: "generic",
      url: process.env.DESKTOP_UPDATES_BASE_URL
    });
    void import_electron_updater.autoUpdater.checkForUpdatesAndNotify();
  } catch {
  }
}
import_electron.app.whenReady().then(async () => {
  debugLog("app ready");
  if (process.platform === "win32") {
    import_electron.app.setAppUserModelId("com.autoszap.desktop");
  }
  import_electron.ipcMain.handle("session:get", () => readSession());
  import_electron.ipcMain.handle("session:set", (_event, session) => {
    writeSession(session);
    return true;
  });
  import_electron.ipcMain.handle("session:clear", () => {
    writeSession(null);
    return true;
  });
  import_electron.ipcMain.handle(
    "desktop:notify",
    (_event, payload) => {
      const notification = new import_electron.Notification({
        title: payload.title,
        body: payload.body
      });
      notification.on("click", () => {
        if (!mainWindow) {
          return;
        }
        mainWindow.focus();
        mainWindow.webContents.send("desktop:open-link", payload.linkHref ?? null);
      });
      notification.show();
      return true;
    }
  );
  import_electron.ipcMain.handle("desktop:get-version", () => import_electron.app.getVersion());
  import_electron.ipcMain.handle(
    "desktop:open-external",
    (_event, target) => import_electron.shell.openExternal(target)
  );
  await createWindow();
  setupAutoUpdates();
  import_electron.app.on("activate", async () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  debugLog("window-all-closed");
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
