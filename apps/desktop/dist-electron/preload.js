"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("autoszapDesktop", {
  getSession: () => import_electron.ipcRenderer.invoke("session:get"),
  setSession: (session) => import_electron.ipcRenderer.invoke("session:set", session),
  clearSession: () => import_electron.ipcRenderer.invoke("session:clear"),
  notify: (payload) => import_electron.ipcRenderer.invoke("desktop:notify", payload),
  getVersion: () => import_electron.ipcRenderer.invoke("desktop:get-version"),
  openExternal: (target) => import_electron.ipcRenderer.invoke("desktop:open-external", target),
  onOpenLink: (callback) => {
    const listener = (_event, linkHref) => {
      callback(linkHref);
    };
    import_electron.ipcRenderer.on("desktop:open-link", listener);
    return () => import_electron.ipcRenderer.removeListener("desktop:open-link", listener);
  }
});
