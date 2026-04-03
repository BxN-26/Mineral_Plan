'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path        = require('path');
const { runInstall } = require('./scripts/installer-core');

let win;

// ── Fenêtre principale ────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:            860,
    height:           660,
    resizable:        false,
    maximizable:      false,
    fullscreenable:   false,
    title:            'Minéral Spirit — Installateur',
    backgroundColor:  '#FAFAF8',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.setMenuBarVisibility(false);

  // Sécurité : empêcher la navigation vers des URLs externes dans la fenêtre
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC : informations système ────────────────────────────────────────────────
ipcMain.handle('system:info', () => ({
  platform:          process.platform,
  isWindows:         process.platform === 'win32',
  isLinux:           process.platform === 'linux',
  nodeVersion:       process.version,
  isPackaged:        app.isPackaged,
  defaultInstallDir: process.platform === 'win32'
    ? 'C:\\Program Files\\Mineral Spirit'
    : '/opt/mineral-spirit',
}));

// ── IPC : sélecteur de répertoire ─────────────────────────────────────────────
ipcMain.handle('dialog:select-dir', async () => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, {
    title:      "Répertoire d'installation",
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

// ── IPC : ouvrir URL dans le navigateur système ───────────────────────────────
ipcMain.handle('shell:open-url', (_, url) => shell.openExternal(url));

// ── IPC : démarrer l'installation ─────────────────────────────────────────────
ipcMain.on('install:start', (_, config) => {
  const send = (data) => {
    if (win && !win.isDestroyed())
      win.webContents.send('install:progress', data);
  };

  runInstall({ ...config, isPackaged: app.isPackaged }, send)
    .catch(err => send({ type: 'fatal', message: err.message }));
});
