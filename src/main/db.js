'use strict';
/**
 * Lapisan database inti.
 *
 * Menggunakan better-sqlite3 (SQLite tertanam, synchronous, sangat stabil,
 * dipakai banyak aplikasi desktop produksi) karena:
 *  - ACID: setiap transaksi jurnal (banyak baris debit/kredit) tercatat
 *    utuh atau tidak sama sekali -> data tidak pernah setengah tersimpan.
 *  - WAL mode: tahan terhadap mati listrik / force-close mendadak.
 *  - Foreign key + CHECK constraint: mencegah data tidak valid masuk
 *    sekalipun ada bug di lapisan UI.
 *  - File tunggal (.db) -> gampang dibackup, dipindah, dan sangat cepat
 *    walau data sudah ratusan ribu baris (didukung index).
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('./logger');

const SCHEMA_VERSION = 1;

/** @type {import('better-sqlite3').Database} */
let db = null;
let dbFilePath = null;

const DEFAULT_ACCOUNTS = [
  // code, name, type, normal_balance, is_cash, is_contra
  ['1-1000', 'Kas', 'Aset', 'Debit', 1, 0],
  ['1-1010', 'Bank', 'Aset', 'Debit', 1, 0],
  ['1-1100', 'Piutang Usaha', 'Aset', 'Debit', 0, 0],
  ['1-1200', 'Persediaan Barang Dagang', 'Aset', 'Debit', 0, 0],
  ['1-1300', 'Perlengkapan', 'Aset', 'Debit', 0, 0],
  ['1-1400', 'Sewa Dibayar Dimuka', 'Aset', 'Debit', 0, 0],
  ['1-1500', 'Asuransi Dibayar Dimuka', 'Aset', 'Debit', 0, 0],
  ['1-2000', 'Peralatan', 'Aset', 'Debit', 0, 0],
  ['1-2010', 'Akumulasi Penyusutan Peralatan', 'Aset', 'Kredit', 0, 1],
  ['1-2100', 'Kendaraan', 'Aset', 'Debit', 0, 0],
  ['1-2110', 'Akumulasi Penyusutan Kendaraan', 'Aset', 'Kredit', 0, 1],
  ['1-2200', 'Bangunan', 'Aset', 'Debit', 0, 0],
  ['1-2210', 'Akumulasi Penyusutan Bangunan', 'Aset', 'Kredit', 0, 1],
  ['2-1000', 'Hutang Usaha', 'Kewajiban', 'Kredit', 0, 0],
  ['2-1100', 'Hutang Bank', 'Kewajiban', 'Kredit', 0, 0],
  ['2-1200', 'Hutang Pajak', 'Kewajiban', 'Kredit', 0, 0],
  ['2-1300', 'Beban Yang Masih Harus Dibayar', 'Kewajiban', 'Kredit', 0, 0],
  ['2-2000', 'Pendapatan Diterima Dimuka', 'Kewajiban', 'Kredit', 0, 0],
  ['3-1000', 'Modal Pemilik', 'Modal', 'Kredit', 0, 0],
  ['3-2000', 'Prive / Penarikan Pemilik', 'Modal', 'Debit', 0, 1],
  ['3-3000', 'Laba Ditahan', 'Modal', 'Kredit', 0, 0],
  ['4-1000', 'Pendapatan Penjualan / Jasa', 'Pendapatan', 'Kredit', 0, 0],
  ['4-2000', 'Retur & Potongan Penjualan', 'Pendapatan', 'Debit', 0, 1],
  ['4-9000', 'Pendapatan Lain-lain', 'Pendapatan', 'Kredit', 0, 0],
  ['5-1000', 'Harga Pokok Penjualan (HPP)', 'Beban', 'Debit', 0, 0],
  ['6-1000', 'Beban Gaji & Upah', 'Beban', 'Debit', 0, 0],
  ['6-1010', 'Beban Sewa', 'Beban', 'Debit', 0, 0],
  ['6-1020', 'Beban Listrik, Air & Telepon', 'Beban', 'Debit', 0, 0],
  ['6-1030', 'Beban Perlengkapan', 'Beban', 'Debit', 0, 0],
  ['6-1040', 'Beban Penyusutan', 'Beban', 'Debit', 0, 0],
  ['6-1050', 'Beban Iklan & Pemasaran', 'Beban', 'Debit', 0, 0],
  ['6-1060', 'Beban Transportasi', 'Beban', 'Debit', 0, 0],
  ['6-1070', 'Beban Administrasi Bank', 'Beban', 'Debit', 0, 0],
  ['6-1080', 'Beban Pajak', 'Beban', 'Debit', 0, 0],
  ['6-9000', 'Beban Lain-lain', 'Beban', 'Debit', 0, 0]
];

