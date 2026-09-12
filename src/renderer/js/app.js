'use strict';
/**
 * Kerangka aplikasi (shell): membangun menu sidebar, mengatur navigasi
 * antar-halaman, dan menjadi lapisan terakhir penangkap error supaya
 * aplikasi tidak pernah menampilkan layar putih/kosong tanpa keterangan.
 */
const App = (() => {
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', view: () => Views.dashboard, icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
    { id: 'accounts', label: 'Bagan Akun', view: () => Views.accounts, icon: '<path d="M4 19V6a1 1 0 0 1 1-1h9l6 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M14 5v5h5"/><path d="M8 13h8M8 16h5"/>' },
    { id: 'journal', label: 'Jurnal Umum', view: () => Views.journal, icon: '<path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M9 12h6M9 16h6M9 8h3"/>' },
    { id: 'ledger', label: 'Buku Besar', view: () => Views.ledger, icon: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M9 8h7M9 12h7"/>' },
    { sep: 'Laporan Keuangan' },
    { id: 'trial-balance', label: 'Neraca Saldo', view: () => Views.trialBalance, icon: '<path d="M4 20h16"/><path d="M7 20V9M12 20V4M17 20v13"/>' },
    { id: 'income-statement', label: 'Laba Rugi', view: () => Views.incomeStatement, icon: '<path d="M4 19l5-6 4 3 7-9"/><path d="M15 6h5v5"/>' },
    { id: 'balance-sheet', label: 'Neraca', view: () => Views.balanceSheet, icon: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16M3 10h9"/>' },
    { id: 'cash-flow', label: 'Arus Kas', view: () => Views.cashFlow, icon: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.7 2.5 1.7-1 1.4-2.5 1.9-2.5.9-2.5 1.9 1 1.7 2.5 1.7 2.5-.6 2.5-1.6"/>' },
    { id: 'equity-changes', label: 'Perubahan Modal', view: () => Views.equityChanges, icon: '<path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5"/>' },
    { sep: 'Data' },
    { id: 'dataio', label: 'Impor / Ekspor & Cadangan', view: () => Views.dataio, icon: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>' },
    { id: 'settings', label: 'Pengaturan', view: () => Views.settings, icon: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.5-2-3.4-2.3.7a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.5 2.3a7.6 7.6 0 0 0-2.6 1.5l-2.3-.7-2 3.4 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.4 2.3-.7a7.6 7.6 0 0 0 2.6 1.5L10 22h4l.5-2.3a7.6 7.6 0 0 0 2.6-1.5l2.3.7 2-3.4z"/>' }
  ];

  let currentCleanup = null;
  let currentId = null;

  function buildSidebar() {
    const nav = document.getElementById('nav-list');
    nav.innerHTML = '';
    NAV_ITEMS.forEach(item => {
      if (item.sep) {
        nav.appendChild(Utils.el('div', { class: 'nav-sep' }, item.sep));
        return;
      }
      const el = Utils.el('button', {
        class: 'nav-item', type: 'button', 'data-id': item.id,
        onclick: () => navigate(item.id)
      }, [Shared.icon(item.icon), Utils.el('span', {}, item.label)]);
      nav.appendChild(el);
    });
  }

  function navigate(id) {
    const item = NAV_ITEMS.find(n => n.id === id);
    if (!item) return;

    if (currentCleanup) {
      try { currentCleanup(); } catch (e) { /* pembersihan halaman lama tidak boleh menghentikan navigasi */ }
    }
    currentCleanup = null;
    currentId = id;

    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('nav-item--active', el.dataset.id === id));
    Shared.setTopbarTools([]);

    const root = document.getElementById('view-root');
    root.innerHTML = '';
    try {
      currentCleanup = item.view().render(root) || (() => {});
    } catch (err) {
      console.error(err);
      root.innerHTML = '';
      root.appendChild(Utils.el('div', { class: 'error-block' }, [
        Utils.el('strong', {}, 'Halaman ini gagal dimuat.'),
        Utils.el('p', {}, err.message || String(err))
      ]));
      Toast.error('Gagal membuka halaman: ' + (err.message || String(err)));
      window.api.app.logError(err.message || String(err), err.stack);
    }
  }

  function setupSidebarToggle() {
    document.getElementById('btn-menu-toggle').addEventListener('click', () => {
      document.getElementById('app-shell').classList.toggle('sidebar-collapsed');
    });
  }

  async function loadBrandInfo() {
    try {
      const company = await Shared.getCompany();
      document.getElementById('brand-company').textContent = company.name || 'Nama Usaha Anda';
    } catch (e) { /* biarkan nilai default */ }
    try {
      const v = await window.api.app.getVersion();
      document.getElementById('app-version-label').textContent = 'v' + v;
    } catch (e) { /* biarkan nilai default */ }
  }

  function init() {
    Toast.installGlobalHandlers();
    setupSidebarToggle();
    buildSidebar();
    loadBrandInfo();
    navigate('dashboard');
  }

  return { navigate, init, get currentId() { return currentId; } };
})();

App.init();
