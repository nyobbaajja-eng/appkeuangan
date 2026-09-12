'use strict';
window.Views = window.Views || {};

Views.accounts = (() => {
  const EXPECTED_NORMAL = { Aset: 'Debit', Kewajiban: 'Kredit', Modal: 'Kredit', Pendapatan: 'Kredit', Beban: 'Debit' };
  const TYPES = ['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban'];
  let state = { includeInactive: false };

  function field(labelText, inputNode, error) {
    return Utils.el('div', { class: 'field' }, [
      Utils.el('label', {}, labelText),
      inputNode,
      error ? Utils.el('span', { class: 'field__error' }, error) : null
    ]);
  }

  function openForm(existing, onSaved) {
    const isEdit = !!existing;
    const codeInput = Utils.el('input', { class: 'input', value: existing ? existing.code : '', maxlength: '30', placeholder: 'contoh: 1-1000' });
    const nameInput = Utils.el('input', { class: 'input', value: existing ? existing.name : '', maxlength: '150', placeholder: 'contoh: Kas' });
    const typeSelect = Utils.el('select', { class: 'input' }, TYPES.map(t =>
      Utils.el('option', { value: t, selected: existing && existing.type === t || undefined }, t)));
    const contraCheck = Utils.el('input', { type: 'checkbox', checked: existing && existing.is_contra ? true : undefined });
    const normalSelect = Utils.el('select', { class: 'input' }, ['Debit', 'Kredit'].map(n =>
      Utils.el('option', { value: n, selected: (existing ? existing.normal_balance : EXPECTED_NORMAL.Aset) === n || undefined }, n)));
    const cashCheck = Utils.el('input', { type: 'checkbox', checked: existing && existing.is_cash ? true : undefined });
    const openingInput = Utils.el('input', { class: 'input input--right', type: 'number', step: '0.01', value: existing ? existing.opening_balance : 0 });

    function suggestNormal() {
      const base = EXPECTED_NORMAL[typeSelect.value] || 'Debit';
      normalSelect.value = contraCheck.checked ? (base === 'Debit' ? 'Kredit' : 'Debit') : base;
    }
    typeSelect.addEventListener('change', suggestNormal);
    contraCheck.addEventListener('change', suggestNormal);
    if (!isEdit) suggestNormal();

    const errorBox = Utils.el('div', { class: 'form-error', style: 'display:none' });

    const body = Utils.el('div', { class: 'form-grid' }, [
      field('Kode Akun', codeInput),
      field('Nama Akun', nameInput),
      field('Jenis Akun', typeSelect),
      field('Saldo Normal', normalSelect),
      Utils.el('label', { class: 'field-check' }, [contraCheck, ' Akun Kontra (mengurangi kelompoknya, mis. Akumulasi Penyusutan)']),
      Utils.el('label', { class: 'field-check' }, [cashCheck, ' Akun Kas / Bank (dipakai di Laporan Arus Kas)']),
      field('Saldo Awal (Rp)', openingInput),
      errorBox
    ]);

    async function save() {
      errorBox.style.display = 'none';
      const payload = {
        code: codeInput.value.trim(),
        name: nameInput.value.trim(),
        type: typeSelect.value,
        normalBalance: normalSelect.value,
        isContra: contraCheck.checked,
        isCash: cashCheck.checked,
        openingBalance: Utils.parseNumberInput(openingInput.value)
      };
      try {
        if (isEdit) await window.api.accounts.update(existing.id, payload);
        else await window.api.accounts.create(payload);
        instance.close();
        Toast.success(isEdit ? 'Akun berhasil diperbarui.' : 'Akun baru berhasil ditambahkan.');
        onSaved();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
      }
    }

    const footer = Utils.el('div', { class: 'modal__actions' }, [
      Utils.el('button', { class: 'btn btn--ghost', onclick: () => instance.close() }, 'Batal'),
      Utils.el('button', { class: 'btn btn--primary', onclick: save }, isEdit ? 'Simpan Perubahan' : 'Tambah Akun')
    ]);

    const instance = Modal.open({ title: isEdit ? `Ubah Akun: ${existing.code}` : 'Tambah Akun Baru', body, footer });
  }

  function actionsCell(acc, reload) {
    const wrap = Utils.el('div', { class: 'row-actions' });
    wrap.appendChild(Utils.el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openForm(acc, reload) }, 'Ubah'));
    if (acc.is_active) {
      wrap.appendChild(Utils.el('button', {
        class: 'btn btn--ghost btn--sm', onclick: async () => {
          const ok = await Modal.confirm({ title: 'Nonaktifkan Akun', message: `Nonaktifkan akun "${acc.code} — ${acc.name}"? Akun tidak akan muncul di pilihan transaksi baru, tapi riwayat transaksi lama tetap aman.` });
          if (!ok) return;
          try { await window.api.accounts.archive(acc.id); Toast.success('Akun dinonaktifkan.'); reload(); }
          catch (err) { Toast.error(err.message); }
        }
      }, 'Nonaktifkan'));
    } else {
      wrap.appendChild(Utils.el('button', {
        class: 'btn btn--ghost btn--sm', onclick: async () => {
          try { await window.api.accounts.restore(acc.id); Toast.success('Akun diaktifkan kembali.'); reload(); }
          catch (err) { Toast.error(err.message); }
        }
      }, 'Aktifkan'));
    }
    wrap.appendChild(Utils.el('button', {
      class: 'btn btn--ghost btn--sm btn--danger-text', onclick: async () => {
        const count = await window.api.accounts.transactionCount(acc.id).catch(() => 0);
        if (count > 0) { Toast.error(`Akun ini punya ${count} baris transaksi dan tidak bisa dihapus. Gunakan "Nonaktifkan".`); return; }
        const ok = await Modal.confirm({ title: 'Hapus Akun', message: `Hapus permanen akun "${acc.code} — ${acc.name}"? Tindakan ini tidak bisa dibatalkan.`, danger: true, confirmText: 'Ya, Hapus' });
        if (!ok) return;
        try { await window.api.accounts.deleteIfUnused(acc.id); Toast.success('Akun dihapus.'); reload(); }
        catch (err) { Toast.error(err.message); }
      }
    }, 'Hapus'));
    return wrap;
  }

  async function load(container) {
    await Shared.renderAsync(container, () => window.api.accounts.list({ includeInactive: state.includeInactive }), (accounts) => {
      const reload = () => load(container);
      const grouped = TYPES.map(t => ({ type: t, items: accounts.filter(a => a.type === t) })).filter(g => g.items.length);
      const root = Utils.el('div', { class: 'view-stack' });
      if (!accounts.length) {
        root.appendChild(Shared.emptyState('Belum ada akun.', 'Klik "Tambah Akun" untuk membuat akun pertama.'));
        return root;
      }
      grouped.forEach(g => {
        root.appendChild(Shared.card(`${g.type} (${g.items.length})`, Shared.simpleTable({
          columns: [
            { key: 'code', label: 'Kode', style: 'width:110px' },
            { key: 'name', label: 'Nama Akun' },
            { key: 'normal_balance', label: 'Saldo Normal' },
            { value: (r) => r.is_cash ? 'Ya' : '', label: 'Kas/Bank' },
            { value: (r) => r.is_contra ? 'Ya' : '', label: 'Kontra' },
            { key: 'opening_balance', label: 'Saldo Awal', align: 'right', amount: true, format: Utils.formatRp },
            { value: (r) => r.is_active ? Utils.el('span', { class: 'badge badge--ok' }, 'Aktif') : Utils.el('span', { class: 'badge badge--muted' }, 'Nonaktif'), label: 'Status' },
            { value: (r) => actionsCell(r, reload), label: '' }
          ],
          rows: g.items
        })));
      });
      return root;
    });
  }

  function render(container) {
    Shared.setPageTitle('Bagan Akun');
    const toggle = Utils.el('label', { class: 'field-check field-check--inline' }, [
      Utils.el('input', {
        type: 'checkbox', checked: state.includeInactive || undefined,
        onchange: (e) => { state.includeInactive = e.target.checked; load(container); }
      }), ' Tampilkan nonaktif'
    ]);
    const addBtn = Utils.el('button', { class: 'btn btn--primary', onclick: () => openForm(null, () => load(container)) }, '+ Tambah Akun');
    Shared.setTopbarTools([toggle, addBtn]);
    load(container);
    return () => {};
  }

  return { render };
})();
