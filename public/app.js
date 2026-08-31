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
  hideUnoperated: true,
};

const els = {
  table: document.getElementById('ons-table'),
  rows: document.getElementById('rows'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  marketDot: document.getElementById('market-dot'),
  marketText: document.getElementById('market-text'),
  search: document.getElementById('search'),
  hideUnoperated: document.getElementById('hide-unoperated'),
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

// Monto operado = nominales * precio por nominal, en la divisa del bono.
function fmtMonto(nominales, price, currency) {
  if (nominales == null || price == null) return '—';
  const monto = nominales * price;
  const symbol = currency === 'ARS' ? '$' : 'U$S';
  return `${symbol} ${Number(monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

async function fetchBonds() {
  try {
    const res = await fetch('/api/ons');
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.error || 'Error');
    state.bonds = json.data.map(b => ({
      ...b,
      monto: (b.volume != null && b.last != null) ? b.volume * b.last : null,
    }));
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

function updateMarketStatus() {
  const hhmm = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit',
  });
  const open = hhmm >= '10:30' && hhmm < '17:00';
  els.marketDot.className = `neon-dot ${open ? 'open' : 'closed'}`;
  els.marketText.textContent = open ? 'Mercado abierto' : 'Mercado cerrado';
}

const ARBITRAJE_MIN_SPREAD = 1; // %
const ARBITRAJE_MIN_VOLUMEN_USD = 500;
const ARBITRAJE_MIN_VOLUMEN_ARS = 600000;

function isArbitraje(b) {
  if (b.spread == null || b.spread <= ARBITRAJE_MIN_SPREAD) return false;
  const minMonto = b.currency === 'ARS' ? ARBITRAJE_MIN_VOLUMEN_ARS : ARBITRAJE_MIN_VOLUMEN_USD;
  return b.monto != null && b.monto > minMonto;
}

function getRows() {
  let rows = state.segment === 'ARBITRAJES'
    ? state.bonds.filter(isArbitraje)
    : state.bonds.filter(b => b.segment === state.segment);

  if (state.tab === 'watchlist') rows = rows.filter(b => state.watchlist.has(b.symbol));

  if (state.hideUnoperated) rows = rows.filter(b => b.volume != null && b.volume > 0);

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
          : state.hideUnoperated
            ? 'Nada operado en este segmento todavía. Destildá "Ocultar no operados" para ver todo.'
            : 'Sin resultados para tu búsqueda.';
    els.rows.innerHTML = `<tr><td colspan="10" class="empty">${msg}</td></tr>`;
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
        <td class="num arb-col">${fmtPrice(b.lastBidOperated)}</td>
        <td class="num arb-col">${fmtPrice(b.lastAskOperated)}</td>
        <td class="num">${fmtSpread(b.spread)}</td>
        <td class="num">${fmtMonto(b.volume, b.last, b.currency)}</td>
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
    els.table.classList.toggle('arb-mode', state.segment === 'ARBITRAJES');
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

els.hideUnoperated.addEventListener('change', (e) => {
  state.hideUnoperated = e.target.checked;
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

updateMarketStatus();
setInterval(updateMarketStatus, 30 * 1000);
