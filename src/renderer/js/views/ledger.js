'use strict';
window.Views = window.Views || {};

Views.ledger = (() => {
  let state = { accountId: null, startDate: Utils.startOfYearStr(), endDate: Utils.todayStr() };
  let vtable = null;

  function render(container) {
    Shared.setPageTitle('Buku Besar');
    container.innerHTML = '';
    const root = Utils.el('div', { class: 'view-stack' });
    container.appendChild(root);

    Shared.renderAsync(root, () => window.api.accounts.list({ includeInactive: true }), (accounts) => {
      if (!accounts.length) return Shared.emptyState('Belum ada akun. Buat akun terlebih dahulu di menu Bagan Akun.');
      if (!state.accountId) state.accountId = accounts[0].id;

      const wrap = Utils.el('div', { class: 'view-stack' });
      const banner = Utils.el('div', { class: 'ledger-banner' });
      const filterBar = Utils.el('div', { class: 'journal-filterbar' }, [
        Shared.accountSelect({
          accounts, value: state.accountId, includeEmpty: false,
          onChange: (v) => { state.accountId = Number(v); vtable.reload(); }
        }),
        Shared.dateRangeControl({
          startDate: state.startDate, endDate: state.endDate,
          onChange: (next) => { state.startDate = next.startDate; state.endDate = next.endDate; vtable.reload(); }
        })
      ]);

      Shared.setTopbarTools(Utils.el('button', {
        class: 'btn btn--ghost', onclick: () => {
          const acc = accounts.find(a => a.id === state.accountId);
          Shared.handleExcelExport('ledger', { accountId: state.accountId, accountLabel: acc ? acc.code : '', startDate: state.startDate, endDate: state.endDate });
        }
      }, 'Export Excel'));

      wrap.appendChild(filterBar);
      wrap.appendChild(banner);
      const tableHost = Utils.el('div', {});
      wrap.appendChild(tableHost);

      vtable = VTable.create({
        container: tableHost,
        columns: [
          { label: 'Tanggal', width: '110px' },
          { label: 'No. Jurnal', width: '120px' },
          { label: 'Keterangan', width: '1fr' },
          { label: 'Memo', width: '1fr' },
          { label: 'Debit', width: '130px', align: 'right' },
          { label: 'Kredit', width: '130px', align: 'right' },
          { label: 'Saldo', width: '150px', align: 'right' }
        ],
        rowHeight: 40,
        viewportHeight: 480,
        emptyText: 'Tidak ada mutasi pada rentang tanggal ini.',
        getRowKey: (r) => r.id,
        fetchPage: async ({ page, pageSize }) => {
          const result = await window.api.ledger.getPaged({ accountId: state.accountId, startDate: state.startDate, endDate: state.endDate, page, pageSize });
          banner.innerHTML = '';
          banner.appendChild(Utils.el('strong', {}, `${result.account.code} — ${result.account.name}`));
          banner.appendChild(Utils.el('span', {}, `Saldo Awal (per ${state.startDate || 'awal data'}): `));
          banner.appendChild(Utils.el('span', { class: Shared.amountClass(result.openingBalance) }, Utils.formatRp(result.openingBalance)));
          return result;
        },
        renderCells: (row) => [
          Utils.formatDateID(row.entry_date), row.entry_no, row.description || '-', row.memo || '-',
          row.debit ? Utils.formatRp(row.debit) : '-', row.credit ? Utils.formatRp(row.credit) : '-',
          Utils.el('span', { class: Shared.amountClass(row.runningBalance) }, Utils.formatRp(row.runningBalance))
        ]
      });

      return wrap;
    });
    return () => {};
  }

  return { render };
})();
