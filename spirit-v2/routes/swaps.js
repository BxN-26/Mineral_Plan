'use strict';
const router = require('express').Router();
const { db_ }  = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyStaff } = require('./notifications');

const AUTH = requireAuth;
const MGR  = [requireAuth, requireRole('admin','manager','superadmin','rh')];

// ─── helpers ────────────────────────────────────────────────────
function getStaff(id) { return db_.get('SELECT * FROM staff WHERE id=?', [id]); }

function fmtH(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}h${mm === 0 ? '00' : String(mm).padStart(2, '0')}`;
}

/**
 * Retire la plage [hourStart, hourEnd[ du planning d'un salarié.
 * Gère les chevauchements partiels et les splits.
 */
function removeSlot(staffId, weekStart, fnSlug, dayIndex, hourStart, hourEnd) {
  const fn = db_.get('SELECT id FROM functions WHERE slug=?', [fnSlug]);
  if (!fn) return false;
  const sch = db_.get(
    'SELECT id FROM schedules WHERE week_start=? AND function_id=?',
    [weekStart, fn.id]
  );
  if (!sch) return false;

  const overlapping = db_.all(
    `SELECT * FROM schedule_slots
     WHERE schedule_id=? AND staff_id=? AND day_of_week=?
       AND hour_start < ? AND hour_end > ?`,
    [sch.id, staffId, dayIndex, hourEnd, hourStart]
  );
  if (overlapping.length === 0) return false;

  for (const slot of overlapping) {
    if (slot.hour_start >= hourStart && slot.hour_end <= hourEnd) {
      // Slot entièrement dans la plage → suppression
      db_.run('DELETE FROM schedule_slots WHERE id=?', [slot.id]);
    } else if (slot.hour_start < hourStart && slot.hour_end > hourEnd) {
      // Slot englobe la plage → split en deux
      db_.run('UPDATE schedule_slots SET hour_end=? WHERE id=?', [hourStart, slot.id]);
      db_.run(
        `INSERT INTO schedule_slots
           (schedule_id, staff_id, day_of_week, hour_start, hour_end, task_type, course_slot_id)
         VALUES (?,?,?,?,?,?,?)`,
        [sch.id, staffId, dayIndex, hourEnd, slot.hour_end, slot.task_type || null, slot.course_slot_id || null]
      );
    } else if (slot.hour_start < hourStart) {
      // Déborde avant → raccourcir la fin
      db_.run('UPDATE schedule_slots SET hour_end=? WHERE id=?', [hourStart, slot.id]);
    } else {
      // Déborde après → raccourcir le début
      db_.run('UPDATE schedule_slots SET hour_start=? WHERE id=?', [hourEnd, slot.id]);
    }
  }
  return true;
}

/** Ajoute une plage [hourStart, hourEnd[ au planning d'un salarié */
function addSlot(staffId, weekStart, fnSlug, dayIndex, hourStart, hourEnd) {
  const fn = db_.get('SELECT id FROM functions WHERE slug=?', [fnSlug]);
  if (!fn) return false;

  let sch = db_.get(
    'SELECT id FROM schedules WHERE week_start=? AND function_id=?',
    [weekStart, fn.id]
  );
  if (!sch) {
    const ins = db_.run(
      `INSERT INTO schedules (week_start, function_id, note) VALUES (?,?,'')`,
      [weekStart, fn.id]
    );
    sch = { id: ins.lastInsertRowid };
  }
  db_.run(
    `INSERT OR IGNORE INTO schedule_slots (schedule_id, staff_id, day_of_week, hour_start, hour_end)
     VALUES (?,?,?,?,?)`,
    [sch.id, staffId, dayIndex, hourStart, hourEnd]
  );
  return true;
}

/** Staff_id du manager direct d'un salarié */
function getManagerStaffId(staffId) {
  return db_.get('SELECT manager_id FROM staff WHERE id=?', [staffId])?.manager_id || null;
}

/** Collègues actifs d'une fonction (hors staffId) */
function getFunctionColleagues(staffId, fnSlug) {
  return db_.all(
    `SELECT sf.staff_id FROM staff_functions sf
       JOIN functions f ON f.id = sf.function_id
       JOIN staff s ON s.id = sf.staff_id
     WHERE f.slug=? AND sf.active=1 AND sf.staff_id != ? AND s.active=1`,
    [fnSlug, staffId]
  ).map(r => r.staff_id);
}

// ── POST /api/swaps — créer une demande d'échange ─────────────
router.post('/', AUTH, (req, res) => {
  const {
    week_start, fn_slug, day_index, hour_start, hour_end,
    mode = 'open', target_id,
    swap_week, swap_fn_slug, swap_day_index, swap_hour_start, swap_hour_end,
    note,
  } = req.body;

  const staffUser = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!staffUser?.staff_id) return res.status(403).json({ error: 'Pas de profil salarié lié' });

  if (!week_start || fn_slug == null || day_index == null || hour_start == null || hour_end == null) {
    return res.status(400).json({ error: 'week_start, fn_slug, day_index, hour_start, hour_end requis' });
  }
  // Normaliser week_start au lundi de la semaine
  const wsDate = new Date(week_start + 'T12:00:00');
  const dow = wsDate.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  wsDate.setDate(wsDate.getDate() + diff);
  const weekStartNorm = wsDate.toISOString().slice(0, 10);
  if (Number(hour_end) <= Number(hour_start)) {
    return res.status(400).json({ error: 'hour_end doit être après hour_start' });
  }

  const ins = db_.run(
    `INSERT INTO shift_swaps
       (requester_id, week_start, fn_slug, day_index, hour, hour_start, hour_end, mode, target_id,
        swap_week, swap_fn_slug, swap_day_index, swap_hour_start, swap_hour_end, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      staffUser.staff_id, weekStartNorm, fn_slug, day_index,
      Math.floor(Number(hour_start)), // hour garde NOT NULL
      Number(hour_start), Number(hour_end),
      mode, target_id || null,
      swap_week || null, swap_fn_slug || null, swap_day_index ?? null,
      swap_hour_start ?? null, swap_hour_end ?? null,
      note || '',
    ]
  );

  const swapId = ins.lastInsertRowid;
  const me = getStaff(staffUser.staff_id);
  const meLabel = `${me.firstname} ${me.lastname}`;
  const dayNames = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const creneauLabel = `${dayNames[day_index]} ${fmtH(Number(hour_start))}–${fmtH(Number(hour_end))} — sem. ${weekStartNorm.slice(5)}`;
  const managerSid = getManagerStaffId(staffUser.staff_id);

  if (mode === 'targeted' && target_id) {
    notifyStaff(target_id, 'swap',
      `🔄 Échange demandé par ${meLabel}`,
      `Créneau : ${creneauLabel}`,
      'swap', swapId
    );
  } else {
    // Mode ouvert : notifier tous les collègues de la fonction
    const colleagues = getFunctionColleagues(staffUser.staff_id, fn_slug);
    for (const cid of colleagues) {
      notifyStaff(cid, 'swap',
        `🔄 Échange disponible — ${meLabel}`,
        `Créneau à reprendre : ${creneauLabel}`,
        'swap', swapId
      );
    }
  }
  // Le référent n'est notifié qu'en cas d'alerte urgente (job 30min) ou lors de l'acceptation
  res.status(201).json({ id: swapId });
});

