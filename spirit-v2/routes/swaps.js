'use strict';
const router = require('express').Router();
const { db_ }  = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notify, notifyManagers, notifyStaff } = require('./notifications');

const AUTH = requireAuth;
const MGR  = [requireAuth, requireRole('admin','manager','superadmin','rh')];

// ─── helpers ────────────────────────────────────────────────────
function getStaff(id) { return db_.get('SELECT * FROM staff WHERE id=?', [id]); }

/** Retire un créneau d'un planning (semaine + fn_slug + day_index + hour) */
function removeSlot(staffId, weekStart, fnSlug, dayIndex, hour) {
  // Trouver le schedule pour ce staff/semaine/fn
  const sch = db_.get(
    `SELECT s.id FROM schedules s WHERE s.week_start=? AND s.fn_slug=?`,
    [weekStart, fnSlug]
  );
  if (!sch) return false;
  const deleted = db_.run(
    `DELETE FROM schedule_slots WHERE schedule_id=? AND staff_id=? AND day_index=? AND hour_start<=? AND hour_end>?`,
    [sch.id, staffId, dayIndex, hour, hour]
  );
  return deleted.changes > 0;
}

/** Ajoute un créneau d'une heure à partir de `hour` */
function addSlot(staffId, weekStart, fnSlug, dayIndex, hour) {
  let sch = db_.get(
    `SELECT id FROM schedules WHERE week_start=? AND fn_slug=?`,
    [weekStart, fnSlug]
  );
  if (!sch) {
    const fn = db_.get('SELECT id FROM functions WHERE slug=?', [fnSlug]);
    if (!fn) return false;
    const ins = db_.run(
      `INSERT INTO schedules (week_start, fn_slug, function_id, note) VALUES (?,?,?,'')`,
      [weekStart, fnSlug, fn.id]
    );
    sch = { id: ins.lastInsertRowid };
  }
  db_.run(
    `INSERT OR IGNORE INTO schedule_slots (schedule_id, staff_id, day_index, hour_start, hour_end)
     VALUES (?,?,?,?,?)`,
    [sch.id, staffId, dayIndex, hour, hour + 1]
  );
  return true;
}

