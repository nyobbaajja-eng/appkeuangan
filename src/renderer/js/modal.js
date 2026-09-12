'use strict';
/**
 * Modal dialog generik + confirm dialog. Semua form (tambah akun, tambah
 * transaksi jurnal, konfirmasi hapus, dsb) memakai komponen ini supaya
 * perilaku (Esc untuk tutup, klik backdrop, fokus) konsisten di seluruh app.
 */
const Modal = (() => {
  const layer = () => document.getElementById('modal-layer');
  let stack = [];

  function open({ title, body, footer, size = 'md', closable = true, onClose } = {}) {
    const root = layer();
    const backdrop = Utils.el('div', { class: 'modal-backdrop' });
    const dialog = Utils.el('div', { class: `modal modal--${size}`, role: 'dialog', 'aria-modal': 'true' });

    const header = Utils.el('div', { class: 'modal__header' }, [
      Utils.el('h2', { class: 'modal__title' }, title || ''),
      closable ? Utils.el('button', {
        class: 'modal__close', 'aria-label': 'Tutup', onclick: () => close()
      }, '×') : null
    ]);
    const bodyEl = Utils.el('div', { class: 'modal__body' }, body || '');
    const footerEl = footer ? Utils.el('div', { class: 'modal__footer' }, footer) : null;

    dialog.appendChild(header);
    dialog.appendChild(bodyEl);
    if (footerEl) dialog.appendChild(footerEl);
    backdrop.appendChild(dialog);

    function onKeydown(e) {
      if (e.key === 'Escape' && closable) close();
    }
    if (closable) {
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      stack = stack.filter(s => s !== instance);
      root.setAttribute('aria-hidden', stack.length === 0 ? 'true' : 'false');
      if (onClose) onClose();
    }

    root.appendChild(backdrop);
    root.setAttribute('aria-hidden', 'false');
    const instance = { close, backdrop, dialog, bodyEl };
    stack.push(instance);

    const firstInput = bodyEl.querySelector('input, select, textarea, button');
    if (firstInput) setTimeout(() => firstInput.focus(), 30);

    return instance;
  }

  function confirm({ title = 'Konfirmasi', message, confirmText = 'Ya, Lanjutkan', cancelText = 'Batal', danger = false } = {}) {
    return new Promise((resolve) => {
      const footer = Utils.el('div', { class: 'modal__actions' }, [
        Utils.el('button', { class: 'btn btn--ghost', onclick: () => { resolve(false); instance.close(); } }, cancelText),
        Utils.el('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          onclick: () => { resolve(true); instance.close(); }
        }, confirmText)
      ]);
      const instance = open({
        title,
        body: Utils.el('p', { class: 'modal__message' }, message),
        footer,
        size: 'sm',
        onClose: () => resolve(false)
      });
    });
  }

  return { open, confirm };
})();
