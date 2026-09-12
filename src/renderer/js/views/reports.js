'use strict';
window.Views = window.Views || {};

(() => {
  const CODE_NAME_COLS = [{ key: 'code', label: 'Kode', style: 'width:100px' }, { key: 'name', label: 'Nama Akun' }];

  function summaryLine(label, value, opts = {}) {
    return Utils.el('div', { class: 'summary-line' + (opts.strong ? ' summary-line--strong' : '') }, [
      Utils.el('span', {}, label),
      Utils.el('span', { class: Shared.amountClass(value) }, Utils.formatRp(value))
    ]);
  }

  function alertBanner(text, tone = 'warn') {
    return Utils.el('div', { class: `alert alert--${tone}` }, text);
  }

  // -------------------------------------------------------------------
  // NERACA SALDO
  // -------------------------------------------------------------------
  Views.trialBalance = (() => {
    let asOfDate = Utils.todayStr();
    function render(container) {
      Shared.setPageTitle('Neraca Saldo');
      Shared.setTopbarTools([
        Shared.asOfDateControl({ date: asOfDate, onChange: (v) => { asOfDate = v; load(container); } }),
        Shared.exportButtons({
          onExcel: () => Shared.handleExcelExport('trial_balance', { asOfDate }),
          onPdf: () => Shared.handlePdfExport(`Neraca-Saldo_${asOfDate}`)
        })
      ]);
      load(container);
      return () => {};
    }
    async function load(container) {
      await Shared.renderAsync(container, async () => {
        const [company, r] = await Promise.all([Shared.getCompany(), window.api.reports.trialBalance({ asOfDate })]);
        return { company, r };
      }, ({ company, r }) => {
        const wrap = Utils.el('div', {}, [
          !r.balanced ? alertBanner('Peringatan: total debit dan kredit tidak seimbang. Segera periksa data transaksi.', 'error') : null,
          Shared.reportSheet({ company, title: 'NERACA SALDO', periodLabel: `Per tanggal ${Utils.formatDateID(asOfDate)}` },
            Shared.simpleTable({
              columns: [
                ...CODE_NAME_COLS,
                { key: 'debit', label: 'Debit', align: 'right', amount: true, format: (v) => v ? Utils.formatRp(v) : '-' },
                { key: 'kredit', label: 'Kredit', align: 'right', amount: true, format: (v) => v ? Utils.formatRp(v) : '-' }
              ],
              rows: r.rows,
              totalsRow: { name: 'TOTAL', debit: r.totalDebit, kredit: r.totalKredit }
            }))
        ]);
        return wrap;
      });
    }
    return { render };
  })();

  // -------------------------------------------------------------------
  // LABA RUGI
  // -------------------------------------------------------------------
  Views.incomeStatement = (() => {
    let range = { startDate: Utils.startOfYearStr(), endDate: Utils.todayStr() };
    function render(container) {
      Shared.setPageTitle('Laporan Laba Rugi');
      Shared.setTopbarTools([
        Shared.dateRangeControl({ ...range, onChange: (n) => { range = n; load(container); } }),
        Shared.exportButtons({
          onExcel: () => Shared.handleExcelExport('income_statement', range),
          onPdf: () => Shared.handlePdfExport(`Laba-Rugi_${range.startDate || 'awal'}_${range.endDate}`)
        })
      ]);
      load(container);
      return () => {};
    }
    async function load(container) {
      await Shared.renderAsync(container, async () => {
        const [company, r] = await Promise.all([Shared.getCompany(), window.api.reports.incomeStatement(range)]);
        return { company, r };
      }, ({ company, r }) => Shared.reportSheet(
        { company, title: 'LAPORAN LABA RUGI', periodLabel: Shared.periodRangeLabel(range.startDate, range.endDate) },
        Utils.el('div', { class: 'view-stack' }, [
          Shared.card('Pendapatan', Shared.simpleTable({
            columns: [...CODE_NAME_COLS, { key: 'amount', label: 'Jumlah', align: 'right', amount: true, format: Utils.formatRp }],
            rows: r.pendapatan, totalsRow: { name: 'Total Pendapatan', amount: r.totalPendapatan }
          })),
          Shared.card('Beban', Shared.simpleTable({
            columns: [...CODE_NAME_COLS, { key: 'amount', label: 'Jumlah', align: 'right', amount: true, format: Utils.formatRp }],
            rows: r.beban, totalsRow: { name: 'Total Beban', amount: r.totalBeban }
          })),
          summaryLine(r.labaRugiBersih >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH', r.labaRugiBersih, { strong: true })
        ])
      ));
    }
    return { render };
  })();

  // -------------------------------------------------------------------
  // NERACA (POSISI KEUANGAN)
  // -------------------------------------------------------------------
  Views.balanceSheet = (() => {
    let asOfDate = Utils.todayStr();
    function render(container) {
      Shared.setPageTitle('Neraca');
      Shared.setTopbarTools([
        Shared.asOfDateControl({ date: asOfDate, onChange: (v) => { asOfDate = v; load(container); } }),
        Shared.exportButtons({
          onExcel: () => Shared.handleExcelExport('balance_sheet', { asOfDate }),
          onPdf: () => Shared.handlePdfExport(`Neraca_${asOfDate}`)
        })
      ]);
      load(container);
      return () => {};
    }
    async function load(container) {
      await Shared.renderAsync(container, async () => {
        const [company, r] = await Promise.all([Shared.getCompany(), window.api.reports.balanceSheet({ asOfDate })]);
        return { company, r };
      }, ({ company, r }) => {
        const modalRows = [...r.modal, { code: '', name: `Laba (Rugi) Berjalan (sejak ${Utils.formatDateID(r.labaBerjalanSejak)})`, amount: r.labaBerjalan }];
        const amtCol = { key: 'amount', label: 'Jumlah', align: 'right', amount: true, format: Utils.formatRp };
        const body = Utils.el('div', { class: 'view-stack' }, [
          Shared.card('Aset', Shared.simpleTable({ columns: [...CODE_NAME_COLS, amtCol], rows: r.aset, totalsRow: { name: 'Total Aset', amount: r.totalAset } })),
          Shared.card('Kewajiban', Shared.simpleTable({ columns: [...CODE_NAME_COLS, amtCol], rows: r.kewajiban, totalsRow: { name: 'Total Kewajiban', amount: r.totalKewajiban } })),
          Shared.card('Modal', Shared.simpleTable({ columns: [...CODE_NAME_COLS, amtCol], rows: modalRows, totalsRow: { name: 'Total Modal', amount: r.totalModal } })),
          summaryLine('TOTAL KEWAJIBAN + MODAL', r.totalKewajibanModal, { strong: true }),
          Math.abs(r.selisih) >= 0.01 ? alertBanner(`Neraca tidak seimbang! Selisih ${Utils.formatRp(r.selisih)}. Periksa kembali data transaksi.`, 'error') : null
        ]);
        return Shared.reportSheet({ company, title: 'LAPORAN POSISI KEUANGAN (NERACA)', periodLabel: `Per tanggal ${Utils.formatDateID(asOfDate)}` }, body);
      });
    }
    return { render };
  })();

  // -------------------------------------------------------------------
  // ARUS KAS
  // -------------------------------------------------------------------
  Views.cashFlow = (() => {
    let range = { startDate: Utils.startOfYearStr(), endDate: Utils.todayStr() };
    function render(container) {
      Shared.setPageTitle('Laporan Arus Kas');
      Shared.setTopbarTools([
        Shared.dateRangeControl({ ...range, onChange: (n) => { range = n; load(container); } }),
        Shared.exportButtons({
          onExcel: () => Shared.handleExcelExport('cash_flow', range),
          onPdf: () => Shared.handlePdfExport(`Arus-Kas_${range.startDate || 'awal'}_${range.endDate}`)
        })
      ]);
      load(container);
      return () => {};
    }
    function section(title, key, r) {
      if (!r.details[key].length) return null;
      return Shared.card(title, Shared.simpleTable({
        columns: [
          { key: 'date', label: 'Tanggal', format: Utils.formatDateID },
          { key: 'entryNo', label: 'No. Jurnal' },
          { key: 'description', label: 'Keterangan' },
          { key: 'amount', label: 'Jumlah', align: 'right', amount: true, format: Utils.formatRp }
        ],
        rows: r.details[key],
        totalsRow: { description: `Subtotal ${title}`, amount: r.totals[key] }
      }));
    }
    async function load(container) {
      await Shared.renderAsync(container, async () => {
        const [company, r] = await Promise.all([Shared.getCompany(), window.api.reports.cashFlow(range)]);
        return { company, r };
      }, ({ company, r }) => {
        if (!r.cashAccounts.length) {
          return Shared.emptyState('Belum ada akun bertanda "Kas/Bank".', 'Tandai akun Kas/Bank Anda lewat menu Bagan Akun agar laporan ini bisa dihitung.');
        }
        const body = Utils.el('div', { class: 'view-stack' }, [
          summaryLine('Saldo Kas Awal', r.saldoAwal),
          section('Aktivitas Operasional', 'Operasional', r),
          section('Aktivitas Investasi', 'Investasi', r),
          section('Aktivitas Pendanaan', 'Pendanaan', r),
          section('Belum Dikategorikan', 'Belum Dikategorikan', r),
          summaryLine('Kenaikan (Penurunan) Kas Bersih', r.kenaikanBersih),
          summaryLine('Saldo Kas Akhir', r.saldoAkhir, { strong: true })
        ]);
        return Shared.reportSheet({ company, title: 'LAPORAN ARUS KAS', periodLabel: Shared.periodRangeLabel(range.startDate, range.endDate) }, body);
      });
    }
    return { render };
  })();

  // -------------------------------------------------------------------
  // PERUBAHAN MODAL
  // -------------------------------------------------------------------
  Views.equityChanges = (() => {
    let range = { startDate: Utils.startOfYearStr(), endDate: Utils.todayStr() };
    function render(container) {
      Shared.setPageTitle('Laporan Perubahan Modal');
      Shared.setTopbarTools([
        Shared.dateRangeControl({ ...range, onChange: (n) => { range = n; load(container); } }),
        Shared.exportButtons({
          onExcel: () => Shared.handleExcelExport('equity_changes', range),
          onPdf: () => Shared.handlePdfExport(`Perubahan-Modal_${range.startDate || 'awal'}_${range.endDate}`)
        })
      ]);
      load(container);
      return () => {};
    }
    async function load(container) {
      await Shared.renderAsync(container, async () => {
        const [company, r] = await Promise.all([Shared.getCompany(), window.api.reports.equityChanges(range)]);
        return { company, r };
      }, ({ company, r }) => {
        if (!r.rows.length) return Shared.emptyState('Belum ada akun bertipe Modal.');
        const body = Utils.el('div', { class: 'view-stack' }, [
          Shared.simpleTable({
            columns: [
              ...CODE_NAME_COLS,
              { label: 'Saldo Awal', align: 'right', amount: true, value: (x) => x.awal, format: Utils.formatRp },
              { label: 'Perubahan', align: 'right', amount: true, value: (x) => x.perubahan, format: Utils.formatRp },
              { label: 'Saldo Akhir', align: 'right', amount: true, value: (x) => x.akhir, format: Utils.formatRp }
            ],
            rows: r.rows
          }),
          summaryLine('Total Modal Awal', r.totalModalAwal),
          summaryLine('Laba (Rugi) Periode Berjalan', r.labaRugiPeriode),
          summaryLine('Total Modal Akhir', r.totalModalAkhir, { strong: true })
        ]);
        return Shared.reportSheet({ company, title: 'LAPORAN PERUBAHAN MODAL', periodLabel: Shared.periodRangeLabel(range.startDate, range.endDate) }, body);
      });
    }
    return { render };
  })();
})();
