const REFRESH_MS = 20 * 1000; // igual al refresco de data912
const WATCHLIST_KEY = 'monitor-argentino:watchlist';

const state = {
  bonds: [],
  segment: 'ARS',
  tab: 'all',
  search: '',
  sortKey: 'symbol',
  sortDir: 1,
  watchlist: loadWatchlist(),
};

const els = {
  rows: document.getElementById('rows'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  search: document.getElementById('search'),
  tabs: document.querySelectorAll('.tab'),
  segments: document.querySelectorAll('.segment'),
  headers: document.querySelectorAll('th[data-sort]'),
};

function loadWatchlist() {
  try { return new Set(JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || []); }
  catch { return new Set(); }
}

function saveWatchlist() {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...state.watchlist]));
}

function toggleWatch(symbol) {
  if (state.watchlist.has(symbol)) state.watchlist.delete(symbol);
  else state.watchlist.add(symbol);
  saveWatchlist();
  render();
}

function fmtPrice(n) {
  return n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(2)}%`;
}

function fmtSpread(n) {
  return n == null ? '—' : `${Number(n).toFixed(2)}%`;
}

function fmtInt(n) {
  return n == null ? '—' : Number(n).toLocaleString('es-AR');
}

async function fetchBonds() {
  try {
    const res = await fetch('/api/ons');
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.error || 'Error');
    state.bonds = json.data;
    setStatus('ok', `Actualizado ${new Date(json.updatedAt).toLocaleTimeString('es-AR')}`);
  } catch (e) {
    setStatus('error', `Error: ${e.message}`);
  }
  render();
}

function setStatus(kind, text) {
  els.statusDot.className = `dot ${kind}`;
  els.statusText.textContent = text;
}

const ARBITRAJE_MIN_SPREAD = 1; // %
const ARBITRAJE_MIN_VOLUMEN_USD = 500;
const ARBITRAJE_MIN_VOLUMEN_ARS = 600000;

function isArbitraje(b) {
  if (b.spread == null || b.spread <= ARBITRAJE_MIN_SPREAD) return false;
  const minVolumen = b.currency === 'ARS' ? ARBITRAJE_MIN_VOLUMEN_ARS : ARBITRAJE_MIN_VOLUMEN_USD;
  return b.volume != null && b.volume > minVolumen;
}

function getRows() {
  let rows = state.segment === 'ARBITRAJES'
    ? state.bonds.filter(isArbitraje)
    : state.bonds.filter(b => b.segment === state.segment);

  if (state.tab === 'watchlist') rows = rows.filter(b => state.watchlist.has(b.symbol));

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    rows = rows.filter(b => b.symbol.toLowerCase().includes(q));
  }

  rows = [...rows].sort((a, b) => {
    const av = a[state.sortKey], bv = b[state.sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * state.sortDir;
    return (av - bv) * state.sortDir;
  });

  return rows;
}

function render() {
  const rows = getRows();

  if (rows.length === 0) {
    const msg = state.bonds.length === 0
      ? 'Cargando cotizaciones...'
      : state.segment === 'ARBITRAJES'
        ? 'Sin oportunidades ahora mismo (spread > 1% y volumen mínimo).'
        : state.tab === 'watchlist'
          ? 'Sin ONs en seguimiento en este segmento. Andá a "Todas" y tocá la ⭐ para agregar.'
          : 'Sin resultados para tu búsqueda.';
    els.rows.innerHTML = `<tr><td colspan="8" class="empty">${msg}</td></tr>`;
    return;
  }

  const segmentLabel = { ARS: 'Pesos', MEP: 'MEP', CABLE: 'Cable' };

  els.rows.innerHTML = rows.map(b => {
    const pctClass = b.pct_change > 0 ? 'pct-up' : b.pct_change < 0 ? 'pct-down' : 'pct-flat';
    const watched = state.watchlist.has(b.symbol);
    return `
      <tr>
        <td class="symbol"><a class="symbol-link" href="/historia.html?symbol=${b.symbol}">${b.symbol}</a>${state.segment === 'ARBITRAJES' ? ` <span class="badge">${segmentLabel[b.segment]}</span>` : ''}</td>
        <td class="num">${fmtPrice(b.last)}</td>
        <td class="num ${pctClass}">${fmtPct(b.pct_change)}</td>
        <td class="num">${fmtPrice(b.px_bid)}</td>
        <td class="num">${fmtPrice(b.px_ask)}</td>
        <td class="num">${fmtSpread(b.spread)}</td>
        <td class="num">${fmtInt(b.volume)}</td>
        <td><button class="star-btn ${watched ? 'active' : ''}" data-symbol="${b.symbol}" title="Agregar/quitar de seguimiento">${watched ? '★' : '☆'}</button></td>
      </tr>
    `;
  }).join('');

  els.rows.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleWatch(btn.dataset.symbol));
  });
}

els.segments.forEach(seg => {
  seg.addEventListener('click', () => {
    els.segments.forEach(s => s.classList.remove('active'));
    seg.classList.add('active');
    state.segment = seg.dataset.segment;
    render();
  });
});

els.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    els.tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.tab = tab.dataset.tab;
    render();
  });
});

els.search.addEventListener('input', (e) => {
  state.search = e.target.value;
  render();
});

els.headers.forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (state.sortKey === key) state.sortDir *= -1;
    else { state.sortKey = key; state.sortDir = 1; }
    render();
  });
});

fetchBonds();
setInterval(fetchBonds, REFRESH_MS);
