const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

const SITE_PASSWORD = process.env.SITE_PASSWORD || '000';
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'monitor_auth';

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function issueToken() {
  return `ok.${sign('ok')}`;
}

function hasValidToken(token) {
  if (!token) return false;
  const [value, sig] = token.split('.');
  return !!value && sig === sign(value);
}

app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', (req, res) => {
  if (req.body.password === SITE_PASSWORD) {
    res.cookie(COOKIE_NAME, issueToken(), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.use((req, res, next) => {
  if (hasValidToken(req.cookies[COOKIE_NAME])) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
  return res.redirect('/login');
});

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
    .map(b => {
      // Convención de BYMA: sin sufijo = Pesos, "D" = Dólar MEP (liquida en el país),
      // "C" = Dólar Cable/CCL (liquida en el exterior).
      let segment = 'ARS', currency = 'ARS';
      if (b.symbol.endsWith('D')) { segment = 'MEP'; currency = 'USD'; }
      else if (b.symbol.endsWith('C')) { segment = 'CABLE'; currency = 'USD'; }

      // data912 cotiza los precios cada 100 nominales; se divide para
      // obtener el precio por 1 nominal individual.
      const last = b.c != null ? b.c / 100 : null;
      const px_bid = b.px_bid != null ? b.px_bid / 100 : null;
      const px_ask = b.px_ask != null ? b.px_ask / 100 : null;

      // Spread entre puntas, como % sobre la punta compradora (la división
      // por 100 no altera el ratio)
      const spread = (px_bid > 0 && px_ask != null)
        ? ((px_ask - px_bid) / px_bid) * 100
        : null;

      return {
        symbol: b.symbol,
        segment,
        currency,
        last,
        px_bid,
        px_ask,
        q_bid: b.q_bid,
        q_ask: b.q_ask,
        volume: b.v,
        pct_change: b.pct_change,
        spread,
      };
    })
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
