-- ════════════════════════════════════════════════════════════
--  minéral Spirit · Schéma SQLite v2.0
--  Architecture : Équipe / Fonction / Planning-Fonction
--  Un salarié peut avoir N fonctions → N agendas superposables
-- ════════════════════════════════════════════════════════════
PRAGMA foreign_keys = ON;
PRAGMA journal_mode  = WAL;
PRAGMA synchronous   = NORMAL;

-- ────────────────────────────────────────────────────────────
-- ORGANISATION : ÉQUIPES
-- Structure hiérarchique (équipe peut avoir un parent)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  slug        TEXT    NOT NULL UNIQUE,
  description TEXT,
  color       TEXT    NOT NULL DEFAULT '#8B8880',
  bg_color    TEXT    NOT NULL DEFAULT '#F5F5F5',
  icon        TEXT    NOT NULL DEFAULT '👥',
  parent_id   INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- FONCTIONS / POSTES
-- Indépendants des équipes : un ouvreur peut venir de l'équipe
-- technique OU de l'équipe accueil. Chaque fonction a son agenda.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS functions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,
  slug            TEXT    NOT NULL UNIQUE,
  description     TEXT,
  color           TEXT    NOT NULL DEFAULT '#8B8880',
  bg_color        TEXT    NOT NULL DEFAULT '#F5F5F5',
  icon            TEXT    NOT NULL DEFAULT '🔖',
  -- Type de personnel autorisé
  allowed_types   TEXT    NOT NULL DEFAULT 'salarie,renfort,benevole', -- JSON-like CSV
  -- Contraintes horaires
  min_staff_hour  INTEGER NOT NULL DEFAULT 1,  -- nb min par créneau
  max_staff_hour  INTEGER NOT NULL DEFAULT 99,
  -- Fonctions qui peuvent se cumuler (affichage overlay)
  compatible_with TEXT,   -- CSV de function slugs
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- SALARIÉS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  firstname    TEXT    NOT NULL,
  lastname     TEXT    NOT NULL,
  initials     TEXT    NOT NULL,
  email        TEXT    UNIQUE COLLATE NOCASE,
  phone        TEXT,
  team_id      INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL DEFAULT 'salarie'
                       CHECK(type IN ('salarie','renfort','benevole','independant')),
  -- Contrat principal (peut être 0 pour vacation)
  contract_h   REAL    NOT NULL DEFAULT 0,
  -- Taux horaire de base (peut être surchargé par fonction)
  hourly_rate  REAL    NOT NULL DEFAULT 0,
  -- Taux de charges patronales (ex: 0.45 = 45%)
  charge_rate  REAL    NOT NULL DEFAULT 0.45,
  color        TEXT    NOT NULL DEFAULT '#8B8880',
  avatar_url   TEXT,
  note         TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  -- RH
  hire_date    TEXT,
  end_date     TEXT,
  siret        TEXT,    -- Pour les indépendants
  -- Soldes congés
  cp_balance   REAL    NOT NULL DEFAULT 0,   -- jours CP restants
  rtt_balance  REAL    NOT NULL DEFAULT 0,
  -- Hiérarchie (manager direct pour validation congés)
  manager_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- Niveau de validation requis pour les congés
  leave_approval_level INTEGER NOT NULL DEFAULT 1, -- 1=manager direct, 2=RH, 3=direction
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Vue pratique : nom complet
CREATE VIEW IF NOT EXISTS v_staff AS
  SELECT *, firstname || ' ' || lastname AS fullname
  FROM staff;

-- ────────────────────────────────────────────────────────────
-- STAFF ↔ FONCTIONS (relation N-N avec taux spécifique)
-- Un salarié peut avoir plusieurs fonctions
-- Chaque fonction peut avoir un taux horaire différent
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_functions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  function_id     INTEGER NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  -- Taux horaire spécifique à cette fonction (surcharge le taux de base)
  hourly_rate     REAL,   -- NULL = utiliser le taux de base du salarié
  -- Niveau de compétence / qualification
  level           TEXT    DEFAULT 'confirmé'
                          CHECK(level IN ('stagiaire','débutant','confirmé','expert','responsable')),
  certified_until TEXT,   -- Date d'expiration d'une certification
  is_primary      INTEGER NOT NULL DEFAULT 0, -- Fonction principale
  active          INTEGER NOT NULL DEFAULT 1,
  since           TEXT,
  note            TEXT,
  UNIQUE(staff_id, function_id)
);

