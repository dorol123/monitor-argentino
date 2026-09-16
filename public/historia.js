const els = {
  input: document.getElementById('symbol-input'),
  datalist: document.getElementById('symbol-list'),
  rangeTabs: document.querySelectorAll('#range-tabs .segment'),
  status: document.getElementById('history-status'),
  chartWrap: document.getElementById('chart-wrap'),
  chart: document.getElementById('chart'),
  legend: document.getElementById('table-legend'),
  tableWrap: document.getElementById('table-wrap'),
  tableRows: document.getElementById('history-rows'),
  subtitle: document.getElementById('subtitle'),
};

const state = {
  symbol: '',
  range: 'rolling48h',
  allSymbols: [],
};

function fmtPrice(n) {
  return n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtSpread(n) {
  return n == null ? '—' : `${Number(n).toFixed(2)}%`;
}

function fmtInt(n) {
  return n == null ? '—' : Number(n).toLocaleString('es-AR');
}

// Monto operado = nominales de la operación * precio por nominal.
function fmtMonto(nominales, price, segment) {
  if (nominales == null || price == null) return '—';
  const monto = Math.abs(nominales) * price;
  const symbol = segment === 'ARS' ? '$' : 'U$S';
  return `${symbol} ${Number(monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function loadSymbolList() {
  try {
    const res = await fetch('/api/ons');
    const json = await res.json();
    state.allSymbols = (json.data || []).map(b => b.symbol).sort();
    els.datalist.innerHTML = state.allSymbols.map(s => `<option value="${s}"></option>`).join('');
  } catch {
    // sin lista de sugerencias, igual se puede escribir el ticker a mano
  }
}

function drawChart(rows) {
  const width = 800, height = 300, padding = 36;
  const points = rows.filter(r => r.last != null);

  if (points.length < 2) {
    els.chart.innerHTML = `<text x="${width / 2}" y="${height / 2}" fill="#8b98ac" font-size="14" text-anchor="middle">No hay suficientes datos todavía para graficar</text>`;
    els.chart.onmousemove = null;
    els.chart.onmouseleave = null;
    els.chart.ontouchstart = null;
    els.chart.ontouchmove = null;
    els.chart.ontouchend = null;
    return;
  }

  const values = points.map(p => p.last);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;

  const x = (i) => padding + (i / (points.length - 1)) * (width - padding * 2);
  const y = (v) => height - padding - ((v - min) / span) * (height - padding * 2);

  const coords = points.map((p, i) => ({ x: x(i), y: y(p.last), price: p.last, ts: p.captured_at }));

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  const firstLabel = fmtDateTime(points[0].captured_at);
  const lastLabel = fmtDateTime(points[points.length - 1].captured_at);

  els.chart.style.cursor = 'crosshair';
  els.chart.innerHTML = `
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#1e2c42" stroke-width="1" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#1e2c42" stroke-width="1" />
    <path d="${path}" fill="none" stroke="#34d399" stroke-width="2" />
    <text x="${padding}" y="${padding - 10}" fill="#8b98ac" font-size="12">${fmtPrice(max)}</text>
    <text x="${padding}" y="${height - padding + 20}" fill="#8b98ac" font-size="12">${fmtPrice(min)}</text>
    <text x="${padding}" y="${height - 8}" fill="#8b98ac" font-size="11">${firstLabel}</text>
    <text x="${width - padding}" y="${height - 8}" fill="#8b98ac" font-size="11" text-anchor="end">${lastLabel}</text>
    <line id="hover-guide" x1="0" y1="${padding}" x2="0" y2="${height - padding}" stroke="#34d399" stroke-width="1" stroke-dasharray="3,3" opacity="0" />
    <circle id="hover-dot" r="4" fill="#34d399" stroke="#0b1220" stroke-width="1.5" opacity="0" />
    <g id="hover-tooltip" opacity="0">
      <rect id="hover-tooltip-bg" rx="6" ry="6" fill="#101c30" stroke="#1e2c42" stroke-width="1" />
      <text id="hover-tooltip-price" fill="#e7ecf5" font-size="13" font-weight="700"></text>
      <text id="hover-tooltip-date" fill="#8b98ac" font-size="11"></text>
    </g>
  `;

  const guide = els.chart.querySelector('#hover-guide');
  const dot = els.chart.querySelector('#hover-dot');
  const tooltip = els.chart.querySelector('#hover-tooltip');
  const tooltipBg = els.chart.querySelector('#hover-tooltip-bg');
  const tooltipPrice = els.chart.querySelector('#hover-tooltip-price');
  const tooltipDate = els.chart.querySelector('#hover-tooltip-date');

  function nearestIndex(svgX) {
    const t = (svgX - padding) / (width - padding * 2);
    const idx = Math.round(t * (coords.length - 1));
    return Math.min(coords.length - 1, Math.max(0, idx));
  }

  function moveTooltip(clientX, clientY) {
    const pt = els.chart.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(els.chart.getScreenCTM().inverse());

    const c = coords[nearestIndex(svgP.x)];

    guide.setAttribute('x1', c.x);
    guide.setAttribute('x2', c.x);
    guide.setAttribute('opacity', '1');

    dot.setAttribute('cx', c.x);
    dot.setAttribute('cy', c.y);
    dot.setAttribute('opacity', '1');

    const priceText = fmtPrice(c.price);
    const dateText = fmtDateTime(c.ts);
    tooltipPrice.textContent = priceText;
    tooltipDate.textContent = dateText;

    const priceWidth = tooltipPrice.getComputedTextLength();
    const dateWidth = tooltipDate.getComputedTextLength();
    const boxWidth = Math.max(priceWidth, dateWidth) + 20;
    const boxHeight = 40;

    let boxX = c.x + 10;
    if (boxX + boxWidth > width - 4) boxX = c.x - boxWidth - 10;
    let boxY = c.y - boxHeight - 10;
    if (boxY < 4) boxY = c.y + 10;

    tooltipBg.setAttribute('x', boxX);
    tooltipBg.setAttribute('y', boxY);
    tooltipBg.setAttribute('width', boxWidth);
    tooltipBg.setAttribute('height', boxHeight);

    tooltipPrice.setAttribute('x', boxX + 10);
    tooltipPrice.setAttribute('y', boxY + 17);
    tooltipDate.setAttribute('x', boxX + 10);
    tooltipDate.setAttribute('y', boxY + 32);

    tooltip.setAttribute('opacity', '1');
  }

  function hideTooltip() {
    guide.setAttribute('opacity', '0');
    dot.setAttribute('opacity', '0');
    tooltip.setAttribute('opacity', '0');
  }

  els.chart.onmousemove = (e) => moveTooltip(e.clientX, e.clientY);
  els.chart.onmouseleave = hideTooltip;
  els.chart.ontouchstart = (e) => moveTooltip(e.touches[0].clientX, e.touches[0].clientY);
  els.chart.ontouchmove = (e) => { e.preventDefault(); moveTooltip(e.touches[0].clientX, e.touches[0].clientY); };
  els.chart.ontouchend = hideTooltip;
}

function renderTable(rows) {
  const reversed = [...rows].reverse().slice(0, 500);
  els.tableRows.innerHTML = reversed.map(r => {
    const sideClass = r.side === 'bid' ? 'row-bid' : r.side === 'ask' ? 'row-ask' : '';
    // Monto operado en la divisa del segmento (nominales de esa operación * precio).
    const nominales = r.op_volume != null ? r.op_volume : r.volume;
    const montoOperado = fmtMonto(nominales, r.last, r.segment);
    return `
    <tr class="${sideClass}">
      <td>${fmtDateTime(r.captured_at)}</td>
      <td class="num">${fmtPrice(r.last)}</td>
      <td class="num">${fmtPrice(r.px_bid)}</td>
      <td class="num">${fmtPrice(r.px_ask)}</td>
      <td class="num">${fmtSpread(r.spread)}</td>
      <td class="num">${montoOperado}</td>
    </tr>
  `;
  }).join('');
}

async function loadHistory() {
  const symbol = state.symbol.trim().toUpperCase();
  if (!symbol) return;

  els.status.style.display = 'block';
  els.status.textContent = `Cargando histórico de ${symbol}...`;
  els.chartWrap.style.display = 'none';
  els.tableWrap.style.display = 'none';
  els.legend.style.display = 'none';
  els.subtitle.textContent = symbol;

  try {
    const res = await fetch(`/api/history/${encodeURIComponent(symbol)}?range=${state.range}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.error || 'Error');

    if (json.rows.length === 0) {
      els.status.textContent = `Todavía no hay datos históricos guardados para ${symbol}.`;
      return;
    }

    els.status.style.display = 'none';
    els.chartWrap.style.display = 'block';
    els.tableWrap.style.display = 'block';
    els.legend.style.display = state.range === 'rolling48h' ? 'flex' : 'none';
    drawChart(json.rows);
    renderTable(json.rows);
  } catch (e) {
    els.status.style.display = 'block';
    els.status.textContent = `Error: ${e.message}`;
  }
}

els.input.addEventListener('change', () => {
  state.symbol = els.input.value;
  const url = new URL(location.href);
  url.searchParams.set('symbol', state.symbol.toUpperCase());
  history.replaceState(null, '', url);
  loadHistory();
});

els.rangeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    els.rangeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.range = tab.dataset.range;
    if (state.symbol) loadHistory();
  });
});

loadSymbolList();

const initialSymbol = new URLSearchParams(location.search).get('symbol');
if (initialSymbol) {
  els.input.value = initialSymbol;
  state.symbol = initialSymbol;
  loadHistory();
}
