'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

// ── GET /api/schedules?week=YYYY-MM-DD ────────────────────────
// Retourne { [functionSlug]: { [day]: [{ staffId, start, end }] } }
// Format "spans" — chaque entrée représente un bloc continu par salarié/jour.
router.get('/', AUTH, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week))
    return res.status(400).json({ error: 'Paramètre week requis (YYYY-MM-DD)' });

  const slots = db_.all(
    `SELECT ss.staff_id, ss.day_of_week, ss.hour_start, ss.hour_end,
            ss.task_type, ss.course_slot_id, f.slug AS fn_slug
     FROM schedule_slots ss
     JOIN schedules sc ON sc.id = ss.schedule_id
     JOIN functions f  ON f.id  = sc.function_id
     WHERE sc.week_start = ? AND f.active = 1
     ORDER BY f.slug, ss.day_of_week, ss.hour_start`,
    [week]
  );

  // Construire { fnSlug: { day: [{ staffId, start, end, taskType, courseSlotId }] } }
  const result = {};
  for (const slot of slots) {
    if (!result[slot.fn_slug]) result[slot.fn_slug] = {};
    const d = String(slot.day_of_week);
    if (!result[slot.fn_slug][d]) result[slot.fn_slug][d] = [];
    result[slot.fn_slug][d].push({
      staffId:      slot.staff_id,
      start:        slot.hour_start,
      end:          slot.hour_end,
      taskType:     slot.task_type     || null,
      courseSlotId: slot.course_slot_id || null,
    });
  }
  res.json(result);
});

// ── POST /api/schedules/week/:week/function/:slug ─────────────
// Body: { spans: { [day]: [{ staffId, start, end }] } }
// Remplace l'intégralité des créneaux de la fonction pour cette semaine.
router.post('/week/:week/function/:slug', ...ADMIN, (req, res) => {
  const { week, slug } = req.params;
  const { spans } = req.body;
  if (!spans) return res.status(400).json({ error: 'spans requis' });
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

  // Convertir les spans en lignes DB
  const rows = [];
  for (const [day, daySpans] of Object.entries(spans)) {
    for (const sp of (daySpans || [])) {
      const start = Number(sp.start);
      const end   = Number(sp.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      rows.push({
        staff_id:      Number(sp.staffId),
        day_of_week:   Number(day),
        hour_start:    start,
        hour_end:      end,
        task_type:     sp.taskType     || null,
        course_slot_id: sp.courseSlotId ? Number(sp.courseSlotId) : null,
      });
    }
  }

  // Remplacement atomique
  db_.tx(() => {
    db_.run('DELETE FROM schedule_slots WHERE schedule_id = ?', [sc.id]);
    for (const s of rows) {
      db_.run(
        `INSERT OR IGNORE INTO schedule_slots
           (schedule_id,staff_id,day_of_week,hour_start,hour_end,task_type,course_slot_id)
         VALUES (?,?,?,?,?,?,?)`,
        [sc.id, s.staff_id, s.day_of_week, s.hour_start, s.hour_end,
         s.task_type || null, s.course_slot_id || null]
      );
    }
    db_.run("UPDATE schedules SET updated_at = datetime('now') WHERE id = ?", [sc.id]);
  });

  auditLog(req, 'SCHEDULE_SAVE', 'schedules', sc.id, null, { week, slug, spans: rows.length });
  res.json({ schedule_id: sc.id, saved: rows.length });
});

module.exports = router;
