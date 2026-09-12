'use strict';
/**
 * Backup & restore file database (.db).
 * - Backup otomatis dijalankan sekali per hari (saat aplikasi dibuka) dan
 *   sebelum operasi berisiko (import Excel, restore).
 * - Menyimpan maksimal MAX_BACKUPS file terbaru, sisanya dihapus otomatis
 *   supaya folder tidak membengkak tanpa batas.
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const MAX_BACKUPS = 30;
let backupDir = null;
let dbPathRef = null;

function init(userDataPath, dbPath) {
  backupDir = path.join(userDataPath, 'backups');
  dbPathRef = dbPath;
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
}

function timestampForFile() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const full = path.join(backupDir, f);
      const stat = fs.statSync(full);
      return { file: f, path: full, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneOldBackups() {
  const backups = listBackups();
  if (backups.length <= MAX_BACKUPS) return;
  const toRemove = backups.slice(MAX_BACKUPS);
  for (const b of toRemove) {
    try { fs.rmSync(b.path, { force: true }); } catch (e) { logger.error('Gagal menghapus backup lama ' + b.path, e); }
  }
}

function backupNow(reason = 'manual') {
  if (!dbPathRef || !fs.existsSync(dbPathRef)) throw new Error('File database belum ada, tidak ada yang dibackup');
  const target = path.join(backupDir, `backup-${reason}-${timestampForFile()}.db`);
  // Salin juga file -wal / -shm jika ada supaya data yang belum di-checkpoint ikut tersalin utuh.
  fs.copyFileSync(dbPathRef, target);
  for (const ext of ['-wal', '-shm']) {
    const src = dbPathRef + ext;
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, target + ext); } catch (e) { /* opsional, abaikan */ }
    }
  }
  pruneOldBackups();
  logger.info(`Backup dibuat: ${target}`);
  return { path: target };
}

function autoBackupIfNeeded() {
  try {
    const backups = listBackups();
    const last = backups.find(b => b.file.startsWith('backup-auto-'));
    const now = Date.now();
    if (!last || (now - new Date(last.createdAt).getTime()) > 20 * 60 * 60 * 1000) {
      backupNow('auto');
    }
  } catch (e) {
    logger.error('Auto-backup gagal (aplikasi tetap lanjut jalan)', e);
  }
}

function restoreFromFile(sourcePath, dbModule) {
  if (!fs.existsSync(sourcePath)) throw new Error('File backup tidak ditemukan');
  const stat = fs.statSync(sourcePath);
  if (stat.size < 100) throw new Error('File backup tidak valid (terlalu kecil / rusak)');
  // Backup kondisi saat ini dulu sebelum menimpa, sebagai jaring pengaman.
  backupNow('sebelum-restore');
  dbModule.close();
  fs.copyFileSync(sourcePath, dbPathRef);
  for (const ext of ['-wal', '-shm']) {
    const target = dbPathRef + ext;
    try { fs.rmSync(target, { force: true }); } catch (e) { /* abaikan */ }
  }
  return { restored: true };
}

module.exports = { init, backupNow, autoBackupIfNeeded, listBackups, restoreFromFile, MAX_BACKUPS };
