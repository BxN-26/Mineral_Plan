'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

// ── GET /api/teams ────────────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  res.json(db_.all('SELECT * FROM teams WHERE active = 1 ORDER BY sort_order, name'));
});

// ── POST /api/teams ───────────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  const { name, slug, description, color = '#8B8880', bg_color = '#F5F5F5', icon = '👥' } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et slug requis' });
  const r = db_.run(
    'INSERT INTO teams (name, slug, description, color, bg_color, icon) VALUES (?, ?, ?, ?, ?, ?)',
    [name, slug, description || null, color, bg_color, icon]
  );
  auditLog(req, 'TEAM_CREATE', 'teams', r.lastInsertRowid, null, req.body);
  res.status(201).json({ id: r.lastInsertRowid });
});

// ── PUT /api/teams/:id ────────────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const { name, description, color, bg_color, icon, active, show_course_slots } = req.body;
  const old = db_.get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Équipe introuvable' });

  db_.run(
    `UPDATE teams SET
       name              = COALESCE(?, name),
       description       = COALESCE(?, description),
       color             = COALESCE(?, color),
       bg_color          = COALESCE(?, bg_color),
       icon              = COALESCE(?, icon),
       active            = COALESCE(?, active),
       show_course_slots = CASE WHEN ? IS NOT NULL THEN ? ELSE show_course_slots END
     WHERE id = ?`,
    [name, description, color, bg_color, icon, active, show_course_slots ?? null, show_course_slots != null ? (show_course_slots ? 1 : 0) : null, req.params.id]
  );
  auditLog(req, 'TEAM_UPDATE', 'teams', req.params.id, old, req.body);
  res.json({ message: 'Équipe mise à jour' });
});

// ── DELETE /api/teams/:id ─────────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  const old = db_.get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Équipe introuvable' });
  db_.run('UPDATE teams SET active = 0 WHERE id = ?', [req.params.id]);
  auditLog(req, 'TEAM_DELETE', 'teams', req.params.id, old, null);
  res.json({ message: 'Équipe supprimée' });
});

module.exports = router;
