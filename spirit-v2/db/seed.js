'use strict';
/**
 * Seed — injecte les données initiales de spirit-staff-v3.html dans la DB SQLite.
 * Idempotent : utilise INSERT OR IGNORE pour ne pas dupliquer.
 * Usage : node db/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { initSchema, db_ } = require('./database');

initSchema();
console.log('[seed] Schéma initialisé ✓');

// ── STAFF ────────────────────────────────────────────────────
// Correspondance slug → id DB (résolu après INSERT)
const staffMap    = {}; // htmlId   → db.id
const teamIdMap   = {}; // teamSlug → db.id
const fnIdMap     = {}; // fnSlug   → db.id
const userIdMap   = {}; // email    → db.id

// Charger les teams et functions (insertées par schema.sql)
for (const t of db_.all('SELECT id, slug FROM teams')) teamIdMap[t.slug] = t.id;
for (const f of db_.all('SELECT id, slug FROM functions')) fnIdMap[f.slug] = f.id;
console.log('[seed] Teams chargées:', Object.keys(teamIdMap));
console.log('[seed] Functions chargées:', Object.keys(fnIdMap));

// ── Données INIT_STAFF du HTML ───────────────────────────────
const INIT_STAFF = [
  { htmlId:1,  name:'Marion',    initials:'MA', contract:35, team:'accueil',    type:'salarie',    rate:14.50, color:'#6366F1', functions:['accueil','bureau','ouverture','fermeture'],        primary:'bureau',          managerHtmlId:null, cp:25, rtt:5,  phone:'06 11 22 33 44', email:'marion@mineral-spirit.fr',    hire:'2019-09-01', note:'Responsable accueil' },
  { htmlId:2,  name:'Joséphine', initials:'JO', contract:25, team:'accueil',    type:'salarie',    rate:12.50, color:'#EC4899', functions:['accueil','bureau','ouverture','fermeture'],        primary:'accueil',         managerHtmlId:1,    cp:20, rtt:3, phone:'06 22 33 44 55', email:'josephine@mineral-spirit.fr', hire:'2021-01-15', note:'Bureau et accueil' },
  { htmlId:3,  name:'Eva',       initials:'EV', contract:25, team:'accueil',    type:'salarie',    rate:12.50, color:'#14B8A6', functions:['accueil','ouverture','fermeture'],                 primary:'accueil',         managerHtmlId:1,    cp:22, rtt:3, phone:'06 33 44 55 66', email:'eva@mineral-spirit.fr',       hire:'2020-06-01', note:'Mercredi + Samedi' },
  { htmlId:4,  name:'Brigitte',  initials:'BR', contract:26, team:'accueil',    type:'salarie',    rate:12.00, color:'#F97316', functions:['accueil','ouverture','fermeture'],                 primary:'accueil',         managerHtmlId:1,    cp:18, rtt:2, phone:'06 44 55 66 77', email:'brigitte@mineral-spirit.fr',  hire:'2018-03-01', note:'Week-end principalement' },
  { htmlId:5,  name:'Marine',    initials:'MR', contract:35, team:'technique',  type:'salarie',    rate:13.50, color:'#8B5CF6', functions:['ouverture_voies','nettoyage','bureau','ouverture'], primary:'ouverture_voies', managerHtmlId:null, cp:28, rtt:5, phone:'06 55 66 77 88', email:'marine@mineral-spirit.fr',    hire:'2017-09-01', note:'Bricolages et ouverture voies' },
  { htmlId:6,  name:'Daphné',    initials:'DA', contract:0,  team:'renforts',   type:'renfort',    rate:11.50, color:'#06B6D4', functions:['accueil','renfort'],                              primary:'renfort',         managerHtmlId:1,    cp:0,  rtt:0, phone:'06 66 77 88 99', email:'daphne@email.fr',             hire:'2022-09-01', note:'Renfort Lundi' },
  { htmlId:7,  name:'Zélie',     initials:'ZE', contract:0,  team:'renforts',   type:'renfort',    rate:11.00, color:'#22C55E', functions:['renfort','accueil'],                              primary:'renfort',         managerHtmlId:1,    cp:0,  rtt:0, phone:'06 77 88 99 00', email:'zelie@email.fr',              hire:'2023-01-01', note:'Renfort ponctuel' },
  { htmlId:8,  name:'Matéo',     initials:'MT', contract:0,  team:'renforts',   type:'renfort',    rate:11.50, color:'#F59E0B', functions:['renfort','moniteur','accueil'],                   primary:'renfort',         managerHtmlId:5,    cp:0,  rtt:0, phone:'06 88 99 00 11', email:'mateo@email.fr',              hire:'2022-06-01', note:'Multi-jours' },
  { htmlId:9,  name:'Julie',     initials:'JU', contract:0,  team:'renforts',   type:'renfort',    rate:11.00, color:'#EF4444', functions:['accueil','renfort'],                              primary:'renfort',         managerHtmlId:1,    cp:0,  rtt:0, phone:'06 99 00 11 22', email:'julie@email.fr',              hire:'2023-03-01', note:'Mer/Jeu/Dim' },
  { htmlId:10, name:'Anaïs',     initials:'AN', contract:0,  team:'renforts',   type:'renfort',    rate:11.00, color:'#A855F7', functions:['renfort'],                                        primary:'renfort',         managerHtmlId:1,    cp:0,  rtt:0, phone:'07 00 11 22 33', email:'anais@email.fr',              hire:'2023-09-01', note:'Vendredi uniquement' },
];

// Première passe : insérer sans manager_id
for (const s of INIT_STAFF) {
  const exist = db_.get('SELECT id FROM staff WHERE email = ?', [s.email]);
  if (exist) {
    staffMap[s.htmlId] = exist.id;
    continue;
  }
  const nameParts = s.name.split(' ');
  const r = db_.run(
    `INSERT INTO staff
       (firstname, lastname, initials, email, phone, team_id, type,
        contract_h, hourly_rate, color, note, hire_date, cp_balance, rtt_balance, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      nameParts[0],
      nameParts.slice(1).join(' ') || '',
      s.initials,
      s.email,
      s.phone,
      teamIdMap[s.team] || null,
      s.type,
      s.contract,
      s.rate,
      s.color,
      s.note,
      s.hire,
      s.cp,
      s.rtt,
    ]
  );
  staffMap[s.htmlId] = r.lastInsertRowid;
}
console.log('[seed] Staff insérés ✓', staffMap);

// Deuxième passe : mettre à jour manager_id
for (const s of INIT_STAFF) {
  if (!s.managerHtmlId) continue;
  const managerId = staffMap[s.managerHtmlId];
  if (managerId) {
    db_.run('UPDATE staff SET manager_id = ? WHERE id = ?', [managerId, staffMap[s.htmlId]]);
  }
}
console.log('[seed] Manager IDs mis à jour ✓');

// Troisième passe : staff_functions
for (const s of INIT_STAFF) {
  const staffDbId = staffMap[s.htmlId];
  for (const fnSlug of s.functions) {
    const fnDbId = fnIdMap[fnSlug];
    if (!fnDbId) continue;
    db_.run(
      `INSERT OR IGNORE INTO staff_functions (staff_id, function_id, is_primary, active)
       VALUES (?, ?, ?, 1)`,
      [staffDbId, fnDbId, fnSlug === s.primary ? 1 : 0]
    );
  }
}
console.log('[seed] Staff-Functions insérés ✓');

// ── USERS ─────────────────────────────────────────────────────
const INIT_USERS = [
  // Note : le compte superadmin (développeur) est créé automatiquement par la
  // migration first_install_accounts dans database.js via les variables .env.
  // Ce seed crée uniquement les données de démonstration / spécifiques au club.
  { email: 'admin@mineral-spirit.fr',     password: 'Spirit2025!', role: 'admin',   staffEmail: null },
  { email: 'marion@mineral-spirit.fr',    password: 'Marion2025',  role: 'manager', staffEmail: 'marion@mineral-spirit.fr' },
  { email: 'josephine@mineral-spirit.fr', password: 'Jose2025',    role: 'staff',   staffEmail: 'josephine@mineral-spirit.fr' },
  { email: 'eva@mineral-spirit.fr',       password: 'Eva2025',     role: 'staff',   staffEmail: 'eva@mineral-spirit.fr' },
  { email: 'brigitte@mineral-spirit.fr',  password: 'Brig2025',    role: 'staff',   staffEmail: 'brigitte@mineral-spirit.fr' },
  { email: 'marine@mineral-spirit.fr',    password: 'Marine2025',  role: 'manager', staffEmail: 'marine@mineral-spirit.fr' },
  { email: 'mateo@email.fr',              password: 'Mateo2025',   role: 'staff',   staffEmail: 'mateo@email.fr' },
];

for (const u of INIT_USERS) {
  const hash    = bcrypt.hashSync(u.password, 10); // saltRounds=10 pour le seed (plus rapide que 12)
  const staffRec = u.staffEmail
    ? db_.get('SELECT id FROM staff WHERE email = ?', [u.staffEmail])
    : null;

  const exist = db_.get('SELECT id FROM users WHERE email = ?', [u.email]);
  if (exist) {
    // Mettre à jour le mot de passe et le rôle (permet de ré-exécuter le seed)
    db_.run(
      'UPDATE users SET password = ?, role = ?, staff_id = COALESCE(?, staff_id) WHERE email = ?',
      [hash, u.role, staffRec?.id || null, u.email]
    );
    userIdMap[u.email] = exist.id;
  } else {
    const r = db_.run(
      'INSERT INTO users (email, password, role, staff_id, active) VALUES (?, ?, ?, ?, 1)',
      [u.email, hash, u.role, staffRec?.id || null]
    );
    userIdMap[u.email] = r.lastInsertRowid;
  }
}
console.log('[seed] Users insérés ✓');

// ── LEAVES (exemples) ─────────────────────────────────────────
const cpTypeId  = db_.get("SELECT id FROM leave_types WHERE slug='cp'")?.id;
const rttTypeId = db_.get("SELECT id FROM leave_types WHERE slug='rtt'")?.id;
const forTypeId = db_.get("SELECT id FROM leave_types WHERE slug='formation'")?.id;

// Approver N1 = compte admin ou superadmin (premier trouvé)
const adminUser = db_.get("SELECT id FROM users WHERE role IN ('admin','superadmin') LIMIT 1");

function seedLeave(staffHtmlId, typeId, start, end, days, status) {
  const sid = staffMap[staffHtmlId];
  if (!sid || !typeId) return;
  const exist = db_.get('SELECT id FROM leaves WHERE staff_id=? AND start_date=?', [sid, start]);
  if (exist) return;
  db_.run(
    `INSERT INTO leaves
       (staff_id, type_id, start_date, end_date, days_count, status, approval_step,
        submitted_at, n1_approver_id, n1_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'pending')`,
    [sid, typeId, start, end, days, status, status === 'approved' ? 99 : 1, adminUser?.id || null]
  );
}

seedLeave(4, cpTypeId,  '2026-03-23', '2026-03-29', 5, 'approved');
seedLeave(3, cpTypeId,  '2026-04-07', '2026-04-14', 5, 'pending');
seedLeave(2, rttTypeId, '2026-04-21', '2026-04-25', 3, 'approved_n1');
seedLeave(8, forTypeId, '2026-04-14', '2026-04-14', 1, 'pending');
seedLeave(5, cpTypeId,  '2026-05-12', '2026-05-16', 5, 'pending');
console.log('[seed] Congés d\'exemple insérés ✓');

// ── SCHEDULES (planning de démonstration) ────────────────────
// Semaine courante (lundi)
function getWeekStart() {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

const WEEK = getWeekStart();
const adminDbId = adminUser?.id || null;

/** Retourne/crée le schedule_id pour (week, functionSlug) */
function getOrCreateSchedule(fnSlug) {
  const fnId = fnIdMap[fnSlug];
  if (!fnId) return null;
  const existing = db_.get('SELECT id FROM schedules WHERE week_start=? AND function_id=?', [WEEK, fnId]);
  if (existing) return existing.id;
  const r = db_.run(
    `INSERT INTO schedules (week_start, function_id, status, created_by) VALUES (?, ?, 'published', ?)`,
    [WEEK, fnId, adminDbId]
  );
  return r.lastInsertRowid;
}

