'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

/* Génère la liste des lundis entre deux dates (incluses) */
function mondaysBetween(from, to) {
  const mondays = [];
  const d   = new Date(from + 'T12:00:00');
  const end = new Date(to   + 'T12:00:00');
  // Avancer jusqu'au premier lundi
  const day = d.getDay();
  if (day !== 1) d.setDate(d.getDate() + (day === 0 ? 1 : 8 - day));
  while (d <= end) {
    mondays.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return mondays;
}

// ── GET /api/templates ────────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const { function_id, include_slots } = req.query;
  let sql = `SELECT t.*, f.slug AS fn_slug, f.name AS fn_name, f.icon AS fn_icon, f.color AS fn_color
             FROM schedule_templates t
             LEFT JOIN functions f ON f.id = t.function_id
             WHERE 1=1`;
  const params = [];
  if (function_id) { sql += ' AND t.function_id = ?'; params.push(Number(function_id)); }
  sql += ' ORDER BY t.is_default DESC, t.name';

  const templates = db_.all(sql, params);
  if (include_slots === 'true') {
    for (const t of templates) {
      t.slots = db_.all(
        `SELECT ts.*, s.firstname, s.lastname, s.color, s.initials
         FROM template_slots ts LEFT JOIN staff s ON s.id = ts.staff_id
         WHERE ts.template_id = ? ORDER BY ts.day_of_week, ts.hour_start`,
        [t.id]
      );
    }
  }
  res.json(templates);
});

// ── POST /api/templates ───────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  const { name, description, function_id, is_default } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  const r = db_.run(
    'INSERT INTO schedule_templates (name, description, function_id, is_default, updated_by) VALUES (?, ?, ?, ?, ?)',
    [name, description || null, function_id || null, is_default ? 1 : 0, req.user.id]
  );
  res.json({ id: r.lastInsertRowid });
});

// ── PUT /api/templates/:id ────────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const { name, description, is_default } = req.body;
  db_.run(
    'UPDATE schedule_templates SET name=?, description=?, is_default=?, updated_by=? WHERE id=?',
    [name, description || null, is_default ? 1 : 0, req.user.id, Number(req.params.id)]
  );
  res.json({ ok: true });
});

// ── DELETE /api/templates/:id ─────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  db_.run('DELETE FROM schedule_templates WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── GET /api/templates/:id/slots ─────────────────────────────
router.get('/:id/slots', AUTH, (req, res) => {
  const slots = db_.all(
    `SELECT ts.*, s.firstname, s.lastname, s.color, s.initials
     FROM template_slots ts LEFT JOIN staff s ON s.id = ts.staff_id
     WHERE ts.template_id = ? ORDER BY ts.day_of_week, ts.hour_start`,
    [Number(req.params.id)]
  );
  res.json(slots);
});

// ── POST /api/templates/:id/slots — remplace tous les créneaux ─
router.post('/:id/slots', ...ADMIN, (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots requis (array)' });
  const tplId = Number(req.params.id);

  db_.tx(() => {
    db_.run('DELETE FROM template_slots WHERE template_id = ?', [tplId]);
    let saved = 0;
    for (const s of slots) {
      const start = Number(s.hour_start ?? s.start);
      const end   = Number(s.hour_end   ?? s.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const staffId = s.staff_id ?? s.staffId ?? null;
      db_.run(
        `INSERT OR IGNORE INTO template_slots
           (template_id, staff_id, day_of_week, hour_start, hour_end, task_type, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tplId, staffId || null, Number(s.day_of_week ?? s.day ?? 0),
         start, end, s.task_type || s.taskType || null, s.note || null]
      );
      saved++;
    }
    return saved;
  });
  res.json({ ok: true });
});

// ── POST /api/templates/:id/apply — applique à une plage ─────
router.post('/:id/apply', ...ADMIN, (req, res) => {
  const { weeks, from, to } = req.body;
  let targetWeeks = [];
  if (Array.isArray(weeks) && weeks.length) {
    targetWeeks = weeks.filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w));
  } else if (from && to) {
    targetWeeks = mondaysBetween(from, to);
  }
  if (!targetWeeks.length)
    return res.status(400).json({ error: 'Fournir weeks[] ou from+to' });

  const tpl = db_.get('SELECT * FROM schedule_templates WHERE id = ?', [Number(req.params.id)]);
  if (!tpl)            return res.status(404).json({ error: 'Template introuvable' });
  if (!tpl.function_id) return res.status(400).json({ error: 'Template sans fonction associée' });

  const tslots = db_.all('SELECT * FROM template_slots WHERE template_id = ?', [tpl.id]);

  const applied = [];
  db_.tx(() => {
    for (const week of targetWeeks) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) continue;

      let sc = db_.get(
        'SELECT id FROM schedules WHERE week_start = ? AND function_id = ?',
        [week, tpl.function_id]
      );
      if (!sc) {
        const r = db_.run(
          "INSERT INTO schedules (week_start,function_id,template_id,status,created_by) VALUES(?,?,?,'draft',?)",
          [week, tpl.function_id, tpl.id, req.user.id]
        );
        sc = { id: r.lastInsertRowid };
      } else {
        db_.run("UPDATE schedules SET template_id=?,updated_at=datetime('now') WHERE id=?",
          [tpl.id, sc.id]);
      }

      db_.run('DELETE FROM schedule_slots WHERE schedule_id = ?', [sc.id]);
      for (const s of tslots) {
        if (!s.staff_id) continue; // créneaux sans salarié = juste structure horaire
        db_.run(
          `INSERT OR IGNORE INTO schedule_slots
             (schedule_id,staff_id,day_of_week,hour_start,hour_end,task_type)
           VALUES(?,?,?,?,?,?)`,
          [sc.id, s.staff_id, s.day_of_week, s.hour_start, s.hour_end, s.task_type || null]
        );
      }
      applied.push(week);
    }
  });

  res.json({ applied: applied.length, weeks: applied });
});

module.exports = router;
