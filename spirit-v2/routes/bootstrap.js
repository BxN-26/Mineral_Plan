'use strict';
/**
 * GET /api/bootstrap
 * Agrège en une seule requête toutes les données statiques chargées au démarrage
 * du frontend : staff, teams, functions, leaves, leave-types, settings, task-types.
 * Réduit les 7 appels parallèles initiaux à 1 seul round-trip.
 */
const router      = require('express').Router();
const { db_ }     = require('../db/database');
const { requireAuth }                       = require('../middleware/auth');
const { withFunctions, stripSensitive }     = require('./staff');

const ROLE_TO_PERM = { staff: 'standard', viewer: 'standard', manager: 'bureau', rh: 'bureau', admin: 'direction', superadmin: 'direction' };

router.get('/', requireAuth, (req, res) => {
  const role      = req.user.role;
  const staffId   = req.user.staff_id ?? null;

  // ── staff ─────────────────────────────────────────────────────
  const staffRows = db_.all(
    `SELECT s.*,
            t.name  AS team_name, t.slug AS team_slug,
            t.color AS team_color, t.bg_color AS team_bg, t.icon AS team_icon,
            m.firstname || ' ' || m.lastname AS manager_name
     FROM staff s
     LEFT JOIN teams t ON t.id = s.team_id
     LEFT JOIN staff m ON m.id = s.manager_id
     WHERE s.active = 1
     ORDER BY s.firstname, s.lastname`,
    []
  );
  const staff = stripSensitive(withFunctions(staffRows), role);

  // ── teams ─────────────────────────────────────────────────────
  const teams = db_.all('SELECT * FROM teams WHERE active = 1 ORDER BY sort_order, name', []);

  // ── functions ─────────────────────────────────────────────────
  const functions = db_.all('SELECT * FROM functions WHERE active = 1 ORDER BY sort_order, name', []);

  // ── leave-types ───────────────────────────────────────────────
  const leaveTypes = db_.all('SELECT * FROM leave_types WHERE active = 1 ORDER BY sort_order, label', []);

  // ── leaves ────────────────────────────────────────────────────
  let leavesSql = `
    SELECT l.*,
           s.firstname || ' ' || s.lastname AS staff_name,
           s.initials, s.color, s.team_id,
           t.name AS team_name, t.color AS team_color,
           lt.label AS type_label, lt.short_label, lt.color AS type_color,
           lt.bg_color AS type_bg, lt.approval_levels, lt.paid,
           u1.email AS n1_email,
           s1.firstname || ' ' || s1.lastname AS n1_name,
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
    WHERE 1=1`;
  const leavesParams = [];
  if (role === 'staff') {
    leavesSql += ' AND l.staff_id = ?';
    leavesParams.push(staffId);
  }
  leavesSql += ' ORDER BY l.created_at DESC LIMIT 200';
  const leaves = db_.all(leavesSql, leavesParams);

  // ── settings ──────────────────────────────────────────────────
  const settings = db_.all('SELECT * FROM settings ORDER BY group_name, key', []);

  // ── task-types ────────────────────────────────────────────────
  const taskTypes = db_.all('SELECT * FROM task_types ORDER BY sort_order, slug', []);

  // ── jours fériés (pour l'affichage dans les calendriers) ─────
  // On retourne tous les enregistrements bruts : l'expansion année est faite côté frontend
  const publicHolidays = db_.all('SELECT * FROM public_holidays ORDER BY date', []);

  // ── vacances scolaires (±2 ans autour d'aujourd'hui, zone configurée) ────
  const schoolZoneSetting = db_.get("SELECT value FROM settings WHERE key='school_holidays_zone'");
  const schoolZone        = schoolZoneSetting?.value || 'Zone C';
  const yearNow           = new Date().getFullYear();
  const schoolHolidays    = db_.all(
    `SELECT * FROM school_holidays
     WHERE zone = ?
       AND start_date < ?
       AND end_date   > ?
     ORDER BY start_date`,
    [schoolZone, `${yearNow + 2}-01-01`, `${yearNow - 1}-01-01`]
  );

  res.json({ staff, teams, functions, leaveTypes, leaves, settings, taskTypes,
             publicHolidays, schoolHolidays });
});

module.exports = router;
