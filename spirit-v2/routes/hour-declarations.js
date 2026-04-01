'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyManagers, notifyStaff } = require('./notifications');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin', 'manager', 'superadmin')];

// ── GET /api/hour-declarations ────────────────────────────────
// Staff : ses propres déclarations. Manager+ : toutes (filtrables par ?staffId=&date=)
router.get('/', AUTH, (req, res) => {
  const isManager = ['admin', 'manager', 'superadmin', 'rh'].includes(req.user.role);
  const { staffId, date, from, to, status } = req.query;

  let sql = `
    SELECT hd.*, s.firstname, s.lastname, s.color,
           f.name AS function_name, f.slug AS function_slug, f.icon AS function_icon
    FROM hour_declarations hd
    JOIN staff s ON s.id = hd.staff_id
    LEFT JOIN functions f ON f.id = hd.function_id
    WHERE 1=1
  `;
  const params = [];

  if (!isManager) {
    // Staff ne voit que ses propres déclarations
    const myStaff = db_.get('SELECT id FROM staff WHERE id = ?', [req.user.staff_id]);
    if (!myStaff) return res.json([]);
    sql += ' AND hd.staff_id = ?';
    params.push(req.user.staff_id);
  } else {
    if (staffId) { sql += ' AND hd.staff_id = ?'; params.push(Number(staffId)); }
  }

  if (date)   { sql += ' AND hd.date = ?';        params.push(date); }
  if (from)   { sql += ' AND hd.date >= ?';        params.push(from); }
  if (to)     { sql += ' AND hd.date <= ?';        params.push(to); }
  if (status) { sql += ' AND hd.status = ?';       params.push(status); }

  sql += ' ORDER BY hd.date DESC, hd.hour_start ASC';

  const rows = db_.all(sql, params);
  res.json(rows);
});

