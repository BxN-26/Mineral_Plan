'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

const VALID_LEVELS = ['manager', 'rh', 'direction'];

function parseApprovalLevels(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '["manager"]'); } catch { return ['manager']; }
}

// ── GET /api/leave-types ──────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const rows = db_.all(
    `SELECT id, slug, label, short_label, color, bg_color, paid,
            count_method, approval_levels, min_notice_days,
            max_consecutive, requires_doc, active, sort_order
     FROM leave_types
     WHERE active = 1
     ORDER BY sort_order, id`
  );
  res.json(rows.map(lt => ({ ...lt, approval_levels: parseApprovalLevels(lt.approval_levels) })));
});

// ── PUT /api/leave-types/:id/approval ─────────────────────────
// Mise à jour de la chaîne d'approbation d'un type de congé.
// Seuls admin/superadmin peuvent modifier.
router.put('/:id/approval', ...ADMIN, (req, res) => {
  const { approval_levels } = req.body;

  if (!Array.isArray(approval_levels) || approval_levels.length === 0) {
    return res.status(400).json({ error: 'approval_levels doit être un tableau non vide' });
  }
  if (!approval_levels.every(l => VALID_LEVELS.includes(l))) {
    return res.status(400).json({ error: `Niveaux valides : ${VALID_LEVELS.join(', ')}` });
  }

  const lt = db_.get('SELECT id FROM leave_types WHERE id = ?', [req.params.id]);
  if (!lt) return res.status(404).json({ error: 'Type de congé introuvable' });

  // Ordonner les niveaux dans le bon sens (manager → rh → direction)
  const ordered = VALID_LEVELS.filter(l => approval_levels.includes(l));

  db_.run(
    'UPDATE leave_types SET approval_levels = ? WHERE id = ?',
    [JSON.stringify(ordered), req.params.id]
  );
  res.json({ ok: true, approval_levels: ordered });
});

module.exports = router;
