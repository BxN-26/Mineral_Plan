// routes/leaves.js — Workflow d'approbation hiérarchique complet
const router = require('express').Router();
const { db_ }                               = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { notify }                             = require('./notifications');
const { sendPush }                           = require('./push');

const AUTH  = requireAuth;
const MGR   = [requireAuth, requireRole('admin','manager','rh','superadmin')];
const RH    = [requireAuth, requireRole('admin','rh','superadmin')];
const ADMIN = [requireAuth, requireRole('admin','superadmin')];

// ── Helpers ──────────────────────────────────────────────────
function calcDays(start, end, method = 'working_days') {
  let days = 0;
  const d = new Date(start), e = new Date(end);
  while (d <= e) {
    if (method === 'working_days') {
      if (d.getDay() !== 0 && d.getDay() !== 7) days++; // Lun-Sam
    } else {
      days++;
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getNextApprover(leave, leaveType) {
  const levels = JSON.parse(leaveType.approval_levels || '["manager"]');
  const step   = leave.approval_step || 1;
  return levels[step - 1] || null;
}

function resolveApprover(staffId, level) {
  // level: 'manager' | 'rh' | 'direction'
  if (level === 'manager') {
    const mgr = db_.get(
      'SELECT u.* FROM users u JOIN staff s ON s.manager_id = u.staff_id WHERE s.id = ?',
      [staffId]
    );
    return mgr;
  }
  if (level === 'rh') {
    return db_.get("SELECT * FROM users WHERE role IN ('rh','admin','superadmin') AND active=1 LIMIT 1");
  }
  if (level === 'direction') {
    return db_.get("SELECT * FROM users WHERE role IN ('admin','superadmin') AND active=1 LIMIT 1");
  }
  return null;
}

// ── GET /api/leaves ──────────────────────────────────────────
router.get('/', AUTH, (req, res) => {
  const { staff_id, status, year, from, to, pending_for, my_approvals } = req.query;

  let sql = `
    SELECT l.*,
           s.firstname || ' ' || s.lastname AS staff_name,
           s.initials, s.color, s.team_id,
           t.name AS team_name, t.color AS team_color,
           lt.label AS type_label, lt.short_label, lt.color AS type_color,
           lt.bg_color AS type_bg, lt.approval_levels, lt.paid,
           -- N1 approver
           u1.email AS n1_email,
           s1.firstname || ' ' || s1.lastname AS n1_name,
           -- N2 approver
           u2.email AS n2_email,
           s2.firstname || ' ' || s2.lastname AS n2_name
    FROM leaves l
    JOIN staff s   ON s.id = l.staff_id
    LEFT JOIN teams t ON t.id = s.team_id
    JOIN leave_types lt ON lt.id = l.type_id
    LEFT JOIN users u1  ON u1.id = l.n1_approver_id
    LEFT JOIN staff s1  ON s1.id = u1.staff_id
    LEFT JOIN users u2  ON u2.id = l.n2_approver_id
    LEFT JOIN staff s2  ON s2.id = u2.staff_id
    WHERE 1=1
  `;
  const p = [];

  // Un viewer/staff ne voit que ses propres congés
  if (req.user.role === 'staff') {
    sql += ' AND l.staff_id = ?'; p.push(req.user.staff_id);
  } else if (staff_id) {
    sql += ' AND l.staff_id = ?'; p.push(staff_id);
  }

  if (status)   { sql += ' AND l.status = ?';   p.push(status); }
  if (from)     { sql += ' AND l.end_date >= ?';   p.push(from); }
  if (to)       { sql += ' AND l.start_date <= ?'; p.push(to); }
  if (year)     { sql += ' AND strftime("%Y",l.start_date) = ?'; p.push(String(year)); }

  // Congés en attente de MON approbation
  if (my_approvals === '1' && req.user.id) {
    sql += ` AND (
      (l.n1_approver_id = ? AND l.n1_status = 'pending') OR
      (l.n2_approver_id = ? AND l.n2_status = 'pending') OR
      (l.n3_approver_id = ? AND l.n3_status = 'pending')
    )`;
    p.push(req.user.id, req.user.id, req.user.id);
  }

  sql += ' ORDER BY l.created_at DESC LIMIT 500';
  res.json(db_.all(sql, p));
});

// ── GET /api/leaves/pending-count ───────────────────────────
router.get('/pending-count', AUTH, (req, res) => {
  const count = db_.get(
    `SELECT COUNT(*) as n FROM leaves
     WHERE (n1_approver_id=? AND n1_status='pending')
        OR (n2_approver_id=? AND n2_status='pending')
        OR (n3_approver_id=? AND n3_status='pending')`,
    [req.user.id, req.user.id, req.user.id]
  );
  res.json({ count: count?.n || 0 });
});

// ── GET /api/leaves/balance/:staffId ───────────────────────
router.get('/balance/:staffId', AUTH, (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const used = db_.all(
    `SELECT lt.slug, lt.label, lt.color,
            COALESCE(SUM(l.days_count),0) as used_days,
            COALESCE(SUM(l.hours_count),0) as used_hours
     FROM leave_types lt
     LEFT JOIN leaves l ON l.type_id=lt.id AND l.staff_id=?
       AND l.status='approved' AND strftime('%Y',l.start_date)=?
     WHERE lt.active=1
     GROUP BY lt.id ORDER BY lt.sort_order`,
    [req.params.staffId, String(year)]
  );
  const staff = db_.get('SELECT cp_balance, rtt_balance FROM staff WHERE id=?', [req.params.staffId]);
  res.json({ used, balances: staff, year });
});

// ── POST /api/leaves ─────────────────────────────────────────
router.post('/', AUTH, (req, res) => {
  const { staff_id, type_id, start_date, end_date, reason, document_url } = req.body;
  if (!staff_id || !type_id || !start_date || !end_date)
    return res.status(400).json({ error: 'Champs requis manquants' });

  // Vérification droits
  if (req.user.role === 'staff' && req.user.staff_id !== Number(staff_id))
    return res.status(403).json({ error: 'Non autorisé' });

  const leaveType = db_.get('SELECT * FROM leave_types WHERE id=?', [type_id]);
  if (!leaveType) return res.status(404).json({ error: 'Type de congé invalide' });

  // Délai minimum (ignoré pour admin/manager/superadmin)
  const isPrivileged = ['admin','superadmin','manager','rh'].includes(req.user.role);
  if (!isPrivileged) {
    // 1. Règle globale configurable depuis les paramètres
    const noticeEnabled = db_.get("SELECT value FROM settings WHERE key='leave_min_notice_enabled'");
    const noticeDays    = db_.get("SELECT value FROM settings WHERE key='leave_min_notice_days'");
    if (noticeEnabled?.value === 'true' && noticeDays) {
      const globalMin  = parseInt(noticeDays.value, 10) || 0;
      const today      = new Date();
      const startDt    = new Date(start_date);
      const diff       = Math.floor((startDt - today) / 86400000);
      if (diff < globalMin)
        return res.status(400).json({
          error: `Délai de préavis insuffisant : merci de soumettre votre demande au moins ${globalMin} jour(s) avant la date de début.`,
        });
    }
    // 2. Règle par type de congé
    if (leaveType.min_notice_days > 0) {
      const today      = new Date();
      const startDt    = new Date(start_date);
      const noticeDiff = Math.floor((startDt - today) / 86400000);
      if (noticeDiff < leaveType.min_notice_days)
        return res.status(400).json({
          error: `Délai de préavis insuffisant pour ce type de congé : merci de soumettre au moins ${leaveType.min_notice_days} jours avant la date de début.`,
        });
    }
  }

  // Chevauchement
  const conflict = db_.get(
    `SELECT id FROM leaves WHERE staff_id=? AND status NOT IN ('refused','cancelled')
     AND NOT (end_date < ? OR start_date > ?)`,
    [staff_id, start_date, end_date]
  );
  if (conflict) return res.status(409).json({ error: 'Conflit avec un congé existant', conflict_id: conflict.id });

  const days  = calcDays(start_date, end_date, leaveType.count_method);
  const levels = JSON.parse(leaveType.approval_levels || '["manager"]');

  // Résolution approvers — dédupliqués (si N2 = N1, inutile d'un 2e niveau)
  const n1 = resolveApprover(staff_id, levels[0]);
  let   n2 = levels[1] ? resolveApprover(staff_id, levels[1]) : null;
  let   n3 = levels[2] ? resolveApprover(staff_id, levels[2]) : null;
  // Supprimer les niveaux redondants (même utilisateur)
  if (n2 && n1 && n2.id === n1.id) n2 = null;
  if (n3 && n2 && n3.id === n2.id) n3 = null;
  if (n3 && !n2 && n1 && n3.id === n1.id) n3 = null;

  const r = db_.run(
    `INSERT INTO leaves
       (staff_id, type_id, start_date, end_date, days_count, reason, document_url,
        status, approval_step, submitted_at,
        n1_approver_id, n1_status,
        n2_approver_id, n2_status,
        n3_approver_id, n3_status)
     VALUES (?,?,?,?,?,?,?, 'pending',1,datetime('now'), ?,?, ?,?, ?,?)`,
    [staff_id, type_id, start_date, end_date, days, reason||null, document_url||null,
     n1?.id||null, n1?'pending':null,
     n2?.id||null, n2?'pending':null,
     n3?.id||null, n3?'pending':null]
  );

  // Notifier N1
  if (n1) {
    db_.run('INSERT INTO leave_notifications (leave_id,user_id,type) VALUES (?,?,?)',
      [r.lastInsertRowid, n1.id, 'new_request']);
  }

  auditLog(req, 'LEAVE_CREATE', 'leaves', r.lastInsertRowid, null, req.body);
  res.status(201).json({ id: r.lastInsertRowid, days_count: days, n1_approver: n1?.email });
});

// ── PUT /api/leaves/:id/approve ──────────────────────────────
router.put('/:id/approve', AUTH, (req, res) => {
  const { comment } = req.body;
  const leave = db_.get(
    'SELECT l.*, lt.approval_levels FROM leaves l JOIN leave_types lt ON lt.id=l.type_id WHERE l.id=?',
    [req.params.id]
  );
  if (!leave) return res.status(404).json({ error: 'Congé introuvable' });

  const userId  = req.user.id;
  const levels  = JSON.parse(leave.approval_levels || '["manager"]');
  let nextStatus = leave.status;

  // Déterminer quel niveau approuve
  if (leave.n1_approver_id === userId && leave.n1_status === 'pending') {
    db_.run(`UPDATE leaves SET n1_status='approved', n1_comment=?, n1_reviewed_at=datetime('now'),
             approval_step=2, updated_at=datetime('now') WHERE id=?`, [comment||null, leave.id]);

    if (levels.length < 2 || !leave.n2_approver_id) {
      // Approbation finale
      db_.run(`UPDATE leaves SET status='approved', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      nextStatus = 'approved';
    } else {
      db_.run(`UPDATE leaves SET status='approved_n1', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      // Notifier N2
      db_.run('INSERT INTO leave_notifications (leave_id,user_id,type) VALUES (?,?,?)',
        [leave.id, leave.n2_approver_id, 'new_request']);
      nextStatus = 'approved_n1';
    }

  } else if (leave.n2_approver_id === userId && leave.n2_status === 'pending') {
    db_.run(`UPDATE leaves SET n2_status='approved', n2_comment=?, n2_reviewed_at=datetime('now'),
             approval_step=3, updated_at=datetime('now') WHERE id=?`, [comment||null, leave.id]);

    if (levels.length < 3 || !leave.n3_approver_id) {
      db_.run(`UPDATE leaves SET status='approved', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      nextStatus = 'approved';
    } else {
      db_.run(`UPDATE leaves SET status='approved_n2', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      db_.run('INSERT INTO leave_notifications (leave_id,user_id,type) VALUES (?,?,?)',
        [leave.id, leave.n3_approver_id, 'new_request']);
      nextStatus = 'approved_n2';
    }

  } else if (leave.n3_approver_id === userId && leave.n3_status === 'pending') {
    db_.run(`UPDATE leaves SET n3_status='approved', n3_comment=?, n3_reviewed_at=datetime('now'),
             status='approved', approval_step=99, updated_at=datetime('now') WHERE id=?`,
      [comment||null, leave.id]);
    nextStatus = 'approved';

  } else if (['admin','superadmin'].includes(req.user.role) &&
             ['approved_n1','approved_n2'].includes(leave.status) &&
             !leave.n2_approver_id && !leave.n3_approver_id) {
    // Cas de finalisation : N1 approuvé, mais pas de N2 assigné (dédup ou configuration)
    db_.run(`UPDATE leaves SET status='approved', approval_step=99, updated_at=datetime('now') WHERE id=?`,
      [leave.id]);
    nextStatus = 'approved';

  } else {
    return res.status(403).json({ error: 'Vous n\'êtes pas le valideur de ce congé à cette étape' });
  }

  // Si approuvé définitivement → déduire du solde + notifier managers des créneaux impactés + push salarié
  if (nextStatus === 'approved') {
    const lt = db_.get('SELECT slug, label FROM leave_types WHERE id=?', [leave.type_id]);
    if (lt?.slug === 'cp')
      db_.run('UPDATE staff SET cp_balance = MAX(0, cp_balance - ?) WHERE id=?', [leave.days_count, leave.staff_id]);
    else if (lt?.slug === 'rtt')
      db_.run('UPDATE staff SET rtt_balance = MAX(0, rtt_balance - ?) WHERE id=?', [leave.days_count, leave.staff_id]);

    // Push notification au salarié concerné
    const staffUser = db_.get('SELECT id FROM users WHERE staff_id=? AND active=1', [leave.staff_id]);
    if (staffUser) {
      sendPush(staffUser.id, {
        title: '✅ Congé approuvé',
        body:  `Votre ${lt?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} a été validé.`,
        url:   '/conges',
      });
    }

    // Trouver les créneaux planifiés du salarié qui tombent dans la période de congé
    // Utiliser T12:00:00 pour éviter les décalages de fuseau horaire (minuit local ≠ minuit UTC)
    const leaveStart = new Date(leave.start_date + 'T12:00:00');
    const leaveEnd   = new Date(leave.end_date   + 'T12:00:00');

    // Calculer les lundis de chaque semaine chevauchant les congés
    const weeksAffected = new Set();
    const d = new Date(leaveStart);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // rewind to Monday
    while (d <= leaveEnd) {
      // Formater en YYYY-MM-DD sans passer par toISOString() (évite le décalage UTC)
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      weeksAffected.add(`${y}-${m}-${day}`);
      d.setDate(d.getDate() + 7);
    }

    const staffRow = db_.get('SELECT firstname, lastname FROM staff WHERE id=?', [leave.staff_id]);
    const staffName = staffRow ? `${staffRow.firstname} ${staffRow.lastname}` : `Salarié #${leave.staff_id}`;

    for (const week of weeksAffected) {
      // Vérifier s'il y a des schedule_slots pour ce salarié cette semaine-là
      const slots = db_.all(
        `SELECT ss.day_of_week, f.slug AS fn_slug, f.name AS fn_name
         FROM schedule_slots ss
         JOIN schedules sc ON sc.id = ss.schedule_id
         JOIN functions f  ON f.id  = sc.function_id
         WHERE sc.week_start = ? AND ss.staff_id = ?
         LIMIT 10`,
        [week, leave.staff_id]
      );
      if (!slots.length) continue;

      const dayNames = ['lun','mar','mer','jeu','ven','sam','dim'];
      const slotsSummary = slots.map(s => `${dayNames[s.day_of_week]} (${s.fn_name})`).join(', ');
      const meta = {
        type: 'leave_unassigned',
        week,
        staffId: leave.staff_id,
        staffName,
        slots: slots.map(s => ({ day: s.day_of_week, fnSlug: s.fn_slug })),
      };

      // Notifier tous les managers/admins
      const managers = db_.all(
        "SELECT id FROM users WHERE role IN ('admin','manager','superadmin') AND active=1"
      );
      for (const mgr of managers) {
        notify(
          mgr.id, 'leave_planning',
          `⚠️ Créneau à réattribuer — ${staffName}`,
          `Congé approuvé du ${leave.start_date} au ${leave.end_date}. Créneaux libres : ${slotsSummary}`,
          'leave', leave.id,
          meta
        );
      }
    }
  }

  auditLog(req, 'LEAVE_APPROVE', 'leaves', leave.id, null, { step: leave.approval_step });
  res.json({ message: 'Approbation enregistrée', new_status: nextStatus });
});

// ── PUT /api/leaves/:id/refuse ───────────────────────────────
router.put('/:id/refuse', AUTH, (req, res) => {
  const { comment } = req.body;
  const leave = db_.get('SELECT * FROM leaves WHERE id=?', [req.params.id]);
  if (!leave) return res.status(404).json({ error: 'Congé introuvable' });

  const uid = req.user.id;
  if (leave.n1_approver_id !== uid && leave.n2_approver_id !== uid &&
      leave.n3_approver_id !== uid && !['admin','superadmin'].includes(req.user.role))
    return res.status(403).json({ error: 'Non autorisé' });

  db_.run(`UPDATE leaves SET status='refused', updated_at=datetime('now'),
           n1_status=CASE WHEN n1_approver_id=? THEN 'refused' ELSE n1_status END,
           n1_comment=CASE WHEN n1_approver_id=? THEN ? ELSE n1_comment END,
           n1_reviewed_at=CASE WHEN n1_approver_id=? THEN datetime('now') ELSE n1_reviewed_at END
           WHERE id=?`,
    [uid, uid, comment||null, uid, leave.id]);

  // Push notification au salarié
  const staffUser = db_.get('SELECT id FROM users WHERE staff_id=? AND active=1', [leave.staff_id]);
  if (staffUser) {
    const lt = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
    sendPush(staffUser.id, {
      title: '❌ Congé refusé',
      body:  `Votre ${lt?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} a été refusé.${comment ? ' Motif : ' + comment : ''}`,
      url:   '/conges',
    });
  }

  auditLog(req, 'LEAVE_REFUSE', 'leaves', leave.id, null, { comment });
  res.json({ message: 'Congé refusé' });
});

// ── DELETE /api/leaves/:id (annulation par le salarié) ───────
router.delete('/:id', AUTH, (req, res) => {
  const leave = db_.get('SELECT * FROM leaves WHERE id=?', [req.params.id]);
  if (!leave) return res.status(404).json({ error: 'Congé introuvable' });

  if (req.user.role === 'staff' && req.user.staff_id !== leave.staff_id)
    return res.status(403).json({ error: 'Non autorisé' });
  if (leave.status === 'approved' && req.user.role === 'staff')
    return res.status(400).json({ error: 'Un congé approuvé ne peut être annulé que par un manager' });

  db_.run(`UPDATE leaves SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [leave.id]);
  auditLog(req, 'LEAVE_CANCEL', 'leaves', leave.id);
  res.json({ message: 'Congé annulé' });
});

module.exports = router;
