// routes/leaves.js — Workflow d'approbation hiérarchique complet
const path    = require('path');
const fs      = require('fs');
const router  = require('express').Router();
const multer  = require('multer');
const { db_ }                               = require('../db/database');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { notify, notifyStaff }               = require('./notifications');
const { sendPush }                           = require('./push');
const { releaseStaffSlots }                  = require('../utils/releaseSlots');

const AUTH  = requireAuth;
const ADMIN = [requireAuth, requireRole('admin','superadmin')];

// ── Multer pour upload justificatif ─────────────────────────
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype);
    if (!ok) return cb(new Error('Fichier image ou PDF requis'));
    cb(null, true);
  },
});

// ── Helpers ──────────────────────────────────────────────────

// Cache des jours ouvrés (invalidé si les settings changent, TTL 5 min)
let _workingDaysCache = null;
let _workingDaysCacheAt = 0;
const WORKING_DAYS_TTL = 5 * 60 * 1000;

/** Lit les jours ouvrés depuis les paramètres (Set de getDay() : 0=Dim, 1=Lun…6=Sam) */
function getWorkingDaysSet() {
  const now = Date.now();
  if (_workingDaysCache && now - _workingDaysCacheAt < WORKING_DAYS_TTL) return _workingDaysCache;
  const setting = db_.get("SELECT value FROM settings WHERE key='leave_working_days'");
  let result;
  if (setting?.value) {
    try {
      const arr = JSON.parse(setting.value);
      if (Array.isArray(arr) && arr.every(n => Number.isInteger(n) && n >= 0 && n <= 6))
        result = new Set(arr);
    } catch (_) {}
  }
  if (!result) result = new Set([1, 2, 3, 4, 5, 6]); // Lun-Sam par défaut
  _workingDaysCache   = result;
  _workingDaysCacheAt = now;
  return result;
}

// Cache des jours fériés par plage YYYY-MM-DD|YYYY-MM-DD (TTL 30 min)
const _holidaysCache = new Map();
const HOLIDAYS_TTL   = 30 * 60 * 1000;

/**
 * Construit un Set des dates "YYYY-MM-DD" fériées comprises dans la plage [start, end].
 * Les jours récurrents (recurring=1) sont étendus à toutes les années couvertes.
 */
function getHolidaysSet(start, end) {
  const cacheKey = `${start}|${end}`;
  const cached   = _holidaysCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HOLIDAYS_TTL) return cached.set;

  const holidays  = db_.all('SELECT date, recurring FROM public_holidays');
  const startYear = new Date(start + 'T12:00:00').getFullYear();
  const endYear   = new Date(end   + 'T12:00:00').getFullYear();
  const set = new Set();
  for (const h of holidays) {
    if (h.recurring) {
      const mmdd = h.date.slice(5); // "MM-DD"
      for (let y = startYear; y <= endYear; y++) set.add(`${y}-${mmdd}`);
    } else {
      set.add(h.date);
    }
  }
  // Éviction simple : on nettoie les entrées expirées au moment d'une miss
  if (_holidaysCache.size > 200) {
    const limit = Date.now() - HOLIDAYS_TTL;
    for (const [k, v] of _holidaysCache) { if (v.at < limit) _holidaysCache.delete(k); }
  }
  _holidaysCache.set(cacheKey, { set, at: Date.now() });
  return set;
}

/**
 * Calcule le nombre de jours de congé en excluant les jours non-ouvrés et les jours fériés.
 * halfStart / halfEnd enlèvent chacun 0,5 jour (demi-journée de début / fin).
 */
function calcDays(start, end, method = 'working_days', halfStart = 0, halfEnd = 0) {
  let days = 0;
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  const working  = method === 'working_days' ? getWorkingDaysSet() : null;
  const holidays = getHolidaysSet(start, end);
  while (d <= e) {
    const dateStr = d.toISOString().slice(0, 10);
    if ((working ? working.has(d.getDay()) : true) && !holidays.has(dateStr)) days++;
    d.setDate(d.getDate() + 1);
  }
  if (halfStart) days -= 0.5;
  if (halfEnd)   days -= 0.5;
  return Math.max(0, days);
}