/** Ajoute un créneau de heure_début à heure_fin - 1 pour chaque heure */
function addSlots(fnSlug, staffHtmlId, day, hourStart, hourEnd) {
  const scId   = getOrCreateSchedule(fnSlug);
  const staffId = staffMap[staffHtmlId];
  if (!scId || !staffId) return;
  for (let h = hourStart; h < hourEnd; h++) {
    db_.run(
      `INSERT OR IGNORE INTO schedule_slots
         (schedule_id, staff_id, day_of_week, hour_start, hour_end)
       VALUES (?, ?, ?, ?, ?)`,
      [scId, staffId, day, h, h + 1]
    );
  }
}

// Accueil
addSlots('accueil', 1, 0, 16, 22); addSlots('accueil', 2, 0, 11, 13); addSlots('accueil', 6, 0, 13, 16);
addSlots('accueil', 1, 1, 18, 20); addSlots('accueil', 2, 1, 11, 15); addSlots('accueil', 8, 1, 12, 14);
addSlots('accueil', 3, 2,  9, 17); addSlots('accueil', 4, 2, 10, 15); addSlots('accueil', 8, 2, 13, 18);
addSlots('accueil', 1, 3, 11, 15); addSlots('accueil', 2, 3, 15, 19); addSlots('accueil', 9, 3, 12, 15);
addSlots('accueil', 1, 4, 14, 17); addSlots('accueil', 2, 4, 11, 14); addSlots('accueil', 10, 4, 12, 14);
addSlots('accueil', 3, 5,  9, 19); addSlots('accueil', 4, 5, 11, 19);
addSlots('accueil', 4, 6, 10, 18);

