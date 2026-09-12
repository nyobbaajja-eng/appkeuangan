'use strict';
window.Views = window.Views || {};

Views.dashboard = (() => {
  let range = { startDate: Utils.startOfYearStr(), endDate: Utils.todayStr() };

  function renderCharts(container, data) {
    const chartsRow = Utils.el('div', { class: 'grid-2' });

    const barCard = Shared.card('Pemasukan vs Pengeluaran per Bulan', (() => {
      const wrap = Utils.el('div', { class: 'chart-wrap' });
      const canvas = Utils.el('canvas');
      wrap.appendChild(canvas);
      if (!data.monthlySeries.length) {
        return Shared.emptyState('Belum ada transaksi pendapatan/beban pada rentang ini.');
      }
      requestAnimationFrame(() => Charts.drawGroupedBarChart(canvas, {
        labels: data.monthlySeries.map(m => Utils.monthLabel(m.ym)),
        series: [
          { name: 'Pemasukan', values: data.monthlySeries.map(m => m.pendapatan), color: '#2F6F4E' },
          { name: 'Pengeluaran', values: data.monthlySeries.map(m => m.beban), color: '#A63D40' }
        ],
        formatValue: (v) => Utils.formatNumber(Math.round(v))
      }));
      return wrap;
    })());

    const donutCard = Shared.card('Beban Terbesar', (() => {
      const wrap = Utils.el('div', { class: 'chart-wrap' });
      const canvas = Utils.el('canvas');
      wrap.appendChild(canvas);
      if (!data.topBeban.length) {
        return Shared.emptyState('Belum ada beban pada rentang ini.');
      }
      const colors = ['#B8863B', '#5B6472', '#2F6F4E', '#A63D40', '#96692A', '#8A8776'];
      requestAnimationFrame(() => Charts.drawDonutChart(canvas, {
        data: data.topBeban.map(b => ({ label: b.name, value: b.amount })),
        colors, formatValue: Utils.formatRp
      }));
      return wrap;
    })());

    chartsRow.appendChild(barCard);
    chartsRow.appendChild(donutCard);
    container.appendChild(chartsRow);
  }

  async function renderRecentTransactions(container) {
    const card = Shared.card('Transaksi Terbaru', Shared.loadingBlock(), {
      headerExtra: Utils.el('button', {
        class: 'btn btn--ghost btn--sm', onclick: () => App.navigate('journal')
      }, 'Lihat Semua Jurnal →')
    });
    container.appendChild(card);
    const body = card.querySelector('.card__body');
    try {
      const result = await window.api.journal.listPaged({ page: 1, pageSize: 8 });
      body.innerHTML = '';
      if (!result.rows.length) {
        body.appendChild(Shared.emptyState('Belum ada transaksi.', 'Tambahkan transaksi pertama dari menu Jurnal Umum.'));
        return;
      }
      body.appendChild(Shared.simpleTable({
        columns: [
          { key: 'entry_date', label: 'Tanggal', format: Utils.formatDateID },
          { key: 'entry_no', label: 'No. Jurnal' },
          { key: 'description', label: 'Keterangan' },
          { key: 'total_debit', label: 'Nilai', align: 'right', format: Utils.formatRp }
        ],
        rows: result.rows
      }));
    } catch (err) {
      body.innerHTML = '';
      body.appendChild(Utils.el('div', { class: 'error-block' }, err.message));
    }
  }

  async function load(container) {
    await Shared.renderAsync(container, () => window.api.reports.dashboard(range), (data) => {
      const root = Utils.el('div', { class: 'view-stack' });

      const laba = data.labaRugiBersih;
      root.appendChild(Utils.el('div', { class: 'stat-grid' }, [
        Shared.statCard({ label: 'Total Pemasukan', value: Utils.formatRp(data.totalPemasukan), tone: 'pos' }),
        Shared.statCard({ label: 'Total Pengeluaran', value: Utils.formatRp(data.totalPengeluaran), tone: 'neg' }),
        Shared.statCard({ label: laba >= 0 ? 'Laba Bersih' : 'Rugi Bersih', value: Utils.formatRp(Math.abs(laba)), tone: laba >= 0 ? 'pos' : 'neg' }),
        Shared.statCard({ label: 'Saldo Kas & Bank', value: Utils.formatRp(data.saldoKas), sub: `${data.entryCount.toLocaleString('id-ID')} transaksi periode ini`, tone: 'neutral' })
      ]));

      renderCharts(root, data);
      container.appendChild(root);
      renderRecentTransactions(root);
    });
  }

  function render(container) {
    Shared.setPageTitle('Dashboard');
    Shared.setTopbarTools(Shared.dateRangeControl({
      startDate: range.startDate,
      endDate: range.endDate,
      onChange: (next) => { range = { startDate: next.startDate, endDate: next.endDate }; load(container); }
    }));
    load(container);
    return () => {}; // tidak ada listener global yang perlu dibersihkan
  }

  return { render };
})();