-- ────────────────────────────────────────────────────────────
-- DISPONIBILITÉS PAR SALARIÉ (récurrentes ou ponctuelles)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availabilities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id     INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  hour_start   INTEGER NOT NULL CHECK(hour_start BETWEEN 0 AND 23),
  hour_end     INTEGER NOT NULL CHECK(hour_end BETWEEN 1 AND 24),
  function_id  INTEGER REFERENCES functions(id) ON DELETE SET NULL,
  recurrent    INTEGER NOT NULL DEFAULT 1,
  valid_from   TEXT,
  valid_until  TEXT,
  note         TEXT,
  UNIQUE(staff_id, day_of_week, hour_start, function_id)
);

-- ────────────────────────────────────────────────────────────
-- MODÈLES DE PLANNING (templates réutilisables)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,
  description  TEXT,
  function_id  INTEGER REFERENCES functions(id) ON DELETE CASCADE,
  is_default   INTEGER NOT NULL DEFAULT 0,
  -- Période de validité (NULL = toujours valide)
  valid_from   TEXT,   -- ex: début d'année scolaire
  valid_until  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by   INTEGER REFERENCES users(id)
);

-- ────────────────────────────────────────────────────────────
-- PLANNINGS HEBDOMADAIRES
-- Clé: week_start + function_id (chaque fonction a son propre planning)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start   TEXT    NOT NULL,  -- YYYY-MM-DD (lundi)
  function_id  INTEGER NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  template_id  INTEGER REFERENCES schedule_templates(id) ON DELETE SET NULL,
  status       TEXT    NOT NULL DEFAULT 'draft'
                       CHECK(status IN ('draft','published','archived')),
  note         TEXT,
  published_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by   INTEGER REFERENCES users(id),
  UNIQUE(week_start, function_id)
);

-- Créneaux : un salarié, dans une fonction, un jour+heure
CREATE TABLE IF NOT EXISTS schedule_slots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id  INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  staff_id     INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  hour_start   INTEGER NOT NULL CHECK(hour_start BETWEEN 0 AND 23),
  hour_end     INTEGER NOT NULL CHECK(hour_end BETWEEN 1 AND 24),
  -- Rôle spécifique dans ce créneau (ex: responsable ouverture)
  sub_role     TEXT,
  note         TEXT,
  -- Statut du créneau (confirmé / à valider / absent)
  status       TEXT    NOT NULL DEFAULT 'confirmed'
                       CHECK(status IN ('confirmed','pending','absent','replaced')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(schedule_id, staff_id, day_of_week, hour_start)
);

