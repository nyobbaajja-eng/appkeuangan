'use strict';
/**
 * Semua komunikasi renderer <-> main lewat sini.
 * Aturan keras: setiap handler dibungkus try/catch dan SELALU
 * mengembalikan bentuk {ok, data} atau {ok:false, error}. Renderer
 * tidak pernah menerima exception mentah yang bisa membuat UI blank/crash.
 */
const { ipcMain, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');

const dbModule = require('./db');
const repo = require('./repository');
const excel = require('./excel');
const backup = require('./backup');
const logger = require('./logger');

function envelopeOk(data) { return { ok: true, data }; }
function envelopeErr(err) {
  const message = err && err.isValidation ? err.message : (err && err.message ? err.message : 'Terjadi kesalahan tak terduga');
  if (!err || !err.isValidation) logger.error('IPC error', err);
  return { ok: false, error: message };
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    try {
      const data = await fn(payload, event);
      return envelopeOk(data);
    } catch (err) {
      return envelopeErr(err);
    }
  });
}

function slugForFilename(s) {
  return String(s || '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

const EXPORT_DEFAULT_NAMES = {
  accounts: () => `Bagan-Akun.xlsx`,
  journal: (p) => `Jurnal-Umum_${p.startDate || 'awal'}_${p.endDate || 'sekarang'}.xlsx`,
  trial_balance: (p) => `Neraca-Saldo_${p.asOfDate}.xlsx`,
  income_statement: (p) => `Laba-Rugi_${p.startDate}_${p.endDate}.xlsx`,
  balance_sheet: (p) => `Neraca_${p.asOfDate}.xlsx`,
  cash_flow: (p) => `Arus-Kas_${p.startDate}_${p.endDate}.xlsx`,
  equity_changes: (p) => `Perubahan-Modal_${p.startDate}_${p.endDate}.xlsx`,
  ledger: (p) => `Buku-Besar_${slugForFilename(p.accountLabel || p.accountId)}.xlsx`,
  full_backup: () => `Backup-Data-Keuangan_${new Date().toISOString().slice(0, 10)}.xlsx`
};

function registerAll({ mainWindow, userDataPath }) {
  // --- APP ---
  handle('app:getVersion', () => app.getVersion());
  handle('app:logError', ({ message, stack } = {}) => {
    logger.error('Error dari renderer: ' + message, stack ? { stack } : null);
    return true;
  });
  handle('app:getLogPath', () => logger.getLogFilePath());

  // --- COMPANY ---
  handle('company:get', () => repo.getCompany());
  handle('company:update', (data) => repo.updateCompany(data || {}));

  // --- ACCOUNTS ---
  handle('accounts:list', (params) => repo.listAccounts(params || {}));
  handle('accounts:get', ({ id }) => repo.getAccount(id));
  handle('accounts:create', (data) => repo.createAccount(data));
  handle('accounts:update', ({ id, data }) => repo.updateAccount(id, data));
  handle('accounts:archive', ({ id }) => repo.archiveAccount(id));
  handle('accounts:restore', ({ id }) => repo.restoreAccount(id));
  handle('accounts:deleteIfUnused', ({ id }) => repo.deleteAccountIfUnused(id));
  handle('accounts:transactionCount', ({ id }) => repo.accountTransactionCount(id));

  // --- JOURNAL ---
  handle('journal:listPaged', (params) => repo.listJournalPaged(params || {}));
  handle('journal:get', ({ id }) => repo.getJournalEntry(id));
  handle('journal:create', (data) => repo.createJournalEntry(data));
  handle('journal:update', ({ id, data }) => repo.updateJournalEntry(id, data));
  handle('journal:remove', ({ id }) => repo.deleteJournalEntry(id));

  // --- LEDGER ---
  handle('ledger:getPaged', (params) => repo.getLedgerPaged(params || {}));

  // --- REPORTS ---
  handle('reports:dashboard', (p) => repo.getDashboardSummary(p));
  handle('reports:trialBalance', (p) => repo.getTrialBalance(p));
  handle('reports:incomeStatement', (p) => repo.getIncomeStatement(p));
  handle('reports:balanceSheet', (p) => repo.getBalanceSheet(p));
  handle('reports:cashFlow', (p) => repo.getCashFlow(p));
  handle('reports:equityChanges', (p) => repo.getEquityChanges(p));

  // --- EXPORT / IMPORT EXCEL ---
  handle('io:exportExcel', async ({ type, params }) => {
    const defaultName = (EXPORT_DEFAULT_NAMES[type] ? EXPORT_DEFAULT_NAMES[type](params || {}) : `Ekspor-${type}.xlsx`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan File Excel',
      defaultPath: defaultName,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    excel.exportToExcel(type, params, result.filePath);
    return { cancelled: false, path: result.filePath };
  });

  handle('io:downloadTemplate', async ({ kind }) => {
    const defaultName = kind === 'accounts' ? 'Template-Import-Akun.xlsx' : 'Template-Import-Jurnal.xlsx';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Template',
      defaultPath: defaultName,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    excel.exportImportTemplate(result.filePath, kind);
    return { cancelled: false, path: result.filePath };
  });

  handle('io:importExcel', async ({ type }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih File Excel untuk Diimpor',
      properties: ['openFile'],
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx', 'xls'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { cancelled: true };
    backup.backupNow('sebelum-import'); // jaring pengaman sebelum operasi berisiko
    const summary = excel.importFromExcel(type, result.filePaths[0]);
    return { cancelled: false, ...summary };
  });

  // --- EXPORT PDF (memakai mesin cetak PDF bawaan Electron/Chromium) ---
  handle('io:exportPdf', async ({ suggestedName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Sebagai PDF',
      defaultPath: (suggestedName || 'Laporan') + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    const data = await mainWindow.webContents.printToPDF({
      printBackground: true, landscape: false, pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });
    fs.writeFileSync(result.filePath, data);
    return { cancelled: false, path: result.filePath };
  });

  // --- BACKUP / RESTORE ---
  handle('io:backupNow', () => backup.backupNow('manual'));
  handle('io:listBackups', () => backup.listBackups());
  handle('io:openBackupsFolder', () => {
    shell.openPath(path.join(userDataPath, 'backups'));
    return true;
  });
  handle('io:restoreFromFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih File Backup (.db)',
      properties: ['openFile'],
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { cancelled: true };
    backup.restoreFromFile(result.filePaths[0], dbModule);
    dbModule.init(userDataPath); // buka kembali koneksi ke file yang baru dipulihkan
    return { cancelled: false, needsReload: true };
  });

  logger.info('Semua endpoint IPC terdaftar.');
}

module.exports = { registerAll };