// ── GET /api/swaps — liste des échanges pertinents ────────────
router.get('/', AUTH, (req, res) => {
  const su = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  const isManager = ['admin','manager','superadmin','rh'].includes(req.user.role);

  let rows;
  if (isManager) {
    rows = db_.all(
      `SELECT ss.*,
         req.firstname||' '||req.lastname AS requester_name,
         req.color AS requester_color, req.initials AS requester_initials,
         resp.firstname||' '||resp.lastname AS responder_name
       FROM shift_swaps ss
       JOIN staff req ON req.id = ss.requester_id
       LEFT JOIN staff resp ON resp.id = ss.responder_id
       ORDER BY ss.created_at DESC LIMIT 100`
    );
  } else if (su?.staff_id) {
    const sid = su.staff_id;
    const myFns = db_.all(
      `SELECT f.slug FROM staff_functions sf JOIN functions f ON f.id=sf.function_id
       WHERE sf.staff_id=? AND sf.active=1`, [sid]
    ).map(r => r.slug);

    rows = db_.all(
      `SELECT ss.*,
         req.firstname||' '||req.lastname AS requester_name,
         req.color AS requester_color, req.initials AS requester_initials,
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
  if (swap.status !== 'pending') return res.status(400).json({ error: 'Échange non modifiable' });

  const su = db_.get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!su?.staff_id) return res.status(403).json({ error: 'Pas de profil salarié' });

  const { accept, swap_week, swap_fn_slug, swap_day_index, swap_hour_start, swap_hour_end } = req.body;
  const responderId = su.staff_id;

  const dayNames = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const creneauLabel = `${dayNames[swap.day_index]} ${fmtH(swap.hour_start)}–${fmtH(swap.hour_end)} — sem. ${swap.week_start.slice(5)}`;
  const requester = getStaff(swap.requester_id);
  const requesterLabel = `${requester.firstname} ${requester.lastname}`;
  const managerSid = getManagerStaffId(swap.requester_id);

  if (!accept) {
    let refusedBy;
    try { refusedBy = JSON.parse(swap.refused_by || '[]'); } catch { refusedBy = []; }
    if (!refusedBy.includes(responderId)) refusedBy.push(responderId);

    if (swap.mode === 'targeted' && swap.target_id === responderId) {
      // La cible directe refuse → passer en mode ouvert, notifier les autres collègues
      const remaining = getFunctionColleagues(swap.requester_id, swap.fn_slug)
        .filter(id => !refusedBy.includes(id));

      if (remaining.length === 0) {
        // Plus personne disponible → alerte référent
        if (managerSid) {
          notifyStaff(managerSid, 'urgent',
            `⚠️ Échange sans preneur — intervention requise`,
            `Personne n'est disponible pour reprendre le créneau de ${requesterLabel} : ${creneauLabel}. Veuillez attribuer ce créneau manuellement.`,
            'swap', swap.id
          );
        }
        db_.run(
          `UPDATE shift_swaps SET refused_by=?, mode='open', target_id=NULL, status='refused', urgent_alert_sent=1 WHERE id=?`,
          [JSON.stringify(refusedBy), swap.id]
        );
      } else {
        // Notifier les collègues restants
        for (const cid of remaining) {
          notifyStaff(cid, 'swap',
            `🔄 Échange disponible — ${requesterLabel}`,
            `Créneau à reprendre : ${creneauLabel}`,
            'swap', swap.id
          );
        }
        if (managerSid) {
          notifyStaff(managerSid, 'swap',
            `🔄 Échange ciblé refusé → ouvert`,
            `La demande de ${requesterLabel} est désormais ouverte à l'équipe : ${creneauLabel}`,
            'swap', swap.id
          );
        }
        db_.run(
          `UPDATE shift_swaps SET refused_by=?, mode='open', target_id=NULL WHERE id=?`,
          [JSON.stringify(refusedBy), swap.id]
        );
      }
      // Informer le demandeur du refus
      notifyStaff(swap.requester_id, 'swap',
        '🔄 Échange refusé par la cible',
        `La demande ciblée a été refusée. Elle est maintenant ouverte à l'équipe.`,
        'swap', swap.id
      );

    } else {
      // Refus en mode ouvert
      const allColleagues = getFunctionColleagues(swap.requester_id, swap.fn_slug);
      const remaining = allColleagues.filter(id => !refusedBy.includes(id));

      db_.run(
        `UPDATE shift_swaps SET refused_by=? WHERE id=?`,
        [JSON.stringify(refusedBy), swap.id]
      );

      if (remaining.length === 0) {
        // Tout le monde a refusé → alerte urgente référent
        if (managerSid) {
          notifyStaff(managerSid, 'urgent',
            `⚠️ Échange sans preneur — toute l'équipe a refusé`,
            `Toute l'équipe a refusé de reprendre le créneau de ${requesterLabel} : ${creneauLabel}. Veuillez attribuer ce créneau manuellement.`,
            'swap', swap.id
          );
        }
        db_.run(`UPDATE shift_swaps SET urgent_alert_sent=1 WHERE id=?`, [swap.id]);
        notifyStaff(swap.requester_id, 'swap',
          '🔄 Aucun remplaçant disponible',
          `Tous vos collègues ont refusé votre demande d'échange. Votre référent a été alerté.`,
          'swap', swap.id
        );
      }
    }

    return res.json({ status: swap.status, refused: true });
  }

  // Acceptation
  db_.run(
    `UPDATE shift_swaps SET status='matched', responder_id=?, responder_at=datetime('now'),
       swap_week=COALESCE(?,swap_week), swap_fn_slug=COALESCE(?,swap_fn_slug),
       swap_day_index=COALESCE(?,swap_day_index),
       swap_hour_start=COALESCE(?,swap_hour_start),
       swap_hour_end=COALESCE(?,swap_hour_end)
     WHERE id=?`,
    [
      responderId, swap_week || null, swap_fn_slug || null,
      swap_day_index ?? null, swap_hour_start ?? null, swap_hour_end ?? null,
      swap.id,
    ]
  );

  if (managerSid) {
    notifyStaff(managerSid, 'swap',
      `🔄 Échange en attente d'approbation`,
      `${requesterLabel} ↔ ${getStaff(responderId)?.firstname || '?'} — ${creneauLabel}`,
      'swap', swap.id
    );
  }
  notifyStaff(swap.requester_id, 'swap',
    '🔄 Échange accepté — en attente manager',
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

  try {
    removeSlot(swap.requester_id, swap.week_start, swap.fn_slug, swap.day_index, swap.hour_start, swap.hour_end);
    if (swap.responder_id) {
      addSlot(swap.responder_id, swap.week_start, swap.fn_slug, swap.day_index, swap.hour_start, swap.hour_end);
    }
    if (swap.swap_week && swap.swap_fn_slug && swap.swap_day_index != null
        && swap.swap_hour_start != null && swap.swap_hour_end != null) {
      removeSlot(swap.responder_id, swap.swap_week, swap.swap_fn_slug, swap.swap_day_index, swap.swap_hour_start, swap.swap_hour_end);
      addSlot(swap.requester_id,   swap.swap_week, swap.swap_fn_slug, swap.swap_day_index, swap.swap_hour_start, swap.swap_hour_end);
    }
  } catch (err) {
    console.error('[swaps/approve] Erreur planning:', err);
  }

  db_.run(
    `UPDATE shift_swaps SET status='approved', manager_id=?, manager_at=datetime('now'), manager_note=? WHERE id=?`,
    [req.user.id, note || '', swap.id]
  );

  notifyStaff(swap.requester_id, 'approval', '✅ Échange approuvé', 'Le manager a validé votre échange de créneau.', 'swap', swap.id);
  if (swap.responder_id) {
    notifyStaff(swap.responder_id, 'approval', '✅ Échange approuvé', 'Le manager a validé l\'échange de créneau.', 'swap', swap.id);
  }

  res.json({ status: 'approved' });
});

