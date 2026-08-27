const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA912_URL = 'https://data912.com/live/arg_corp';
const CACHE_TTL_MS = 20 * 1000; // data912 refresca este panel cada ~20s

let cache = { data: null, ts: 0 };

async function getLiveCorp() {
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL_MS) return cache;

  const res = await fetch(DATA912_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`data912 respondió ${res.status}`);
  const raw = await res.json();

  const data = raw
    .filter(b => b && b.symbol)
    .map(b => ({
      symbol: b.symbol,
      currency: b.symbol.endsWith('D') ? 'USD' : 'ARS',
      last: b.c,
      px_bid: b.px_bid,
      px_ask: b.px_ask,
      q_bid: b.q_bid,
      q_ask: b.q_ask,
      volume: b.v,
      pct_change: b.pct_change,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  cache = { data, ts: now };
  return cache;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ons', async (req, res) => {
  try {
    const { data, ts } = await getLiveCorp();
    res.json({ data, updatedAt: new Date(ts).toISOString() });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo obtener la cotización de data912', message: e.message });
  }
});

app.listen(PORT, () => console.log(`Monitor Argentino corriendo en http://localhost:${PORT}`));
