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

    // ── Bootstrap schéma (nouvelle installation BDD vierge) ─────
    // Sur une installation fraîche, les tables de base (staff, users…)
    // n'existent pas encore. On applique schema.sql AVANT les migrations
    // qui supposent que ces tables existent.
    const usersTableExists = _db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();
    if (!usersTableExists) {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      _db.exec(schemaSql);
    }

    // Migrations ALTER TABLE (idempotentes via _migrations)
    const migrations = [
      ["staff_charge_rate",         "ALTER TABLE staff ADD COLUMN charge_rate REAL NOT NULL DEFAULT 0.45"],
      ["staff_avatar_url_idx",      "CREATE INDEX IF NOT EXISTS idx_staff_avatar ON staff(id) WHERE avatar_url IS NOT NULL"],
      ["users_must_change_password","ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"],
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

  // ── Migration : table push_subscriptions ─────────────────────
  const pushSubDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='push_subscriptions_table'").get();
  if (!pushSubDone) {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint   TEXT    NOT NULL UNIQUE,
        p256dh     TEXT    NOT NULL,
        auth       TEXT    NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pushsub_user ON push_subscriptions(user_id);
    `);
    // Seed du paramètre push_notifications_enabled dans settings
    _db.prepare(
      "INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)"
    ).run('push_notifications_enabled', 'false', 'boolean', 'Activer les notifications push (Web Push)', 'system');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('push_subscriptions_table')").run();
  }

  // ── Migration : seeds paramètres configurables ────────────────
  const configSeedsDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='config_settings_seeds'").get();
  if (!configSeedsDone) {
    const seed = _db.prepare(
      "INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)"
    );
    // Groupe : congés
    seed.run('leave_min_notice_enabled', 'false',        'boolean', 'Activer le délai minimum de préavis pour les demandes de congés', 'conges');
    seed.run('leave_min_notice_days',    '2',            'number',  'Nombre de jours minimum de préavis requis avant la date de début du congé', 'conges');
    seed.run('leave_default_cp_balance', '25',           'number',  'Solde initial en jours de CP attribué lors de la création d\'un nouveau salarié', 'conges');
    seed.run('leave_default_rtt_balance','5',            'number',  'Solde initial en jours de RTT attribué lors de la création d\'un nouveau salarié', 'conges');
    seed.run('leave_count_method',       'working_days', 'string',  'Méthode de décompte des congés : jours ouvrés ou calendaires', 'conges');
    // Groupe : planning
    seed.run('planning_day_start', '7',  'number', 'Heure de début d\'affichage du planning (0-23)', 'planning');
    seed.run('planning_day_end',   '22', 'number', 'Heure de fin d\'affichage du planning (0-23)', 'planning');
    // Groupe : rh
    seed.run('rh_default_charge_rate', '45', 'number', 'Taux de charges patronales par défaut (%) appliqué aux nouveaux salariés', 'rh');
    seed.run('rh_default_contract_h',  '35', 'number', 'Heures hebdomadaires par défaut pour les nouveaux contrats', 'rh');
    // Groupe : system (thème)
    seed.run('ui_theme', 'light', 'string', 'Thème visuel de l\'application (clair ou sombre)', 'system');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('config_settings_seeds')").run();
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

  // ── Migration : colonne contract_base sur staff ───────────────
  const contractBaseDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='staff_contract_base'").get();
  if (!contractBaseDone) {
    try { _db.exec("ALTER TABLE staff ADD COLUMN contract_base TEXT NOT NULL DEFAULT 'hebdomadaire'"); } catch (_) {}
    // Les bénévoles, renforts et indépendants n'ont pas de base horaire par défaut
    _db.exec("UPDATE staff SET contract_base = 'aucune' WHERE type IN ('benevole', 'renfort', 'independant')");
    // Seeds de configuration des bases horaires
    const seed = _db.prepare("INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)");
    seed.run('contract_base_hebdo_enabled', 'true',                 'boolean', 'Activer la base "Horaire hebdomadaire"', 'rh');
    seed.run('contract_base_hebdo_label',   'Horaire hebdomadaire', 'string',  'Libellé de la base "Horaire hebdomadaire"', 'rh');
    seed.run('contract_base_annuel_enabled','true',                 'boolean', 'Activer la base "Annualisé"', 'rh');
    seed.run('contract_base_annuel_label',  'Annualisé',            'string',  'Libellé de la base "Annualisé"', 'rh');
    seed.run('contract_base_aucune_enabled','true',                 'boolean', 'Activer la base "Sans base horaire"', 'rh');
    seed.run('contract_base_aucune_label',  'Sans base horaire',    'string',  'Libellé de la base "Sans base horaire"', 'rh');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('staff_contract_base')").run();
  }

  // ── Migration : seeds exercice comptable ──────────────────────
  const fiscalSeedsDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='fiscal_year_seeds'").get();
  if (!fiscalSeedsDone) {
    const seed = _db.prepare("INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)");
    seed.run('fiscal_year_type',        'calendar', 'string', 'Type d\'exercice : "calendar" (1 jan→31 déc) ou "custom" (date personnalisée)', 'conges');
    seed.run('fiscal_year_start_month', '9',        'number', 'Mois de début de l\'exercice personnalisé (1=janvier, 9=septembre)', 'conges');
    seed.run('fiscal_year_start_day',   '1',        'number', 'Jour de début de l\'exercice personnalisé', 'conges');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('fiscal_year_seeds')").run();
  }

  // ── Migration : contraintes horaires planning ─────────────────
  const planningConstraintsDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='planning_constraints'").get();
  if (!planningConstraintsDone) {
    const seed = _db.prepare("INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)");
    seed.run('planning_max_amplitude_enabled', 'false', 'boolean', 'Activer la limite d\'amplitude journalière (heure début → heure fin dans la journée)', 'planning');
    seed.run('planning_max_amplitude_hours',   '12',    'number',  'Amplitude journalière maximale autorisée (en heures)', 'planning');
    seed.run('planning_min_rest_enabled',       'false', 'boolean', 'Activer le contrôle du repos minimum entre deux prises de poste', 'planning');
    seed.run('planning_min_rest_hours',         '11',    'number',  'Durée minimale de repos entre la fin d\'un poste et le début du suivant (en heures)', 'planning');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('planning_constraints')").run();
  }

  // ── Migration : paramètres affichage cours et tri planning ────
  const planningDisplayDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='planning_display_settings'").get();
  if (!planningDisplayDone) {
    const seed2 = _db.prepare("INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)");
    seed2.run('planning_course_slots_fns', '[]',       'json',   'Slugs de fonctions pour lesquelles afficher les créneaux de cours dans la grille', 'planning');
    seed2.run('planning_group_by',         'function', 'string', 'Tri du planning : function | team | both', 'planning');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('planning_display_settings')").run();
  }

  // ── Migration : paramètre niveau d'approbation des échanges ────────────────
  const swapApprovalDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='swap_approval_level_seed'").get();
  if (!swapApprovalDone) {
    _db.prepare(
      "INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)"
    ).run('swap_approval_level', 'manager', 'string',
      'Niveau hiérarchique requis pour approuver les échanges de créneaux', 'organigramme');
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('swap_approval_level_seed')").run();
  }

  // ── Migration : table task_types ─────────────────────────────
  const taskTypesDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='task_types_table'").get();
  if (!taskTypesDone) {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS task_types (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        slug       TEXT    NOT NULL UNIQUE,
        label      TEXT    NOT NULL,
        icon       TEXT    NOT NULL DEFAULT '⚙️',
        color      TEXT    NOT NULL DEFAULT '#6B7280',
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    const seedTT = _db.prepare(
      'INSERT OR IGNORE INTO task_types (slug, label, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    seedTT.run('permanent',       'Permanence',    '🏬', '#5B75DB', 0);
    seedTT.run('ouverture_blocs', 'Ouvert. blocs', '🪨', '#E8820C', 1);
    seedTT.run('ouverture_voies', 'Ouvert. voies', '🧗', '#DC3545', 2);
    seedTT.run('demontage',       'Démontage',     '🔧', '#6B7280', 3);
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('task_types_table')").run();
  }

  // ── Migration : comptes première installation (superadmin + admin) ───────────
  // Crée les deux comptes système uniquement si absents.
  // Utilise les variables d'environnement SUPERADMIN_* et ADMIN_* du .env.
  // Le superadmin est le compte développeur (secret, invisible pour les admins).
  // L'admin est le compte opérateur du club (must_change_password=1).
  const firstInstallDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='first_install_accounts'").get();
  if (!firstInstallDone) {
    const bcrypt   = require('bcryptjs');
    const saEmail  = (process.env.SUPERADMIN_EMAIL         || 'dev@spirit-app.internal').toLowerCase().trim();
    const saPass   =  process.env.SUPERADMIN_PASSWORD      || 'ChangeMe2025!Dev';
    const adEmail  = (process.env.ADMIN_EMAIL              || 'admin@spirit-app.local').toLowerCase().trim();
    const adPass   =  process.env.ADMIN_INITIAL_PASSWORD   || 'Admin2025!';

    const saHash = bcrypt.hashSync(saPass, 12);
    const adHash = bcrypt.hashSync(adPass, 12);

    // Superadmin : aucun staff_id, must_change_password=0
    const existSa = _db.prepare('SELECT id FROM users WHERE email = ?').get(saEmail);
    if (!existSa) {
      _db.prepare(
        'INSERT INTO users (email, password, role, staff_id, active, must_change_password) VALUES (?, ?, ?, NULL, 1, 0)'
      ).run(saEmail, saHash, 'superadmin');
    }

    // Admin : avec fiche salarié si ADMIN_FIRSTNAME/LASTNAME renseignés
    const adFirstname = (process.env.ADMIN_FIRSTNAME || '').trim();
    const adLastname  = (process.env.ADMIN_LASTNAME  || '').trim();
    const existAd = _db.prepare('SELECT id FROM users WHERE email = ?').get(adEmail);
    if (!existAd) {
      let adStaffId = null;
      if (adFirstname && adLastname) {
        const initials = (adFirstname[0] + adLastname[0]).toUpperCase();
        const staffRes = _db.prepare(
          'INSERT OR IGNORE INTO staff (firstname, lastname, initials, email, type, active) VALUES (?, ?, ?, ?, ?, 1)'
        ).run(adFirstname, adLastname, initials, adEmail, 'salarie');
        adStaffId = staffRes.lastInsertRowid || _db.prepare('SELECT id FROM staff WHERE lower(email)=?').get(adEmail.toLowerCase())?.id || null;
      }
      _db.prepare(
        'INSERT INTO users (email, password, role, staff_id, active, must_change_password) VALUES (?, ?, ?, ?, 1, 1)'
      ).run(adEmail, adHash, 'admin', adStaffId);
    }

    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('first_install_accounts')").run();
  }

  // ── Migration : lier la fiche salarié de l'admin (installations existantes) ─
  // Pour les serveurs déjà installés avec ADMIN_FIRSTNAME/LASTNAME ajoutés au .env.
  const adminStaffLinkDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='admin_staff_link'").get();
  if (!adminStaffLinkDone) {
    const adEmail2    = (process.env.ADMIN_EMAIL      || 'admin@spirit-app.local').toLowerCase().trim();
    const adFirstname2 = (process.env.ADMIN_FIRSTNAME || '').trim();
    const adLastname2  = (process.env.ADMIN_LASTNAME  || '').trim();
    if (adFirstname2 && adLastname2) {
      const adminUser = _db.prepare('SELECT id, staff_id FROM users WHERE lower(email)=?').get(adEmail2);
      if (adminUser && !adminUser.staff_id) {
        let staffRecord = _db.prepare('SELECT id FROM staff WHERE lower(email)=?').get(adEmail2);
        if (!staffRecord) {
          const initials = (adFirstname2[0] + adLastname2[0]).toUpperCase();
          const res = _db.prepare(
            'INSERT OR IGNORE INTO staff (firstname, lastname, initials, email, type, active) VALUES (?, ?, ?, ?, ?, 1)'
          ).run(adFirstname2, adLastname2, initials, adEmail2, 'salarie');
          staffRecord = { id: res.lastInsertRowid };
        }
        if (staffRecord?.id) {
          _db.prepare('UPDATE users SET staff_id=? WHERE id=?').run(staffRecord.id, adminUser.id);
        }
      }
    }
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('admin_staff_link')").run();
  }

  // ── Migration : corriger les anciens comptes superadmin hérités du seed ──────
  // L'ancien seed créait admin@mineral-spirit.fr comme 'superadmin'.
  // Ce rôle est désormais réservé au compte développeur (SUPERADMIN_EMAIL).
  // Tout compte 'superadmin' dont l'email ≠ SUPERADMIN_EMAIL est reclassé 'admin'.
  const fixLegacySaDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='fix_legacy_superadmin'").get();
  if (!fixLegacySaDone) {
    const devEmail = (process.env.SUPERADMIN_EMAIL || 'dev@spirit-app.internal').toLowerCase().trim();
    _db.prepare(
      "UPDATE users SET role = 'admin' WHERE role = 'superadmin' AND lower(email) != ?"
    ).run(devEmail);
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('fix_legacy_superadmin')").run();
  }

  // ── Migration : plage horaire sur shift_swaps (hour → hour_start/hour_end) ──
  const swapsRangeDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='swaps_range_columns'").get();
  if (!swapsRangeDone) {
    try { _db.exec("ALTER TABLE shift_swaps ADD COLUMN hour_start REAL"); } catch (_) {}
    try { _db.exec("ALTER TABLE shift_swaps ADD COLUMN hour_end REAL"); } catch (_) {}
    try { _db.exec("ALTER TABLE shift_swaps ADD COLUMN swap_hour_start REAL"); } catch (_) {}
    try { _db.exec("ALTER TABLE shift_swaps ADD COLUMN swap_hour_end REAL"); } catch (_) {}
    try { _db.exec("ALTER TABLE shift_swaps ADD COLUMN refused_by TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
    try { _db.exec("ALTER TABLE shift_swaps ADD COLUMN urgent_alert_sent INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
    // Migrer les anciennes valeurs (hour entier → plage de 1h)
    _db.exec("UPDATE shift_swaps SET hour_start = CAST(hour AS REAL), hour_end = CAST(hour AS REAL) + 1 WHERE hour_start IS NULL AND hour IS NOT NULL");
    _db.exec("UPDATE shift_swaps SET swap_hour_start = CAST(swap_hour AS REAL), swap_hour_end = CAST(swap_hour AS REAL) + 1 WHERE swap_hour_start IS NULL AND swap_hour IS NOT NULL");
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('swaps_range_columns')").run();
  }

  // ── Migration : type 'urgent' dans notifications ──────────────
  const notifUrgentDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='notifications_type_urgent'").get();
  if (!notifUrgentDone) {
    _db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS notifications_v3 (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type         TEXT    NOT NULL DEFAULT 'info'
                             CHECK(type IN ('leave','leave_planning','overtime','approval','info','swap','urgent')),
        title        TEXT    NOT NULL,
        body         TEXT    NOT NULL DEFAULT '',
        read         INTEGER NOT NULL DEFAULT 0,
        related_type TEXT,
        related_id   INTEGER,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        meta         TEXT    DEFAULT NULL
      );
      INSERT OR IGNORE INTO notifications_v3
        SELECT id, user_id, type, title, body, read, related_type, related_id, created_at, meta
        FROM notifications;
      DROP TABLE notifications;
      ALTER TABLE notifications_v3 RENAME TO notifications;
      PRAGMA foreign_keys = ON;
    `);
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('notifications_type_urgent')").run();
  }

  // ── Migration : seed paramètre alerte urgente échanges ────────
  const swapAlertSeedDone = _db.prepare("SELECT 1 FROM _migrations WHERE name='swap_urgent_alert_seed'").get();
  if (!swapAlertSeedDone) {
    _db.prepare(
      "INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES (?,?,?,?,?)"
    ).run(
      'swap_urgent_alert_hours', '24', 'number',
      'Nombre d\'heures avant la prise de poste à partir duquel une alerte urgente est envoyée au référent si aucun remplaçant n\'a été trouvé pour un échange',
      'planning'
    );
    _db.prepare("INSERT OR IGNORE INTO _migrations(name) VALUES('swap_urgent_alert_seed')").run();
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
