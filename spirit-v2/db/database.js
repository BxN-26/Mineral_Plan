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
      -- ── Table multi-équipes ───────────────────────────────
      CREATE TABLE IF NOT EXISTS staff_teams (
        staff_id   INTEGER NOT NULL REFERENCES staff(id)  ON DELETE CASCADE,
        team_id    INTEGER NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
        is_primary INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (staff_id, team_id)
      );
      CREATE INDEX IF NOT EXISTS idx_staff_teams_staff ON staff_teams(staff_id);
      CREATE INDEX IF NOT EXISTS idx_staff_teams_team  ON staff_teams(team_id);
    `);

    // Seed initial : migrer les staff.team_id existants vers staff_teams
    const migDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='staff_teams_seed'").get();
    if (!migDone) {
      const staffWithTeam = _db.prepare('SELECT id, team_id FROM staff WHERE team_id IS NOT NULL').all();
      const ins = _db.prepare(
        'INSERT OR IGNORE INTO staff_teams (staff_id, team_id, is_primary) VALUES (?, ?, 1)'
      );
      const tx = _db.transaction(() => {
        for (const s of staffWithTeam) ins.run(s.id, s.team_id);
      });
      tx();
      _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('staff_teams_seed')").run();
    }

    // Migration fonction Service Civique
    const scDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='fn_service_civique'").get();
    if (!scDone) {
      _db.prepare(
        `INSERT OR IGNORE INTO functions
           (name, slug, description, color, bg_color, icon, min_staff_hour, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        'Service Civique', 'service_civique',
        'Mission de service civique', '#059669', '#D1FAE5', '🌿', 0, 14
      );
      _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('fn_service_civique')").run();
    }

    // ── Migration slots REAL (quarts d'heure) ────────────────
    // Les anciens slots stockaient hour_start/hour_end en INTEGER (ex: 8→9).
    // Le nouveau format stocke en REAL (ex: 8.0→8.25).
    // On fusionne les slots consécutifs du même salarié/jour en un seul span.
    const slotsDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='schedule_slots_real_spans'").get();
    if (!slotsDone) {
      // Recréer la table avec colonnes REAL et contrainte UNIQUE adaptée
      _db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_slots_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          schedule_id  INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
          staff_id     INTEGER NOT NULL REFERENCES staff(id)     ON DELETE CASCADE,
          day_of_week  INTEGER NOT NULL,
          hour_start   REAL    NOT NULL,
          hour_end     REAL    NOT NULL,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE(schedule_id, staff_id, day_of_week, hour_start)
        );
        CREATE INDEX IF NOT EXISTS idx_ss_new_schedule ON schedule_slots_new(schedule_id);
        CREATE INDEX IF NOT EXISTS idx_ss_new_staff    ON schedule_slots_new(staff_id);
      `);

      // Fusionner les slots entiers consécutifs en spans
      const oldSlots = _db.prepare(
        `SELECT schedule_id, staff_id, day_of_week, hour_start, hour_end
         FROM schedule_slots
         ORDER BY schedule_id, staff_id, day_of_week, hour_start`
      ).all();

      // Grouper par (schedule_id, staff_id, day_of_week) et fusionner consécutifs
      const groups = {};
      for (const s of oldSlots) {
        const k = `${s.schedule_id}_${s.staff_id}_${s.day_of_week}`;
        if (!groups[k]) groups[k] = { schedule_id: s.schedule_id, staff_id: s.staff_id, day_of_week: s.day_of_week, slots: [] };
        groups[k].slots.push({ start: s.hour_start, end: s.hour_end });
      }
      const ins = _db.prepare(
        `INSERT OR IGNORE INTO schedule_slots_new (schedule_id, staff_id, day_of_week, hour_start, hour_end)
         VALUES (?, ?, ?, ?, ?)`
      );
      const tx = _db.transaction(() => {
        for (const g of Object.values(groups)) {
          // Trier et fusionner les plages contiguës
          g.slots.sort((a, b) => a.start - b.start);
          let cur = { ...g.slots[0] };
          for (let i = 1; i < g.slots.length; i++) {
            if (g.slots[i].start <= cur.end) {
              cur.end = Math.max(cur.end, g.slots[i].end);
            } else {
              ins.run(g.schedule_id, g.staff_id, g.day_of_week, cur.start, cur.end);
              cur = { ...g.slots[i] };
            }
          }
          ins.run(g.schedule_id, g.staff_id, g.day_of_week, cur.start, cur.end);
        }
      });
      tx();

      // Remplacer l'ancienne table
      _db.exec(`
        DROP TABLE IF EXISTS schedule_slots;
        ALTER TABLE schedule_slots_new RENAME TO schedule_slots;
      `);
      _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('schedule_slots_real_spans')").run();
    }
  }

  // ── Migration : table course_slots ───────────────────────────
  const csDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='course_slots_table'").get();
  if (!csDone) {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS course_slots (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        function_id  INTEGER REFERENCES functions(id) ON DELETE CASCADE,
        day_of_week  INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
        hour_start   REAL    NOT NULL,
        hour_end     REAL    NOT NULL,
        group_name   TEXT    NOT NULL,
        level        TEXT,
        public_desc  TEXT,
        capacity     INTEGER NOT NULL DEFAULT 2,
        color        TEXT    NOT NULL DEFAULT '#5B75DB',
        bg_color     TEXT    NOT NULL DEFAULT '#EBF0FE',
        season       TEXT    NOT NULL DEFAULT 'always',
        valid_from   TEXT,
        valid_until  TEXT,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cs_function ON course_slots(function_id);
      CREATE INDEX IF NOT EXISTS idx_cs_day      ON course_slots(day_of_week);
    `);
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('course_slots_table')").run();
  }

  // ── Migration : table template_slots ─────────────────────────
  const tsDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='template_slots_table'").get();
  if (!tsDone) {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS template_slots (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id    INTEGER NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
        staff_id       INTEGER REFERENCES staff(id) ON DELETE CASCADE,
        day_of_week    INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
        hour_start     REAL    NOT NULL,
        hour_end       REAL    NOT NULL,
        task_type      TEXT,
        note           TEXT,
        UNIQUE(template_id, staff_id, day_of_week, hour_start)
      );
      CREATE INDEX IF NOT EXISTS idx_ts_template ON template_slots(template_id);
    `);
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('template_slots_table')").run();
  }

  // ── Migration : task_type + course_slot_id sur schedule_slots ─
  const ttDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='schedule_slots_task_type'").get();
  if (!ttDone) {
    try { _db.exec("ALTER TABLE schedule_slots ADD COLUMN task_type TEXT DEFAULT NULL"); } catch (_) {}
    try { _db.exec("ALTER TABLE schedule_slots ADD COLUMN course_slot_id INTEGER DEFAULT NULL"); } catch (_) {}
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('schedule_slots_task_type')").run();
  }

  // ── Migration : colonne meta sur notifications ────────────────
  const notifMetaDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='notifications_meta_col'").get();
  if (!notifMetaDone) {
    try { _db.exec("ALTER TABLE notifications ADD COLUMN meta TEXT DEFAULT NULL"); } catch (_) {}
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('notifications_meta_col')").run();
  }

  // ── Migration : étendre le CHECK type de notifications (+ leave_planning) ──
  const notifTypeDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='notifications_type_extended'").get();
  if (!notifTypeDone) {
    _db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS notifications_v2 (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type         TEXT    NOT NULL DEFAULT 'info'
                             CHECK(type IN ('leave','leave_planning','overtime','approval','info','swap')),
        title        TEXT    NOT NULL,
        body         TEXT    NOT NULL DEFAULT '',
        read         INTEGER NOT NULL DEFAULT 0,
        related_type TEXT,
        related_id   INTEGER,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        meta         TEXT    DEFAULT NULL
      );
      INSERT OR IGNORE INTO notifications_v2
        SELECT id, user_id, type, title, body, read, related_type, related_id, created_at, meta
        FROM notifications;
      DROP TABLE notifications;
      ALTER TABLE notifications_v2 RENAME TO notifications;
      PRAGMA foreign_keys = ON;
    `);
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('notifications_type_extended')").run();
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
