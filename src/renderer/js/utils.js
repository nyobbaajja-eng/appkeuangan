'use strict';
/* Kumpulan helper murni tanpa dependensi apapun (browser vanilla). */

const Utils = (() => {
  const rupiahFormatter = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  function formatRp(n, { withSymbol = true } = {}) {
    const num = Number(n) || 0;
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    return `${sign}${withSymbol ? 'Rp ' : ''}${rupiahFormatter.format(abs)}`;
  }

  function formatNumber(n) {
    return rupiahFormatter.format(Number(n) || 0);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function startOfYearStr(date = new Date()) {
    return `${date.getFullYear()}-01-01`;
  }

  function formatDateID(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait = 300) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  function parseNumberInput(v) {
    if (v === '' || v === null || v === undefined) return 0;
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${names[m - 1]} ${String(y).slice(2)}`;
  }

  function downloadNoticeText(res) {
    if (!res || res.cancelled) return null;
    return res.path;
  }

  return {
    formatRp, formatNumber, todayStr, startOfYearStr, formatDateID, escapeHtml,
    debounce, el, qs, qsa, clamp, parseNumberInput, monthLabel, downloadNoticeText
  };
})();
