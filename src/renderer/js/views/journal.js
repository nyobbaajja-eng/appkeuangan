'use strict';
window.Views = window.Views || {};

Views.journal = (() => {
  const CF_CATEGORIES = ['', 'Operasional', 'Investasi', 'Pendanaan'];
  let filters = { startDate: undefined, endDate: undefined, search: '' };
  let vtable = null;

  // ---------------------------------------------------------------------
  // FORM TAMBAH / UBAH TRANSAKSI
  // ---------------------------------------------------------------------
  function buildLineRow(accounts, line, onChange) {
    const accSelect = Shared.accountSelect({ accounts, value: line ? line.accountId : '', onChange: onChange });
    const debitInput = Utils.el('input', {
      class: 'input input--right', type: 'number', step: '0.01', min: '0',
      value: line && line.debit ? line.debit : '', placeholder: '0',
      oninput: () => { if (Number(debitInput.value) > 0) creditInput.value = ''; onChange(); }
    });
    const creditInput = Utils.el('input', {
      class: 'input input--right', type: 'number', step: '0.01', min: '0',
      value: line && line.credit ? line.credit : '', placeholder: '0',
      oninput: () => { if (Number(creditInput.value) > 0) debitInput.value = ''; onChange(); }
    });
    const memoInput = Utils.el('input', { class: 'input', value: line ? line.memo || '' : '', placeholder: 'Memo (opsional)' });
    const row = Utils.el('div', { class: 'line-row' }, [
      accSelect, debitInput, creditInput, memoInput,
      Utils.el('button', {
        class: 'btn btn--ghost btn--sm line-row__remove', type: 'button', title: 'Hapus baris',
        onclick: () => { row.remove(); onChange(); }
      }, '✕')
    ]);
    row._getData = () => ({
      accountId: accSelect.value ? Number(accSelect.value) : null,
      debit: Utils.parseNumberInput(debitInput.value),
      credit: Utils.parseNumberInput(creditInput.value),
      memo: memoInput.value.trim()
    });
    return row;
  }

  function openForm(existingEntry, onSaved) {
    (async () => {
      let accounts;
      try {
        accounts = await window.api.accounts.list({ includeInactive: false });
      } catch (err) {
        Toast.error('Gagal memuat daftar akun: ' + err.message);
        return;
      }
      if (accounts.length < 2) {
        Toast.error('Minimal harus ada 2 akun aktif sebelum bisa mencatat transaksi.');
        return;
      }

      const isEdit = !!existingEntry;
      const dateInput = Utils.el('input', { class: 'input', type: 'date', value: existingEntry ? existingEntry.entry_date : Utils.todayStr() });
      const descInput = Utils.el('input', { class: 'input', value: existingEntry ? existingEntry.description : '', maxlength: '500', placeholder: 'contoh: Penjualan tunai' });
      const refInput = Utils.el('input', { class: 'input', value: existingEntry ? existingEntry.reference : '', maxlength: '100', placeholder: 'contoh: BKM-0001 (opsional)' });
      const cfSelect = Utils.el('select', { class: 'input' }, CF_CATEGORIES.map(c =>
        Utils.el('option', { value: c, selected: (existingEntry ? (existingEntry.cash_flow_category || '') : '') === c || undefined },
          c || '(Tidak melibatkan Kas/Bank)')));

      const linesContainer = Utils.el('div', { class: 'lines-container' });
      const totalsBar = Utils.el('div', { class: 'lines-totals' });
      const errorBox = Utils.el('div', { class: 'form-error', style: 'display:none' });

      function recompute() {
        const rows = Utils.qsa('.line-row', linesContainer);
        let debit = 0, credit = 0;
        rows.forEach(r => { const d = r._getData(); debit += d.debit || 0; credit += d.credit || 0; });
        debit = Math.round(debit * 100) / 100; credit = Math.round(credit * 100) / 100;
        const balanced = Math.abs(debit - credit) < 0.01 && debit > 0;
        totalsBar.innerHTML = '';
        totalsBar.appendChild(Utils.el('span', {}, `Total Debit: ${Utils.formatRp(debit)}`));
        totalsBar.appendChild(Utils.el('span', {}, `Total Kredit: ${Utils.formatRp(credit)}`));
        totalsBar.appendChild(Utils.el('span', { class: balanced ? 'balance-ok' : 'balance-bad' },
          balanced ? '✓ Balance' : (debit === 0 && credit === 0 ? 'Isi nilai transaksi' : `Selisih ${Utils.formatRp(Math.abs(debit - credit))}`)));
        saveBtn.disabled = !balanced || rows.length < 2;
        return { debit, credit, balanced };
      }

      function addRow(line) {
        const row = buildLineRow(accounts, line, recompute);
        linesContainer.appendChild(row);
        recompute();
      }

      if (isEdit && existingEntry.lines.length) {
        existingEntry.lines.forEach(l => addRow({ accountId: l.account_id, debit: l.debit, credit: l.credit, memo: l.memo }));
      } else {
        addRow(); addRow();
      }

      const addRowBtn = Utils.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => addRow() }, '+ Tambah Baris');
      const saveBtn = Utils.el('button', { class: 'btn btn--primary', onclick: save }, isEdit ? 'Simpan Perubahan' : 'Simpan Transaksi');

      const body = Utils.el('div', { class: 'journal-form' }, [
        Utils.el('div', { class: 'form-grid form-grid--3' }, [
          field2('Tanggal', dateInput),
          field2('No. Bukti / Referensi', refInput),
          field2('Kategori Arus Kas (jika ada baris Kas/Bank)', cfSelect)
        ]),
        field2('Keterangan', descInput),
        Utils.el('div', { class: 'lines-header' }, [
          Utils.el('span', {}, 'Akun'), Utils.el('span', {}, 'Debit'), Utils.el('span', {}, 'Kredit'), Utils.el('span', {}, 'Memo'), Utils.el('span', {}, '')
        ]),
        linesContainer,
        addRowBtn,
        totalsBar,
        errorBox
      ]);

      function field2(labelText, node) {
        return Utils.el('div', { class: 'field' }, [Utils.el('label', {}, labelText), node]);
      }

      async function save() {
        errorBox.style.display = 'none';
        const lines = Utils.qsa('.line-row', linesContainer).map(r => r._getData())
          .filter(l => l.accountId && (l.debit > 0 || l.credit > 0));
        const payload = {
          date: dateInput.value,
          description: descInput.value.trim(),
          reference: refInput.value.trim(),
          cashFlowCategory: cfSelect.value || null,
          lines
        };
        try {
          if (isEdit) await window.api.journal.update(existingEntry.id, payload);
          else await window.api.journal.create(payload);
          instance.close();
          Toast.success(isEdit ? 'Transaksi berhasil diperbarui.' : 'Transaksi berhasil disimpan.');
          onSaved();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.style.display = 'block';
        }
      }

      const footer = Utils.el('div', { class: 'modal__actions' }, [
        Utils.el('button', { class: 'btn btn--ghost', onclick: () => instance.close() }, 'Batal'),
        saveBtn
      ]);

      const instance = Modal.open({
        title: isEdit ? `Ubah Transaksi ${existingEntry.entry_no}` : 'Tambah Transaksi Baru',
        body, footer, size: 'lg'
      });
    })();
  }

  // ---------------------------------------------------------------------
  // DAFTAR TRANSAKSI (paginasi + virtual scroll via VTable)
  // ---------------------------------------------------------------------
  function actionsCell(row) {
    return Utils.el('div', { class: 'row-actions' }, [
      Utils.el('button', {
        class: 'btn btn--ghost btn--sm', onclick: async () => {
          try {
            const full = await window.api.journal.get(row.id);
            openForm(full, () => vtable.reload());
          } catch (err) { Toast.error(err.message); }
        }
      }, 'Ubah'),
      Utils.el('button', {
        class: 'btn btn--ghost btn--sm btn--danger-text', onclick: async () => {
          const ok = await Modal.confirm({ title: 'Hapus Transaksi', message: `Hapus transaksi ${row.entry_no} tanggal ${Utils.formatDateID(row.entry_date)}? Tindakan ini tidak bisa dibatalkan.`, danger: true, confirmText: 'Ya, Hapus' });
          if (!ok) return;
          try { await window.api.journal.remove(row.id); Toast.success('Transaksi dihapus.'); vtable.reload(); }
          catch (err) { Toast.error(err.message); }
        }
      }, 'Hapus')
    ]);
  }

  function buildFilterBar(onApply) {
    const search = Utils.el('input', {
      class: 'input input--search', placeholder: 'Cari keterangan / no. bukti / no. jurnal…', value: filters.search,
      oninput: Utils.debounce((e) => { filters.search = e.target.value; onApply(); }, 350)
    });
    const range = Shared.dateRangeControl({
      startDate: filters.startDate, endDate: filters.endDate,
      onChange: (next) => { filters.startDate = next.startDate; filters.endDate = next.endDate; onApply(); }
    });
    return Utils.el('div', { class: 'journal-filterbar' }, [search, range]);
  }

  function render(container) {
    Shared.setPageTitle('Jurnal Umum');
    Shared.setTopbarTools([
      Utils.el('button', {
        class: 'btn btn--ghost', onclick: () => Shared.handleExcelExport('journal', { startDate: filters.startDate, endDate: filters.endDate })
      }, 'Export Excel'),
      Utils.el('button', { class: 'btn btn--primary', onclick: () => openForm(null, () => vtable.reload()) }, '+ Tambah Transaksi')
    ]);

    container.innerHTML = '';
    const filterBar = buildFilterBar(() => vtable.reload());
    container.appendChild(filterBar);
    const tableHost = Utils.el('div', { class: 'view-stack' });
    container.appendChild(tableHost);

    vtable = VTable.create({
      container: tableHost,
      columns: [
        { label: 'Tanggal', width: '110px' },
        { label: 'No. Jurnal', width: '120px' },
        { label: 'Keterangan', width: '1fr' },
        { label: 'No. Bukti', width: '130px' },
        { label: 'Jumlah', width: '150px', align: 'right' },
        { label: 'Baris', width: '70px', align: 'center' },
        { label: 'Aksi', width: '150px' }
      ],
      rowHeight: 40,
      viewportHeight: 480,
      emptyText: 'Belum ada transaksi. Klik "Tambah Transaksi" untuk mulai mencatat.',
      getRowKey: (r) => r.id,
      fetchPage: ({ page, pageSize }) => window.api.journal.listPaged({ page, pageSize, ...filters }),
      renderCells: (row) => [
        Utils.formatDateID(row.entry_date),
        row.entry_no,
        row.description || '-',
        row.reference || '-',
        Utils.formatRp(row.total_debit),
        String(row.line_count),
        actionsCell(row)
      ]
    });

    return () => {};
  }

  return { render };
})();
