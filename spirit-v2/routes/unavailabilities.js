'use strict';
const router = require('express').Router();
const { db_ }  = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify } = require('./notifications');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

/* ── Développer les récurrences dans une plage de dates ──────── */
function expandRecurrences(unavail, from, to) {
  if (unavail.recurrence === 'none') return [unavail];
  const results = [];
  const origStart = new Date(unavail.date_start + 'T12:00:00');
  const origEnd   = new Date(unavail.date_end   + 'T12:00:00');
  const durDays   = Math.round((origEnd - origStart) / (24 * 3600 * 1000));
  const recEnd    = unavail.recurrence_end
    ? new Date(unavail.recurrence_end + 'T12:00:00')
    : new Date(to + 'T12:00:00');
  const step = unavail.recurrence === 'weekly' ? 7 : 14;
  let cur = new Date(origStart);
  while (cur <= recEnd) {
    const curEndD = new Date(cur);
    curEndD.setDate(curEndD.getDate() + durDays);
    const s = cur.toISOString().slice(0, 10);
    const e = curEndD.toISOString().slice(0, 10);
    if (e >= from && s <= to) {
      results.push({ ...unavail, date_start: s, date_end: e, _orig_id: unavail.id });
    }
    cur.setDate(cur.getDate() + step);
  }
  return results;
}

/* ── GET /api/unavailabilities ───────────────────────────────── */
// ?staff_id=  &from=YYYY-MM-DD  &to=YYYY-MM-DD  &status=pending
router.get('/', AUTH, (req, res) => {
  const { staff_id, from, to, status } = req.query;
  let sql = `SELECT u.*, s.firstname, s.lastname, s.color, s.initials
             FROM unavailabilities u
             JOIN staff s ON s.id = u.staff_id
             WHERE 1=1`;
  const params = [];
  if (staff_id) { sql += ' AND u.staff_id = ?'; params.push(Number(staff_id)); }
  if (status)   { sql += ' AND u.status = ?';   params.push(status); }
  if (from && to) {
    // On récupère aussi les récurrentes dont la date de départ est antérieure
    sql += ' AND (u.date_end >= ? AND u.date_start <= ? OR u.recurrence != \'none\')';
    params.push(from, to);
  } else if (from) {
    sql += ' AND u.date_end >= ?'; params.push(from);
  }
  sql += ' ORDER BY u.date_start, u.created_at';

  const rows = db_.all(sql, params);

  if (from && to) {
    const expanded = [];
    for (const r of rows) expanded.push(...expandRecurrences(r, from, to));
    return res.json(expanded.filter(r => r.date_start <= to && r.date_end >= from));
  }
  res.json(rows);
});

/* ── POST /api/unavailabilities ──────────────────────────────── */
router.post('/', AUTH, (req, res) => {
  const { staff_id, date_start, date_end, all_day, hour_start, hour_end,
          note, recurrence, recurrence_end } = req.body;

  if (!staff_id || !date_start || !date_end)
    return res.status(400).json({ error: 'staff_id, date_start, date_end requis' });

  // Un salarié ne peut déclarer que pour lui-même
  if (req.user.role === 'staff' && req.user.staff_id !== Number(staff_id))
    return res.status(403).json({ error: 'Vous ne pouvez déclarer des indisponibilités que pour vous-même' });

  // Délai minimum
  const minNoticeDays = parseInt(
    (db_.get("SELECT value FROM settings WHERE key='unavailability_min_notice_days'") || {}).value || '3', 10
  );
  const approvalRequired =
    (db_.get("SELECT value FROM settings WHERE key='unavailability_approval_required'") || {}).value !== 'false';

  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(date_start + 'T00:00:00');
  const diffDays  = Math.floor((startDate - today) / (24 * 3600 * 1000));
  const needsApproval = approvalRequired && diffDays < minNoticeDays;
  const status = needsApproval ? 'pending' : 'approved';

  const r = db_.run(
    `INSERT INTO unavailabilities
       (staff_id, date_start, date_end, all_day, hour_start, hour_end,
        note, recurrence, recurrence_end, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [Number(staff_id), date_start, date_end,
     all_day ? 1 : 0,
     all_day ? null : (hour_start != null ? Number(hour_start) : null),
     all_day ? null : (hour_end   != null ? Number(hour_end)   : null),
     note || null,
     recurrence || 'none',
     recurrence_end || null,
     status]
  );

  // Notifier le manager si délai non respecté
  if (needsApproval) {
    const staffData = db_.get('SELECT * FROM staff WHERE id = ?', [Number(staff_id)]);
    let managerUser = null;

    if (staffData?.manager_id) {
      managerUser = db_.get(
        'SELECT u.* FROM users u JOIN staff ms ON ms.id = u.staff_id WHERE ms.id = ?',
        [staffData.manager_id]
      );
    }

    if (managerUser) {
      const name = `${staffData.firstname} ${staffData.lastname}`;
      notify(
        managerUser.id, 'approval',
        `⚠️ Indisponibilité hors délai — ${name}`,
        `${name} a déclaré une indisponibilité du ${date_start} au ${date_end} sans respecter le délai de ${minNoticeDays} jour(s). Validation requise.`,
        'unavailability', r.lastInsertRowid
      );
    } else {
      // Pas de manager référent → approbation automatique
      db_.run(
        `UPDATE unavailabilities SET status='approved', review_note='Auto-approuvée (aucun référent assigné)' WHERE id=?`,
        [r.lastInsertRowid]
      );
      return res.json({ id: r.lastInsertRowid, status: 'approved' });
    }
  }

  res.json({ id: r.lastInsertRowid, status });
});

/* ── PUT /api/unavailabilities/:id/review ────────────────────── */
router.put('/:id/review', ...ADMIN, (req, res) => {
  const { status, review_note } = req.body;
  if (!['approved', 'refused'].includes(status))
    return res.status(400).json({ error: 'status doit être "approved" ou "refused"' });

  const unavail = db_.get('SELECT * FROM unavailabilities WHERE id = ?', [Number(req.params.id)]);
  if (!unavail) return res.status(404).json({ error: 'Introuvable' });

  db_.run(
    `UPDATE unavailabilities
     SET status=?, reviewed_by=?, reviewed_at=datetime('now'), review_note=?
     WHERE id=?`,
    [status, req.user.id, review_note || null, Number(req.params.id)]
  );

  // Notifier le salarié du résultat
  const staffUser = db_.get('SELECT u.* FROM users u WHERE u.staff_id = ?', [unavail.staff_id]);
  if (staffUser) {
    const icon = status === 'approved' ? '✅' : '❌';
    notify(
      staffUser.id, 'info',
      `${icon} Indisponibilité ${status === 'approved' ? 'acceptée' : 'refusée'}`,
      status === 'approved'
        ? `Votre indisponibilité du ${unavail.date_start} au ${unavail.date_end} a été acceptée.`
        : `Votre indisponibilité du ${unavail.date_start} au ${unavail.date_end} a été refusée.${review_note ? ' Note : ' + review_note : ''}`,
      'unavailability', unavail.id
    );
  }

  res.json({ ok: true });
});

/* ── DELETE /api/unavailabilities/:id ───────────────────────── */
router.delete('/:id', AUTH, (req, res) => {
  const unavail = db_.get('SELECT * FROM unavailabilities WHERE id = ?', [Number(req.params.id)]);
  if (!unavail) return res.status(404).json({ error: 'Introuvable' });

  if (req.user.role === 'staff' && req.user.staff_id !== unavail.staff_id)
    return res.status(403).json({ error: 'Non autorisé' });

  db_.run('DELETE FROM unavailabilities WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
