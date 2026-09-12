'use strict';
/**
 * Logger sederhana berbasis file, tanpa dependensi eksternal.
 * Semua error di proses utama maupun renderer dicatat ke sini supaya
 * aplikasi tidak "diam-diam crash" tanpa jejak yang bisa ditelusuri.
 */
const fs = require('fs');
const path = require('path');

let logDir = null;
let logFile = null;
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB, dirotasi kalau kelebihan

function init(userDataPath) {
  logDir = path.join(userDataPath, 'logs');
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    // Kalau folder log saja gagal dibuat, jangan sampai app ikut mati.
    console.error('Gagal membuat folder log:', e);
  }
  logFile = path.join(logDir, 'app.log');
  rotateIfNeeded();
}

function rotateIfNeeded() {
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) {
      const old = path.join(logDir, `app.old.log`);
      fs.rmSync(old, { force: true });
      fs.renameSync(logFile, old);
    }
  } catch (e) {
    // abaikan kegagalan rotasi, tidak kritikal
  }
}

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, extra) {
  const line = `[${timestamp()}] [${level}] ${message}${extra ? '\n' + extra : ''}\n`;
  try {
    if (logFile) {
      fs.appendFileSync(logFile, line, 'utf8');
    } else {
      // Sebelum init() dipanggil, minimal tetap tampil di console.
      console.log(line);
    }
  } catch (e) {
    // Jika penulisan log gagal (misalnya disk penuh), jangan lempar error baru.
    console.error('Gagal menulis log:', e);
  }
}

function info(message) {
  write('INFO', message);
}

function warn(message) {
  write('WARN', message);
}

function error(message, err) {
  const stack = err && err.stack ? err.stack : (err ? String(err) : undefined);
  write('ERROR', message, stack);
}

function getLogFilePath() {
  return logFile;
}

module.exports = { init, info, warn, error, getLogFilePath };
