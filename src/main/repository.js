'use strict';
/**
 * Semua akses data & logika akuntansi terpusat di sini.
 * Prinsip: renderer TIDAK PERNAH menyentuh database langsung -
 * semua lewat fungsi-fungsi ini melalui IPC (lihat ipc.js), agar
 * validasi & aturan double-entry selalu ditegakkan di satu tempat.
 */
const { getDb } = require('./db');

const EXPECTED_NORMAL = {
  Aset: 'Debit',
  Kewajiban: 'Kredit',
  Modal: 'Kredit',
  Pendapatan: 'Kredit',
  Beban: 'Debit'
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.isValidation = true;
    throw err;
  }
}

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());
}

// ---------------------------------------------------------------------------
// PERUSAHAAN
// ---------------------------------------------------------------------------
function getCompany() {
  return getDb().prepare('SELECT * FROM company WHERE id = 1').get();
}

function updateCompany(data) {
  const db = getDb();
  const current = getCompany();
  const name = String(data.name ?? current.name).slice(0, 200);
  const address = String(data.address ?? current.address).slice(0, 500);
  const npwp = String(data.npwp ?? current.npwp).slice(0, 50);
  const currency = String(data.currency ?? current.currency).slice(0, 10);
  const fiscalYearStart = String(data.fiscalYearStart ?? current.fiscal_year_start).slice(0, 5);
  db.prepare(`UPDATE company SET name=?, address=?, npwp=?, currency=?, fiscal_year_start=? WHERE id=1`)
    .run(name, address, npwp, currency, fiscalYearStart);
  return getCompany();
}

// ---------------------------------------------------------------------------
// AKUN (CHART OF ACCOUNTS)
// ---------------------------------------------------------------------------
function listAccounts({ includeInactive = false } = {}) {
  const db = getDb();
  if (includeInactive) {
    return db.prepare('SELECT * FROM accounts ORDER BY code ASC').all();
  }
  return db.prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY code ASC').all();
}

function getAccount(id) {
  const row = getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  assert(row, 'Akun tidak ditemukan');
  return row;
}

function validateAccountInput(data, currentId) {
  assert(data && typeof data === 'object', 'Data akun tidak valid');
  const code = String(data.code || '').trim();
  const name = String(data.name || '').trim();
  assert(code.length > 0 && code.length <= 30, 'Kode akun wajib diisi (maks 30 karakter)');
  assert(name.length > 0 && name.length <= 150, 'Nama akun wajib diisi (maks 150 karakter)');
  assert(['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban'].includes(data.type), 'Jenis akun tidak valid');
  assert(['Debit', 'Kredit'].includes(data.normalBalance), 'Saldo normal tidak valid');
  const opening = data.openingBalance === undefined || data.openingBalance === null || data.openingBalance === ''
    ? 0 : Number(data.openingBalance);
  assert(isFiniteNumber(opening), 'Saldo awal harus berupa angka');
  const db = getDb();
  const dup = db.prepare('SELECT id FROM accounts WHERE code = ? AND id != ?').get(code, currentId || -1);
  assert(!dup, `Kode akun "${code}" sudah dipakai akun lain`);
  return {
    code,
    name,
    type: data.type,
    normalBalance: data.normalBalance,
    isCash: data.isCash ? 1 : 0,
    isContra: data.isContra ? 1 : 0,
    openingBalance: round2(opening)
  };
}

function createAccount(data) {
  const v = validateAccountInput(data, null);
  const db = getDb();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM accounts').get().m;
  const info = db.prepare(`
    INSERT INTO accounts (code, name, type, normal_balance, is_cash, is_contra, opening_balance, sort_order)
    VALUES (@code, @name, @type, @normalBalance, @isCash, @isContra, @openingBalance, @sortOrder)
  `).run({ ...v, sortOrder: maxSort + 1 });
  return getAccount(info.lastInsertRowid);
}

