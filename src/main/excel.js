'use strict';
/**
 * Ekspor & impor Excel (.xlsx).
 * Import selalu: (1) divalidasi total dulu tanpa menyentuh database,
 * (2) baru baris/kelompok yang valid dimasukkan dalam SATU transaksi.
 * Baris bermasalah dilaporkan lengkap dengan alasannya, tidak membuat
 * aplikasi crash ataupun menyimpan data setengah-setengah.
 */
const fs = require('fs');
const XLSX = require('xlsx');
const repo = require('./repository');
const logger = require('./logger');

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024; // 25MB, cukup besar utk puluhan ribu baris

function fmtDateForSheet(d) {
  return d || '';
}

function autoWidth(rows) {
  if (!rows.length) return [{ wch: 15 }];
  const keys = Object.keys(rows[0]);
  return keys.map(k => {
    const maxLen = Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length));
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
}

function buildWorkbookFromSheets(sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = s.aoa ? XLSX.utils.aoa_to_sheet(s.aoa) : XLSX.utils.json_to_sheet(s.rows, { defval: '' });
    if (!s.aoa) ws['!cols'] = autoWidth(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return wb;
}

function writeWorkbook(wb, filePath) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(filePath, buf);
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

function exportAccounts(filePath) {
  const accounts = repo.listAccounts({ includeInactive: true });
  const rows = accounts.map(a => ({
    'Kode Akun': a.code, 'Nama Akun': a.name, 'Jenis': a.type, 'Saldo Normal': a.normal_balance,
    'Akun Kas/Bank': a.is_cash ? 'Ya' : 'Tidak', 'Akun Kontra': a.is_contra ? 'Ya' : 'Tidak',
    'Saldo Awal': a.opening_balance, 'Status': a.is_active ? 'Aktif' : 'Nonaktif'
  }));
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Bagan Akun', rows }]), filePath);
}

function exportJournal(filePath, { startDate, endDate } = {}) {
  const rows = [];
  let page = 1;
  const pageSize = 500;
  // Ambil semua data secara paginasi (menghindari memuat query raksasa sekaligus)
  while (true) {
    const result = repo.listJournalPaged({ page, pageSize, startDate, endDate });
    for (const entry of result.rows) {
      const full = repo.getJournalEntry(entry.id);
      full.lines.forEach(l => {
        rows.push({
          'Tanggal': full.entry_date, 'No Jurnal': full.entry_no, 'Keterangan': full.description,
          'No Bukti/Ref': full.reference, 'Kode Akun': l.account_code, 'Nama Akun': l.account_name,
          'Debit': l.debit, 'Kredit': l.credit, 'Memo Baris': l.memo,
          'Kategori Arus Kas': full.cash_flow_category || ''
        });
      });
    }
    if (page >= result.totalPages) break;
    page++;
  }
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Jurnal Umum', rows }]), filePath);
}

function reportAoa(title, subtitle, headerRow, dataRows, totalRow) {
  const aoa = [[title], [subtitle], [], headerRow, ...dataRows];
  if (totalRow) aoa.push([], totalRow);
  return aoa;
}

function exportTrialBalance(filePath, { asOfDate }) {
  const r = repo.getTrialBalance({ asOfDate });
  const company = repo.getCompany();
  const rows = r.rows.map(x => [x.code, x.name, x.debit || '', x.kredit || '']);
  const aoa = reportAoa(
    `${company.name} - NERACA SALDO`, `Per tanggal ${asOfDate}`,
    ['Kode', 'Nama Akun', 'Debit', 'Kredit'], rows,
    ['', 'TOTAL', r.totalDebit, r.totalKredit]
  );
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Neraca Saldo', aoa }]), filePath);
}

function exportIncomeStatement(filePath, { startDate, endDate }) {
  const r = repo.getIncomeStatement({ startDate, endDate });
  const company = repo.getCompany();
  const aoa = [
    [`${company.name} - LAPORAN LABA RUGI`], [`Periode ${startDate} s.d. ${endDate}`], [],
    ['PENDAPATAN'],
    ...r.pendapatan.map(x => [x.code, x.name, x.amount]),
    ['', 'Total Pendapatan', r.totalPendapatan], [],
    ['BEBAN'],
    ...r.beban.map(x => [x.code, x.name, x.amount]),
    ['', 'Total Beban', r.totalBeban], [],
    ['', 'LABA (RUGI) BERSIH', r.labaRugiBersih]
  ];
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Laba Rugi', aoa }]), filePath);
}

function exportBalanceSheet(filePath, { asOfDate }) {
  const r = repo.getBalanceSheet({ asOfDate });
  const company = repo.getCompany();
  const aoa = [
    [`${company.name} - LAPORAN POSISI KEUANGAN (NERACA)`], [`Per tanggal ${asOfDate}`], [],
    ['ASET'],
    ...r.aset.map(x => [x.code, x.name, x.amount]),
    ['', 'Total Aset', r.totalAset], [],
    ['KEWAJIBAN'],
    ...r.kewajiban.map(x => [x.code, x.name, x.amount]),
    ['', 'Total Kewajiban', r.totalKewajiban], [],
    ['MODAL'],
    ...r.modal.map(x => [x.code, x.name, x.amount]),
    ['', `Laba (Rugi) Berjalan (sejak ${r.labaBerjalanSejak})`, r.labaBerjalan],
    ['', 'Total Modal', r.totalModal], [],
    ['', 'TOTAL KEWAJIBAN + MODAL', r.totalKewajibanModal],
    ['', 'Selisih (harus 0)', r.selisih]
  ];
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Neraca', aoa }]), filePath);
}

function exportCashFlow(filePath, { startDate, endDate }) {
  const r = repo.getCashFlow({ startDate, endDate });
  const company = repo.getCompany();
  const section = (label, key) => [
    [label],
    ...r.details[key].map(d => [d.date, d.entryNo, d.description, d.amount]),
    ['', '', `Subtotal ${label}`, r.totals[key]], []
  ];
  const aoa = [
    [`${company.name} - LAPORAN ARUS KAS`], [`Periode ${startDate} s.d. ${endDate}`], [],
    ['Saldo Kas Awal', '', '', r.saldoAwal], [],
    ...section('Aktivitas Operasional', 'Operasional'),
    ...section('Aktivitas Investasi', 'Investasi'),
    ...section('Aktivitas Pendanaan', 'Pendanaan'),
    ...(r.details['Belum Dikategorikan'].length ? section('Belum Dikategorikan', 'Belum Dikategorikan') : []),
    ['Kenaikan (Penurunan) Kas Bersih', '', '', r.kenaikanBersih],
    ['Saldo Kas Akhir', '', '', r.saldoAkhir]
  ];
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Arus Kas', aoa }]), filePath);
}

function exportEquityChanges(filePath, { startDate, endDate }) {
  const r = repo.getEquityChanges({ startDate, endDate });
  const company = repo.getCompany();
  const aoa = [
    [`${company.name} - LAPORAN PERUBAHAN MODAL`], [`Periode ${startDate} s.d. ${endDate}`], [],
    ['Kode', 'Nama Akun', 'Saldo Awal', 'Perubahan', 'Saldo Akhir'],
    ...r.rows.map(x => [x.code, x.name, x.awal, x.perubahan, x.akhir]),
    [],
    ['', 'Total Modal Awal', r.totalModalAwal],
    ['', 'Laba (Rugi) Periode Berjalan', r.labaRugiPeriode],
    ['', 'Total Modal Akhir', r.totalModalAkhir]
  ];
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Perubahan Modal', aoa }]), filePath);
}

function exportLedger(filePath, { accountId, startDate, endDate }) {
  const rows = [];
  let page = 1;
  const pageSize = 500;
  let account = null;
  let opening = 0;
  while (true) {
    const result = repo.getLedgerPaged({ accountId, startDate, endDate, page, pageSize });
    account = result.account;
    opening = result.openingBalance;
    result.rows.forEach(r => rows.push({
      'Tanggal': r.entry_date, 'No Jurnal': r.entry_no, 'Keterangan': r.description, 'Memo': r.memo,
      'Debit': r.debit, 'Kredit': r.credit, 'Saldo': r.runningBalance
    }));
    if (page >= result.totalPages) break;
    page++;
  }
  const company = repo.getCompany();
  const aoa = [
    [`${company.name} - BUKU BESAR: ${account.code} ${account.name}`],
    [`Periode ${startDate || 'Awal'} s.d. ${endDate || 'Sekarang'}`], [],
    ['Tanggal', 'No Jurnal', 'Keterangan', 'Memo', 'Debit', 'Kredit', 'Saldo'],
    ['', '', 'Saldo Awal', '', '', '', opening],
    ...rows.map(r => [r['Tanggal'], r['No Jurnal'], r['Keterangan'], r['Memo'], r['Debit'], r['Kredit'], r['Saldo']])
  ];
  writeWorkbook(buildWorkbookFromSheets([{ name: 'Buku Besar', aoa }]), filePath);
}

function exportFullBackupXlsx(filePath) {
  const accounts = repo.listAccounts({ includeInactive: true });
  const accRows = accounts.map(a => ({
    'Kode Akun': a.code, 'Nama Akun': a.name, 'Jenis': a.type, 'Saldo Normal': a.normal_balance,
    'Akun Kas/Bank': a.is_cash ? 'Ya' : 'Tidak', 'Saldo Awal': a.opening_balance, 'Status': a.is_active ? 'Aktif' : 'Nonaktif'
  }));
  const journalRows = [];
  let page = 1;
  while (true) {
    const result = repo.listJournalPaged({ page, pageSize: 500 });
    for (const entry of result.rows) {
      const full = repo.getJournalEntry(entry.id);
      full.lines.forEach(l => journalRows.push({
        'Tanggal': full.entry_date, 'No Jurnal': full.entry_no, 'Keterangan': full.description,
        'No Bukti/Ref': full.reference, 'Kode Akun': l.account_code, 'Nama Akun': l.account_name,
        'Debit': l.debit, 'Kredit': l.credit, 'Kategori Arus Kas': full.cash_flow_category || ''
      }));
    }
    if (page >= result.totalPages) break;
    page++;
  }
  writeWorkbook(buildWorkbookFromSheets([
    { name: 'Bagan Akun', rows: accRows },
    { name: 'Jurnal Umum', rows: journalRows }
  ]), filePath);
}

function exportImportTemplate(filePath, kind) {
  const accounts = repo.listAccounts({ includeInactive: true });
  if (kind === 'accounts') {
    const rows = [{
      'Kode Akun': '1-9000', 'Nama Akun': 'Contoh Akun Baru', 'Jenis': 'Aset',
      'Saldo Normal': 'Debit', 'Akun Kas/Bank': 'Tidak', 'Saldo Awal': 0
    }];
    writeWorkbook(buildWorkbookFromSheets([
      { name: 'Template Akun', rows },
      { name: 'Petunjuk', aoa: [
        ['Petunjuk Pengisian Import Akun'],
        ['Jenis harus salah satu dari: Aset, Kewajiban, Modal, Pendapatan, Beban'],
        ['Saldo Normal harus salah satu dari: Debit, Kredit'],
        ['Akun Kas/Bank: Ya jika akun ini uang tunai/bank (dipakai di Laporan Arus Kas)'],
        ['Jika Kode Akun sudah ada, datanya akan DIPERBARUI (bukan dobel)']
      ] }
    ]), filePath);
  } else {
    const rows = [
      { 'Tanggal': '2026-01-05', 'No Bukti': 'BKM-0001', 'Keterangan': 'Penjualan tunai', 'Kode Akun': '1-1000', 'Debit': 500000, 'Kredit': '', 'Kategori Arus Kas (khusus baris kas)': 'Operasional' },
      { 'Tanggal': '2026-01-05', 'No Bukti': 'BKM-0001', 'Keterangan': 'Penjualan tunai', 'Kode Akun': '4-1000', 'Debit': '', 'Kredit': 500000, 'Kategori Arus Kas (khusus baris kas)': '' }
    ];
    writeWorkbook(buildWorkbookFromSheets([
      { name: 'Template Jurnal', rows },
      { name: 'Daftar Kode Akun', rows: accounts.map(a => ({ 'Kode Akun': a.code, 'Nama Akun': a.name, 'Jenis': a.type })) },
      { name: 'Petunjuk', aoa: [
        ['Petunjuk Pengisian Import Jurnal'],
        ['Baris dengan "No Bukti" DAN "Tanggal" yang SAMA akan digabung jadi satu transaksi'],
        ['Setiap transaksi minimal 2 baris, total Debit harus sama dengan total Kredit'],
        ['Isi salah satu saja: Debit ATAU Kredit per baris, jangan dua-duanya'],
        ['Kode Akun harus sudah terdaftar (lihat sheet "Daftar Kode Akun")'],
        ['Format Tanggal: YYYY-MM-DD, contoh 2026-01-05']
      ] }
    ]), filePath);
  }
}

const EXPORTERS = {
  accounts: exportAccounts,
  journal: exportJournal,
  trial_balance: exportTrialBalance,
  income_statement: exportIncomeStatement,
  balance_sheet: exportBalanceSheet,
  cash_flow: exportCashFlow,
  equity_changes: exportEquityChanges,
  ledger: exportLedger,
  full_backup: exportFullBackupXlsx
};

function exportToExcel(type, params, filePath) {
  const fn = EXPORTERS[type];
  if (!fn) throw new Error('Jenis ekspor tidak dikenal: ' + type);
  fn(filePath, params || {});
  return { path: filePath };
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

function readSheetRows(filePath, preferredSheetNames) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`File terlalu besar (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maksimal 25MB.`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: false });
  let sheetName = wb.SheetNames.find(n => preferredSheetNames.some(p => n.toLowerCase().includes(p)));
  if (!sheetName) sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel tidak berisi sheet apapun');
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
}

