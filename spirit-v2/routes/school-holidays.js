// routes/school-holidays.js — Vacances scolaires (sync API Éducation nationale)
'use strict';
const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { db_, getDb } = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { fetchJson } = require('../utils/http-proxy');

const ADMIN = [requireAuth, requireRole('admin', 'superadmin')];

/** Zones valides */
const VALID_ZONES = new Set(['Zone A', 'Zone B', 'Zone C']);

/** Convertit un timestamp ISO 8601 en YYYY-MM-DD heure Paris */
function toParisDate(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  } catch {
    return String(isoStr).slice(0, 10);
  }
}

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de synchronisations, réessayez dans une heure' },
});

// ── GET /api/school-holidays ──────────────────────────────────
// Retourne les vacances scolaires stockées en DB.
// ?zone=Zone A|B|C  (défaut : zone configurée dans settings)
// ?year=YYYY       (filtrer sur une année calendaire)
router.get('/', requireAuth, (req, res) => {
  const zoneSetting = db_.get("SELECT value FROM settings WHERE key='school_holidays_zone'");
  const zone = req.query.zone || zoneSetting?.value || 'Zone C';

  if (!VALID_ZONES.has(zone))
    return res.status(400).json({ error: 'Zone invalide (Zone A, Zone B ou Zone C)' });

  const year = req.query.year ? parseInt(req.query.year, 10) : null;
  let sql    = 'SELECT * FROM school_holidays WHERE zone = ?';
  const params = [zone];

  if (year && !isNaN(year)) {
    // Inclure les périodes qui chevauchent l'année demandée
    sql += ' AND start_date < ? AND end_date > ?';
    params.push(`${year + 1}-01-01`, `${year}-01-01`);
  }
  sql += ' ORDER BY start_date';

  res.json(db_.all(sql, params));
});

// ── GET /api/school-holidays/check-update ────────────────────
// Vérifie si le dataset distant a été mis à jour depuis la dernière sync.
router.get('/check-update', requireAuth, requireRole('admin', 'superadmin'), async (req, res) => {
  const apiUrlSetting     = db_.get("SELECT value FROM settings WHERE key='school_holidays_api_url'");
  const datasetSetting    = db_.get("SELECT value FROM settings WHERE key='school_holidays_api_dataset'");
  const storedModSetting  = db_.get("SELECT value FROM settings WHERE key='school_holidays_api_modified'");
  const lastSyncSetting   = db_.get("SELECT value FROM settings WHERE key='school_holidays_last_sync'");
  const countSetting      = db_.get("SELECT COUNT(*) AS c FROM school_holidays");

  const apiBase   = apiUrlSetting?.value   || 'https://data.education.gouv.fr/api/explore/v2.0';
  const dataset   = datasetSetting?.value  || 'fr-en-calendrier-scolaire';
  const storedMod = storedModSetting?.value || '';

  try {
    const metaUrl = `${apiBase}/catalog/datasets/${encodeURIComponent(dataset)}`;
    const meta    = await fetchJson(metaUrl);
    const apiModified  = meta?.dataset?.metas?.default?.modified   || null;
    const recordsCount = meta?.dataset?.metas?.default?.records_count || null;

    const updateAvailable = !!(apiModified && storedMod && apiModified !== storedMod);
    const neverSynced     = !storedMod || !lastSyncSetting?.value;

    res.json({
      updateAvailable,
      neverSynced,
      apiModified,
      storedModified: storedMod || null,
      lastSync:       lastSyncSetting?.value || null,
      recordsInDb:    countSetting?.c || 0,
      recordsCount,
    });
  } catch (e) {
    res.status(502).json({ error: `Impossible de vérifier les mises à jour : ${e.message}` });
  }
});

