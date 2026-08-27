const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ping gratuito (sin auth) para mantener despierto el servicio en Render free
// y que el poller de histórico no se corte por inactividad.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

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

// Histórico: "rolling" guarda una foto cada 20s y retiene 48hs;
// "daily" guarda 3 fotos por día y se conserva indefinidamente.
const ROLLING_TABLE = 'snapshots';
const DAILY_TABLE = 'snapshots_daily';
const ROLLING_RETENTION_MS = 48 * 60 * 60 * 1000;
const DAILY_QUERY_WINDOW_MS = 400 * 24 * 60 * 60 * 1000; // ~13 meses hacia atrás
const POLL_MS = 20 * 1000;
const PRUNE_EVERY_TICKS = 30; // podar cada ~10 min
const DAILY_SLOTS_AR = ['11:00', '14:00', '17:00']; // hora Argentina

let pollTick = 0;
let lastDailySlotKey = null;
// symbol -> { volume, px_bid, px_ask } de la última vez que lo vimos, para
// detectar solo operaciones reales (cambios de volumen) y no repetir
// falsos positivos al reiniciar el proceso.
let lastState = new Map();

function arTimeParts(ts) {
  const d = new Date(ts);
  const hhmm = d.toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' });
  const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  return { hhmm, dateKey };
}

// Clasifica la operación contra las puntas que había ANTES del cambio de
// volumen (no las puntas ya movidas por la propia operación).
function classifySide(lastPrice, prevBid, prevAsk) {
  if (lastPrice == null) return null;
  if (prevBid == null && prevAsk == null) return null;
  if (prevAsk == null) return 'bid';
  if (prevBid == null) return 'ask';
  const distBid = Math.abs(lastPrice - prevBid);
  const distAsk = Math.abs(lastPrice - prevAsk);
  return distBid <= distAsk ? 'bid' : 'ask';
}

async function pollAndStore() {
  let data, ts;
  try {
    ({ data, ts } = await getLiveCorp());
  } catch (e) {
    console.error('Poller: no se pudo obtener data912:', e.message);
    return;
  }

  try {
    const trades = [];
    for (const b of data) {
      const prev = lastState.get(b.symbol);
      if (prev && b.volume != null && prev.volume != null && b.volume !== prev.volume) {
        trades.push({
          ...b,
          op_volume: b.volume - prev.volume,
          side: classifySide(b.last, prev.px_bid, prev.px_ask),
        });
      }
      lastState.set(b.symbol, { volume: b.volume, px_bid: b.px_bid, px_ask: b.px_ask });
    }

    if (trades.length > 0) await db.insertSnapshot(ROLLING_TABLE, trades, ts);

    pollTick++;
    if (pollTick % PRUNE_EVERY_TICKS === 0) {
      await db.pruneOlderThan(ROLLING_TABLE, Date.now() - ROLLING_RETENTION_MS);
    }
  } catch (e) {
    console.error('Poller: error guardando operaciones:', e.message);
  }

  const { hhmm, dateKey } = arTimeParts(ts);
  const slotKey = `${dateKey} ${hhmm}`;
  if (DAILY_SLOTS_AR.includes(hhmm) && slotKey !== lastDailySlotKey) {
    lastDailySlotKey = slotKey;
    try {
      await db.insertSnapshot(DAILY_TABLE, data, ts);
    } catch (e) {
      console.error('Poller: error guardando snapshot diario:', e.message);
    }
  }
}

if (db.enabled) {
  db.init()
    .then(() => db.latestStatePerSymbol(ROLLING_TABLE))
    .then((seed) => {
      lastState = seed;
      console.log(`Histórico Turso listo. Guardando solo operaciones (cambios de volumen) cada 20s (retención 48hs), ${seed.size} símbolos con estado previo, y 3x/día (largo plazo).`);
      pollAndStore();
      setInterval(pollAndStore, POLL_MS);
    })
    .catch(e => console.error('No se pudo inicializar Turso:', e.message));
} else {
  console.log('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN no configurados: histórico deshabilitado.');
}

app.get('/api/history/:symbol', async (req, res) => {
  if (!db.enabled) return res.status(503).json({ error: 'Histórico no configurado en este deploy' });

  const symbol = req.params.symbol.trim().toUpperCase();
  const table = req.query.range === 'monthly' ? DAILY_TABLE : ROLLING_TABLE;
  const sinceTs = table === DAILY_TABLE ? Date.now() - DAILY_QUERY_WINDOW_MS : Date.now() - ROLLING_RETENTION_MS;

  try {
    const rows = await db.history(table, symbol, sinceTs);
    res.json({ symbol, range: table === DAILY_TABLE ? 'monthly' : 'rolling48h', rows });
  } catch (e) {
    res.status(502).json({ error: 'Error consultando histórico', message: e.message });
  }
});

app.listen(PORT, () => console.log(`Monitor Argentino corriendo en http://localhost:${PORT}`));