function updateAccount(id, data) {
  getAccount(id);
  const v = validateAccountInput(data, id);
  const db = getDb();
  db.prepare(`
    UPDATE accounts SET code=@code, name=@name, type=@type, normal_balance=@normalBalance,
      is_cash=@isCash, is_contra=@isContra, opening_balance=@openingBalance,
      updated_at = datetime('now','localtime')
    WHERE id=@id
  `).run({ ...v, id });
  return getAccount(id);
}

function accountTransactionCount(id) {
  return getDb().prepare('SELECT COUNT(*) c FROM journal_lines WHERE account_id = ?').get(id).c;
}

function archiveAccount(id) {
  getAccount(id);
  getDb().prepare(`UPDATE accounts SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?`).run(id);
  return getAccount(id);
}

function restoreAccount(id) {
  getAccount(id);
  getDb().prepare(`UPDATE accounts SET is_active = 1, updated_at = datetime('now','localtime') WHERE id = ?`).run(id);
  return getAccount(id);
}

function deleteAccountIfUnused(id) {
  getAccount(id);
  const count = accountTransactionCount(id);
  assert(count === 0, `Akun ini punya ${count} baris transaksi dan tidak boleh dihapus. Gunakan "Nonaktifkan" sebagai gantinya.`);
  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// SALDO AKUN (inti perhitungan laporan)
// ---------------------------------------------------------------------------

/**
 * Mengembalikan Map<accountId, {debitSum, creditSum}> untuk seluruh transaksi
 * dengan entry_date di antara [startDate, endDate] inklusif. Jika salah satu
 * null, batas tersebut tidak dipakai (open-ended).
 */
function sumsByAccount({ startDate, endDate } = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};
  if (startDate) { clauses.push('je.entry_date >= @startDate'); params.startDate = startDate; }
  if (endDate) { clauses.push('je.entry_date <= @endDate'); params.endDate = endDate; }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT jl.account_id as accountId,
           COALESCE(SUM(jl.debit),0) as debitSum,
           COALESCE(SUM(jl.credit),0) as creditSum
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    ${where}
    GROUP BY jl.account_id
  `).all(params);
  const map = new Map();
  rows.forEach(r => map.set(r.accountId, r));
  return map;
}

/**
 * Saldo tiap akun ("presented balance": positif = arah normal akun),
 * dihitung kumulatif sejak awal s.d. asOfDate (inklusif). Termasuk saldo awal.
 */
function balancesAsOf(asOfDate) {
  const accounts = listAccounts({ includeInactive: true });
  // asOfDate null/undefined berarti "sebelum seluruh riwayat" (dipakai saat rentang
  // laporan dikosongkan, mis. preset "Semua") -> jangan hitung mutasi apapun,
  // cukup pakai saldo awal akun saja. Jangan teruskan nilai kosong ke SQL.
  const sums = asOfDate ? sumsByAccount({ endDate: asOfDate }) : new Map();
  const result = new Map();
  for (const acc of accounts) {
    const s = sums.get(acc.id) || { debitSum: 0, creditSum: 0 };
    const raw = acc.opening_balance + s.debitSum - s.creditSum;
    const presented = acc.normal_balance === 'Debit' ? raw : -raw;
    result.set(acc.id, round2(presented));
  }
  return result;
}

function typeSign(account) {
  return account.normal_balance === EXPECTED_NORMAL[account.type] ? 1 : -1;
}

function addDays(dateStr, days) {
  if (!dateStr) return null; // biarkan pemanggil memperlakukan ini sebagai "tanpa batas awal"
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fiscalYearStartDate(dateStr, fiscalYearStart) {
  // fiscalYearStart format 'MM-DD'
  const [mm, dd] = (fiscalYearStart || '01-01').split('-').map(Number);
  const year = Number(dateStr.slice(0, 4));
  const candidate = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return candidate <= dateStr ? candidate : `${year - 1}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// JURNAL UMUM
// ---------------------------------------------------------------------------

function nextEntryNo() {
  const db = getDb();
  db.prepare(`INSERT INTO app_meta (key, value) VALUES ('journal_seq','0')
              ON CONFLICT(key) DO NOTHING`).run();
  const row = db.prepare(`
    UPDATE app_meta SET value = CAST(value AS INTEGER) + 1
    WHERE key = 'journal_seq'
    RETURNING value
  `).get();
  const seq = Number(row.value);
  return `JU-${String(seq).padStart(6, '0')}`;
}

function validateEntryPayload(payload) {
  assert(payload && typeof payload === 'object', 'Data jurnal tidak valid');
  assert(isValidDateStr(payload.date), 'Tanggal transaksi tidak valid (format YYYY-MM-DD)');
  const description = String(payload.description || '').trim().slice(0, 500);
  const reference = String(payload.reference || '').trim().slice(0, 100);
  const cashFlowCategory = ['Operasional', 'Investasi', 'Pendanaan'].includes(payload.cashFlowCategory)
    ? payload.cashFlowCategory : null;
  assert(Array.isArray(payload.lines) && payload.lines.length >= 2, 'Minimal 2 baris (debit & kredit) diperlukan');
  assert(payload.lines.length <= 200, 'Terlalu banyak baris dalam satu transaksi (maks 200)');

  const accounts = new Map(listAccounts({ includeInactive: true }).map(a => [a.id, a]));
  let debitTotal = 0, creditTotal = 0;
  const cleanLines = payload.lines.map((l, idx) => {
    const accountId = Number(l.accountId);
    assert(accounts.has(accountId), `Baris ${idx + 1}: akun tidak ditemukan`);
    const debit = round2(Number(l.debit) || 0);
    const credit = round2(Number(l.credit) || 0);
    assert(isFiniteNumber(debit) && debit >= 0, `Baris ${idx + 1}: nilai debit tidak valid`);
    assert(isFiniteNumber(credit) && credit >= 0, `Baris ${idx + 1}: nilai kredit tidak valid`);
    assert(!(debit > 0 && credit > 0), `Baris ${idx + 1}: tidak boleh isi debit dan kredit sekaligus`);
    assert(debit > 0 || credit > 0, `Baris ${idx + 1}: isi salah satu nilai debit atau kredit`);
    debitTotal = round2(debitTotal + debit);
    creditTotal = round2(creditTotal + credit);
    return { accountId, debit, credit, memo: String(l.memo || '').trim().slice(0, 200) };
  });
  assert(Math.abs(debitTotal - creditTotal) < 0.01, `Transaksi tidak balance! Total Debit Rp ${debitTotal.toLocaleString('id-ID')} vs Total Kredit Rp ${creditTotal.toLocaleString('id-ID')}`);
  assert(debitTotal > 0, 'Total transaksi tidak boleh nol');

  return { date: payload.date, description, reference, cashFlowCategory, lines: cleanLines, total: debitTotal };
}

function createJournalEntry(payload) {
  const clean = validateEntryPayload(payload);
  const db = getDb();
  const run = db.transaction(() => {
    const entryNo = nextEntryNo();
    const info = db.prepare(`
      INSERT INTO journal_entries (entry_no, entry_date, description, reference, cash_flow_category)
      VALUES (?, ?, ?, ?, ?)
    `).run(entryNo, clean.date, clean.description, clean.reference, clean.cashFlowCategory);
    const entryId = info.lastInsertRowid;
    const insLine = db.prepare(`
      INSERT INTO journal_lines (entry_id, account_id, debit, credit, memo, line_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    clean.lines.forEach((l, idx) => insLine.run(entryId, l.accountId, l.debit, l.credit, l.memo, idx));
    return entryId;
  });
  const entryId = run();
  return getJournalEntry(entryId);
}

function updateJournalEntry(id, payload) {
  const existing = getDb().prepare('SELECT id FROM journal_entries WHERE id = ?').get(id);
  assert(existing, 'Transaksi tidak ditemukan');
  const clean = validateEntryPayload(payload);
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(`
      UPDATE journal_entries SET entry_date=?, description=?, reference=?, cash_flow_category=?,
        updated_at = datetime('now','localtime')
      WHERE id=?
    `).run(clean.date, clean.description, clean.reference, clean.cashFlowCategory, id);
    db.prepare('DELETE FROM journal_lines WHERE entry_id = ?').run(id);
    const insLine = db.prepare(`
      INSERT INTO journal_lines (entry_id, account_id, debit, credit, memo, line_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    clean.lines.forEach((l, idx) => insLine.run(id, l.accountId, l.debit, l.credit, l.memo, idx));
  });
  run();
  return getJournalEntry(id);
}

function deleteJournalEntry(id) {
  const existing = getDb().prepare('SELECT id FROM journal_entries WHERE id = ?').get(id);
  assert(existing, 'Transaksi tidak ditemukan');
  getDb().prepare('DELETE FROM journal_entries WHERE id = ?').run(id);
  return { deleted: true };
}

function getJournalEntry(id) {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
  assert(entry, 'Transaksi tidak ditemukan');
  const lines = db.prepare(`
    SELECT jl.*, a.code as account_code, a.name as account_name
    FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
    WHERE jl.entry_id = ? ORDER BY jl.line_order ASC, jl.id ASC
  `).all(id);
  return { ...entry, lines };
}

function clampPage(page, pageSize) {
  const size = Math.min(Math.max(Number(pageSize) || 50, 10), 500);
  const p = Math.max(Number(page) || 1, 1);
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

function listJournalPaged({ page = 1, pageSize = 50, startDate, endDate, accountId, search } = {}) {
  const db = getDb();
  const { page: p, pageSize: size, offset } = clampPage(page, pageSize);
  const clauses = [];
  const params = {};
  if (startDate) { clauses.push('je.entry_date >= @startDate'); params.startDate = startDate; }
  if (endDate) { clauses.push('je.entry_date <= @endDate'); params.endDate = endDate; }
  if (accountId) {
    clauses.push('EXISTS (SELECT 1 FROM journal_lines x WHERE x.entry_id = je.id AND x.account_id = @accountId)');
    params.accountId = Number(accountId);
  }
  if (search && String(search).trim()) {
    clauses.push('(je.description LIKE @q OR je.reference LIKE @q OR je.entry_no LIKE @q)');
    params.q = `%${String(search).trim().slice(0, 100)}%`;
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM journal_entries je ${where}`).get(params).c;
  const rows = db.prepare(`
    SELECT je.*,
      (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE entry_id = je.id) as total_debit,
      (SELECT COUNT(*) FROM journal_lines WHERE entry_id = je.id) as line_count
    FROM journal_entries je
    ${where}
    ORDER BY je.entry_date DESC, je.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: size, offset });

  return { rows, total, page: p, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
}

// ---------------------------------------------------------------------------
// BUKU BESAR (per akun, dengan saldo berjalan) - dipaginasi untuk data besar
// ---------------------------------------------------------------------------
function getLedgerPaged({ accountId, startDate, endDate, page = 1, pageSize = 100 } = {}) {
  const db = getDb();
  const account = getAccount(accountId);
  const { page: p, pageSize: size, offset } = clampPage(page, pageSize);

  const openingBalanceRaw = (() => {
    const before = startDate ? addDays(startDate, -1) : null;
    const sums = sumsByAccount(before ? { endDate: before } : { endDate: '0000-01-01' });
    const s = sums.get(account.id) || { debitSum: 0, creditSum: 0 };
    const raw = account.opening_balance + s.debitSum - s.creditSum;
    return raw;
  })();

  const clauses = ['jl.account_id = @accountId'];
  const params = { accountId: Number(accountId) };
  if (startDate) { clauses.push('je.entry_date >= @startDate'); params.startDate = startDate; }
  if (endDate) { clauses.push('je.entry_date <= @endDate'); params.endDate = endDate; }
  const where = 'WHERE ' + clauses.join(' AND ');

  const total = db.prepare(`
    SELECT COUNT(*) c FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id ${where}
  `).get(params).c;

  const pageRows = db.prepare(`
    SELECT jl.id, je.entry_date, je.entry_no, je.description, jl.memo, jl.debit, jl.credit
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    ${where}
    ORDER BY je.entry_date ASC, je.id ASC, jl.line_order ASC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: size, offset });

  // Saldo berjalan hingga baris pertama di halaman ini (agar kolom saldo tetap benar walau di-paginasi)
  let runningRaw = openingBalanceRaw;
  if (offset > 0) {
    const prior = db.prepare(`
      SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
      FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      ${where}
      ORDER BY je.entry_date ASC, je.id ASC, jl.line_order ASC
      LIMIT @offset
    `).get({ ...params, offset });
    runningRaw += (prior.d - prior.c);
  }

  const rows = pageRows.map(r => {
    runningRaw += (r.debit - r.credit);
    const presented = account.normal_balance === 'Debit' ? runningRaw : -runningRaw;
    return { ...r, runningBalance: round2(presented) };
  });

  const openingPresented = account.normal_balance === 'Debit' ? openingBalanceRaw : -openingBalanceRaw;

  return {
    account,
    openingBalance: round2(openingPresented),
    rows,
    total,
    page: p,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size))
  };
}

// ---------------------------------------------------------------------------
// LAPORAN
// ---------------------------------------------------------------------------

function getTrialBalance({ asOfDate }) {
  const accounts = listAccounts({ includeInactive: false });
  const balances = balancesAsOf(asOfDate);
  let totalDebit = 0, totalKredit = 0;
  const rows = accounts.map(a => {
    const bal = balances.get(a.id) || 0;
    const debit = a.normal_balance === 'Debit' && bal >= 0 ? bal : (a.normal_balance === 'Kredit' && bal < 0 ? -bal : 0);
    const kredit = a.normal_balance === 'Kredit' && bal >= 0 ? bal : (a.normal_balance === 'Debit' && bal < 0 ? -bal : 0);
    totalDebit = round2(totalDebit + debit);
    totalKredit = round2(totalKredit + kredit);
    return { accountId: a.id, code: a.code, name: a.name, type: a.type, debit, kredit };
  }).filter(r => r.debit !== 0 || r.kredit !== 0);
  return { asOfDate, rows, totalDebit, totalKredit, balanced: Math.abs(totalDebit - totalKredit) < 0.01 };
}

function getIncomeStatement({ startDate, endDate }) {
  const accounts = listAccounts({ includeInactive: false }).filter(a => a.type === 'Pendapatan' || a.type === 'Beban');
  const sums = sumsByAccount({ startDate, endDate });
  const pendapatan = [];
  const beban = [];
  let totalPendapatan = 0, totalBeban = 0;
  for (const a of accounts) {
    const s = sums.get(a.id) || { debitSum: 0, creditSum: 0 };
    const raw = s.debitSum - s.creditSum; // tanpa saldo awal (akun nominal mulai dari 0 tiap periode)
    const presented = a.normal_balance === 'Debit' ? raw : -raw;
    const signed = round2(presented * typeSign(a));
    if (signed === 0) continue;
    if (a.type === 'Pendapatan') { pendapatan.push({ accountId: a.id, code: a.code, name: a.name, amount: signed }); totalPendapatan = round2(totalPendapatan + signed); }
    else { beban.push({ accountId: a.id, code: a.code, name: a.name, amount: signed }); totalBeban = round2(totalBeban + signed); }
  }
  const labaRugiBersih = round2(totalPendapatan - totalBeban);
  return { startDate, endDate, pendapatan, beban, totalPendapatan, totalBeban, labaRugiBersih };
}

function getBalanceSheet({ asOfDate }) {
  const company = getCompany();
  const accounts = listAccounts({ includeInactive: false });
  const balances = balancesAsOf(asOfDate);
  const groups = { Aset: [], Kewajiban: [], Modal: [] };
  const totals = { Aset: 0, Kewajiban: 0, Modal: 0 };
  for (const a of accounts) {
    if (!groups[a.type]) continue;
    const bal = balances.get(a.id) || 0;
    const signed = round2(bal * typeSign(a));
    if (signed === 0 && bal === 0) continue;
    groups[a.type].push({ accountId: a.id, code: a.code, name: a.name, amount: signed, isContra: !!a.is_contra });
    totals[a.type] = round2(totals[a.type] + signed);
  }
  const fyStart = fiscalYearStartDate(asOfDate, company.fiscal_year_start);
  const laba = getIncomeStatement({ startDate: fyStart, endDate: asOfDate });
  const totalModalAkhir = round2(totals.Modal + laba.labaRugiBersih);
  const totalAset = totals.Aset;
  const totalKewajibanModal = round2(totals.Kewajiban + totalModalAkhir);
  return {
    asOfDate,
    aset: groups.Aset,
    kewajiban: groups.Kewajiban,
    modal: groups.Modal,
    labaBerjalan: laba.labaRugiBersih,
    labaBerjalanSejak: fyStart,
    totalAset,
    totalKewajiban: totals.Kewajiban,
    totalModal: totalModalAkhir,
    totalKewajibanModal,
    selisih: round2(totalAset - totalKewajibanModal)
  };
}

function getEquityChanges({ startDate, endDate }) {
  const accounts = listAccounts({ includeInactive: false }).filter(a => a.type === 'Modal');
  const startBefore = addDays(startDate, -1);
  const balBefore = balancesAsOf(startBefore);
  const balEnd = balancesAsOf(endDate);
  let totalAwal = 0, totalAkhirAkun = 0;
  const rows = accounts.map(a => {
    const awal = round2((balBefore.get(a.id) || 0) * typeSign(a));
    const akhir = round2((balEnd.get(a.id) || 0) * typeSign(a));
    totalAwal = round2(totalAwal + awal);
    totalAkhirAkun = round2(totalAkhirAkun + akhir);
    return { accountId: a.id, code: a.code, name: a.name, awal, perubahan: round2(akhir - awal), akhir };
  });
  const laba = getIncomeStatement({ startDate, endDate });
  const totalAkhir = round2(totalAkhirAkun + laba.labaRugiBersih);
  return {
    startDate, endDate, rows,
    totalModalAwal: totalAwal,
    labaRugiPeriode: laba.labaRugiBersih,
    totalModalAkhir: totalAkhir
  };
}

function getCashFlow({ startDate, endDate }) {
  const db = getDb();
  const cashAccounts = listAccounts({ includeInactive: true }).filter(a => a.is_cash);
  const cashIds = cashAccounts.map(a => a.id);
  const categories = ['Operasional', 'Investasi', 'Pendanaan', 'Belum Dikategorikan'];
  const totals = { Operasional: 0, Investasi: 0, Pendanaan: 0, 'Belum Dikategorikan': 0 };
  const details = { Operasional: [], Investasi: [], Pendanaan: [], 'Belum Dikategorikan': [] };

  if (cashIds.length > 0) {
    const placeholders = cashIds.map((_, i) => `@c${i}`).join(',');
    const params = {};
    cashIds.forEach((id, i) => { params[`c${i}`] = id; });
    const dateClauses = [];
    if (startDate) { dateClauses.push('je.entry_date >= @startDate'); params.startDate = startDate; }
    if (endDate) { dateClauses.push('je.entry_date <= @endDate'); params.endDate = endDate; }
    const dateWhere = dateClauses.length ? ' AND ' + dateClauses.join(' AND ') : '';
    const rows = db.prepare(`
      SELECT je.id as entryId, je.entry_no, je.entry_date, je.description, je.cash_flow_category,
             COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as netCash
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.account_id IN (${placeholders})${dateWhere}
      GROUP BY je.id
      HAVING netCash != 0
      ORDER BY je.entry_date ASC, je.id ASC
    `).all(params);
    for (const r of rows) {
      const cat = categories.includes(r.cash_flow_category) ? r.cash_flow_category : 'Belum Dikategorikan';
      totals[cat] = round2(totals[cat] + r.netCash);
      details[cat].push({ entryId: r.entryId, entryNo: r.entry_no, date: r.entry_date, description: r.description, amount: round2(r.netCash) });
    }
  }

  const startBefore = addDays(startDate, -1);
  const balBefore = balancesAsOf(startBefore);
  const saldoAwal = round2(cashAccounts.reduce((sum, a) => sum + (balBefore.get(a.id) || 0), 0));
  const kenaikanBersih = round2(totals.Operasional + totals.Investasi + totals.Pendanaan + totals['Belum Dikategorikan']);
  const saldoAkhir = round2(saldoAwal + kenaikanBersih);

  return { startDate, endDate, totals, details, saldoAwal, kenaikanBersih, saldoAkhir, cashAccounts: cashAccounts.map(a => ({ id: a.id, code: a.code, name: a.name })) };
}

function getDashboardSummary({ startDate, endDate }) {
  const income = getIncomeStatement({ startDate, endDate });
  const cash = getCashFlow({ startDate, endDate });
  const db = getDb();

  const dateClauses = [];
  const dateParams = {};
  if (startDate) { dateClauses.push('je.entry_date >= @startDate'); dateParams.startDate = startDate; }
  if (endDate) { dateClauses.push('je.entry_date <= @endDate'); dateParams.endDate = endDate; }
  const dateWhereAnd = dateClauses.length ? 'WHERE ' + dateClauses.join(' AND ') + ' AND ' : 'WHERE ';

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', je.entry_date) as ym,
           a.type as type,
           a.normal_balance as normalBalance,
           a.code as code,
           COALESCE(SUM(jl.debit),0) as debitSum,
           COALESCE(SUM(jl.credit),0) as creditSum
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN accounts a ON a.id = jl.account_id
    ${dateWhereAnd} a.type IN ('Pendapatan','Beban')
    GROUP BY ym, a.id
    ORDER BY ym ASC
  `).all(dateParams);

  const monthMap = new Map();
  for (const r of monthly) {
    if (!monthMap.has(r.ym)) monthMap.set(r.ym, { ym: r.ym, pendapatan: 0, beban: 0 });
    const raw = r.debitSum - r.creditSum;
    const presented = r.normalBalance === 'Debit' ? raw : -raw;
    const sign = r.normalBalance === EXPECTED_NORMAL[r.type] ? 1 : -1;
    const signed = presented * sign;
    const bucket = monthMap.get(r.ym);
    if (r.type === 'Pendapatan') bucket.pendapatan = round2(bucket.pendapatan + signed);
    else bucket.beban = round2(bucket.beban + signed);
  }
  const monthlySeries = Array.from(monthMap.values()).sort((a, b) => a.ym.localeCompare(b.ym));

  const topBeban = db.prepare(`
    SELECT a.name as name, COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) as amount
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN accounts a ON a.id = jl.account_id
    ${dateWhereAnd} a.type = 'Beban'
    GROUP BY a.id
    HAVING amount > 0
    ORDER BY amount DESC
    LIMIT 6
  `).all(dateParams);

  const entryCountWhere = dateClauses.length ? 'WHERE ' + dateClauses.join(' AND ') : '';
  const entryCount = db.prepare(`SELECT COUNT(*) c FROM journal_entries je ${entryCountWhere}`).get(dateParams).c;

  return {
    startDate, endDate,
    totalPemasukan: income.totalPendapatan,
    totalPengeluaran: income.totalBeban,
    labaRugiBersih: income.labaRugiBersih,
    saldoKas: cash.saldoAkhir,
    entryCount,
    monthlySeries,
    topBeban: topBeban.map(r => ({ name: r.name, amount: round2(r.amount) }))
  };
}

module.exports = {
  getCompany, updateCompany,
  listAccounts, getAccount, createAccount, updateAccount, archiveAccount, restoreAccount,
  deleteAccountIfUnused, accountTransactionCount,
  createJournalEntry, updateJournalEntry, deleteJournalEntry, getJournalEntry, listJournalPaged,
  getLedgerPaged,
  getTrialBalance, getIncomeStatement, getBalanceSheet, getEquityChanges, getCashFlow, getDashboardSummary,
  balancesAsOf, sumsByAccount, EXPECTED_NORMAL, round2, addDays, fiscalYearStartDate
};