/** Résout un approbateur pour un niveau donné. Retourne null si introuvable. */
function resolveApprover(staffId, level) {
  if (level === 'manager') {
    return db_.get(
      'SELECT u.* FROM users u JOIN staff s ON s.manager_id = u.staff_id WHERE s.id = ? AND u.active=1',
      [staffId]
    ) || null;
  }
  if (level === 'rh') {
    return db_.get("SELECT * FROM users WHERE role IN ('rh','admin','superadmin') AND active=1 LIMIT 1") || null;
  }
  if (level === 'direction') {
    return db_.get("SELECT * FROM users WHERE role IN ('admin','superadmin') AND active=1 LIMIT 1") || null;
  }
  return null;
}

/**
 * Résout et compacte les approbateurs pour une demande.
 * Les niveaux sans approbateur sont ignorés et les non-null sont compactés en N1/N2/N3.
 * Les doublons (même utilisateur à plusieurs niveaux) sont dédupliqués.
 */
function resolveApprovers(staffId, levels) {
  const resolved = levels.map(l => resolveApprover(staffId, l)).filter(Boolean);
  const seen = new Set();
  const unique = resolved.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
  return { n1: unique[0] || null, n2: unique[1] || null, n3: unique[2] || null };
}

/** Déduit le solde CP/RTT quand un congé est définitivement approuvé. */
function deductBalance(leave) {
  const lt = db_.get('SELECT slug FROM leave_types WHERE id=?', [leave.type_id]);
  if (lt?.slug === 'cp')
    db_.run('UPDATE staff SET cp_balance = MAX(0, cp_balance - ?) WHERE id=?', [leave.days_count, leave.staff_id]);
  else if (lt?.slug === 'rtt')
    db_.run('UPDATE staff SET rtt_balance = MAX(0, rtt_balance - ?) WHERE id=?', [leave.days_count, leave.staff_id]);
}

/** Restitue le solde CP/RTT quand un congé approuvé est annulé. */
function restoreBalance(leave) {
  const lt = db_.get('SELECT slug FROM leave_types WHERE id=?', [leave.type_id]);
  if (lt?.slug === 'cp')
    db_.run('UPDATE staff SET cp_balance = cp_balance + ? WHERE id=?', [leave.days_count, leave.staff_id]);
  else if (lt?.slug === 'rtt')
    db_.run('UPDATE staff SET rtt_balance = rtt_balance + ? WHERE id=?', [leave.days_count, leave.staff_id]);
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

  // Un viewer/staff ne voit QUE ses propres congés, quel que soit le query param
  if (req.user.role === 'staff') {
    sql += ' AND l.staff_id = ?'; p.push(req.user.staff_id);
  } else if (staff_id) {
    // Managers/RH/admin peuvent filtrer par staff_id
    sql += ' AND l.staff_id = ?'; p.push(Number(staff_id));
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

  // F2 — pagination optionnelle (?page=1&limit=50, rétrocompatible)
  const page    = req.query.page  ? Math.max(1, parseInt(req.query.page,  10)) : null;
  const perPage = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit, 10))) : 50;

  if (page !== null) {
    // Requête de comptage avec les mêmes filtres
    const countSql = `SELECT COUNT(*) AS total FROM leaves l
      JOIN staff s ON s.id = l.staff_id
      LEFT JOIN teams t ON t.id = s.team_id
      JOIN leave_types lt ON lt.id = l.type_id
      LEFT JOIN users u1 ON u1.id = l.n1_approver_id
      LEFT JOIN staff s1 ON s1.id = u1.staff_id
      LEFT JOIN users u2 ON u2.id = l.n2_approver_id
      LEFT JOIN staff s2 ON s2.id = u2.staff_id
      WHERE 1=1` + sql.split('WHERE 1=1')[1];
    const { total } = db_.get(countSql, p);
    const items = db_.all(sql + ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?',
      [...p, perPage, (page - 1) * perPage]);
    return res.json({ items, total, page, pages: Math.ceil(total / perPage), limit: perPage });
  }

  // Sans paramètre page : liste complète jusqu'à 500 (rétrocompatible)
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
  const targetId = Number(req.params.staffId);
  // Un salarié ne peut consulter que son propre solde
  if (req.user.role === 'staff' && req.user.staff_id !== targetId)
    return res.status(403).json({ error: 'Accès non autorisé' });
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
    [targetId, String(year)]
  );
  const staff = db_.get('SELECT cp_balance, rtt_balance FROM staff WHERE id=?', [targetId]);
  res.json({ used, balances: staff, year });
});

