'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

// ── GET /api/course-slots ─────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const { function_id, active = '1' } = req.query;
  let sql = `SELECT cs.*, f.slug AS fn_slug, f.name AS fn_name, f.icon AS fn_icon
             FROM course_slots cs
             LEFT JOIN functions f ON f.id = cs.function_id
             WHERE cs.active = ?`;
  const params = [Number(active)];
  if (function_id) { sql += ' AND cs.function_id = ?'; params.push(Number(function_id)); }
  sql += ' ORDER BY cs.day_of_week, cs.hour_start';
  res.json(db_.all(sql, params));
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

module.exports = router;
