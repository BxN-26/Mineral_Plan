'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  filterCourseSlotsByWeek,
  loadSchoolHolidays,
  getConfiguredSchoolZone,
} = require('../utils/holidayHelper');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

// ── GET /api/course-slots ─────────────────────────────────────
// ?week=YYYY-MM-DD  → filtre par saison + valid_from/until pour cette semaine
// ?active=1         → seulement les actifs (défaut : 1)
// ?function_id=N    → filtre par fonction
router.get('/', AUTH, (req, res) => {
  const { function_id, active = '1', week } = req.query;
  let sql = `SELECT cs.*, f.slug AS fn_slug, f.name AS fn_name, f.icon AS fn_icon
             FROM course_slots cs
             LEFT JOIN functions f ON f.id = cs.function_id
             WHERE cs.active = ?`;
  const params = [Number(active)];
  if (function_id) { sql += ' AND cs.function_id = ?'; params.push(Number(function_id)); }
  sql += ' ORDER BY cs.day_of_week, cs.hour_start';
  let slots = db_.all(sql, params);

  // Filtrage par saison si une semaine est précisée
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const zone         = getConfiguredSchoolZone(db_);
    const year         = new Date(week + 'T12:00:00').getFullYear();
    const schoolHols   = loadSchoolHolidays(db_, zone, year - 1, year + 1);
    slots = filterCourseSlotsByWeek(slots, week, schoolHols);
  }

  res.json(slots);
});

// ── POST /api/course-slots ────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  const { function_id, day_of_week, hour_start, hour_end,
          group_name, level, public_desc, capacity,
          color, bg_color, season, valid_from, valid_until } = req.body;
  if (!group_name || day_of_week === undefined || hour_start === undefined || hour_end === undefined)
    return res.status(400).json({ error: 'group_name, day_of_week, hour_start, hour_end requis' });

  const r = db_.run(
    `INSERT INTO course_slots
       (function_id,day_of_week,hour_start,hour_end,group_name,level,public_desc,
        capacity,color,bg_color,season,valid_from,valid_until)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [function_id || null, Number(day_of_week), Number(hour_start), Number(hour_end),
     group_name, level || null, public_desc || null, capacity || 2,
     color || '#5B75DB', bg_color || '#EBF0FE', season || 'always',
     valid_from || null, valid_until || null]
  );
  res.json({ id: r.lastInsertRowid });
});

// ── PUT /api/course-slots/:id ─────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const { function_id, day_of_week, hour_start, hour_end,
          group_name, level, public_desc, capacity,
          color, bg_color, season, active, valid_from, valid_until } = req.body;
  db_.run(
    `UPDATE course_slots SET
       function_id=?,day_of_week=?,hour_start=?,hour_end=?,group_name=?,level=?,public_desc=?,
       capacity=?,color=?,bg_color=?,season=?,active=?,valid_from=?,valid_until=?
     WHERE id=?`,
    [function_id || null, Number(day_of_week), Number(hour_start), Number(hour_end),
     group_name, level || null, public_desc || null, capacity || 2,
     color || '#5B75DB', bg_color || '#EBF0FE', season || 'always',
     active === false || active === 0 ? 0 : 1,
     valid_from || null, valid_until || null, Number(req.params.id)]
  );
  res.json({ ok: true });
});

// ── DELETE /api/course-slots/:id (désactivation douce) ────────
router.delete('/:id', ...ADMIN, (req, res) => {
  db_.run('UPDATE course_slots SET active = 0 WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── GET /api/course-slots/assignments ─────────────────────────
router.get('/assignments', AUTH, (req, res) => {
  const { week, function_id } = req.query;
  if (!week) return res.status(400).json({ error: 'week requis' });
  let sql = `SELECT csa.course_slot_id, csa.staff_id
             FROM course_slot_assignments csa
             JOIN course_slots cs ON cs.id = csa.course_slot_id
             WHERE csa.week_start = ?`;
  const params = [week];
  if (function_id) { sql += ' AND cs.function_id = ?'; params.push(Number(function_id)); }
  res.json(db_.all(sql, params));
});

// ── POST /api/course-slots/:id/assign ─────────────────────────
// Vérifie que le cours est actif pour la semaine (saison + valid_from/until)
// avant de créer l'assignation.
router.post('/:id/assign', ...ADMIN, (req, res) => {
  const { staff_id, week_start } = req.body;
  if (!staff_id || !week_start) return res.status(400).json({ error: 'staff_id et week_start requis' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) return res.status(400).json({ error: 'Format week_start invalide' });

  // Vérifier que le cours existe et est actif
  const cs = db_.get('SELECT * FROM course_slots WHERE id = ? AND active = 1', [Number(req.params.id)]);
  if (!cs) return res.status(404).json({ error: 'Créneau de cours introuvable ou inactif' });

  // Vérifier que le cours est pertinent pour cette semaine (saison + dates de validité)
  const zone       = getConfiguredSchoolZone(db_);
  const year       = new Date(week_start + 'T12:00:00').getFullYear();
  const schoolHols = loadSchoolHolidays(db_, zone, year - 1, year + 1);
  const validSlots = filterCourseSlotsByWeek([cs], week_start, schoolHols);
  if (!validSlots.length) {
    return res.status(409).json({
      error: 'Ce cours n\'est pas actif pour cette semaine (saison ou période de validité)',
      reason: cs.season === 'hors-vacances' ? 'vacation_week' :
              cs.season === 'vacances'      ? 'non_vacation_week' : 'date_range',
    });
  }

  try {
    db_.run(
      `INSERT OR IGNORE INTO course_slot_assignments (course_slot_id, staff_id, week_start)
       VALUES (?, ?, ?)`,
      [Number(req.params.id), Number(staff_id), week_start]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── DELETE /api/course-slots/:id/assign ───────────────────────
router.delete('/:id/assign', ...ADMIN, (req, res) => {
  const { staff_id, week } = req.query;
  if (!staff_id || !week) return res.status(400).json({ error: 'staff_id et week requis' });
  db_.run(
    `DELETE FROM course_slot_assignments
     WHERE course_slot_id = ? AND staff_id = ? AND week_start = ?`,
    [Number(req.params.id), Number(staff_id), week]
  );
  res.json({ ok: true });
});

module.exports = router;
