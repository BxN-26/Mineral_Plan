// routes/functions.js — Gestion des fonctions et plannings multi-fonctions
const router = require('express').Router();
const { db_ }                               = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin','manager','superadmin')];

// ── GET /api/functions ───────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const fns = db_.all('SELECT * FROM functions WHERE active=1 ORDER BY sort_order, name');
  res.json(fns);
});

// ── POST /api/functions ──────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  const { name, slug, description, color, bg_color, icon, min_staff_hour } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et slug requis' });
  const r = db_.run(
    'INSERT INTO functions (name,slug,description,color,bg_color,icon,min_staff_hour) VALUES (?,?,?,?,?,?,?)',
    [name, slug, description||null, color||'#8B8880', bg_color||'#F5F5F5', icon||'🔖', min_staff_hour||1]
  );
  res.status(201).json({ id: r.lastInsertRowid });
});

// ── PUT /api/functions/:id ───────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const { name, description, color, bg_color, icon, min_staff_hour, active } = req.body;
  db_.run(`UPDATE functions SET name=COALESCE(?,name), description=?, color=COALESCE(?,color),
           bg_color=COALESCE(?,bg_color), icon=COALESCE(?,icon),
           min_staff_hour=COALESCE(?,min_staff_hour), active=COALESCE(?,active) WHERE id=?`,
    [name, description||null, color, bg_color, icon, min_staff_hour, active, req.params.id]);
  res.json({ message: 'Fonction mise à jour' });
});

// ── DELETE /api/functions/:id ────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  db_.run('UPDATE functions SET active=0 WHERE id=?', [req.params.id]);
  res.json({ message: 'Fonction désactivée' });
});

// ── GET /api/functions/:id/staff ─────────────────────────────
// Salariés ayant cette fonction
router.get('/:id/staff', AUTH, (req, res) => {
  const isPrivileged = ['admin', 'superadmin', 'manager', 'rh'].includes(req.user.role);
  const rows = db_.all(
    `SELECT s.id, s.firstname, s.lastname, s.initials, s.color, s.avatar_url,
            s.type, s.active, s.team_id,
            ${isPrivileged ? 's.hourly_rate, s.charge_rate, s.hire_date, s.end_date, s.contract_h, s.phone, s.email, s.note,' : ''}
            sf.hourly_rate as fn_rate, sf.level, sf.is_primary, sf.since, sf.note as fn_note,
            t.name as team_name, t.color as team_color
     FROM staff_functions sf
     JOIN staff s  ON s.id = sf.staff_id
     LEFT JOIN teams t ON t.id = s.team_id
     WHERE sf.function_id=? AND sf.active=1 AND s.active=1
     ORDER BY sf.is_primary DESC, s.firstname`,
    [req.params.id]
  );
  res.json(rows);
});

// ── GET /api/staff/:id/functions ─────────────────────────────
// Toutes les fonctions d'un salarié
router.get('/staff/:staffId', AUTH, (req, res) => {
  const isPrivileged = ['admin', 'superadmin', 'manager', 'rh'].includes(req.user.role);
  const isSelf = req.user.staff_id === Number(req.params.staffId);
  // Un staff ne peut voir que ses propres données ou celles d'autrui sans champs sensibles
  const rows = db_.all(
    `SELECT f.id, f.name, f.slug, f.color, f.bg_color, f.icon, f.sort_order,
            sf.level, sf.is_primary, sf.active as sf_active, sf.certified_until, sf.since,
            ${(isPrivileged || isSelf) ? 'sf.hourly_rate as fn_rate, sf.note as fn_note,' : ''}
            1 as _pad
     FROM staff_functions sf
     JOIN functions f ON f.id = sf.function_id
     WHERE sf.staff_id=? AND f.active=1
     ORDER BY sf.is_primary DESC, f.sort_order`,
    [req.params.staffId]
  );
  res.json(rows);
});

// ── POST /api/functions/staff/:staffId/assign ────────────────
router.post('/staff/:staffId/assign', ...ADMIN, (req, res) => {
  const { function_ids, is_primary } = req.body;
  if (!Array.isArray(function_ids)) return res.status(400).json({ error: 'function_ids requis' });

  for (const fid of function_ids) {
    db_.run(
      `INSERT INTO staff_functions (staff_id, function_id, is_primary)
       VALUES (?,?,?)
       ON CONFLICT(staff_id,function_id) DO UPDATE SET active=1`,
      [req.params.staffId, fid, is_primary || 0]
    );
  }
  res.json({ message: `${function_ids.length} fonction(s) assignée(s)` });
});

// ── DELETE /api/functions/staff/:staffId/:functionId ─────────
router.delete('/staff/:staffId/:functionId', ...ADMIN, (req, res) => {
  db_.run('UPDATE staff_functions SET active=0 WHERE staff_id=? AND function_id=?',
    [req.params.staffId, req.params.functionId]);
  res.json({ message: 'Fonction retirée' });
});