// Bureau
addSlots('bureau', 1, 0,  9, 14); addSlots('bureau', 1, 1,  9, 12); addSlots('bureau', 2, 2,  9, 12);
addSlots('bureau', 2, 3,  9, 12); addSlots('bureau', 1, 4,  9, 11); addSlots('bureau', 5, 1, 13, 17);
addSlots('bureau', 5, 3,  9, 14);

// Ouverture
addSlots('ouverture', 2, 0, 8, 10); addSlots('ouverture', 3, 1, 8, 10); addSlots('ouverture', 3, 2, 8, 10);
addSlots('ouverture', 2, 3, 8, 10); addSlots('ouverture', 4, 4, 8, 10); addSlots('ouverture', 3, 5, 8, 10);
addSlots('ouverture', 4, 6, 8, 10);

// Fermeture
addSlots('fermeture', 1, 0, 21, 22); addSlots('fermeture', 5, 1, 21, 22); addSlots('fermeture', 5, 2, 21, 22);
addSlots('fermeture', 3, 3, 21, 22); addSlots('fermeture', 4, 4, 21, 22); addSlots('fermeture', 4, 5, 21, 22);
addSlots('fermeture', 5, 6, 21, 22);

// Ouverture de voies
addSlots('ouverture_voies', 5, 1, 9, 13); addSlots('ouverture_voies', 5, 3, 14, 18); addSlots('ouverture_voies', 5, 6, 9, 14);

// Moniteur
addSlots('moniteur', 8, 2, 14, 18); addSlots('moniteur', 8, 5, 14, 18);
addSlots('moniteur', 9, 3, 14, 18); addSlots('moniteur', 9, 6, 14, 18);

// Renfort
addSlots('renfort', 6, 0, 13, 16); addSlots('renfort', 9, 3, 14, 18);
addSlots('renfort', 7, 6, 10, 14); addSlots('renfort', 10, 4, 12, 16);

// Nettoyage
addSlots('nettoyage', 5, 0, 8, 10); addSlots('nettoyage', 5, 2, 8, 10);
addSlots('nettoyage', 5, 4, 8, 10); addSlots('nettoyage', 5, 6, 8, 10);

console.log(`[seed] Planning semaine ${WEEK} inséré ✓`);
console.log('[seed] ✅ Base de données initialisée avec succès !');
console.log('[seed] 🔑 Compte admin : admin@mineral-spirit.fr / Spirit2025!');
