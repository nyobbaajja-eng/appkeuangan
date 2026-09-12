'use strict';
/* Grafik ringan berbasis Canvas 2D, tanpa dependensi pihak ketiga. */

const Charts = (() => {
  function setupHiDPI(canvas, cssWidth, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / mag;
    let n;
    if (norm <= 1) n = 1; else if (norm <= 2) n = 2; else if (norm <= 5) n = 5; else n = 10;
    return n * mag;
  }

  /**
   * Grafik batang berkelompok untuk membandingkan dua seri (misal Pemasukan vs Pengeluaran per bulan).
   */
  function drawGroupedBarChart(canvas, { labels, series, formatValue }) {
    const container = canvas.parentElement;
    const cssWidth = Math.max(container.clientWidth, 280);
    const cssHeight = 280;
    const ctx = setupHiDPI(canvas, cssWidth, cssHeight);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padding = { top: 20, right: 16, bottom: 34, left: 72 };
    const plotW = cssWidth - padding.left - padding.right;
    const plotH = cssHeight - padding.top - padding.bottom;

    const maxVal = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const steps = 4;

    ctx.strokeStyle = '#D8D5CC';
    ctx.fillStyle = '#5B6472';
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= steps; i++) {
      const y = padding.top + plotH - (plotH * i / steps);
      const val = (maxVal * i / steps);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotW, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = i === 0 ? '#B9B6AC' : '#E7E5DD';
      ctx.stroke();
      ctx.fillText(formatValue ? formatValue(val) : String(Math.round(val)), padding.left - 8, y);
    }

    const groupW = plotW / Math.max(labels.length, 1);
    const barGap = 6;
    const barW = Math.max(6, (groupW - barGap * (series.length + 1)) / series.length);

    labels.forEach((label, gi) => {
      const groupX = padding.left + gi * groupW;
      series.forEach((s, si) => {
        const val = s.values[gi] || 0;
        const h = (val / maxVal) * plotH;
        const x = groupX + barGap + si * (barW + barGap);
        const y = padding.top + plotH - h;
        ctx.fillStyle = s.color;
        ctx.fillRect(x, y, barW, h);
      });
      ctx.fillStyle = '#5B6472';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, groupX + groupW / 2, padding.top + plotH + 8);
    });

    // Legenda
    let lx = padding.left;
    const ly = 4;
    series.forEach(s => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly, 10, 10);
      ctx.fillStyle = '#2B3648';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '12px Segoe UI, Arial, sans-serif';
      ctx.fillText(s.name, lx + 14, ly - 1);
      lx += ctx.measureText(s.name).width + 34;
    });
  }

  /**
   * Donut chart sederhana, dipakai untuk komposisi beban terbesar.
   */
  function drawDonutChart(canvas, { data, colors, formatValue }) {
    const container = canvas.parentElement;
    const cssWidth = Math.max(container.clientWidth, 220);
    const cssHeight = 260;
    const ctx = setupHiDPI(canvas, cssWidth, cssHeight);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const total = data.reduce((s, d) => s + d.value, 0);
    const cx = 90, cy = cssHeight / 2, rOuter = 78, rInner = 46;

    if (total <= 0) {
      ctx.fillStyle = '#8A8776';
      ctx.font = '13px Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada data', cx, cy);
    } else {
      let angle = -Math.PI / 2;
      data.forEach((d, i) => {
        const slice = (d.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rOuter, angle, angle + slice);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        angle += slice;
      });
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }

    // Legenda daftar di sisi kanan
    let ly = 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    data.forEach((d, i) => {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(190, ly, 10, 10);
      ctx.fillStyle = '#2B3648';
      ctx.font = '12px Segoe UI, Arial, sans-serif';
      const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
      ctx.fillText(`${d.label} (${pct}%)`, 206, ly - 1);
      ly += 20;
    });
  }

  return { drawGroupedBarChart, drawDonutChart };
})();
