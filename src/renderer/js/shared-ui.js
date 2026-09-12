'use strict';
/* Komponen & helper UI yang dipakai berulang di banyak halaman (views). */
const Shared = (() => {

  function setPageTitle(title) {
    document.getElementById('page-title').textContent = title;
    document.title = `${title} — Laporan Keuangan`;
  }

  function setTopbarTools(nodes) {
    const root = document.getElementById('topbar-tools');
    root.innerHTML = '';
    (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean).forEach(n => root.appendChild(n));
  }

  function icon(svgInner, size = 18) {
    const span = Utils.el('span', { class: 'icon', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svgInner}</svg>` });
    return span;
  }

  function amountClass(n) {
    const v = Number(n) || 0;
    if (v > 0.0049) return 'amount amount--pos';
    if (v < -0.0049) return 'amount amount--neg';
    return 'amount';
  }

  function card(title, contentNode, opts = {}) {
    const node = Utils.el('div', { class: 'card' + (opts.class ? ' ' + opts.class : '') }, [
      title ? Utils.el('div', { class: 'card__head' }, [
        Utils.el('h3', { class: 'card__title' }, title),
        opts.headerExtra || null
      ]) : null,
      Utils.el('div', { class: 'card__body' }, contentNode)
    ]);
    return node;
  }

  function statCard({ label, value, sub, tone = 'neutral' }) {
    return Utils.el('div', { class: `stat-card stat-card--${tone}` }, [
      Utils.el('span', { class: 'stat-card__label' }, label),
      Utils.el('strong', { class: 'stat-card__value' }, value),
      sub ? Utils.el('span', { class: 'stat-card__sub' }, sub) : null
    ]);
  }

  function emptyState(text, hint) {
    return Utils.el('div', { class: 'empty-state' }, [
      Utils.el('p', {}, text),
      hint ? Utils.el('p', { class: 'empty-state__hint' }, hint) : null
    ]);
  }

  function loadingBlock(text = 'Memuat…') {
    return Utils.el('div', { class: 'loading-block' }, text);
  }

  /** Bungkus pemuatan data async: tampilkan loading, lalu render hasil atau pesan error (tidak pernah membuat layar kosong tanpa keterangan). */
  async function renderAsync(container, loader, renderer) {
    container.innerHTML = '';
    container.appendChild(loadingBlock());
    try {
      const data = await loader();
      container.innerHTML = '';
      container.appendChild(renderer(data));
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(Utils.el('div', { class: 'error-block' }, [
        Utils.el('strong', {}, 'Gagal memuat data'),
        Utils.el('p', {}, err.message || String(err))
      ]));
      Toast.error(err.message || String(err));
    }
  }

  function simpleTable({ columns, rows, totalsRow, emptyText = 'Tidak ada data pada rentang ini.' }) {
    const thead = Utils.el('thead', {}, Utils.el('tr', {}, columns.map(c =>
      Utils.el('th', { style: c.align ? `text-align:${c.align}` : '' }, c.label))));
    const tbody = Utils.el('tbody', {}, rows.length ? rows.map(r => Utils.el('tr', {}, columns.map(c => {
      const raw = typeof c.value === 'function' ? c.value(r) : r[c.key];
      const content = c.format ? c.format(raw, r) : raw;
      return Utils.el('td', { style: c.align ? `text-align:${c.align}` : '', class: c.amount ? amountClass(raw) : '' },
        content instanceof Node ? content : String(content ?? ''));
    }))) : [Utils.el('tr', {}, Utils.el('td', { colspan: String(columns.length), class: 'table__empty' }, emptyText))]);
    const table = Utils.el('table', { class: 'table' }, [thead, tbody]);
    if (totalsRow) {
      table.appendChild(Utils.el('tfoot', {}, Utils.el('tr', { class: 'table__totals' }, columns.map(c => {
        const raw = typeof totalsRow.value === 'function' ? totalsRow.value(c) : totalsRow[c.key];
        const content = raw === undefined ? '' : (c.format ? c.format(raw, totalsRow) : raw);
        return Utils.el('td', { style: c.align ? `text-align:${c.align}` : '', class: c.amount && raw !== undefined ? amountClass(raw) : '' },
          content instanceof Node ? content : String(content ?? ''));
      }))));
    }
    return table;
  }

  function accountSelect({ accounts, value, onChange, placeholder = 'Pilih akun…', includeEmpty = true, name }) {
    const groups = {};
    accounts.forEach(a => { (groups[a.type] = groups[a.type] || []).push(a); });
    const order = ['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban'];
    const children = [];
    if (includeEmpty) children.push(Utils.el('option', { value: '' }, placeholder));
    order.filter(t => groups[t] && groups[t].length).forEach(type => {
      children.push(Utils.el('optgroup', { label: type }, groups[type].map(a =>
        Utils.el('option', { value: String(a.id), selected: value && String(value) === String(a.id) || undefined },
          `${a.code} — ${a.name}`))));
    });
    return Utils.el('select', { class: 'input', name, onchange: onChange ? (e) => onChange(e.target.value) : undefined }, children);
  }

  function dateInput({ value, onChange, label, max, min }) {
    const wrap = Utils.el('label', { class: 'field-inline' }, [
      label ? Utils.el('span', {}, label) : null,
      Utils.el('input', {
        type: 'date', class: 'input input--date', value: value || '', max, min,
        onchange: onChange ? (e) => onChange(e.target.value) : undefined
      })
    ]);
    return wrap;
  }

  function presetButton(label, onClick) {
    return Utils.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: onClick }, label);
  }

  function firstDayOfMonth(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  /** Bilah rentang tanggal (dipakai Jurnal, Buku Besar, Laba Rugi, Arus Kas, Perubahan Modal, Dashboard). */
  function dateRangeControl({ startDate, endDate, onChange }) {
    const today = Utils.todayStr();
    const startEl = dateInput({
      value: startDate, label: 'Dari', max: today,
      onChange: (v) => onChange({ startDate: v || undefined, endDate })
    });
    const endEl = dateInput({
      value: endDate, label: 'Sampai', max: today,
      onChange: (v) => onChange({ startDate, endDate: v || undefined })
    });
    const wrap = Utils.el('div', { class: 'date-range' }, [
      startEl, endEl,
      Utils.el('div', { class: 'date-range__presets' }, [
        presetButton('Bulan Ini', () => onChange({ startDate: firstDayOfMonth(), endDate: today })),
        presetButton('Tahun Ini', () => onChange({ startDate: Utils.startOfYearStr(), endDate: today })),
        presetButton('Semua', () => onChange({ startDate: undefined, endDate: today }))
      ])
    ]);
    return wrap;
  }

  /** Kontrol tanggal tunggal "per tanggal" (Neraca Saldo, Neraca). */
  function asOfDateControl({ date, onChange }) {
    const today = Utils.todayStr();
    return Utils.el('div', { class: 'date-range' }, [
      dateInput({ value: date, label: 'Per Tanggal', max: today, onChange: (v) => onChange(v || today) }),
      Utils.el('div', { class: 'date-range__presets' }, [
        presetButton('Hari Ini', () => onChange(today)),
        presetButton('Akhir Bulan Lalu', () => {
          const d = new Date(); d.setDate(0);
          onChange(d.toISOString().slice(0, 10));
        }),
        presetButton('Akhir Tahun Lalu', () => onChange(`${new Date().getFullYear() - 1}-12-31`))
      ])
    ]);
  }

  function exportButtons({ onExcel, onPdf, disabled }) {
    return Utils.el('div', { class: 'btn-group' }, [
      Utils.el('button', { class: 'btn btn--ghost', disabled: disabled || undefined, onclick: onExcel }, [icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>'), ' Excel']),
      Utils.el('button', { class: 'btn btn--ghost', disabled: disabled || undefined, onclick: onPdf }, [icon('<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'), ' PDF / Cetak'])
    ]);
  }

  async function handleExcelExport(type, params, busyBtnLabel) {
    try {
      const res = await window.api.io.exportExcel(type, params);
      if (res.cancelled) return;
      Toast.success('Berhasil diekspor ke: ' + res.path);
    } catch (err) {
      Toast.error('Gagal ekspor Excel: ' + err.message);
    }
  }

  async function handlePdfExport(suggestedName) {
    try {
      const res = await window.api.io.exportPdf(suggestedName);
      if (res.cancelled) return;
      Toast.success('Berhasil disimpan ke: ' + res.path);
    } catch (err) {
      Toast.error('Gagal membuat PDF: ' + err.message);
    }
  }

  let companyCache = null;
  async function getCompany(forceRefresh) {
    if (!companyCache || forceRefresh) companyCache = await window.api.company.get();
    return companyCache;
  }
  function invalidateCompany() { companyCache = null; }

  function reportSheet({ company, title, periodLabel }, bodyNode) {
    return Utils.el('div', { class: 'report-sheet' }, [
      Utils.el('div', { class: 'report-sheet__head' }, [
        Utils.el('h2', {}, company.name || 'Nama Usaha Anda'),
        company.address ? Utils.el('p', { class: 'report-sheet__address' }, company.address) : null,
        Utils.el('h3', {}, title),
        Utils.el('p', { class: 'report-sheet__period' }, periodLabel)
      ]),
      Utils.el('div', { class: 'report-sheet__body' }, bodyNode)
    ]);
  }

  function periodRangeLabel(startDate, endDate) {
    if (!startDate && !endDate) return 'Seluruh periode';
    if (!startDate) return `Sampai dengan ${Utils.formatDateID(endDate)}`;
    return `Periode ${Utils.formatDateID(startDate)} s.d. ${Utils.formatDateID(endDate)}`;
  }

  return {
    setPageTitle, setTopbarTools, icon, amountClass, card, statCard, emptyState, loadingBlock,
    renderAsync, simpleTable, accountSelect, dateInput, dateRangeControl, asOfDateControl,
    exportButtons, handleExcelExport, handlePdfExport, firstDayOfMonth,
    getCompany, invalidateCompany, reportSheet, periodRangeLabel
  };
})();
