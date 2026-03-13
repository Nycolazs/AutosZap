"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/electron/index.js
var require_electron = __commonJS({
  "../../node_modules/electron/index.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var pathFile = path.join(__dirname, "path.txt");
    function getElectronPath() {
      let executablePath;
      if (fs.existsSync(pathFile)) {
        executablePath = fs.readFileSync(pathFile, "utf-8");
      }
      if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || "electron");
      }
      if (executablePath) {
        return path.join(__dirname, "dist", executablePath);
      } else {
        throw new Error("Electron failed to install correctly, please delete node_modules/electron and try installing again");
      }
    }
    module2.exports = getElectronPath();
  }
});

// electron/main.ts
var import_electron = __toESM(require_electron());
var import_electron_updater = require("electron-updater");
var import_node_fs = require("fs");
var import_node_path = require("path");
var mainWindow = null;
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
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#03101f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: (0, import_node_path.join)(__dirname, "preload.js")
    }
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  if (!import_electron.app.isPackaged) {
    await mainWindow.loadURL(devServerUrl);
  } else {
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
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
