'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

// ── GET /api/schedules?week=YYYY-MM-DD ────────────────────────
// Retourne { [functionSlug]: { [day]: { [hour]: [staffId] } } }
// Compatible avec le format interne du frontend
router.get('/', AUTH, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week))
    return res.status(400).json({ error: 'Paramètre week requis (YYYY-MM-DD)' });

  const slots = db_.all(
    `SELECT ss.staff_id, ss.day_of_week, ss.hour_start, ss.hour_end, f.slug AS fn_slug
     FROM schedule_slots ss
     JOIN schedules sc      ON sc.id     = ss.schedule_id
     JOIN functions f       ON f.id      = sc.function_id
     WHERE sc.week_start = ? AND f.active = 1
     ORDER BY f.slug, ss.day_of_week, ss.hour_start`,
    [week]
  );

  // Construire { fnSlug: { day: { hour: [staffId, ...] } } }
  const result = {};
  for (const slot of slots) {
    if (!result[slot.fn_slug]) result[slot.fn_slug] = {};
    for (let h = slot.hour_start; h < slot.hour_end; h++) {
      const d = String(slot.day_of_week);
      const hour = String(h);
      if (!result[slot.fn_slug][d])    result[slot.fn_slug][d]    = {};
      if (!result[slot.fn_slug][d][hour]) result[slot.fn_slug][d][hour] = [];
      if (!result[slot.fn_slug][d][hour].includes(slot.staff_id))
        result[slot.fn_slug][d][hour].push(slot.staff_id);
    }
  }
  res.json(result);
});

// ── POST /api/schedules/week/:week/function/:slug ─────────────
// Body: { grid: { [day]: { [hour]: [staffId] } } }
// Remplace l'intégralité des créneaux de la fonction pour cette semaine.
router.post('/week/:week/function/:slug', ...ADMIN, (req, res) => {
  const { week, slug } = req.params;
  const { grid } = req.body;
  if (!grid) return res.status(400).json({ error: 'grid requis' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week))
    return res.status(400).json({ error: 'Format week invalide (YYYY-MM-DD)' });

  const fn = db_.get('SELECT id FROM functions WHERE slug = ? AND active = 1', [slug]);
  if (!fn) return res.status(404).json({ error: 'Fonction introuvable' });

  // Obtenir ou créer le schedule
  let sc = db_.get('SELECT id FROM schedules WHERE week_start = ? AND function_id = ?', [week, fn.id]);
  if (!sc) {
    const r = db_.run(
      `INSERT INTO schedules (week_start, function_id, status, created_by) VALUES (?, ?, 'draft', ?)`,
      [week, fn.id, req.user.id]
    );
    sc = { id: r.lastInsertRowid };
  }

  // Convertir la grille en tableaux de créneaux
  const slots = [];
  for (const [day, hours] of Object.entries(grid)) {
    for (const [hour, staffIds] of Object.entries(hours)) {
      for (const staffId of (staffIds || [])) {
        slots.push({
          staff_id:    Number(staffId),
          day_of_week: Number(day),
          hour_start:  Number(hour),
          hour_end:    Number(hour) + 1,
        });
      }
    }
  }

  // Remplacement atomique
  db_.tx(() => {
    db_.run('DELETE FROM schedule_slots WHERE schedule_id = ?', [sc.id]);
    for (const s of slots) {
      db_.run(
        `INSERT OR IGNORE INTO schedule_slots
           (schedule_id, staff_id, day_of_week, hour_start, hour_end)
         VALUES (?, ?, ?, ?, ?)`,
        [sc.id, s.staff_id, s.day_of_week, s.hour_start, s.hour_end]
      );
    }
    db_.run("UPDATE schedules SET updated_at = datetime('now') WHERE id = ?", [sc.id]);
  });

  auditLog(req, 'SCHEDULE_SAVE', 'schedules', sc.id, null, { week, slug, slots: slots.length });
  res.json({ schedule_id: sc.id, saved: slots.length });
});

module.exports = router;