// ── PUT /api/swaps/:id/assign — référent assigne un remplaçant ─
router.put('/:id/assign', ...MGR, (req, res) => {
  const swap = db_.get('SELECT * FROM shift_swaps WHERE id=?', [req.params.id]);
  if (!swap) return res.status(404).json({ error: 'Échange introuvable' });
  if (!['pending', 'matched', 'refused'].includes(swap.status))
    return res.status(400).json({ error: 'Statut invalide pour une assignation directe' });

  const assigneeId = parseInt(req.body.assignee_id, 10);
  if (!assigneeId) return res.status(400).json({ error: 'assignee_id requis' });
  const assignee = getStaff(assigneeId);
  if (!assignee) return res.status(404).json({ error: 'Salarié introuvable' });
  const requester = getStaff(swap.requester_id);

  try {
    removeSlot(swap.requester_id, swap.week_start, swap.fn_slug, swap.day_index, swap.hour_start, swap.hour_end);
    addSlot(assigneeId, swap.week_start, swap.fn_slug, swap.day_index, swap.hour_start, swap.hour_end);
  } catch (err) {
    console.error('[swaps/assign] Erreur planning:', err);
  }

  db_.run(
    `UPDATE shift_swaps SET status='approved', responder_id=?, manager_id=?, manager_at=datetime('now'), manager_note=? WHERE id=?`,
    [assigneeId, req.user.id, req.body.note || '', swap.id]
  );

  notifyStaff(swap.requester_id, 'approval',
    '✅ Remplaçant désigné par le référent',
    `${assignee.firstname} ${assignee.lastname} a été désigné pour votre créneau ${fmtH(swap.hour_start)}–${fmtH(swap.hour_end)}.`,
    'swap', swap.id
  );
  notifyStaff(assigneeId, 'swap',
    '📋 Créneau assigné par le référent',
    `Le référent vous a assigné le créneau de ${requester?.firstname || '?'} : ${fmtH(swap.hour_start)}–${fmtH(swap.hour_end)} (sem. ${swap.week_start}).`,
    'swap', swap.id
  );

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

  notifyStaff(swap.requester_id, 'swap', '🔄 Échange refusé', note || 'Le manager a refusé l\'échange.', 'swap', swap.id);
  if (swap.responder_id) {
    notifyStaff(swap.responder_id, 'swap', '🔄 Échange refusé', 'L\'échange a été refusé par le manager.', 'swap', swap.id);
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