function normalizeKey(obj, candidates) {
  const keys = Object.keys(obj);
  for (const c of candidates) {
    const found = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
    if (found) return obj[found];
  }
  return undefined;
}

function toDateStr(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') {
    // serial date Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  return null;
}

function toNumber(v) {
  if (v === '' || v === undefined || v === null) return 0;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^0-9.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function importAccounts(filePath) {
  const rows = readSheetRows(filePath, ['akun', 'account']);
  const errors = [];
  const validRows = [];
  rows.forEach((row, idx) => {
    const rowNo = idx + 2; // +2: header + 1-based
    const code = String(normalizeKey(row, ['Kode Akun', 'Kode']) || '').trim();
    const name = String(normalizeKey(row, ['Nama Akun', 'Nama']) || '').trim();
    const type = String(normalizeKey(row, ['Jenis', 'Type']) || '').trim();
    const normalBalance = String(normalizeKey(row, ['Saldo Normal', 'Normal Balance']) || '').trim();
    const isCashRaw = String(normalizeKey(row, ['Akun Kas/Bank', 'Kas']) || '').trim().toLowerCase();
    const opening = toNumber(normalizeKey(row, ['Saldo Awal', 'Opening Balance']));
    if (!code && !name) return; // baris kosong, lewati diam-diam
    if (!code) { errors.push({ row: rowNo, reason: 'Kode Akun kosong' }); return; }
    if (!name) { errors.push({ row: rowNo, reason: 'Nama Akun kosong' }); return; }
    if (!['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban'].includes(type)) {
      errors.push({ row: rowNo, reason: `Jenis "${type}" tidak valid (Aset/Kewajiban/Modal/Pendapatan/Beban)` }); return;
    }
    if (!['Debit', 'Kredit'].includes(normalBalance)) {
      errors.push({ row: rowNo, reason: `Saldo Normal "${normalBalance}" tidak valid (Debit/Kredit)` }); return;
    }
    if (!Number.isFinite(opening)) { errors.push({ row: rowNo, reason: 'Saldo Awal bukan angka' }); return; }
    validRows.push({ code, name, type, normalBalance, isCash: isCashRaw === 'ya' || isCashRaw === 'yes' || isCashRaw === 'y', openingBalance: opening });
  });

  const existing = new Map(repo.listAccounts({ includeInactive: true }).map(a => [a.code, a]));
  let inserted = 0, updated = 0;
  const run = () => {
    for (const r of validRows) {
      const found = existing.get(r.code);
      if (found) { repo.updateAccount(found.id, r); updated++; }
      else { repo.createAccount(r); inserted++; }
    }
  };
  const db = require('./db').getDb();
  db.transaction(run)();

  logger.info(`Import akun: ${inserted} baru, ${updated} diperbarui, ${errors.length} error dari file ${filePath}`);
  return { inserted, updated, skipped: errors.length, errors };
}

function importJournal(filePath) {
  const rows = readSheetRows(filePath, ['jurnal', 'journal', 'transaksi']);
  const accountsByCode = new Map(repo.listAccounts({ includeInactive: true }).map(a => [a.code, a]));

  const groups = new Map(); // key -> { date, voucher, description, cashFlowCategory, lines:[], rowNos:[] }
  const preErrors = [];

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const dateRaw = normalizeKey(row, ['Tanggal', 'Date']);
    const voucher = String(normalizeKey(row, ['No Bukti', 'No Bukti/Ref', 'Voucher']) || '').trim();
    const description = String(normalizeKey(row, ['Keterangan', 'Description']) || '').trim();
    const accountCode = String(normalizeKey(row, ['Kode Akun', 'Kode']) || '').trim();
    const debit = normalizeKey(row, ['Debit']);
    const credit = normalizeKey(row, ['Kredit', 'Credit']);
    const cfCategoryRaw = String(normalizeKey(row, ['Kategori Arus Kas (khusus baris kas)', 'Kategori Arus Kas', 'Cash Flow Category']) || '').trim();

    if (!dateRaw && !voucher && !accountCode) return; // baris kosong
    const date = toDateStr(dateRaw);
    if (!date) { preErrors.push({ row: rowNo, reason: 'Tanggal tidak valid/kosong (format YYYY-MM-DD)' }); return; }
    if (!voucher) { preErrors.push({ row: rowNo, reason: 'No Bukti kosong (dipakai mengelompokkan baris jadi satu transaksi)' }); return; }
    if (!accountCode || !accountsByCode.has(accountCode)) { preErrors.push({ row: rowNo, reason: `Kode Akun "${accountCode}" tidak ditemukan` }); return; }
    const debitNum = toNumber(debit);
    const creditNum = toNumber(credit);
    if (!Number.isFinite(debitNum) || !Number.isFinite(creditNum)) { preErrors.push({ row: rowNo, reason: 'Nilai Debit/Kredit bukan angka' }); return; }
    if (debitNum > 0 && creditNum > 0) { preErrors.push({ row: rowNo, reason: 'Debit dan Kredit tidak boleh diisi bersamaan' }); return; }
    if (debitNum <= 0 && creditNum <= 0) { preErrors.push({ row: rowNo, reason: 'Isi salah satu: Debit atau Kredit' }); return; }

    const key = `${date}||${voucher}`;
    if (!groups.has(key)) {
      groups.set(key, {
        date, voucher, description,
        cashFlowCategory: ['Operasional', 'Investasi', 'Pendanaan'].includes(cfCategoryRaw) ? cfCategoryRaw : null,
        lines: [], rowNos: []
      });
    }
    const g = groups.get(key);
    if (!g.cashFlowCategory && ['Operasional', 'Investasi', 'Pendanaan'].includes(cfCategoryRaw)) g.cashFlowCategory = cfCategoryRaw;
    g.lines.push({ accountId: accountsByCode.get(accountCode).id, debit: debitNum, credit: creditNum });
    g.rowNos.push(rowNo);
  });

  const errors = [...preErrors];
  const validGroups = [];
  for (const [key, g] of groups) {
    if (g.lines.length < 2) { errors.push({ row: g.rowNos.join(','), reason: `Transaksi "${g.voucher}" hanya punya ${g.lines.length} baris (minimal 2)` }); continue; }
    const totalDebit = g.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = g.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      errors.push({ row: g.rowNos.join(','), reason: `Transaksi "${g.voucher}" tidak balance (Debit ${totalDebit} vs Kredit ${totalCredit})` });
      continue;
    }
    validGroups.push(g);
  }

  let inserted = 0;
  const db = require('./db').getDb();
  const run = db.transaction(() => {
    for (const g of validGroups) {
      repo.createJournalEntry({
        date: g.date, description: g.description || `Import: ${g.voucher}`,
        reference: g.voucher, cashFlowCategory: g.cashFlowCategory, lines: g.lines
      });
      inserted++;
    }
  });
  run();

  logger.info(`Import jurnal: ${inserted} transaksi masuk, ${errors.length} error dari file ${filePath}`);
  return { inserted, updated: 0, skipped: errors.length, errors };
}

function importFromExcel(type, filePath) {
  if (type === 'accounts') return importAccounts(filePath);
  if (type === 'journal') return importJournal(filePath);
  throw new Error('Jenis import tidak dikenal: ' + type);
}

module.exports = { exportToExcel, exportImportTemplate, importFromExcel };
