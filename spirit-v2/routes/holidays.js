// routes/holidays.js — Gestion des jours fériés configurables
'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { db_ }                               = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { fetchJson }                         = require('../utils/http-proxy');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

const VALID_ZONES = new Set([
  'metropole', 'alsace-moselle', 'guadeloupe', 'martinique', 'mayotte',
  'nouvelle-caledonie', 'polynesie-francaise', 'saint-barthelemy',
  'saint-martin', 'saint-pierre-et-miquelon', 'wallis-et-futuna', 'la-reunion',
]);

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de synchronisations, réessayez dans une heure' },
});

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

// ── POST /api/holidays/sync-from-api ─────────────────────────
// Admin — importe les jours fériés depuis l'API calendrier.api.gouv.fr
// pour l'année demandée (ponctuel : recurring=0).
router.post('/sync-from-api', ...ADMIN, syncLimiter, async (req, res) => {
  const { year } = req.body;
  const importYear = year ? parseInt(year, 10) : new Date().getFullYear();
  if (isNaN(importYear) || importYear < 2020 || importYear > 2040)
    return res.status(400).json({ error: 'Année invalide (2020–2040)' });

  const zoneSetting   = db_.get("SELECT value FROM settings WHERE key='public_holidays_zone'");
  const apiUrlSetting = db_.get("SELECT value FROM settings WHERE key='public_holidays_api_url'");
  const zone    = zoneSetting?.value   || 'metropole';
  const apiBase = apiUrlSetting?.value || 'https://calendrier.api.gouv.fr/jours-feries/';

  if (!VALID_ZONES.has(zone))
    return res.status(400).json({ error: 'Zone configurée invalide' });

  const url = `${apiBase}${encodeURIComponent(zone)}/${importYear}.json`;

  try {
    const data = await fetchJson(url);
    if (typeof data !== 'object' || Array.isArray(data))
      return res.status(502).json({ error: 'Format de réponse inattendu' });

    const entries = Object.entries(data);
    if (entries.length === 0)
      return res.json({ imported: 0, skipped: 0, year: importYear, zone });

    const insert = db_.run.bind(null);
    let imported = 0, skipped = 0;
    const stmt = require('../db/database').getDb().prepare(
      'INSERT OR IGNORE INTO public_holidays (date, label, recurring) VALUES (?, ?, 0)'
    );
    require('../db/database').getDb().transaction(() => {
      for (const [date, label] of entries) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const r = stmt.run(date, String(label).slice(0, 100));
        if (r.changes > 0) imported++; else skipped++;
      }
    })();

    auditLog(req, 'HOLIDAYS_SYNC_API', 'public_holidays', null, null, { year: importYear, zone, imported });
    res.json({ imported, skipped, year: importYear, zone });
  } catch (e) {
    res.status(502).json({ error: `Impossible de contacter l'API : ${e.message}` });
  }
});

module.exports = router;
