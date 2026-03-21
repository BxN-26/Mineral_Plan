'use strict';
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const sharp  = require('sharp');
const { db_ } = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

/** Enrichit chaque staff avec ses fonctions (slugs) */
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
    return {
      ...s,
      functions:        fns.map(f => f.slug),
      functions_detail: fns,
      primary_function: primaryFn?.slug || fns[0]?.slug || null,
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
  const {
    firstname, lastname = '', initials, email, phone,
    team_id, type = 'salarie', contract_h = 0, hourly_rate = 0,
    color = '#6366F1', note, hire_date, cp_balance = 0, rtt_balance = 0,
    manager_id, functions: fns = [], primary_function,
  } = req.body;

  if (!firstname) return res.status(400).json({ error: 'Prénom requis' });

  const r = db_.run(
    `INSERT INTO staff
       (firstname, lastname, initials, email, phone, team_id, type,
        contract_h, hourly_rate, color, note, hire_date,
        cp_balance, rtt_balance, manager_id, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [firstname, lastname, initials || firstname.slice(0, 2).toUpperCase(), email || null,
     phone || null, team_id || null, type, contract_h, hourly_rate, color, note || null,
     hire_date || null, cp_balance, rtt_balance, manager_id || null]
  );
  const staffId = r.lastInsertRowid;

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
  res.status(201).json({ id: staffId });
});

// ── PUT /api/staff/:id ────────────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const {
    firstname, lastname, initials, email, phone,
    team_id, type, contract_h, hourly_rate, charge_rate, color, note, hire_date,
    cp_balance, rtt_balance, manager_id, functions: fns, primary_function,
  } = req.body;

  const old = db_.get('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Salarié introuvable' });

  db_.run(
    `UPDATE staff SET
       firstname     = COALESCE(?, firstname),
       lastname      = COALESCE(?, lastname),
       initials      = COALESCE(?, initials),
       email         = COALESCE(?, email),
       phone         = COALESCE(?, phone),
       team_id       = COALESCE(?, team_id),
       type          = COALESCE(?, type),
       contract_h    = COALESCE(?, contract_h),
       hourly_rate   = COALESCE(?, hourly_rate),
       charge_rate   = COALESCE(?, charge_rate),
       color         = COALESCE(?, color),
       note          = COALESCE(?, note),
       hire_date     = COALESCE(?, hire_date),
       cp_balance    = COALESCE(?, cp_balance),
       rtt_balance   = COALESCE(?, rtt_balance),
       manager_id    = COALESCE(?, manager_id),
       updated_at    = datetime('now')
     WHERE id = ?`,
    [firstname, lastname, initials, email, phone, team_id, type,
     contract_h, hourly_rate, charge_rate ?? null, color, note, hire_date,
     cp_balance, rtt_balance, manager_id, req.params.id]
  );

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
  res.json({ message: 'Salarié mis à jour' });
});

// ── DELETE /api/staff/:id ─────────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  const s = db_.get('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Salarié introuvable' });
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
  const dest     = path.join(__dirname, '..', 'uploads', 'avatars', filename);
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
