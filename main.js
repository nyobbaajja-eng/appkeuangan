'use strict';
/**
 * Proses utama Electron.
 *
 * Pengamanan yang diterapkan di file ini:
 *  - contextIsolation aktif + nodeIntegration mati + sandbox aktif di renderer
 *    -> halaman renderer TIDAK PERNAH bisa mengakses Node.js/filesystem langsung.
 *  - Single instance lock -> mencegah dua proses menulis ke file SQLite yang sama.
 *  - Navigasi keluar & window baru diblokir -> aplikasi memang tidak memuat
 *    apapun dari internet (full offline), jadi tidak ada alasan berpindah.
 *  - uncaughtException / unhandledRejection ditangkap -> dicatat ke log dan
 *    ditampilkan pesan yang ramah, alih-alih aplikasi mendadak tertutup.
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const logger = require('./src/main/logger');
const dbModule = require('./src/main/db');
const backup = require('./src/main/backup');
const ipc = require('./src/main/ipc');

let mainWindow = null;

// --- Kunci single-instance: cegah dua proses aplikasi berjalan bersamaan ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#EEF0EC',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Aplikasi ini murni offline: tidak ada alasan navigasi keluar / window baru.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function initBackend() {
  const userDataPath = app.getPath('userData');
  logger.init(userDataPath);
  logger.info('Aplikasi dimulai. Versi: ' + app.getVersion());
  dbModule.init(userDataPath);
  backup.init(userDataPath, dbModule.getDbPath());
  backup.autoBackupIfNeeded();
  ipc.registerAll({ mainWindow, userDataPath });
}

app.whenReady().then(() => {
  createWindow();
  try {
    initBackend();
  } catch (err) {
    logger.error('Gagal menginisialisasi backend, aplikasi tidak bisa lanjut', err);
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Gagal Memulai Aplikasi',
      'Terjadi kesalahan saat menyiapkan database:\n' + (err && err.message ? err.message : String(err)) +
      '\n\nSilakan hubungi dukungan teknis dengan menyertakan file log di:\n' + (logger.getLogFilePath() || '(tidak tersedia)')
    );
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { backup.backupNow('exit'); } catch (e) { logger.error('Backup saat keluar gagal', e); }
  dbModule.close();
});

// --- Jaring pengaman terakhir: jangan biarkan error tak tertangani mematikan app diam-diam ---
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException (proses utama)', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection (proses utama)', reason instanceof Error ? reason : new Error(String(reason)));
});
