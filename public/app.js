const REFRESH_MS = 20 * 1000; // igual al refresco de data912
const WATCHLIST_KEY = 'monitor-argentino:watchlist';

const state = {
  bonds: [],
  tab: 'watchlist',
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
  return n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(2)}%`;
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

function getRows() {
  let rows = state.tab === 'watchlist'
    ? state.bonds.filter(b => state.watchlist.has(b.symbol))
    : state.bonds;

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
      : state.tab === 'watchlist'
        ? 'Sin ONs en seguimiento. Andá a "Todas las ONs" y tocá la ⭐ para agregar.'
        : 'Sin resultados para tu búsqueda.';
    els.rows.innerHTML = `<tr><td colspan="8" class="empty">${msg}</td></tr>`;
    return;
  }

  els.rows.innerHTML = rows.map(b => {
    const pctClass = b.pct_change > 0 ? 'pct-up' : b.pct_change < 0 ? 'pct-down' : 'pct-flat';
    const watched = state.watchlist.has(b.symbol);
    return `
      <tr>
        <td class="symbol">${b.symbol}</td>
        <td><span class="badge">${b.currency}</span></td>
        <td class="num">${fmtPrice(b.last)}</td>
        <td class="num ${pctClass}">${fmtPct(b.pct_change)}</td>
        <td class="num">${fmtPrice(b.px_bid)}</td>
        <td class="num">${fmtPrice(b.px_ask)}</td>
        <td class="num">${fmtInt(b.volume)}</td>
        <td><button class="star-btn ${watched ? 'active' : ''}" data-symbol="${b.symbol}" title="Agregar/quitar de seguimiento">${watched ? '★' : '☆'}</button></td>
      </tr>
    `;
  }).join('');

  els.rows.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleWatch(btn.dataset.symbol));
  });
}

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