-- ────────────────────────────────────────────────────────────
-- UTILISATEURS APPLICATION
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password     TEXT    NOT NULL,
  role         TEXT    NOT NULL DEFAULT 'viewer'
                       CHECK(role IN ('superadmin','admin','manager','rh','viewer','staff')),
  staff_id     INTEGER UNIQUE REFERENCES staff(id) ON DELETE SET NULL,
  -- Périmètre de management (équipes dont il gère les congés)
  managed_team_ids TEXT,  -- CSV d'ids
  active       INTEGER NOT NULL DEFAULT 1,
  last_login   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- TYPES DE CONGÉS / ABSENCES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT    NOT NULL UNIQUE,
  label            TEXT    NOT NULL,
  short_label      TEXT    NOT NULL,
  color            TEXT    NOT NULL DEFAULT '#8B8880',
  bg_color         TEXT    NOT NULL DEFAULT '#F5F5F5',
  paid             INTEGER NOT NULL DEFAULT 1,
  -- Décompte
  count_method     TEXT    NOT NULL DEFAULT 'working_days'
                           CHECK(count_method IN ('working_days','calendar_days','hours')),
  -- Niveaux d'approbation requis (JSON: [niveau1, niveau2, ...])
  approval_levels  TEXT    NOT NULL DEFAULT '["manager"]',
  -- Délai de demande minimum (jours avant)
  min_notice_days  INTEGER NOT NULL DEFAULT 0,
  max_consecutive  INTEGER,  -- Nb max de jours consécutifs
  requires_doc     INTEGER NOT NULL DEFAULT 0,  -- Justificatif obligatoire
  active           INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- DEMANDES DE CONGÉS — workflow hiérarchique complet
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaves (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id      INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type_id       INTEGER NOT NULL REFERENCES leave_types(id),
  start_date    TEXT    NOT NULL,
  end_date      TEXT    NOT NULL,
  days_count    REAL    NOT NULL DEFAULT 0,
  hours_count   REAL    NOT NULL DEFAULT 0,
  -- Statut global
  status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('draft','pending','approved_n1','approved_n2','approved','refused','cancelled')),
  -- Niveau d'approbation actuel (0=brouillon, 1=attente N1, 2=attente N2, 99=terminé)
  approval_step INTEGER NOT NULL DEFAULT 1,
  -- Raison / commentaire du salarié
  reason        TEXT,
  -- Document justificatif (path)
  document_url  TEXT,
  -- Approbation N1 (manager direct)
  n1_approver_id    INTEGER REFERENCES users(id),
  n1_status         TEXT CHECK(n1_status IN ('pending','approved','refused')),
  n1_comment        TEXT,
  n1_reviewed_at    TEXT,
  -- Approbation N2 (RH)
  n2_approver_id    INTEGER REFERENCES users(id),
  n2_status         TEXT CHECK(n2_status IN ('pending','approved','refused')),
  n2_comment        TEXT,
  n2_reviewed_at    TEXT,
  -- Approbation N3 (Direction — si requis)
  n3_approver_id    INTEGER REFERENCES users(id),
  n3_status         TEXT CHECK(n3_status IN ('pending','approved','refused')),
  n3_comment        TEXT,
  n3_reviewed_at    TEXT,
  -- Méta
  submitted_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Notifications de congés
CREATE TABLE IF NOT EXISTS leave_notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_id    INTEGER NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        TEXT    NOT NULL, -- 'new_request','approved','refused','reminder'
  read_at     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- RELEVÉS D'HEURES (heures réellement effectuées)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id      INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  function_id   INTEGER REFERENCES functions(id) ON DELETE SET NULL,
  work_date     TEXT    NOT NULL,
  time_in       TEXT,
  time_out      TEXT,
  break_min     INTEGER NOT NULL DEFAULT 0,
  hours_worked  REAL    GENERATED ALWAYS AS (
    CASE WHEN time_in IS NOT NULL AND time_out IS NOT NULL THEN
      ROUND(((CAST(substr(time_out,1,2) AS REAL)*60 + CAST(substr(time_out,4,2) AS REAL))
      - (CAST(substr(time_in,1,2) AS REAL)*60 + CAST(substr(time_in,4,2) AS REAL))
      - break_min) / 60.0, 2)
    ELSE hours_manual END
  ) STORED,
  hours_manual  REAL    DEFAULT 0,  -- Saisie manuelle si pas de pointage
  overtime      REAL    NOT NULL DEFAULT 0,
  note          TEXT,
  validated     INTEGER NOT NULL DEFAULT 0,
  validated_by  INTEGER REFERENCES users(id),
  validated_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- PARAMÈTRES APPLICATION
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  type        TEXT NOT NULL DEFAULT 'string'
                   CHECK(type IN ('string','number','boolean','json')),
  description TEXT,
  group_name  TEXT NOT NULL DEFAULT 'general',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- JOURNAL D'AUDIT
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT    NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  old_data    TEXT,
  new_data    TEXT,
  ip_addr     TEXT,
  user_agent  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ════════════════════════════════════════════════════════════
