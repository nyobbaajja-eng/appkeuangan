'use strict';
/**
 * Sistem notifikasi ringan + penangkap error global.
 * Prinsip: error apapun di renderer TIDAK BOLEH membuat layar putih/blank
 * tanpa penjelasan. Selalu tampilkan toast dan catat ke log file.
 */
const Toast = (() => {
  let container = null;

  function ensureContainer() {
    if (!container) {
      container = Utils.el('div', { class: 'toast-stack', id: 'toast-stack' });
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'info', timeout = 4500) {
    const root = ensureContainer();
    const node = Utils.el('div', { class: `toast toast--${type}` }, [
      Utils.el('span', { class: 'toast__icon' }, type === 'error' ? '⚠' : (type === 'success' ? '✓' : 'ℹ'),
      ),
      Utils.el('span', { class: 'toast__msg' }, String(message)),
      Utils.el('button', { class: 'toast__close', 'aria-label': 'Tutup', onclick: () => node.remove() }, '×')
    ]);
    root.appendChild(node);
    if (timeout > 0) setTimeout(() => node.remove(), timeout);
    return node;
  }

  function success(msg) { return show(msg, 'success'); }
  function error(msg) { return show(msg, 'error', 8000); }
  function info(msg) { return show(msg, 'info'); }

  function installGlobalHandlers() {
    window.addEventListener('error', (event) => {
      const msg = event.error && event.error.message ? event.error.message : event.message;
      error('Terjadi kesalahan tak terduga: ' + msg);
      try { window.api.app.logError(msg, event.error ? event.error.stack : ''); } catch (e) { /* abaikan */ }
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg = reason && reason.message ? reason.message : String(reason);
      error(msg);
      try { window.api.app.logError(msg, reason && reason.stack ? reason.stack : ''); } catch (e) { /* abaikan */ }
    });
  }

  return { show, success, error, info, installGlobalHandlers };
})();
