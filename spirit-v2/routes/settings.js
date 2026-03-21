'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

// ── GET /api/settings ─────────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const rows = db_.all('SELECT key, value, type, description, group_name FROM settings ORDER BY group_name, key');
  res.json(rows);
});

// ── PUT /api/settings/:key ────────────────────────────────────
router.put('/:key', ...ADMIN, (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value requis' });
  db_.run(
    `UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`,
    [String(value), req.params.key]
  );
  res.json({ message: 'Paramètre mis à jour' });
});

// ── GET /api/leave-types ──────────────────────────────────────
router.get('/leave-types', AUTH, (req, res) => {
  res.json(db_.all('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort_order, label'));
});

module.exports = router;
