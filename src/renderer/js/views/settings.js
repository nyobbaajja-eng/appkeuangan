'use strict';
window.Views = window.Views || {};

Views.settings = (() => {
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function companyForm(company, onSaved) {
    const nameInput = Utils.el('input', { class: 'input', value: company.name, maxlength: '200' });
    const addressInput = Utils.el('textarea', { class: 'input', rows: '3', maxlength: '500' }, company.address || '');
    const npwpInput = Utils.el('input', { class: 'input', value: company.npwp || '', maxlength: '50', placeholder: 'opsional' });
    const [fyMonth, fyDay] = (company.fiscal_year_start || '01-01').split('-').map(Number);
    const monthSelect = Utils.el('select', { class: 'input' }, MONTHS.map((m, i) =>
      Utils.el('option', { value: String(i + 1).padStart(2, '0'), selected: (i + 1) === fyMonth || undefined }, m)));
    const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
    const daySelect = Utils.el('select', { class: 'input' }, dayOptions.map(d =>
      Utils.el('option', { value: String(d).padStart(2, '0'), selected: d === fyDay || undefined }, String(d))));
    const errorBox = Utils.el('div', { class: 'form-error', style: 'display:none' });

    const body = Utils.el('div', { class: 'form-grid' }, [
      Utils.el('div', { class: 'field' }, [Utils.el('label', {}, 'Nama Usaha'), nameInput]),
      Utils.el('div', { class: 'field' }, [Utils.el('label', {}, 'Alamat'), addressInput]),
      Utils.el('div', { class: 'field' }, [Utils.el('label', {}, 'NPWP'), npwpInput]),
      Utils.el('div', { class: 'field' }, [
        Utils.el('label', {}, 'Awal Tahun Fiskal (untuk laba berjalan di Neraca)'),
        Utils.el('div', { class: 'btn-group' }, [monthSelect, daySelect])
      ]),
      errorBox
    ]);

    async function save() {
      errorBox.style.display = 'none';
      try {
        await window.api.company.update({
          name: nameInput.value.trim() || 'Nama Usaha Anda',
          address: addressInput.value.trim(),
          npwp: npwpInput.value.trim(),
          currency: 'IDR',
          fiscalYearStart: `${monthSelect.value}-${daySelect.value}`
        });
        Shared.invalidateCompany();
        Toast.success('Profil usaha disimpan.');
        onSaved();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
      }
    }

    const footer = Utils.el('div', { class: 'modal__actions', style: 'padding:0;border:none;margin-top:12px' }, [
      Utils.el('button', { class: 'btn btn--primary', onclick: save }, 'Simpan Profil Usaha')
    ]);
    return Utils.el('div', {}, [body, footer]);
  }

  async function aboutCard() {
    let version = '-', logPath = '-';
    try { version = await window.api.app.getVersion(); } catch (e) { /* abaikan */ }
    try { logPath = await window.api.app.getLogPath(); } catch (e) { /* abaikan */ }
    return Shared.card('Tentang Aplikasi', Utils.el('div', { class: 'about-grid' }, [
      Utils.el('div', {}, [Utils.el('span', { class: 'text-muted' }, 'Versi Aplikasi'), Utils.el('strong', {}, version)]),
      Utils.el('div', {}, [Utils.el('span', { class: 'text-muted' }, 'Mode'), Utils.el('strong', {}, '100% Offline — data tersimpan di komputer ini')]),
      Utils.el('div', {}, [Utils.el('span', { class: 'text-muted' }, 'File Log (untuk dukungan teknis)'), Utils.el('code', { class: 'log-path' }, logPath)])
    ]));
  }

  function render(container) {
    Shared.setPageTitle('Pengaturan');
    Shared.setTopbarTools([]);
    container.innerHTML = '';
    const root = Utils.el('div', { class: 'view-stack' });
    container.appendChild(root);

    Shared.renderAsync(root, () => Shared.getCompany(true), (company) => {
      const wrap = Utils.el('div', { class: 'view-stack' });
      wrap.appendChild(Shared.card('Profil Usaha', companyForm(company, () => render(container))));
      wrap.appendChild(Utils.el('div', { class: 'settings-about-slot' }));
      aboutCard().then(node => wrap.querySelector('.settings-about-slot').replaceWith(node));
      return wrap;
    });
    return () => {};
  }

  return { render };
})();