-- INDEX DE PERFORMANCE
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_staff_team        ON staff(team_id);
CREATE INDEX IF NOT EXISTS idx_staff_functions   ON staff_functions(staff_id, function_id);
CREATE INDEX IF NOT EXISTS idx_schedules_week    ON schedules(week_start, function_id);
CREATE INDEX IF NOT EXISTS idx_slots_schedule    ON schedule_slots(schedule_id);
CREATE INDEX IF NOT EXISTS idx_slots_staff       ON schedule_slots(staff_id);
CREATE INDEX IF NOT EXISTS idx_leaves_staff      ON leaves(staff_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leaves_status     ON leaves(status, approval_step);
CREATE INDEX IF NOT EXISTS idx_timesheets_staff  ON timesheets(staff_id, work_date);
CREATE INDEX IF NOT EXISTS idx_audit_created     ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_user        ON leave_notifications(user_id, read_at);

-- ════════════════════════════════════════════════════════════
-- DONNÉES INITIALES
-- ════════════════════════════════════════════════════════════

-- ── Équipes ──────────────────────────────────────────────────
INSERT OR IGNORE INTO teams (name, slug, description, color, bg_color, icon, sort_order) VALUES
  ('Direction',           'direction',    'Direction générale et administration', '#C5753A', '#FFF4EC', '🏛️', 1),
  ('Accueil',             'accueil',      'Équipe accueil et caisse',            '#EC4899', '#FDF2F8', '🏠', 2),
  ('Technique',           'technique',    'Ouverture, entretien, voies',         '#0EA5E9', '#F0F9FF', '🔧', 3),
  ('Enseignement',        'enseignement', 'Moniteurs et encadrants',             '#4A8C6E', '#EBF5F0', '🧗', 4),
  ('Renforts',            'renforts',     'Renforts ponctuels et saisonniers',   '#06B6D4', '#ECFEFF', '⚡', 5),
  ('Bénévoles',           'benevoles',    'Équipe bénévole',                     '#8B5CF6', '#F5F3FF', '💜', 6);

-- ── Fonctions / Postes ───────────────────────────────────────
INSERT OR IGNORE INTO functions (name, slug, description, color, bg_color, icon, min_staff_hour, sort_order) VALUES
  -- Accueil
  ('Accueil / Caisse',    'accueil',        'Tenue du poste accueil et caisse',          '#EC4899', '#FDF2F8', '🎫', 1, 1),
  ('Bureau / Admin',      'bureau',         'Tâches administratives et bureau',          '#C5753A', '#FFF4EC', '📋', 1, 2),
  -- Ouverture
  ('Ouverture',           'ouverture',      'Ouverture de la salle le matin',            '#22C55E', '#F0FDF4', '🔓', 1, 3),
  ('Fermeture',           'fermeture',      'Fermeture de la salle le soir',             '#6366F1', '#EEF2FF', '🔒', 1, 4),
  -- Technique
  ('Ouverture de voies',  'ouverture_voies','Tracé et ouverture de nouvelles voies',     '#F97316', '#FFF7ED', '🪨', 1, 5),
  ('Entretien / Nettoyage','nettoyage',     'Nettoyage et entretien des équipements',    '#64748B', '#F1F5F9', '🧹', 1, 6),
  ('Maintenance',         'maintenance',    'Maintenance technique de la salle',         '#0EA5E9', '#F0F9FF', '🔧', 1, 7),
  -- Enseignement
  ('Moniteur',            'moniteur',       'Animation de séances et cours',             '#4A8C6E', '#EBF5F0', '🧗', 1, 8),
  ('Encadrant',           'encadrant',      'Encadrement de groupes',                    '#059669', '#ECFDF5', '👷', 1, 9),
  ('Formation',           'formation',      'Dispensation de formations',                '#7C3AED', '#F5F3FF', '📚', 1, 10),
  -- Autres
  ('Renfort général',     'renfort',        'Renfort polyvalent selon besoins',          '#06B6D4', '#ECFEFF', '⚡', 1, 11),
  ('Événementiel',        'evenement',      'Organisation et animation événements',      '#F59E0B', '#FFFBEB', '🎉', 1, 12),
  ('Bénévolat',           'benevole',       'Missions bénévoles diverses',               '#8B5CF6', '#F5F3FF', '💜', 0, 13),
  ('Service Civique',     'service_civique','Mission de service civique',                '#059669', '#D1FAE5', '🌿', 0, 14);

-- ── Types de congés ──────────────────────────────────────────
INSERT OR IGNORE INTO leave_types (slug, label, short_label, color, bg_color, paid, count_method, approval_levels, min_notice_days, requires_doc) VALUES
  ('cp',          'Congé payé',              'CP',   '#22C55E', '#F0FDF4', 1, 'working_days',  '["manager","rh"]',            14, 0),
  ('rtt',         'RTT',                     'RTT',  '#6366F1', '#EEF2FF', 1, 'working_days',  '["manager"]',                  7, 0),
  ('maladie',     'Arrêt maladie',           'MAL',  '#EF4444', '#FEF2F2', 1, 'calendar_days', '["rh"]',                       0, 1),
  ('accident',    'Accident du travail',     'AT',   '#DC2626', '#FEF2F2', 1, 'calendar_days', '["rh","direction"]',            0, 1),
  ('formation',   'Formation professionnelle','FORM', '#06B6D4', '#ECFEFF', 1, 'working_days',  '["manager","rh"]',              7, 0),
  ('sans_solde',  'Congé sans solde',        'CSS',  '#64748B', '#F1F5F9', 0, 'calendar_days', '["manager","rh","direction"]', 30, 0),
  ('maternite',   'Congé maternité/paternité','MAT', '#EC4899', '#FDF2F8', 1, 'calendar_days', '["rh","direction"]',            0, 1),
  ('evenement',   'Événement familial',      'EVT',  '#F59E0B', '#FFFBEB', 1, 'working_days',  '["manager"]',                   3, 1),
  ('recup',       'Récupération heures',     'REC',  '#8B5CF6', '#F5F3FF', 1, 'hours',         '["manager"]',                   2, 0),
  ('convent',     'Convention collective',   'CC',   '#0EA5E9', '#F0F9FF', 1, 'working_days',  '["rh"]',                        0, 0);

-- ── Paramètres application ───────────────────────────────────
INSERT OR IGNORE INTO settings (key, value, type, description, group_name) VALUES
  ('club_name',           'minéral Spirit',  'string',  'Nom du club',                         'general'),
  ('club_address',        '',                'string',  'Adresse',                             'general'),
  ('opening_hour',        '8',               'number',  'Heure ouverture',                     'general'),
  ('closing_hour',        '22',              'number',  'Heure fermeture',                     'general'),
  ('charges_coeff',       '1.42',            'number',  'Coefficient charges patronales',       'finance'),
  ('currency',            'EUR',             'string',  'Devise',                              'finance'),
  ('timezone',            'Europe/Paris',    'string',  'Fuseau horaire',                      'general'),
  ('week_start_day',      '1',               'number',  'Jour de début de semaine (1=Lundi)', 'planning'),
  ('leave_auto_notify',   'true',            'boolean', 'Notifier auto responsables congés',   'leaves'),
  ('leave_min_cp_balance','0',               'number',  'Solde CP minimum autorisé',           'leaves'),
  ('overlap_alert',       'true',            'boolean', 'Alerte superposition de plannings',   'planning'),
  ('app_version',         '2.0.0',           'string',  'Version application',                 'system');

-- ── Comptes initiaux ─────────────────────────────────────────
-- Les comptes superadmin et admin sont créés automatiquement au premier
-- démarrage par la migration "first_install_accounts" dans database.js,
-- à partir des variables d'environnement SUPERADMIN_* et ADMIN_* du .env.
-- Aucun compte hardcodé ici pour des raisons de sécurité.
