'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

// ── GET /api/task-types ───────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const rows = db_.all('SELECT * FROM task_types ORDER BY sort_order, id');
  res.json(rows);
});

// ── POST /api/task-types ──────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  const { slug, label, icon, color, sort_order, function_id } = req.body;
  if (!slug || !label) return res.status(400).json({ error: 'slug et label requis' });

  const existing = db_.get('SELECT id FROM task_types WHERE slug = ?', [slug]);
  if (existing) return res.status(409).json({ error: 'Ce slug existe déjà' });

  const result = db_.run(
    'INSERT INTO task_types (slug, label, icon, color, sort_order, function_id) VALUES (?, ?, ?, ?, ?, ?)',
    [slug, label, icon || '⚙️', color || '#6B7280', sort_order ?? 0, function_id || null]
  );
  res.status(201).json(db_.get('SELECT * FROM task_types WHERE id = ?', [result.lastInsertRowid]));
});

// ── PUT /api/task-types/:id ───────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const { slug, label, icon, color, sort_order, function_id } = req.body;
  const tt = db_.get('SELECT id FROM task_types WHERE id = ?', [req.params.id]);
  if (!tt) return res.status(404).json({ error: 'Type de tâche introuvable' });

  // Vérifier unicité du slug (hors l'élément lui-même)
  const conflict = db_.get('SELECT id FROM task_types WHERE slug = ? AND id != ?', [slug, req.params.id]);
  if (conflict) return res.status(409).json({ error: 'Ce slug existe déjà' });

  db_.run(
    'UPDATE task_types SET slug=?, label=?, icon=?, color=?, sort_order=?, function_id=? WHERE id=?',
    [slug, label, icon || '⚙️', color || '#6B7280', sort_order ?? tt.sort_order ?? 0, function_id || null, req.params.id]
  );
  res.json(db_.get('SELECT * FROM task_types WHERE id = ?', [req.params.id]));
});

// ── DELETE /api/task-types/:id ────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  const tt = db_.get('SELECT id FROM task_types WHERE id = ?', [req.params.id]);
  if (!tt) return res.status(404).json({ error: 'Type de tâche introuvable' });
  db_.run('DELETE FROM task_types WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
