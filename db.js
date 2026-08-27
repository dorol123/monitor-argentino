const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const enabled = !!(url && authToken);
const client = enabled ? createClient({ url, authToken }) : null;

const COLUMNS = 'symbol, segment, last, px_bid, px_ask, volume, pct_change, spread, captured_at';

async function init() {
  if (!enabled) return;
  for (const table of ['snapshots', 'snapshots_daily']) {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        segment TEXT NOT NULL,
        last REAL, px_bid REAL, px_ask REAL,
        volume INTEGER, pct_change REAL, spread REAL,
        captured_at INTEGER NOT NULL
      )
    `);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_symbol_time ON ${table}(symbol, captured_at)`);
  }
}

// table es siempre una constante interna ('snapshots' | 'snapshots_daily'), nunca input de usuario.
async function insertSnapshot(table, bonds, capturedAt) {
  if (!enabled || bonds.length === 0) return;
  const stmts = bonds.map(b => ({
    sql: `INSERT INTO ${table} (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [b.symbol, b.segment, b.last, b.px_bid, b.px_ask, b.volume, b.pct_change, b.spread, capturedAt],
  }));
  await client.batch(stmts, 'write');
}

async function pruneOlderThan(table, cutoffTs) {
  if (!enabled) return;
  await client.execute({ sql: `DELETE FROM ${table} WHERE captured_at < ?`, args: [cutoffTs] });
}

async function history(table, symbol, sinceTs) {
  if (!enabled) return [];
  const res = await client.execute({
    sql: `SELECT ${COLUMNS} FROM ${table} WHERE symbol = ? AND captured_at >= ? ORDER BY captured_at ASC`,
    args: [symbol, sinceTs],
  });
  return res.rows;
}

module.exports = { enabled, init, insertSnapshot, pruneOlderThan, history };