function getDbPath() {
  return dbFilePath;
}

function init(userDataPath) {
  const dataDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  dbFilePath = path.join(dataDir, 'laporan-keuangan.db');

  db = new Database(dbFilePath);

  // --- Pengaturan keandalan SQLite ---
  db.pragma('journal_mode = WAL');      // tahan crash / mati listrik mendadak
  db.pragma('synchronous = NORMAL');    // aman & cepat saat WAL aktif
  db.pragma('foreign_keys = ON');       // integritas relasi wajib
  db.pragma('busy_timeout = 5000');     // hindari error "database is locked"

  createSchema();
  runIntegrityCheck();
  seedDefaultDataIfEmpty();

  return db;
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'Nama Usaha Anda',
      address TEXT NOT NULL DEFAULT '',
      npwp TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'IDR',
      fiscal_year_start TEXT NOT NULL DEFAULT '01-01'
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('Aset','Kewajiban','Modal','Pendapatan','Beban')),
      normal_balance TEXT NOT NULL CHECK (normal_balance IN ('Debit','Kredit')),
      is_cash INTEGER NOT NULL DEFAULT 0 CHECK (is_cash IN (0,1)),
      is_contra INTEGER NOT NULL DEFAULT 0 CHECK (is_contra IN (0,1)),
      opening_balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
    CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_no TEXT NOT NULL UNIQUE,
      entry_date TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      cash_flow_category TEXT CHECK (cash_flow_category IN ('Operasional','Investasi','Pendanaan') OR cash_flow_category IS NULL),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_entries_date ON journal_entries(entry_date);

    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      debit REAL NOT NULL DEFAULT 0 CHECK (debit >= 0),
      credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0),
      memo TEXT NOT NULL DEFAULT '',
      line_order INTEGER NOT NULL DEFAULT 0,
      CHECK (NOT (debit > 0 AND credit > 0))
    );
    CREATE INDEX IF NOT EXISTS idx_lines_entry ON journal_lines(entry_id);
    CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(account_id);

    CREATE TABLE IF NOT EXISTS import_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      file_name TEXT,
      kind TEXT,
      inserted INTEGER,
      skipped INTEGER,
      details TEXT
    );
  `);

  const row = db.prepare('SELECT COUNT(*) c FROM company').get();
  if (row.c === 0) {
    db.prepare('INSERT INTO company (id) VALUES (1)').run();
  }

  db.prepare(`INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(String(SCHEMA_VERSION));
}

function runIntegrityCheck() {
  try {
    const result = db.pragma('integrity_check');
    const ok = Array.isArray(result) && result.length === 1 && result[0].integrity_check === 'ok';
    if (!ok) {
      logger.warn('PRAGMA integrity_check menemukan masalah: ' + JSON.stringify(result));
    }
  } catch (e) {
    logger.error('Gagal menjalankan integrity_check', e);
  }
}

function seedDefaultDataIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) c FROM accounts').get().c;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO accounts (code, name, type, normal_balance, is_cash, is_contra, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    rows.forEach((r, idx) => insert.run(r[0], r[1], r[2], r[3], r[4], r[5], idx));
  });
  insertMany(DEFAULT_ACCOUNTS);
  logger.info(`Seed ${DEFAULT_ACCOUNTS.length} akun bawaan (Bagan Akun standar).`);
}

function getDb() {
  if (!db) throw new Error('Database belum diinisialisasi');
  return db;
}

function close() {
  try {
    if (db) {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    }
  } catch (e) {
    logger.error('Gagal menutup database dengan bersih', e);
  }
}

module.exports = { init, getDb, close, getDbPath, DEFAULT_ACCOUNTS };