// ── POST /api/swaps — créer une demande d'échange ─────────────
router.post('/', AUTH, (req, res) => {
  const { week_start, fn_slug, day_index, hour, mode = 'open',
          target_id, swap_week, swap_fn_slug, swap_day_index, swap_hour, note } = req.body;

  // Vérifier que le demandeur est un staff lié à l'utilisateur
  const staffUser = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!staffUser?.staff_id) return res.status(403).json({ error: 'Pas de profil salarié lié' });

  if (!week_start || fn_slug == null || day_index == null || hour == null) {
    return res.status(400).json({ error: 'week_start, fn_slug, day_index, hour requis' });
  }

  const ins = db_.run(
    `INSERT INTO shift_swaps
       (requester_id, week_start, fn_slug, day_index, hour, mode, target_id,
        swap_week, swap_fn_slug, swap_day_index, swap_hour, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [staffUser.staff_id, week_start, fn_slug, day_index, hour, mode,
     target_id || null, swap_week || null, swap_fn_slug || null,
     swap_day_index ?? null, swap_hour ?? null, note || '']
  );

  const me = getStaff(staffUser.staff_id);
  const meLabel = `${me.firstname} ${me.lastname}`;
  const dayNames = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  if (mode === 'targeted' && target_id) {
    // Notif au destinataire ciblé
    notifyStaff(target_id, 'swap',
      `Échange demandé par ${meLabel}`,
      `Créneau: ${dayNames[day_index]} ${hour}h — Sem. ${week_start.slice(5)}`,
      'swap', ins.lastInsertRowid
    );
  }
  notifyManagers('swap',
    `Échange créé par ${meLabel}`,
    `Mode: ${mode === 'open' ? 'ouvert' : 'ciblé'} — ${dayNames[day_index]} ${hour}h — ${week_start.slice(5)}`,
    'swap', ins.lastInsertRowid
  );

  res.status(201).json({ id: ins.lastInsertRowid });
});

// ── GET /api/swaps — liste des échanges pertinents ────────────
router.get('/', AUTH, (req, res) => {
  const su = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  const isManager = ['admin','manager','superadmin','rh'].includes(req.user.role);

  let rows;
  if (isManager) {
    rows = db_.all(
      `SELECT ss.*,
         req.firstname||' '||req.lastname AS requester_name, req.color AS requester_color, req.initials AS requester_initials,
         resp.firstname||' '||resp.lastname AS responder_name
       FROM shift_swaps ss
       JOIN staff req ON req.id = ss.requester_id
       LEFT JOIN staff resp ON resp.id = ss.responder_id
       ORDER BY ss.created_at DESC LIMIT 100`
    );
  } else if (su?.staff_id) {
    const sid = su.staff_id;
    // Mes demandes + demandes qui me sont adressées + demandes ouvertes de ma/mes fonctions
    const myFns = db_.all(
      `SELECT f.slug FROM staff_functions sf JOIN functions f ON f.id=sf.function_id
       WHERE sf.staff_id=? AND sf.active=1`, [sid]
    ).map(r => r.slug);

    rows = db_.all(
      `SELECT ss.*,
         req.firstname||' '||req.lastname AS requester_name, req.color AS requester_color, req.initials AS requester_initials,
         resp.firstname||' '||resp.lastname AS responder_name
       FROM shift_swaps ss
       JOIN staff req ON req.id = ss.requester_id
       LEFT JOIN staff resp ON resp.id = ss.responder_id
       WHERE ss.requester_id=?
          OR ss.target_id=?
          OR (ss.mode='open' AND ss.status='pending' AND ss.fn_slug IN (${myFns.map(()=>'?').join(',')||"'__none__'"}) AND ss.requester_id != ?)
       ORDER BY ss.created_at DESC LIMIT 100`,
      [sid, sid, ...myFns, sid]
    );
  } else {
    rows = [];
  }

  res.json(rows);
});

// ── PUT /api/swaps/:id/respond — le répondant accepte / refuse ─
router.put('/:id/respond', AUTH, (req, res) => {
  const swap = db_.get('SELECT * FROM shift_swaps WHERE id=?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Échange introuvable' });
  if (!['pending'].includes(swap.status)) return res.status(400).json({ error: 'Échange non modifiable' });

  const su = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!su?.staff_id) return res.status(403).json({ error: 'Pas de profil salarié' });

  const { accept, swap_week, swap_fn_slug, swap_day_index, swap_hour } = req.body;

  if (!accept) {
    db_.run(`UPDATE shift_swaps SET status='refused', responder_id=?, responder_at=datetime('now') WHERE id=?`,
      [su.staff_id, swap.id]);
    // Notif au demandeur
    notifyStaff(swap.requester_id, 'swap',
      'Échange refusé',
      `Votre demande a été refusée.`,
      'swap', swap.id
    );
    return res.json({ status: 'refused' });
  }

  // Acceptation: enregistrer le créneau de retour si fourni
  db_.run(
    `UPDATE shift_swaps SET status='matched', responder_id=?, responder_at=datetime('now'),
       swap_week=COALESCE(?,swap_week), swap_fn_slug=COALESCE(?,swap_fn_slug),
       swap_day_index=COALESCE(?,swap_day_index), swap_hour=COALESCE(?,swap_hour)
     WHERE id=?`,
    [su.staff_id, swap_week || null, swap_fn_slug || null,
     swap_day_index ?? null, swap_hour ?? null, swap.id]
  );

  // Notif manager pour approbation
  notifyManagers('swap',
    "Échange en attente d'approbation",
    `Deux salariés ont accepté un échange — semaine ${swap.week_start.slice(5)}`,
    'swap', swap.id
  );
  notifyStaff(swap.requester_id, 'swap',
    'Échange accepté — en attente manager',
    'Un collègue a accepté votre échange. En attente de validation.',
    'swap', swap.id
  );

  res.json({ status: 'matched' });
});

// ── PUT /api/swaps/:id/approve — manager approuve ─────────────
router.put('/:id/approve', ...MGR, (req, res) => {
  const swap = db_.get('SELECT * FROM shift_swaps WHERE id=?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Échange introuvable' });
  if (swap.status !== 'matched') return res.status(400).json({ error: 'L\'échange n\'est pas en statut "matched"' });

  const { note } = req.body;

  // Appliquer les modifications au planning
  try {
    // Retirer le créneau du demandeur
    removeSlot(swap.requester_id, swap.week_start, swap.fn_slug, swap.day_index, swap.hour);
    // Ajouter le créneau au répondant
    if (swap.responder_id) {
      addSlot(swap.responder_id, swap.week_start, swap.fn_slug, swap.day_index, swap.hour);
    }
    // Si échange bilatéral
    if (swap.swap_week && swap.swap_fn_slug && swap.swap_day_index != null && swap.swap_hour != null) {
      removeSlot(swap.responder_id, swap.swap_week, swap.swap_fn_slug, swap.swap_day_index, swap.swap_hour);
      addSlot(swap.requester_id, swap.swap_week, swap.swap_fn_slug, swap.swap_day_index, swap.swap_hour);
    }
  } catch (err) {
    console.error('[swaps/approve] Erreur planning:', err);
  }

  db_.run(
    `UPDATE shift_swaps SET status='approved', manager_id=?, manager_at=datetime('now'), manager_note=? WHERE id=?`,
    [req.user.id, note || '', swap.id]
  );

  notifyStaff(swap.requester_id,  'approval', 'Échange approuvé ✓', 'Le manager a validé votre échange de créneau.', 'swap', swap.id);
  if (swap.responder_id) {
    notifyStaff(swap.responder_id, 'approval', 'Échange approuvé ✓', 'Le manager a validé l\'échange de créneau.', 'swap', swap.id);
  }

  res.json({ status: 'approved' });
});

// ── PUT /api/swaps/:id/refuse — manager refuse ────────────────
router.put('/:id/refuse', ...MGR, (req, res) => {
  const swap = db_.get('SELECT * FROM shift_swaps WHERE id=?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Échange introuvable' });

  const { note } = req.body;
  db_.run(
    `UPDATE shift_swaps SET status='refused', manager_id=?, manager_at=datetime('now'), manager_note=? WHERE id=?`,
    [req.user.id, note || '', swap.id]
  );

  notifyStaff(swap.requester_id, 'swap', 'Échange refusé', note || 'Le manager a refusé l\'échange.', 'swap', swap.id);
  if (swap.responder_id) {
    notifyStaff(swap.responder_id, 'swap', 'Échange refusé', 'L\'échange a été refusé par le manager.', 'swap', swap.id);
  }
  res.json({ status: 'refused' });
});

// ── PUT /api/swaps/:id/cancel — annuler (demandeur) ───────────
router.put('/:id/cancel', AUTH, (req, res) => {
  const swap = db_.get('SELECT * FROM shift_swaps WHERE id=?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Échange introuvable' });

  const su = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  const isManager = ['admin','manager','superadmin','rh'].includes(req.user.role);
  if (!isManager && su?.staff_id !== swap.requester_id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  if (!['pending','matched'].includes(swap.status)) {
    return res.status(400).json({ error: 'Impossible d\'annuler dans ce statut' });
  }

  db_.run(`UPDATE shift_swaps SET status='cancelled' WHERE id=?`, [swap.id]);

  if (swap.responder_id) {
    notifyStaff(swap.responder_id, 'swap', 'Échange annulé', 'La demande d\'échange a été annulée.', 'swap', swap.id);
  }
  res.json({ status: 'cancelled' });
});

module.exports = router;
