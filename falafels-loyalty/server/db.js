import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, 'falafels.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    username            TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,
    coins               INTEGER NOT NULL DEFAULT 0,
    punches             INTEGER NOT NULL DEFAULT 0,
    free_redeemed       INTEGER NOT NULL DEFAULT 0,
    current_streak      INTEGER NOT NULL DEFAULT 0,
    longest_streak      INTEGER NOT NULL DEFAULT 0,
    last_purchase_date  TEXT,
    total_coffees       INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vouchers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    code         TEXT    NOT NULL,
    value_cents  INTEGER NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'active',
    created_at   TEXT    NOT NULL,
    redeemed_at  TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    type        TEXT    NOT NULL,
    detail      TEXT,
    created_at  TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

export function logEvent(userId, type, detail = null) {
  db.prepare(
    'INSERT INTO events (user_id, type, detail, created_at) VALUES (?, ?, ?, ?)'
  ).run(userId, type, detail ? JSON.stringify(detail) : null, new Date().toISOString());
}