// ── GET /api/functions/schedule/:week ────────────────────────
// Tous les plannings de la semaine, toutes fonctions, avec grilles
router.get('/schedule/:week', AUTH, (req, res) => {
  const { function_ids } = req.query; // CSV optionnel pour filtrer

  let sql = `SELECT sc.*, f.name as fn_name, f.slug as fn_slug, f.color as fn_color,
                    f.bg_color as fn_bg, f.icon as fn_icon
             FROM schedules sc JOIN functions f ON f.id = sc.function_id
             WHERE sc.week_start=?`;
  const p = [req.params.week];

  if (function_ids) {
    const ids = function_ids.split(',').map(Number).filter(Boolean);
    sql += ` AND sc.function_id IN (${ids.map(()=>'?').join(',')})`;
    p.push(...ids);
  }

  const schedules = db_.all(sql, p);

  // Pour chaque planning, charger les créneaux
  for (const sc of schedules) {
    sc.slots = db_.all(
      `SELECT ss.*, s.firstname || ' ' || s.lastname AS staff_name,
              s.initials, s.color, s.team_id
       FROM schedule_slots ss JOIN staff s ON s.id=ss.staff_id
       WHERE ss.schedule_id=? ORDER BY ss.day_of_week, ss.hour_start`,
      [sc.id]
    );
  }

  res.json(schedules);
});

// ── GET /api/functions/staff-view/:staffId/:week ─────────────
// Vue salarié : tous ses plannings de la semaine, toutes fonctions
router.get('/staff-view/:staffId/:week', AUTH, (req, res) => {
  // Vérification droits
  if (req.user.role === 'staff' && req.user.staff_id !== Number(req.params.staffId))
    return res.status(403).json({ error: 'Non autorisé' });

  // Toutes les fonctions du salarié
  const fns = db_.all(
    'SELECT function_id FROM staff_functions WHERE staff_id=? AND active=1',
    [req.params.staffId]
  );
  const fnIds = fns.map(f => f.function_id);

  if (fnIds.length === 0) return res.json({ slots: [], by_function: [] });

  // Tous ses créneaux cette semaine
  const slots = db_.all(
    `SELECT ss.*, f.name as fn_name, f.slug as fn_slug, f.color as fn_color,
            f.bg_color as fn_bg, f.icon as fn_icon, sc.status as sched_status
     FROM schedule_slots ss
     JOIN schedules sc ON sc.id=ss.schedule_id
     JOIN functions f ON f.id=sc.function_id
     WHERE ss.staff_id=? AND sc.week_start=?
     ORDER BY ss.day_of_week, ss.hour_start, f.name`,
    [req.params.staffId, req.params.week]
  );

  // Construire grille combinée (overlay)
  const grid = {}; // day → hour → [slot]
  for (let d = 0; d < 7; d++) {
    grid[d] = {};
    for (let h = 8; h < 22; h++) grid[d][h] = [];
  }
  for (const s of slots) {
    for (let h = s.hour_start; h < s.hour_end; h++) {
      if (grid[s.day_of_week]?.[h]) grid[s.day_of_week][h].push(s);
    }
  }

  // Regrouper par fonction
  const byFunction = {};
  for (const s of slots) {
    if (!byFunction[s.fn_slug]) byFunction[s.fn_slug] = { fn: { name:s.fn_name, slug:s.fn_slug, color:s.fn_color, bg:s.fn_bg, icon:s.fn_icon }, slots:[], totalH:0 };
    byFunction[s.fn_slug].slots.push(s);
    byFunction[s.fn_slug].totalH += (s.hour_end - s.hour_start);
  }

  res.json({
    staff_id:    Number(req.params.staffId),
    week_start:  req.params.week,
    grid,
    slots,
    by_function: Object.values(byFunction),
    total_h:     slots.reduce((a,s)=>a+(s.hour_end-s.hour_start),0),
  });
});

// ── POST /api/functions/schedule/:week/:functionId/slots/bulk
router.post('/schedule/:week/:functionId/slots/bulk', ...ADMIN, (req, res) => {
  const { slots } = req.body;
  const { week, functionId } = req.params;

  // Créer le planning si inexistant
  let sc = db_.get('SELECT id FROM schedules WHERE week_start=? AND function_id=?', [week, functionId]);
  if (!sc) {
    const r = db_.run(
      'INSERT INTO schedules (week_start,function_id,created_by) VALUES (?,?,?)',
      [week, functionId, req.user.id]
    );
    sc = { id: r.lastInsertRowid };
  }

  db_.tx(() => {
    db_.run('DELETE FROM schedule_slots WHERE schedule_id=?', [sc.id]);
    for (const s of (slots||[])) {
      db_.run(
        `INSERT OR IGNORE INTO schedule_slots
         (schedule_id,staff_id,day_of_week,hour_start,hour_end,sub_role,note)
         VALUES (?,?,?,?,?,?,?)`,
        [sc.id, s.staff_id, s.day_of_week, s.hour_start, s.hour_end||s.hour_start+1, s.sub_role||null, s.note||null]
      );
    }
    db_.run("UPDATE schedules SET updated_at=datetime('now') WHERE id=?", [sc.id]);
  });

  auditLog(req, 'BULK_SAVE_SLOTS', 'schedule_slots', sc.id, null, { count: slots?.length, function_id: functionId });
  res.json({ schedule_id: sc.id, saved: slots?.length || 0 });
});

module.exports = router;
