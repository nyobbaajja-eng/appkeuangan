'use strict';
/**
 * Preload script - berjalan dengan hak akses Node terbatas sebelum halaman
 * dimuat, lalu mengekspos HANYA fungsi-fungsi berikut ke window.api.
 * Renderer tidak pernah mendapat akses ke ipcRenderer, fs, atau require
 * secara langsung (contextIsolation aktif).
 */
const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).then((res) => {
    if (res && res.ok) return res.data;
    const message = (res && res.error) || 'Terjadi kesalahan tak terduga';
    throw new Error(message);
  });
}

contextBridge.exposeInMainWorld('api', {
  app: {
    getVersion: () => invoke('app:getVersion'),
    getLogPath: () => invoke('app:getLogPath'),
    logError: (message, stack) => invoke('app:logError', { message, stack }).catch(() => {})
  },
  company: {
    get: () => invoke('company:get'),
    update: (data) => invoke('company:update', data)
  },
  accounts: {
    list: (params) => invoke('accounts:list', params),
    get: (id) => invoke('accounts:get', { id }),
    create: (data) => invoke('accounts:create', data),
    update: (id, data) => invoke('accounts:update', { id, data }),
    archive: (id) => invoke('accounts:archive', { id }),
    restore: (id) => invoke('accounts:restore', { id }),
    deleteIfUnused: (id) => invoke('accounts:deleteIfUnused', { id }),
    transactionCount: (id) => invoke('accounts:transactionCount', { id })
  },
  journal: {
    listPaged: (params) => invoke('journal:listPaged', params),
    get: (id) => invoke('journal:get', { id }),
    create: (data) => invoke('journal:create', data),
    update: (id, data) => invoke('journal:update', { id, data }),
    remove: (id) => invoke('journal:remove', { id })
  },
  ledger: {
    getPaged: (params) => invoke('ledger:getPaged', params)
  },
  reports: {
    dashboard: (params) => invoke('reports:dashboard', params),
    trialBalance: (params) => invoke('reports:trialBalance', params),
    incomeStatement: (params) => invoke('reports:incomeStatement', params),
    balanceSheet: (params) => invoke('reports:balanceSheet', params),
    cashFlow: (params) => invoke('reports:cashFlow', params),
    equityChanges: (params) => invoke('reports:equityChanges', params)
  },
  io: {
    exportExcel: (type, params) => invoke('io:exportExcel', { type, params }),
    downloadTemplate: (kind) => invoke('io:downloadTemplate', { kind }),
    importExcel: (type) => invoke('io:importExcel', { type }),
    exportPdf: (suggestedName) => invoke('io:exportPdf', { suggestedName }),
    backupNow: () => invoke('io:backupNow'),
    listBackups: () => invoke('io:listBackups'),
    openBackupsFolder: () => invoke('io:openBackupsFolder'),
    restoreFromFile: () => invoke('io:restoreFromFile')
  }
});