// ── POST /api/hour-declarations ───────────────────────────────
// Créer une nouvelle déclaration d'heures reliquat
router.post('/', AUTH, (req, res) => {
  try {
    const { date, function_id, hour_start, hour_end, note } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Date requise (YYYY-MM-DD)' });
    if (hour_start == null || hour_end == null)
      return res.status(400).json({ error: 'Heures de début et de fin requises' });

    const start = Number(hour_start);
    const end   = Number(hour_end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return res.status(400).json({ error: 'Plage horaire invalide' });
    if (start < 0 || end > 24)
      return res.status(400).json({ error: 'Heures hors limites (0–24)' });

    // Récupérer le staff_id de l'utilisateur
    const staffId = req.user.staff_id;
    if (!staffId) return res.status(400).json({ error: 'Votre compte n\'est pas lié à une fiche salarié' });

    const staff = db_.get('SELECT id, firstname, lastname FROM staff WHERE id = ?', [staffId]);
    if (!staff) return res.status(400).json({ error: 'Fiche salarié introuvable' });

    // Vérifier la fonction si fournie + vérifier qu'elle est attribuée à ce salarié
    let fnId = null;
    if (function_id) {
      const fn = db_.get('SELECT id FROM functions WHERE id = ? AND active = 1', [Number(function_id)]);
      if (!fn) return res.status(400).json({ error: 'Fonction introuvable' });
      const assigned = db_.get(
        'SELECT id FROM staff_functions WHERE staff_id = ? AND function_id = ? AND active = 1',
        [staffId, fn.id]
      );
      if (!assigned) return res.status(400).json({ error: 'Cette fonction n\'est pas attribuée à votre profil' });
      fnId = fn.id;
    }

    // M5 — bloquer la déclaration si le salarié est en congé approuvé ce jour
    const onLeave = db_.get(
      `SELECT id FROM leaves WHERE staff_id=? AND status='approved'
       AND start_date <= ? AND end_date >= ?`,
      [staffId, date, date]
    );
    if (onLeave)
      return res.status(409).json({ error: 'Impossible de déclarer des heures sur une journée de congé approuvé' });

    // Si le salarié n'a pas de N+1 (manager_id NULL), auto-approbation immédiate
    const staffFull  = db_.get('SELECT manager_id FROM staff WHERE id = ?', [staffId]);
    const autoApprove = !staffFull?.manager_id;
    const status      = autoApprove ? 'approved' : 'pending';

    const r = db_.run(
      `INSERT INTO hour_declarations
         (staff_id, function_id, date, hour_start, hour_end, note, status,
          reviewed_by, reviewed_at, review_note)
       VALUES (?, ?, ?, ?, ?, ?, ?,
               ?, datetime('now'), ?)`,
      [staffId, fnId, date, start, end, note || null, status,
       autoApprove ? req.user.id : null,
       autoApprove ? 'Auto-approuvé (aucun responsable hiérarchique)' : null]
    );

    const id    = r.lastInsertRowid;
    const hours = Math.round((end - start) * 100) / 100;

    if (!autoApprove) {
      // Notifier les managers uniquement si validation nécessaire
      notifyManagers(
        'approval',
        'Déclaration d\'heures à approuver',
        `${staff.firstname} ${staff.lastname} a déclaré ${hours}h de reliquat le ${date}.`,
        'hour_declaration', id
      );
    }

    res.status(201).json({
      id,
      message: autoApprove
        ? 'Déclaration enregistrée et auto-approuvée'
        : 'Déclaration créée, en attente d\'approbation',
    });
  } catch (err) {
    console.error('[POST /hour-declarations]', err.message, err.stack);
    res.status(500).json({ error: 'Erreur serveur lors de la création de la déclaration' });
  }
});

// ── PUT /api/hour-declarations/:id/review ─────────────────────
// Approuver ou refuser (manager+)
router.put('/:id/review', ...ADMIN, (req, res) => {
  const { status, review_note } = req.body;
  if (!['approved', 'refused'].includes(status))
    return res.status(400).json({ error: 'status doit être approved ou refused' });

  const hd = db_.get('SELECT * FROM hour_declarations WHERE id = ?', [Number(req.params.id)]);
  if (!hd) return res.status(404).json({ error: 'Déclaration introuvable' });
  if (hd.status !== 'pending')
    return res.status(400).json({ error: 'Seules les déclarations en attente peuvent être révisées' });

  db_.run(
    `UPDATE hour_declarations
     SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
     WHERE id = ?`,
    [status, req.user.id, review_note || null, hd.id]
  );

  const staff = db_.get('SELECT id, firstname, lastname FROM staff WHERE id = ?', [hd.staff_id]);
  const hours = Math.round((hd.hour_end - hd.hour_start) * 100) / 100;
  const statusLabel = status === 'approved' ? 'approuvée' : 'refusée';
  const emoji       = status === 'approved' ? '✅' : '❌';

  if (hd.staff_id) {
    notifyStaff(
      hd.staff_id,
      'approval',
      `Déclaration d'heures ${statusLabel}`,
      `${emoji} Votre déclaration de ${hours}h le ${hd.date} a été ${statusLabel}.${review_note ? ' Note : ' + review_note : ''}`,
      'hour_declaration', hd.id
    );
  }

  res.json({ message: `Déclaration ${statusLabel}` });
});

// ── DELETE /api/hour-declarations/:id ────────────────────────
// Annuler sa propre déclaration si encore en attente
router.delete('/:id', AUTH, (req, res) => {
  const hd = db_.get('SELECT * FROM hour_declarations WHERE id = ?', [Number(req.params.id)]);
  if (!hd) return res.status(404).json({ error: 'Déclaration introuvable' });

  const isManager = ['admin', 'manager', 'superadmin'].includes(req.user.role);
  const isOwner   = hd.staff_id === req.user.staff_id;

  if (!isOwner && !isManager)
    return res.status(403).json({ error: 'Accès refusé' });
  if (hd.status !== 'pending')
    return res.status(400).json({ error: 'Seules les déclarations en attente peuvent être annulées' });

  db_.run(
    "UPDATE hour_declarations SET status = 'cancelled' WHERE id = ?",
    [hd.id]
  );

  res.json({ message: 'Déclaration annulée' });
});

module.exports = router;
