'use strict';
/**
 * Tabel data besar yang aman dipakai untuk puluhan ribu baris:
 *
 *  1) LAZY LOADING / PAGINASI - data diambil dari database per halaman
 *     (fetchPage), tidak pernah memuat seluruh tabel sekaligus ke memori.
 *  2) VIRTUAL SCROLL - dari satu halaman yang sudah dimuat (maks 500 baris),
 *     hanya baris yang benar-benar terlihat di layar yang dibuat elemen DOM-nya.
 *     Baris di luar layar cukup diwakili ruang kosong (spacer), sehingga
 *     scroll tetap mulus walau pageSize besar.
 *
 * Kombinasi keduanya membuat tabel tidak pernah "meledak" memakan RAM/DOM
 * berapa pun banyak data di database.
 */
const VTable = (() => {
  function create({
    container, columns, rowHeight = 36, viewportHeight = 420, fetchPage, renderCells,
    emptyText = 'Belum ada data.', pageSizeOptions = [25, 50, 100, 200, 500],
    initialPageSize = 50, toolbarExtra = null, getRowKey = (r, i) => i
  }) {
    const state = { page: 1, pageSize: initialPageSize, total: 0, totalPages: 1, rows: [], loading: false };
    const gridTemplate = columns.map(c => c.width || '1fr').join(' ');

    const root = Utils.el('div', { class: 'vtable' });
    const toolbar = Utils.el('div', { class: 'vtable__toolbar' });
    const pageSizeSelect = Utils.el('select', {
      class: 'vtable__pagesize', onchange: (e) => { state.pageSize = Number(e.target.value); goToPage(1); }
    }, pageSizeOptions.map(n => Utils.el('option', { value: n, selected: n === initialPageSize || undefined }, `${n} / halaman`)));

    const infoLabel = Utils.el('span', { class: 'vtable__info' }, '');
    const btnFirst = Utils.el('button', { class: 'btn btn--ghost btn--sm', onclick: () => goToPage(1) }, '«');
    const btnPrev = Utils.el('button', { class: 'btn btn--ghost btn--sm', onclick: () => goToPage(state.page - 1) }, '‹');
    const pageInput = Utils.el('input', {
      class: 'vtable__pageinput', type: 'number', min: '1', value: '1',
      onchange: (e) => goToPage(Number(e.target.value) || 1)
    });
    const totalPagesLabel = Utils.el('span', {}, '/ 1');
    const btnNext = Utils.el('button', { class: 'btn btn--ghost btn--sm', onclick: () => goToPage(state.page + 1) }, '›');
    const btnLast = Utils.el('button', { class: 'btn btn--ghost btn--sm', onclick: () => goToPage(state.totalPages) }, '»');

    toolbar.appendChild(Utils.el('div', { class: 'vtable__toolbar-left' }, [
      pageSizeSelect, infoLabel
    ]));
    const pager = Utils.el('div', { class: 'vtable__pager' }, [
      btnFirst, btnPrev, pageInput, totalPagesLabel, btnNext, btnLast
    ]);
    const toolbarRight = Utils.el('div', { class: 'vtable__toolbar-right' }, [toolbarExtra, pager].filter(Boolean));
    toolbar.appendChild(toolbarRight);

    const header = Utils.el('div', { class: 'vtable__header', style: `grid-template-columns:${gridTemplate}` },
      columns.map(c => Utils.el('div', { class: 'vtable__th', style: c.align ? `text-align:${c.align}` : '' }, c.label)));

    const viewport = Utils.el('div', { class: 'vtable__viewport', style: `height:${viewportHeight}px` });
    const spacer = Utils.el('div', { class: 'vtable__spacer' });
    const rowsLayer = Utils.el('div', { class: 'vtable__rows-layer' });
    const emptyState = Utils.el('div', { class: 'vtable__empty' }, emptyText);
    const loadingOverlay = Utils.el('div', { class: 'vtable__loading' }, 'Memuat data…');

    viewport.appendChild(spacer);
    viewport.appendChild(rowsLayer);
    viewport.appendChild(loadingOverlay);

    root.appendChild(toolbar);
    root.appendChild(header);
    root.appendChild(viewport);
    root.appendChild(emptyState);
    container.innerHTML = '';
    container.appendChild(root);

    let rafPending = false;
    function renderVisibleRows() {
      const scrollTop = viewport.scrollTop;
      const buffer = 6;
      const visibleCount = Math.ceil(viewportHeight / rowHeight) + buffer * 2;
      let startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
      const endIndex = Math.min(state.rows.length, startIndex + visibleCount);
      startIndex = Math.min(startIndex, Math.max(0, endIndex - visibleCount));

      rowsLayer.style.transform = `translateY(${startIndex * rowHeight}px)`;
      rowsLayer.innerHTML = '';
      for (let i = startIndex; i < endIndex; i++) {
        const row = state.rows[i];
        const cells = renderCells(row, i);
        const rowEl = Utils.el('div', {
          class: 'vtable__row', style: `grid-template-columns:${gridTemplate}; height:${rowHeight}px`,
          'data-key': String(getRowKey(row, i))
        }, columns.map((c, ci) => Utils.el('div', { class: 'vtable__td', style: c.align ? `text-align:${c.align}` : '' }, cells[ci] instanceof Node ? cells[ci] : String(cells[ci] ?? ''))));
        rowsLayer.appendChild(rowEl);
      }
    }

    viewport.addEventListener('scroll', () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { renderVisibleRows(); rafPending = false; });
    });

    function updateChrome() {
      const startN = state.total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
      const endN = Math.min(state.total, state.page * state.pageSize);
      infoLabel.textContent = `Menampilkan ${startN.toLocaleString('id-ID')}–${endN.toLocaleString('id-ID')} dari ${state.total.toLocaleString('id-ID')} data`;
      pageInput.value = state.page;
      totalPagesLabel.textContent = `/ ${state.totalPages}`;
      btnFirst.disabled = btnPrev.disabled = state.page <= 1;
      btnNext.disabled = btnLast.disabled = state.page >= state.totalPages;
      emptyState.style.display = state.total === 0 ? 'block' : 'none';
      viewport.style.display = state.total === 0 ? 'none' : 'block';
    }

    async function goToPage(page) {
      state.page = Utils.clamp(page || 1, 1, Math.max(1, state.totalPages));
      await reload();
    }

    async function reload() {
      state.loading = true;
      loadingOverlay.style.display = 'flex';
      try {
        const result = await fetchPage({ page: state.page, pageSize: state.pageSize });
        state.rows = result.rows || [];
        state.total = result.total || 0;
        state.page = result.page || state.page;
        state.pageSize = result.pageSize || state.pageSize;
        state.totalPages = result.totalPages || 1;
        spacer.style.height = (state.rows.length * rowHeight) + 'px';
        viewport.scrollTop = 0;
        updateChrome();
        renderVisibleRows();
      } catch (err) {
        Toast.error('Gagal memuat data: ' + err.message);
      } finally {
        state.loading = false;
        loadingOverlay.style.display = 'none';
      }
    }

    reload();
    return { reload, goToPage, state };
  }

  return { create };
})();