// ── POST /api/leaves ─────────────────────────────────────────
router.post('/', AUTH, (req, res) => {
  // N5 — ignorer document_url du body : l'URL ne doit être définie que via le endpoint /document
  const { staff_id, type_id, start_date, end_date, reason } = req.body;
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

  // M4 — conversion correcte des demi-journées (évite 'false' truthy)
  const toFlag = v => (v === true || v === 1 || v === 'true' || v === '1') ? 1 : 0;
  const half_start = toFlag(req.body.half_start);
  const half_end   = toFlag(req.body.half_end);
  // M6 — JSON.parse sécurisé
  let levels;
  try { levels = JSON.parse(leaveType.approval_levels || '["manager"]'); }
  catch (_) { levels = ['manager']; }

  const days   = calcDays(start_date, end_date, leaveType.count_method, half_start, half_end);

  // Résolution & compaction des approbateurs (niveaux null sautés, doublons dédupliqués)
  const { n1, n2, n3 } = resolveApprovers(Number(staff_id), levels);

  // Avertissement solde insuffisant (non-bloquant)
  let balance_warning = null;
  if (['cp','rtt'].includes(leaveType.slug)) {
    const s = db_.get('SELECT cp_balance, rtt_balance FROM staff WHERE id=?', [staff_id]);
    const bal = leaveType.slug === 'cp' ? (s?.cp_balance ?? 0) : (s?.rtt_balance ?? 0);
    if (days > bal) balance_warning = `Solde insuffisant : il reste ${bal}j, vous en demandez ${days}j.`;
  }

  // E3 — chevauchement + insertion atomiques (protection race condition)
  const txInsert = db_.transaction(() => {
    const c = db_.get(
      `SELECT id FROM leaves WHERE staff_id=? AND status NOT IN ('refused','cancelled')
       AND NOT (end_date < ? OR start_date > ?)`,
      [staff_id, start_date, end_date]
    );
    if (c) return { conflict: c };
    const ins = db_.run(
      `INSERT INTO leaves
         (staff_id, type_id, start_date, end_date, days_count, reason,
          status, approval_step, submitted_at,
          half_start, half_end,
          n1_approver_id, n1_status,
          n2_approver_id, n2_status,
          n3_approver_id, n3_status)
       VALUES (?,?,?,?,?,?, 'pending',1,datetime('now'), ?,?, ?,?, ?,?, ?,?)`,
      [staff_id, type_id, start_date, end_date, days, reason||null,
       half_start, half_end,
       n1?.id||null, n1 ? 'pending' : null,
       n2?.id||null, n2 ? 'pending' : null,
       n3?.id||null, n3 ? 'pending' : null]
    );
    return { insertId: ins.lastInsertRowid };
  })();

  if (txInsert.conflict)
    return res.status(409).json({ error: 'Conflit avec un congé existant', conflict_id: txInsert.conflict.id });

  // Notifier le premier approbateur via notifications unifiées
  if (n1) {
    const staffRow = db_.get('SELECT firstname, lastname FROM staff WHERE id=?', [staff_id]);
    const staffName = staffRow ? `${staffRow.firstname} ${staffRow.lastname}` : 'Un salarié';
    notify(n1.id, 'approval',
      'Nouvelle demande de congé',
      `${staffName} a demandé un ${leaveType.label} du ${start_date} au ${end_date}.`,
      'leave', txInsert.insertId, { action: 'approve' }
    );
  }

  auditLog(req, 'LEAVE_CREATE', 'leaves', txInsert.insertId, null, req.body);
  res.status(201).json({ id: txInsert.insertId, days_count: days, n1_approver: n1?.email, balance_warning });
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
  // M6 — JSON.parse sécurisé
  let levels;
  try { levels = JSON.parse(leave.approval_levels || '["manager"]'); }
  catch (_) { levels = ['manager']; }
  let nextStatus = leave.status;

  // Déterminer quel niveau approuve
  if (leave.n1_approver_id === userId && leave.n1_status === 'pending') {
    // E2 — verrou optimiste : protection race condition
    const chk1 = db_.run(`UPDATE leaves SET n1_status='approved', n1_comment=?, n1_reviewed_at=datetime('now'),
             approval_step=2, updated_at=datetime('now') WHERE id=? AND n1_status='pending'`, [comment||null, leave.id]);
    if (chk1.changes === 0) return res.status(409).json({ error: 'Ce congé vient d\'être traité simultanément' });

    if (levels.length < 2 || !leave.n2_approver_id) {
      // Approbation finale
      db_.run(`UPDATE leaves SET status='approved', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      nextStatus = 'approved';
    } else {
      db_.run(`UPDATE leaves SET status='approved_n1', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      // Notifier N2 via notifications unifiées
      const lt2 = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
      const sf2 = db_.get('SELECT firstname, lastname FROM staff WHERE id=?', [leave.staff_id]);
      notify(leave.n2_approver_id, 'approval',
        'Demande de congé à valider',
        `${sf2 ? sf2.firstname + ' ' + sf2.lastname : 'Un salarié'} — ${lt2?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} (N1 validé, en attente de votre approbation).`,
        'leave', leave.id, { action: 'approve' }
      );
      nextStatus = 'approved_n1';
    }

  } else if (leave.n2_approver_id === userId && leave.n2_status === 'pending' && leave.n1_status === 'approved') {
    // E1+E2 — N1 doit être approuvé + verrou optimiste
    const chk2 = db_.run(`UPDATE leaves SET n2_status='approved', n2_comment=?, n2_reviewed_at=datetime('now'),
             approval_step=3, updated_at=datetime('now') WHERE id=? AND n2_status='pending'`, [comment||null, leave.id]);
    if (chk2.changes === 0) return res.status(409).json({ error: 'Ce congé vient d\'être traité simultanément' });

    if (levels.length < 3 || !leave.n3_approver_id) {
      db_.run(`UPDATE leaves SET status='approved', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      nextStatus = 'approved';
    } else {
      db_.run(`UPDATE leaves SET status='approved_n2', updated_at=datetime('now') WHERE id=?`, [leave.id]);
      const lt3 = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
      const sf3 = db_.get('SELECT firstname, lastname FROM staff WHERE id=?', [leave.staff_id]);
      notify(leave.n3_approver_id, 'approval',
        'Demande de congé à valider',
        `${sf3 ? sf3.firstname + ' ' + sf3.lastname : 'Un salarié'} — ${lt3?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} (N1+N2 validés, en attente de votre approbation).`,
        'leave', leave.id, { action: 'approve' }
      );
      nextStatus = 'approved_n2';
    }

  } else if (leave.n3_approver_id === userId && leave.n3_status === 'pending' && leave.n2_status === 'approved') {
    // E1+E2 — N2 doit être approuvé + verrou optimiste
    const chk3 = db_.run(`UPDATE leaves SET n3_status='approved', n3_comment=?, n3_reviewed_at=datetime('now'),
             status='approved', approval_step=99, updated_at=datetime('now') WHERE id=? AND n3_status='pending'`,
      [comment||null, leave.id]);
    if (chk3.changes === 0) return res.status(409).json({ error: 'Ce congé vient d\'être traité simultanément' });
    nextStatus = 'approved';

  } else if (['admin','superadmin'].includes(req.user.role) &&
             ['approved_n1','approved_n2'].includes(leave.status) &&
             !leave.n2_approver_id && !leave.n3_approver_id) {
    // Cas de finalisation : N1 approuvé, mais pas de N2 assigné (dédup ou configuration)
    db_.run(`UPDATE leaves SET status='approved', approval_step=99, updated_at=datetime('now') WHERE id=?`,
      [leave.id]);
    nextStatus = 'approved';

  } else if (['admin','superadmin'].includes(req.user.role) &&
             ['pending','approved_n1','approved_n2'].includes(leave.status)) {
    // Override admin/superadmin : peut approuver à l'étape courante même s'il n'est pas le valideur désigné
    if (leave.n1_status === 'pending') {
      // Approuver en tant que N1
      db_.run(`UPDATE leaves SET n1_status='approved', n1_approver_id=?, n1_comment=?, n1_reviewed_at=datetime('now'),
               approval_step=2, updated_at=datetime('now') WHERE id=?`, [userId, comment||null, leave.id]);
      if (levels.length < 2 || !leave.n2_approver_id) {
        db_.run(`UPDATE leaves SET status='approved', updated_at=datetime('now') WHERE id=?`, [leave.id]);
        nextStatus = 'approved';
      } else {
        db_.run(`UPDATE leaves SET status='approved_n1', updated_at=datetime('now') WHERE id=?`, [leave.id]);
        if (leave.n2_approver_id !== userId) {
          const lt2r = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
          const sf2r = db_.get('SELECT firstname, lastname FROM staff WHERE id=?', [leave.staff_id]);
          notify(leave.n2_approver_id, 'approval',
            'Demande de congé à valider',
            `${sf2r ? sf2r.firstname + ' ' + sf2r.lastname : 'Un salarié'} — ${lt2r?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} (N1 validé, en attente de votre approbation).`,
            'leave', leave.id, { action: 'approve' }
          );
        }
        nextStatus = 'approved_n1';
      }
    } else if (leave.n2_status === 'pending') {
      // Approuver en tant que N2
      db_.run(`UPDATE leaves SET n2_status='approved', n2_approver_id=?, n2_comment=?, n2_reviewed_at=datetime('now'),
               approval_step=3, updated_at=datetime('now') WHERE id=?`, [userId, comment||null, leave.id]);
      if (levels.length < 3 || !leave.n3_approver_id) {
        db_.run(`UPDATE leaves SET status='approved', updated_at=datetime('now') WHERE id=?`, [leave.id]);
        nextStatus = 'approved';
      } else {
        db_.run(`UPDATE leaves SET status='approved_n2', updated_at=datetime('now') WHERE id=?`, [leave.id]);
        if (leave.n3_approver_id && leave.n3_approver_id !== userId) {
          const ltA = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
          const sfA = db_.get('SELECT firstname, lastname FROM staff WHERE id=?', [leave.staff_id]);
          notify(leave.n3_approver_id, 'approval',
            'Demande de congé à valider',
            `${sfA ? sfA.firstname + ' ' + sfA.lastname : 'Un salarié'} — ${ltA?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} (en attente de votre approbation finale).`,
            'leave', leave.id, { action: 'approve' }
          );
        }
        nextStatus = 'approved_n2';
      }
    } else if (leave.n3_status === 'pending') {
      db_.run(`UPDATE leaves SET n3_status='approved', n3_approver_id=?, n3_comment=?, n3_reviewed_at=datetime('now'),
               status='approved', approval_step=99, updated_at=datetime('now') WHERE id=?`,
        [userId, comment||null, leave.id]);
      nextStatus = 'approved';
    } else {
      // Aucune étape N* en attente — approuver directement (ex: congé sans approbateurs assignés)
      db_.run(`UPDATE leaves SET status='approved', approval_step=99, updated_at=datetime('now') WHERE id=?`, [leave.id]);
      nextStatus = 'approved';
    }

  } else {
    return res.status(403).json({ error: 'Vous n\'êtes pas le valideur de ce congé à cette étape' });
  }

  // Si approuvé définitivement → déduire solde + push salarié + libérer créneaux
  if (nextStatus === 'approved') {
    const lt = db_.get('SELECT slug, label FROM leave_types WHERE id=?', [leave.type_id]);
    deductBalance({ ...leave, days_count: leave.days_count, type_id: leave.type_id, staff_id: leave.staff_id });

    const staffUser = db_.get('SELECT id FROM users WHERE staff_id=? AND active=1', [leave.staff_id]);
    if (staffUser) {
      sendPush(staffUser.id, {
        title: '✅ Congé approuvé',
        body:  `Votre ${lt?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} a été validé.`,
        url:   '/conges',
      });
      notify(staffUser.id, 'leave',
        '✅ Congé approuvé',
        `Votre ${lt?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} a été validé.`,
        'leave', leave.id
      );
    }

    releaseStaffSlots(db_, notify, {
      staffId:   leave.staff_id,
      dateStart: leave.start_date,
      dateEnd:   leave.end_date,
      allDay:    true,
      hourStart: null,
      hourEnd:   null,
      label: `Congé approuvé${lt?.label ? ' (' + lt.label + ')' : ''}`,
    });
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
  const isOverride = ['admin','superadmin'].includes(req.user.role);
  if (leave.n1_approver_id !== uid && leave.n2_approver_id !== uid &&
      leave.n3_approver_id !== uid && !isOverride)
    return res.status(403).json({ error: 'Non autorisé' });

  // Mettre à jour le bon niveau Nx selon qui refuse
  db_.run(`UPDATE leaves SET status='refused', updated_at=datetime('now'),
           n1_status=CASE WHEN n1_approver_id=? OR (? AND n1_status='pending') THEN 'refused' ELSE n1_status END,
           n1_comment=CASE WHEN n1_approver_id=? OR (? AND n1_status='pending') THEN ? ELSE n1_comment END,
           n1_reviewed_at=CASE WHEN n1_approver_id=? OR (? AND n1_status='pending') THEN datetime('now') ELSE n1_reviewed_at END,
           n2_status=CASE WHEN n2_approver_id=? THEN 'refused' ELSE n2_status END,
           n2_comment=CASE WHEN n2_approver_id=? THEN ? ELSE n2_comment END,
           n2_reviewed_at=CASE WHEN n2_approver_id=? THEN datetime('now') ELSE n2_reviewed_at END,
           n3_status=CASE WHEN n3_approver_id=? THEN 'refused' ELSE n3_status END,
           n3_comment=CASE WHEN n3_approver_id=? THEN ? ELSE n3_comment END,
           n3_reviewed_at=CASE WHEN n3_approver_id=? THEN datetime('now') ELSE n3_reviewed_at END
           WHERE id=?`,
    [
      uid, isOverride ? 1 : 0,
      uid, isOverride ? 1 : 0, comment||null,
      uid, isOverride ? 1 : 0,
      uid, comment||null, uid,
      uid, comment||null, uid,
      leave.id,
    ]);

  // Notifier le salarié (push + notification in-app)
  const staffUser = db_.get('SELECT id FROM users WHERE staff_id=? AND active=1', [leave.staff_id]);
  const lt = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
  if (staffUser) {
    const body = `Votre ${lt?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} a été refusé.${comment ? ' Motif : ' + comment : ''}`;
    sendPush(staffUser.id, { title: '❌ Congé refusé', body, url: '/conges' });
    notify(staffUser.id, 'leave', '❌ Congé refusé', body, 'leave', leave.id);
  }

  auditLog(req, 'LEAVE_REFUSE', 'leaves', leave.id, null, { comment });
  res.json({ message: 'Congé refusé' });
});

// ── DELETE /api/leaves/:id (annulation) ──────────────────────
router.delete('/:id', AUTH, (req, res) => {
  const leave = db_.get('SELECT * FROM leaves WHERE id=?', [req.params.id]);
  if (!leave) return res.status(404).json({ error: 'Congé introuvable' });

  if (req.user.role === 'staff' && req.user.staff_id !== leave.staff_id)
    return res.status(403).json({ error: 'Non autorisé' });
  if (leave.status === 'approved' && req.user.role === 'staff')
    return res.status(400).json({ error: 'Un congé approuvé ne peut être annulé que par un manager' });

  // Restituer le solde si le congé était approuvé et déjà déduit
  if (leave.status === 'approved') restoreBalance(leave);

  db_.run(`UPDATE leaves SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [leave.id]);

  // Notifier le salarié si annulation par un tiers
  if (req.user.staff_id !== leave.staff_id) {
    const lt = db_.get('SELECT label FROM leave_types WHERE id=?', [leave.type_id]);
    notifyStaff(leave.staff_id, 'leave',
      'Congé annulé',
      `Votre ${lt?.label || 'congé'} du ${leave.start_date} au ${leave.end_date} a été annulé par un responsable.`,
      'leave', leave.id
    );
  }

  auditLog(req, 'LEAVE_CANCEL', 'leaves', leave.id);
  res.json({ message: 'Congé annulé' });
});

// ── POST /api/leaves/:id/document ────────────────────────────
// Upload d'un justificatif pour une demande existante
router.post('/:id/document', AUTH, docUpload.single('document'), async (req, res) => {
  const leave = db_.get('SELECT * FROM leaves WHERE id=?', [req.params.id]);
  if (!leave) return res.status(404).json({ error: 'Congé introuvable' });

  // Vérification droits : salarié concerné ou admin/manager/rh
  const isPrivileged = ['admin','superadmin','manager','rh'].includes(req.user.role);
  if (!isPrivileged && req.user.staff_id !== leave.staff_id)
    return res.status(403).json({ error: 'Non autorisé' });

  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

  // N4 — vérification magic bytes (ne pas se fier au MIME déclaré)
  const hdrD = req.file.buffer;
  const isJpegD = hdrD[0]===0xFF && hdrD[1]===0xD8 && hdrD[2]===0xFF;
  const isPngD  = hdrD[0]===0x89 && hdrD[1]===0x50 && hdrD[2]===0x4E && hdrD[3]===0x47;
  const isPdfD  = hdrD[0]===0x25 && hdrD[1]===0x50 && hdrD[2]===0x44 && hdrD[3]===0x46; // %PDF
  const isWebpD = hdrD[0]===0x52 && hdrD[1]===0x49 && hdrD[2]===0x46 && hdrD[3]===0x46
               && hdrD[8]===0x57 && hdrD[9]===0x45 && hdrD[10]===0x42 && hdrD[11]===0x50;
  if (!isJpegD && !isPngD && !isPdfD && !isWebpD)
    return res.status(400).json({ error: 'Format invalide — JPEG, PNG, WebP ou PDF uniquement' });

  const docsDir = require('path').join(__dirname, '..', 'uploads', 'documents');
  if (!require('fs').existsSync(docsDir))
    require('fs').mkdirSync(docsDir, { recursive: true });

  // Supprimer ancien fichier s'il existait
  if (leave.document_url) {
    const old = require('path').join(__dirname, '..', leave.document_url.replace(/^\//, ''));
    if (require('fs').existsSync(old)) { try { require('fs').unlinkSync(old); } catch (_) {} }
  }

  const ext = req.file.mimetype === 'application/pdf' ? '.pdf' : '.jpg';
  const filename = `leave_${leave.id}_${Date.now()}${ext}`;
  const dest = require('path').join(docsDir, filename);

  require('fs').writeFileSync(dest, req.file.buffer);

  const url = `/uploads/documents/${filename}`;
  db_.run("UPDATE leaves SET document_url=?, updated_at=datetime('now') WHERE id=?", [url, leave.id]);

  auditLog(req, 'LEAVE_DOC_UPLOAD', 'leaves', leave.id);
  res.json({ document_url: url });
});

module.exports = router;
