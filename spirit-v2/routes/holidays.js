// routes/holidays.js — Gestion des jours fériés configurables
'use strict';
const router = require('express').Router();
const { db_ }                               = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

// ── GET /api/holidays ─────────────────────────────────────────
// Retourne tous les jours fériés (+ expansion des récurrents pour une année donnée)
router.get('/', AUTH, (req, res) => {
  const year = req.query.year ? parseInt(req.query.year, 10) : null;
  const rows = db_.all('SELECT * FROM public_holidays ORDER BY date');

  if (!year) return res.json(rows);

  // Expansion : pour les récurrents, on retourne la date dans l'année demandée
  const expanded = rows.map(h => {
    if (!h.recurring) return h;
    const mmdd = h.date.slice(5); // "MM-DD"
    return { ...h, date: `${year}-${mmdd}` };
  });

  // Trier par date
  expanded.sort((a, b) => a.date.localeCompare(b.date));
  res.json(expanded);
});

// ── POST /api/holidays ────────────────────────────────────────
router.post('/', ...ADMIN, (req, res) => {
  const { date, label, recurring = 0 } = req.body;
  if (!date || !label) return res.status(400).json({ error: 'date et label requis' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Format date invalide (YYYY-MM-DD)' });

  try {
    const r = db_.run(
      'INSERT INTO public_holidays (date, label, recurring) VALUES (?, ?, ?)',
      [date, label.trim(), recurring ? 1 : 0]
    );
    auditLog(req, 'HOLIDAY_CREATE', 'public_holidays', r.lastInsertRowid, null, { date, label });
    const row = db_.get('SELECT * FROM public_holidays WHERE id=?', [r.lastInsertRowid]);
    res.status(201).json(row);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Un jour férié existe déjà à cette date' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PUT /api/holidays/:id ─────────────────────────────────────
router.put('/:id', ...ADMIN, (req, res) => {
  const { date, label, recurring } = req.body;
  const h = db_.get('SELECT * FROM public_holidays WHERE id=?', [req.params.id]);
  if (!h) return res.status(404).json({ error: 'Jour férié introuvable' });

  const newDate  = date  !== undefined ? date  : h.date;
  const newLabel = label !== undefined ? label.trim() : h.label;
  const newRec   = recurring !== undefined ? (recurring ? 1 : 0) : h.recurring;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return res.status(400).json({ error: 'Format date invalide' });

  try {
    db_.run(
      'UPDATE public_holidays SET date=?, label=?, recurring=? WHERE id=?',
      [newDate, newLabel, newRec, h.id]
    );
    auditLog(req, 'HOLIDAY_UPDATE', 'public_holidays', h.id, h, { date: newDate, label: newLabel });
    res.json(db_.get('SELECT * FROM public_holidays WHERE id=?', [h.id]));
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Un jour férié existe déjà à cette date' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── DELETE /api/holidays/:id ──────────────────────────────────
router.delete('/:id', ...ADMIN, (req, res) => {
  const h = db_.get('SELECT * FROM public_holidays WHERE id=?', [req.params.id]);
  if (!h) return res.status(404).json({ error: 'Jour férié introuvable' });
  db_.run('DELETE FROM public_holidays WHERE id=?', [h.id]);
  auditLog(req, 'HOLIDAY_DELETE', 'public_holidays', h.id, h, null);
  res.json({ message: 'Jour férié supprimé' });
});

module.exports = router;
