'use strict';
window.Views = window.Views || {};

Views.dataio = (() => {
  function importResultBlock(summary, kind) {
    const wrap = Utils.el('div', { class: 'import-result' });
    wrap.appendChild(Utils.el('p', {}, [
      Utils.el('strong', {}, kind === 'accounts' ? 'Hasil Impor Akun: ' : 'Hasil Impor Jurnal: '),
      `${summary.inserted || 0} baru ditambahkan` + (summary.updated ? `, ${summary.updated} diperbarui` : '') + `, ${summary.skipped || 0} baris dilewati.`
    ]));
    if (summary.errors && summary.errors.length) {
      wrap.appendChild(Utils.el('p', { class: 'text-muted' }, `Rincian ${summary.errors.length} baris bermasalah (baris mengikuti nomor di file Excel):`));
      wrap.appendChild(Shared.simpleTable({
        columns: [{ key: 'row', label: 'Baris', style: 'width:80px' }, { key: 'reason', label: 'Keterangan' }],
        rows: summary.errors.slice(0, 200)
      }));
      if (summary.errors.length > 200) wrap.appendChild(Utils.el('p', { class: 'text-muted' }, `…dan ${summary.errors.length - 200} baris lainnya.`));
    }
    return wrap;
  }

  function importCard() {
    const resultHost = Utils.el('div', {});
    const body = Utils.el('div', { class: 'view-stack' }, [
      Utils.el('p', { class: 'text-muted' }, 'Gunakan template resmi agar format kolom sesuai. Kode Akun yang sudah ada akan diperbarui datanya, bukan digandakan.'),
      Utils.el('div', { class: 'btn-group' }, [
        Utils.el('button', { class: 'btn btn--ghost', onclick: () => downloadTemplate('accounts') }, 'Unduh Template Akun'),
        Utils.el('button', { class: 'btn btn--ghost', onclick: () => downloadTemplate('journal') }, 'Unduh Template Jurnal')
      ]),
      Utils.el('div', { class: 'btn-group' }, [
        Utils.el('button', { class: 'btn btn--primary', onclick: () => runImport('accounts') }, 'Impor Akun dari Excel'),
        Utils.el('button', { class: 'btn btn--primary', onclick: () => runImport('journal') }, 'Impor Transaksi Jurnal dari Excel')
      ]),
      resultHost
    ]);

    async function downloadTemplate(kind) {
      try {
        const res = await window.api.io.downloadTemplate(kind);
        if (res.cancelled) return;
        Toast.success('Template disimpan: ' + res.path);
      } catch (err) { Toast.error(err.message); }
    }

    async function runImport(type) {
      const ok = await Modal.confirm({
        title: 'Impor dari Excel',
        message: `Sebelum impor, aplikasi akan membuat cadangan otomatis data saat ini sebagai jaring pengaman. Lanjutkan memilih file Excel untuk diimpor sebagai ${type === 'accounts' ? 'Akun' : 'Transaksi Jurnal'}?`
      });
      if (!ok) return;
      try {
        const res = await window.api.io.importExcel(type);
        if (res.cancelled) return;
        resultHost.innerHTML = '';
        resultHost.appendChild(importResultBlock(res, type));
        Toast.success(`Impor selesai: ${res.inserted || 0} baris berhasil.`);
      } catch (err) { Toast.error('Impor gagal: ' + err.message); }
    }

    return Shared.card('Impor Data dari Excel', body);
  }

  function exportCard() {
    const body = Utils.el('div', { class: 'view-stack' }, [
      Utils.el('p', { class: 'text-muted' }, 'Ekspor seluruh Bagan Akun dan Jurnal Umum ke satu file Excel (berguna sebagai cadangan yang mudah dibuka di komputer lain).'),
      Utils.el('button', {
        class: 'btn btn--primary', onclick: async () => {
          try {
            const res = await window.api.io.exportExcel('full_backup', {});
            if (res.cancelled) return;
            Toast.success('Seluruh data diekspor ke: ' + res.path);
          } catch (err) { Toast.error(err.message); }
        }
      }, 'Ekspor Semua Data ke Excel')
    ]);
    return Shared.card('Ekspor Seluruh Data', body);
  }

  async function backupCard() {
    const listHost = Utils.el('div', {}, Shared.loadingBlock());
    const body = Utils.el('div', { class: 'view-stack' }, [
      Utils.el('p', { class: 'text-muted' }, 'Database disimpan sebagai satu file (.db) di komputer ini. Cadangan otomatis dibuat setiap hari, dan sebelum operasi berisiko (impor/pemulihan).'),
      Utils.el('div', { class: 'btn-group' }, [
        Utils.el('button', {
          class: 'btn btn--ghost', onclick: async () => {
            try { const res = await window.api.io.backupNow(); Toast.success('Cadangan dibuat: ' + res.path); refreshList(); }
            catch (err) { Toast.error(err.message); }
          }
        }, 'Cadangkan Sekarang'),
        Utils.el('button', { class: 'btn btn--ghost', onclick: () => window.api.io.openBackupsFolder() }, 'Buka Folder Cadangan'),
        Utils.el('button', {
          class: 'btn btn--danger', onclick: async () => {
            const ok = await Modal.confirm({
              title: 'Pulihkan dari Cadangan', danger: true, confirmText: 'Ya, Pulihkan',
              message: 'Data SAAT INI akan digantikan seluruhnya oleh isi file cadangan yang Anda pilih (kondisi sekarang tetap dicadangkan otomatis dulu sebagai jaring pengaman). Aplikasi akan dimuat ulang setelah selesai. Lanjutkan?'
            });
            if (!ok) return;
            try {
              const res = await window.api.io.restoreFromFile();
              if (res.cancelled) return;
              Toast.success('Data berhasil dipulihkan. Memuat ulang…');
              setTimeout(() => location.reload(), 1200);
            } catch (err) { Toast.error(err.message); }
          }
        }, 'Pulihkan dari File Cadangan…')
      ]),
      Utils.el('h4', {}, 'Riwayat Cadangan'),
      listHost
    ]);

    async function refreshList() {
      listHost.innerHTML = '';
      try {
        const backups = await window.api.io.listBackups();
        if (!backups.length) { listHost.appendChild(Shared.emptyState('Belum ada cadangan.')); return; }
        listHost.appendChild(Shared.simpleTable({
          columns: [
            { key: 'file', label: 'Nama File' },
            { key: 'createdAt', label: 'Dibuat', format: (v) => new Date(v).toLocaleString('id-ID') },
            { key: 'size', label: 'Ukuran', align: 'right', format: (v) => `${(v / 1024).toFixed(0)} KB` }
          ],
          rows: backups
        }));
      } catch (err) {
        listHost.appendChild(Utils.el('div', { class: 'error-block' }, err.message));
      }
    }
    refreshList();
    return Shared.card('Cadangan & Pemulihan Database', body);
  }

  function render(container) {
    Shared.setPageTitle('Impor / Ekspor & Cadangan Data');
    Shared.setTopbarTools([]);
    container.innerHTML = '';
    const root = Utils.el('div', { class: 'view-stack' });
    root.appendChild(importCard());
    root.appendChild(exportCard());
    container.appendChild(root);
    backupCard().then(node => root.appendChild(node));
    return () => {};
  }

  return { render };
})();
