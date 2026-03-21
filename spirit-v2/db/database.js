'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, 'spirit.db');

let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('foreign_keys = ON');
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');
    // Table de refresh tokens (pas dans schema.sql)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT    NOT NULL UNIQUE,
        expires_at TEXT    NOT NULL,
        revoked    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rt_token ON refresh_tokens(token_hash);

      -- ── Migrations dynamiques ────────────────────────────────
      -- Colonne charge_rate sur staff (taux charges patronales par salarié)
      CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
    `);

    // Migrations ALTER TABLE (idempotentes via _migrations)
    const migrations = [
      ["staff_charge_rate",   "ALTER TABLE staff ADD COLUMN charge_rate REAL NOT NULL DEFAULT 0.45"],
      ["staff_avatar_url_idx","CREATE INDEX IF NOT EXISTS idx_staff_avatar ON staff(id) WHERE avatar_url IS NOT NULL"],
    ];
    for (const [name, sql] of migrations) {
      const done = _db.prepare('SELECT 1 FROM _migrations WHERE name=?').get(name);
      if (!done) {
        try { _db.exec(sql); } catch (_) {}
        _db.prepare('INSERT OR IGNORE INTO _migrations(name) VALUES(?)').run(name);
      }
    }

    // ── Notifications ────────────────────────────────────────
    _db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type         TEXT    NOT NULL DEFAULT 'info'
                             CHECK(type IN ('leave','overtime','approval','info','swap')),
        title        TEXT    NOT NULL,
        body         TEXT    NOT NULL DEFAULT '',
        read         INTEGER NOT NULL DEFAULT 0,
        related_type TEXT,   -- 'leave' | 'swap' | 'schedule'
        related_id   INTEGER,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

      -- ── Échanges de créneaux ──────────────────────────────
      CREATE TABLE IF NOT EXISTS shift_swaps (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        -- Initiateur
        requester_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        -- Créneau proposé à l'échange (celui du requester)
        week_start      TEXT    NOT NULL,
        fn_slug         TEXT    NOT NULL,
        day_index       INTEGER NOT NULL,  -- 0=Lun … 6=Dim
        hour            INTEGER NOT NULL,
        -- Mode: 'open' (n'importe qui) | 'targeted' (destinataire précis)
        mode            TEXT    NOT NULL DEFAULT 'open'
                                CHECK(mode IN ('open','targeted')),
        -- Destinataire (NULL si mode='open')
        target_id       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        -- Créneau offert en retour par le répondant (si échange bilatéral)
        swap_week       TEXT,
        swap_fn_slug    TEXT,
        swap_day_index  INTEGER,
        swap_hour       INTEGER,
        -- Workflow
        status          TEXT    NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','matched','approved','refused','cancelled')),
        responder_id    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        responder_at    TEXT,
        manager_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        manager_at      TEXT,
        manager_note    TEXT,
        note            TEXT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_swap_week   ON shift_swaps(week_start);
      CREATE INDEX IF NOT EXISTS idx_swap_req    ON shift_swaps(requester_id);
      CREATE INDEX IF NOT EXISTS idx_swap_target ON shift_swaps(target_id);
    `);
    _db.exec(`
    `);
  }
  return _db;
}

/** Initialise le schéma en exécutant schema.sql */
function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  getDb().exec(sql);
}

/**
 * Wrapper synchrone autour de better-sqlite3.
 * Toutes les méthodes acceptent (sql, paramsArray).
 */
const db_ = {
  get:  (sql, params = []) => getDb().prepare(sql).get(...params),
  all:  (sql, params = []) => getDb().prepare(sql).all(...params),
  run:  (sql, params = []) => getDb().prepare(sql).run(...params),
  exec: (sql)              => getDb().exec(sql),
  tx:   (fn)               => getDb().transaction(fn)(),
};

module.exports = { getDb, initSchema, db_ };