// ── POST /api/school-holidays/sync ───────────────────────────
// Admin — synchronise les vacances scolaires depuis l'API Éducation nationale.
// Body: { zone?: 'Zone A'|'Zone B'|'Zone C' }
router.post('/sync', ...ADMIN, syncLimiter, async (req, res) => {
  const apiUrlSetting  = db_.get("SELECT value FROM settings WHERE key='school_holidays_api_url'");
  const datasetSetting = db_.get("SELECT value FROM settings WHERE key='school_holidays_api_dataset'");
  const zoneSetting    = db_.get("SELECT value FROM settings WHERE key='school_holidays_zone'");

  const apiBase = apiUrlSetting?.value   || 'https://data.education.gouv.fr/api/explore/v2.0';
  const dataset = datasetSetting?.value  || 'fr-en-calendrier-scolaire';
  const zone    = req.body.zone || zoneSetting?.value || 'Zone C';

  if (!VALID_ZONES.has(zone))
    return res.status(400).json({ error: 'Zone invalide (Zone A, Zone B ou Zone C)' });

  const PAGE_SIZE   = 100;
  const MAX_RECORDS = 5000; // sécurité anti-boucle infinie
  let offset        = 0;
  let totalExpected = null;
  const allRecords  = [];

  try {
    do {
      // Filtre sur la zone exacte : zones contient "Zone X"
      const whereClause = encodeURIComponent(`zones="${zone}"`);
      const fields      = 'description,start_date,end_date,zones,annee_scolaire';
      const url = `${apiBase}/catalog/datasets/${encodeURIComponent(dataset)}/records`
                + `?where=${whereClause}&limit=${PAGE_SIZE}&offset=${offset}&select=${fields}`;

      const data = await fetchJson(url);

      if (totalExpected === null) totalExpected = Math.min(data.total_count || 0, MAX_RECORDS);
      if (!Array.isArray(data.records) || data.records.length === 0) break;

      allRecords.push(...data.records);
      offset += PAGE_SIZE;
    } while (allRecords.length < totalExpected);

    if (allRecords.length === 0)
      return res.json({ imported: 0, updated: 0, skipped: 0, zone, message: 'Aucune donnée reçue' });

    const _db = getDb();
    const upsert = _db.prepare(`
      INSERT INTO school_holidays (zone, description, start_date, end_date, annee_scolaire)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(zone, start_date, description) DO UPDATE SET
        end_date       = excluded.end_date,
        annee_scolaire = excluded.annee_scolaire
    `);

    let imported = 0, updated = 0, skipped = 0;

    _db.transaction(() => {
      for (const rec of allRecords) {
        const f = rec.record?.fields || rec.fields || {};
        if (!f.start_date || !f.end_date || !f.description) { skipped++; continue; }

        const startDate = toParisDate(f.start_date);
        const endDate   = toParisDate(f.end_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
          skipped++;
          continue;
        }

        const r = upsert.run(zone, String(f.description).slice(0, 200), startDate, endDate, f.annee_scolaire || null);
        if (r.changes > 0) {
          // SQLite ne distingue pas INSERT de UPDATE dans les changes pour upsert ;
          // on vérifie via lastInsertRowid : si > MAX connu → INSERT, sinon UPDATE
          const existed = _db.prepare(
            'SELECT 1 FROM school_holidays WHERE zone=? AND start_date=? AND description=? AND created_at < datetime(\'now\')'
          ).get(zone, startDate, String(f.description).slice(0, 200));
          if (!existed) imported++; else updated++;
        } else {
          skipped++;
        }
      }
    })();

    // Récupérer la date de modification du dataset pour le suivi des mises à jour
    let apiModified = null;
    try {
      const metaUrl = `${apiBase}/catalog/datasets/${encodeURIComponent(dataset)}`;
      const meta    = await fetchJson(metaUrl);
      apiModified   = meta?.dataset?.metas?.default?.modified || null;
    } catch { /* non bloquant */ }

    const now = new Date().toISOString();
    db_.run("UPDATE settings SET value = ? WHERE key = 'school_holidays_last_sync'",   [now]);
    if (apiModified)
      db_.run("UPDATE settings SET value = ? WHERE key = 'school_holidays_api_modified'", [apiModified]);

    auditLog(req, 'SCHOOL_HOLIDAYS_SYNC', 'school_holidays', null, null,
      { zone, imported, updated, skipped, total: allRecords.length });

    res.json({ imported, updated, skipped, zone, lastSync: now, apiModified,
               total: allRecords.length });
  } catch (e) {
    res.status(502).json({ error: `Erreur lors de la synchronisation : ${e.message}` });
  }
});

// ── DELETE /api/school-holidays ───────────────────────────────
// Admin — supprime les vacances scolaires (par zone ou toutes).
// ?zone=Zone A|B|C  (sans paramètre : supprime tout)
router.delete('/', ...ADMIN, (req, res) => {
  const zone = req.query.zone || null;

  if (zone && !VALID_ZONES.has(zone))
    return res.status(400).json({ error: 'Zone invalide (Zone A, Zone B ou Zone C)' });

  if (zone) {
    db_.run('DELETE FROM school_holidays WHERE zone = ?', [zone]);
  } else {
    db_.run('DELETE FROM school_holidays', []);
    db_.run("UPDATE settings SET value = '' WHERE key IN ('school_holidays_last_sync', 'school_holidays_api_modified')");
  }

  auditLog(req, 'SCHOOL_HOLIDAYS_DELETE', 'school_holidays', null, null, { zone: zone || 'all' });
  res.json({ message: zone ? `Vacances zone ${zone} supprimées` : 'Toutes les vacances scolaires supprimées' });
});

module.exports = router;
