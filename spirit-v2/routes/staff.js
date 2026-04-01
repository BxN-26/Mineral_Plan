'use strict';
const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const sharp   = require('sharp');
const { db_ } = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { notify }                             = require('./notifications');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

const PERM_TO_ROLE  = { standard: 'staff', bureau: 'manager', direction: 'admin' };
const ROLE_TO_PERM  = { staff: 'standard', viewer: 'standard', manager: 'bureau', rh: 'bureau', admin: 'direction', superadmin: 'direction' };

/** Enrichit chaque staff avec ses fonctions (slugs) et ses équipes */
function withFunctions(staffRows) {
  return staffRows.map(s => {
    const fns = db_.all(
      `SELECT f.slug, f.id, f.name, f.color, f.bg_color, f.icon, sf.is_primary
       FROM staff_functions sf
       JOIN functions f ON f.id = sf.function_id
       WHERE sf.staff_id = ? AND sf.active = 1 AND f.active = 1
       ORDER BY sf.is_primary DESC, f.sort_order`,
      [s.id]
    );
    const primaryFn = fns.find(f => f.is_primary);
    const teams = db_.all(
      `SELECT t.id, t.name, t.slug, t.color, t.bg_color, t.icon, st.is_primary
       FROM staff_teams st JOIN teams t ON t.id = st.team_id
       WHERE st.staff_id = ? AND t.active = 1 ORDER BY st.is_primary DESC, t.sort_order`,
      [s.id]
    );
    const linkedUser = db_.get('SELECT role FROM users WHERE staff_id = ? AND active = 1', [s.id]);
    return {
      ...s,
      functions:        fns.map(f => f.slug),
      functions_detail: fns,
      primary_function: primaryFn?.slug || fns[0]?.slug || null,
      team_ids:         teams.map(t => t.id),
      teams_detail:     teams,
      user_role:        linkedUser?.role || null,
      permission_level: ROLE_TO_PERM[linkedUser?.role] || 'standard',
    };
  });
}

// ── GET /api/staff ────────────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const { team_id, type, active = '1' } = req.query;
  let sql = `
    SELECT s.*,
           t.name  AS team_name, t.slug AS team_slug,
           t.color AS team_color, t.bg_color AS team_bg,
           t.icon  AS team_icon,
           m.firstname || ' ' || m.lastname AS manager_name
    FROM staff s
    LEFT JOIN teams t ON t.id = s.team_id
    LEFT JOIN staff m ON m.id = s.manager_id
    WHERE s.active = ?`;
  const p = [active === '0' ? 0 : 1];
  if (team_id) { sql += ' AND s.team_id = ?'; p.push(team_id); }
  if (type)    { sql += ' AND s.type = ?';    p.push(type); }
  sql += ' ORDER BY s.firstname, s.lastname';
  res.json(withFunctions(db_.all(sql, p)));
});

// ── GET /api/staff/:id ────────────────────────────────────────
router.get('/:id', AUTH, (req, res) => {
  // Un staff ne peut voir que sa propre fiche
  if (req.user.role === 'staff' && req.user.staff_id !== Number(req.params.id))
    return res.status(403).json({ error: 'Accès refusé' });

  const s = db_.get(
    `SELECT s.*,
            t.name AS team_name, t.slug AS team_slug,
            t.color AS team_color, t.bg_color AS team_bg, t.icon AS team_icon
     FROM staff s LEFT JOIN teams t ON t.id = s.team_id
     WHERE s.id = ?`,
    [req.params.id]
  );
  if (!s) return res.status(404).json({ error: 'Salarié introuvable' });
  res.json(withFunctions([s])[0]);
});

