import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('autoszapDesktop', {
  getSession: () => ipcRenderer.invoke('session:get'),
  setSession: (session: unknown) => ipcRenderer.invoke('session:set', session),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  notify: (payload: { title: string; body: string; linkHref?: string }) =>
    ipcRenderer.invoke('desktop:notify', payload),
  getVersion: () => ipcRenderer.invoke('desktop:get-version'),
  openExternal: (target: string) =>
    ipcRenderer.invoke('desktop:open-external', target),
  onOpenLink: (callback: (linkHref: string | null) => void) => {
    const listener = (_event: unknown, linkHref: string | null) => {
      callback(linkHref);
    };

    ipcRenderer.on('desktop:open-link', listener);
    return () => ipcRenderer.removeListener('desktop:open-link', listener);
  },
});
