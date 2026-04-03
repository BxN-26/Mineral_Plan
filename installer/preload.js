'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  selectDir:     () => ipcRenderer.invoke('dialog:select-dir'),
  openUrl:   (url) => ipcRenderer.invoke('shell:open-url', url),
  startInstall: (cfg) => ipcRenderer.send('install:start', cfg),

  onProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('install:progress', handler);
    // Retourne une fonction de nettoyage
    return () => ipcRenderer.removeListener('install:progress', handler);
  },
});