// ── POST /api/staff ───────────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  // Lire les valeurs par défaut configurées
  const defCp     = db_.get("SELECT value FROM settings WHERE key='leave_default_cp_balance'");
  const defRtt    = db_.get("SELECT value FROM settings WHERE key='leave_default_rtt_balance'");
  const defCharge = db_.get("SELECT value FROM settings WHERE key='rh_default_charge_rate'");
  const defH      = db_.get("SELECT value FROM settings WHERE key='rh_default_contract_h'");

  const {
    firstname, lastname = '', initials, email, phone,
    team_id, team_ids,
    type = 'salarie',
    contract_base = (type === 'benevole' || type === 'renfort') ? 'aucune' : 'hebdomadaire',
    contract_h   = defH      ? Number(defH.value)      : 0,
    hourly_rate  = 0,
    charge_rate  = defCharge ? Number(defCharge.value) / 100 : 0.45,
    color = '#6366F1', note, hire_date,
    cp_balance   = defCp     ? Number(defCp.value)     : 25,
    rtt_balance  = defRtt    ? Number(defRtt.value)    : 5,
    manager_id, functions: fns = [], primary_function,
    permission_level, initial_password,
  } = req.body;

  if (!firstname) return res.status(400).json({ error: 'Prénom requis' });

  // Déduire la liste d'équipes (multi ou simple)
  const teamList = Array.isArray(team_ids) && team_ids.length
    ? team_ids.map(Number)
    : team_id ? [Number(team_id)] : [];
  const primaryTeamId = teamList[0] || null;

  const r = db_.run(
    `INSERT INTO staff
       (firstname, lastname, initials, email, phone, team_id, type,
        contract_base, contract_h, hourly_rate, color, note, hire_date,
        cp_balance, rtt_balance, manager_id, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [firstname, lastname, initials || firstname.slice(0, 2).toUpperCase(), email || null,
     phone || null, primaryTeamId, type, contract_base, contract_h, hourly_rate, color, note || null,
     hire_date || null, cp_balance, rtt_balance, manager_id || null]
  );
  const staffId = r.lastInsertRowid;

  // Assigner les équipes
  for (let i = 0; i < teamList.length; i++) {
    db_.run(
      'INSERT OR IGNORE INTO staff_teams (staff_id, team_id, is_primary) VALUES (?, ?, ?)',
      [staffId, teamList[i], i === 0 ? 1 : 0]
    );
  }

  // Assigner les fonctions
  for (const slug of fns) {
    const fn = db_.get('SELECT id FROM functions WHERE slug = ?', [slug]);
    if (fn) {
      db_.run(
        `INSERT OR IGNORE INTO staff_functions (staff_id, function_id, is_primary, active)
         VALUES (?, ?, ?, 1)`,
        [staffId, fn.id, slug === primary_function ? 1 : 0]
      );
    }
  }

  auditLog(req, 'STAFF_CREATE', 'staff', staffId, null, { firstname, email });

  // Créer/mettre à jour le compte utilisateur lié
  if (permission_level || initial_password) {
    const role    = PERM_TO_ROLE[permission_level] || 'staff';
    const existU  = db_.get('SELECT id FROM users WHERE staff_id = ?', [staffId]);
    if (existU) {
      db_.run('UPDATE users SET role = ? WHERE id = ?', [role, existU.id]);
    } else if (initial_password && email) {
      const hash = bcrypt.hashSync(initial_password, 12);
      db_.run(
        'INSERT OR IGNORE INTO users (email, password, role, staff_id, active, must_change_password) VALUES (?,?,?,?,1,1)',
        [email.toLowerCase().trim(), hash, role, staffId]
      );
    }
  }

  res.status(201).json({ id: staffId });
});

// ── PUT /api/staff/:id ────────────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const {
    firstname, lastname, initials, email, phone,
    team_id, team_ids,
    type, contract_base, contract_h, hourly_rate, charge_rate, color, note, hire_date,
    cp_balance, rtt_balance, manager_id, functions: fns, primary_function,
    active,
  } = req.body;

  const old = db_.get('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Salarié introuvable' });

  // manager_id peut être explicitement mis à null (retirer le responsable)
  const finalManagerId = 'manager_id' in req.body
    ? (manager_id ? Number(manager_id) : null)
    : old.manager_id;

  // Déduire équipe primaire pour team_id (colonne de compatibilité)
  let newTeamId = old.team_id;
  if (Array.isArray(team_ids)) {
    newTeamId = team_ids.length > 0 ? Number(team_ids[0]) : null;
  } else if (team_id !== undefined) {
    newTeamId = team_id || null;
  }

  db_.run(
    `UPDATE staff SET
       firstname     = COALESCE(?, firstname),
       lastname      = COALESCE(?, lastname),
       initials      = COALESCE(?, initials),
       email         = COALESCE(?, email),
       phone         = COALESCE(?, phone),
       team_id       = ?,
       type          = COALESCE(?, type),
       contract_base = COALESCE(?, contract_base),
       contract_h    = COALESCE(?, contract_h),
       hourly_rate   = COALESCE(?, hourly_rate),
       charge_rate   = COALESCE(?, charge_rate),
       color         = COALESCE(?, color),
       note          = COALESCE(?, note),
       hire_date     = COALESCE(?, hire_date),
       cp_balance    = COALESCE(?, cp_balance),
       rtt_balance   = COALESCE(?, rtt_balance),
       manager_id    = ?,
       active        = COALESCE(?, active),
       updated_at    = datetime('now')
     WHERE id = ?`,
    [firstname, lastname, initials, email, phone, newTeamId, type,
     contract_base ?? null, contract_h, hourly_rate, charge_rate ?? null, color, note, hire_date,
     cp_balance, rtt_balance, finalManagerId, active ?? null, req.params.id]
  );

  // Mettre à jour les équipes si fournies
  if (Array.isArray(team_ids)) {
    db_.run('DELETE FROM staff_teams WHERE staff_id = ?', [req.params.id]);
    for (let i = 0; i < team_ids.length; i++) {
      db_.run(
        'INSERT OR IGNORE INTO staff_teams (staff_id, team_id, is_primary) VALUES (?, ?, ?)',
        [req.params.id, Number(team_ids[i]), i === 0 ? 1 : 0]
      );
    }
  }

  // Mettre à jour les fonctions si fournies
  if (Array.isArray(fns)) {
    db_.run('UPDATE staff_functions SET active = 0 WHERE staff_id = ?', [req.params.id]);
    for (const slug of fns) {
      const fn = db_.get('SELECT id FROM functions WHERE slug = ?', [slug]);
      if (fn) {
        db_.run(
          `INSERT INTO staff_functions (staff_id, function_id, is_primary, active)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(staff_id, function_id) DO UPDATE SET active = 1, is_primary = excluded.is_primary`,
          [req.params.id, fn.id, slug === primary_function ? 1 : 0]
        );
      }
    }
  }

  auditLog(req, 'STAFF_UPDATE', 'staff', req.params.id, old, req.body);

  // Mettre à jour le rôle du compte lié si permission_level fourni
  const { permission_level } = req.body;
  if (permission_level !== undefined) {
    const role   = PERM_TO_ROLE[permission_level] || 'staff';
    const existU = db_.get('SELECT id FROM users WHERE staff_id = ?', [req.params.id]);
    if (existU) {
      db_.run('UPDATE users SET role = ? WHERE id = ?', [role, existU.id]);
    }
  }

  res.json({ message: 'Salarié mis à jour' });
});

// ── DELETE /api/staff/:id ─────────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  const s = db_.get('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Salarié introuvable' });

  // E7 — si ce salarié est approbateur de congés en attente, notifier les admins
  const staffUser = db_.get('SELECT id FROM users WHERE staff_id=? AND active=1', [req.params.id]);
  if (staffUser) {
    const stuckLeaves = db_.all(
      `SELECT id FROM leaves WHERE status IN ('pending','approved_n1','approved_n2')
       AND (
         (n1_approver_id=? AND n1_status='pending') OR
         (n2_approver_id=? AND n2_status='pending') OR
         (n3_approver_id=? AND n3_status='pending')
       )`,
      [staffUser.id, staffUser.id, staffUser.id]
    );
    if (stuckLeaves.length > 0) {
      const admins = db_.all(`SELECT u.id FROM users u WHERE u.active=1 AND u.role IN ('admin','superadmin')`);
      for (const admin of admins) {
        notify(admin.id, 'info',
          '⚠️ Congés en attente sans approbateur',
          `${stuckLeaves.length} demande(s) n'ont plus d'approbateur suite à la désactivation de ${s.firstname} ${s.lastname}. Traitez-les manuellement.`,
          'leave', null
        );
      }
    }
  }

  db_.run("UPDATE staff SET active = 0, updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  auditLog(req, 'STAFF_DELETE', 'staff', req.params.id, s, null);
  res.json({ message: 'Salarié supprimé' });
});

// ── POST /api/staff/:id/avatar ────────────────────────────────
// Upload + compression photo (max 500 Ko après resize 300×300)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 8 * 1024 * 1024 }, // 8 Mo en entrée max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Fichier image requis'));
    cb(null, true);
  },
});

router.post('/:id/avatar', AUTH, upload.single('avatar'), async (req, res) => {
  // Un salarié peut changer sa propre photo ; l'admin peut changer n'importe laquelle
  const isAdmin = ['admin', 'superadmin', 'manager'].includes(req.user.role);
  const staffId = Number(req.params.id);
  if (!isAdmin && req.user.staff_id !== staffId)
    return res.status(403).json({ error: 'Accès refusé' });

  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  // M3 — vérification magic bytes (ne pas se fier uniquement au MIME déclaré par le client)
  const hdr = req.file.buffer;
  const isJpeg = hdr[0] === 0xFF && hdr[1] === 0xD8 && hdr[2] === 0xFF;
  const isPng  = hdr[0] === 0x89 && hdr[1] === 0x50 && hdr[2] === 0x4E && hdr[3] === 0x47;
  const isWebp = hdr[0] === 0x52 && hdr[1] === 0x49 && hdr[2] === 0x46 && hdr[3] === 0x46
              && hdr[8] === 0x57 && hdr[9] === 0x45 && hdr[10] === 0x42 && hdr[11] === 0x50;
  if (!isJpeg && !isPng && !isWebp)
    return res.status(400).json({ error: 'Format image invalide — JPEG, PNG ou WebP uniquement' });

  const s = db_.get('SELECT * FROM staff WHERE id = ?', [staffId]);
  if (!s) return res.status(404).json({ error: 'Salarié introuvable' });

  // Supprimer l'ancienne photo si elle existe
  if (s.avatar_url) {
    const old = path.join(__dirname, '..', 'uploads', 'avatars',
      path.basename(s.avatar_url));
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }

  // Compresser + retailler en carré 300×300, max ~120 Ko
  const filename = `${staffId}_${Date.now()}.webp`;
  const avatarsDir = path.join(__dirname, '..', 'uploads', 'avatars');
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
  const dest     = path.join(avatarsDir, filename);
  await sharp(req.file.buffer)
    .resize(300, 300, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toFile(dest);

  const url = `/uploads/avatars/${filename}`;
  db_.run("UPDATE staff SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?",
    [url, staffId]);

  res.json({ avatar_url: url });
});

// ── DELETE /api/staff/:id/avatar ──────────────────────────────
router.delete('/:id/avatar', AUTH, (req, res) => {
  const isAdmin = ['admin', 'superadmin', 'manager'].includes(req.user.role);
  const staffId = Number(req.params.id);
  if (!isAdmin && req.user.staff_id !== staffId)
    return res.status(403).json({ error: 'Accès refusé' });

  const s = db_.get('SELECT avatar_url FROM staff WHERE id = ?', [staffId]);
  if (s?.avatar_url) {
    const p = path.join(__dirname, '..', 'uploads', 'avatars', path.basename(s.avatar_url));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db_.run("UPDATE staff SET avatar_url = NULL, updated_at = datetime('now') WHERE id = ?", [staffId]);
  res.json({ message: 'Avatar supprimé' });
});

module.exports = router;
