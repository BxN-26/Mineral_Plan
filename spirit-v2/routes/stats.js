'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const MGR = [requireAuth, requireRole('admin','manager','superadmin','rh')];

// ── GET /api/stats?week=YYYY-MM-DD&period=week|month ─────────
router.get('/', ...MGR, (req, res) => {
  const { week = currentMonday(), period = 'week' } = req.query;

  // --- 1. KPIs globaux semaine ---
  const slots = db_.all(
    `SELECT ss.staff_id, ss.day_of_week, ss.hour_start, ss.hour_end, f.slug AS fn_slug
     FROM schedule_slots ss
     JOIN schedules sc ON sc.id = ss.schedule_id
     JOIN functions f  ON f.id  = sc.function_id
     WHERE sc.week_start = ?`,
    [week]
  );

  const staffIds  = [...new Set(slots.map(s => s.staff_id))];
  const totalHours = slots.reduce((a, s) => a + (s.hour_end - s.hour_start), 0);
  const staffCount = db_.get('SELECT COUNT(*) AS c FROM staff WHERE active=1').c;

  // Heures par salarié
  const byStaff = {};
  for (const s of slots) {
    byStaff[s.staff_id] = (byStaff[s.staff_id] || 0) + (s.hour_end - s.hour_start);
  }
  // Heures par fonction
  const byFn = {};
  for (const s of slots) {
    byFn[s.fn_slug] = (byFn[s.fn_slug] || 0) + (s.hour_end - s.hour_start);
  }
  // Couverture par jour (nb créneaux distincts)
  const byDay = Array(7).fill(0);
  for (const s of slots) {
    byDay[s.day_of_week] += (s.hour_end - s.hour_start);
  }

  // --- 2. Données salariés enrichies ---
  const staffList = db_.all(
    `SELECT s.id, s.firstname, s.lastname, s.initials, s.color, s.avatar_url,
            t.name AS team_name
     FROM staff s LEFT JOIN teams t ON t.id = s.team_id
     WHERE s.active = 1 ORDER BY s.firstname`
  );

  const staffHours = staffList.map(s => ({
    id:        s.id,
    name:      `${s.firstname} ${s.lastname}`,
    initials:  s.initials,
    color:     s.color,
    avatar_url: s.avatar_url,
    team:      s.team_name,
    hours:     byStaff[s.id] || 0,
  }));

  // --- 3. Fonctions pour donut ---
  const functions = db_.all('SELECT id, name, slug, color FROM functions WHERE active=1');
  const fnData = functions.map(f => ({
    name:  f.name,
    slug:  f.slug,
    color: f.color,
    hours: byFn[f.slug] || 0,
  })).filter(f => f.hours > 0);

  // --- 4. Congés de la semaine ---
  const weekEnd = addDays(week, 6);
  const leavesWeek = db_.all(
    `SELECT lt.slug, lt.label, lt.color, COUNT(*) as count
     FROM leaves l
     JOIN leave_types lt ON lt.id = l.type_id
     WHERE l.start_date <= ? AND l.end_date >= ?
       AND l.status IN ('approved','approved_n1','approved_n2')
     GROUP BY lt.slug`,
    [weekEnd, week]
  );

  // --- 5. Tableau par équipe ---
  const teams = db_.all('SELECT id, name, color FROM teams WHERE active=1');
  const teamStats = teams.map(t => {
    const members = db_.all('SELECT id FROM staff WHERE team_id=? AND active=1', [t.id]);
    const h = members.reduce((a, m) => a + (byStaff[m.id] || 0), 0);
    return { id: t.id, name: t.name, color: t.color, members: members.length, hours: h };
  }).filter(t => t.members > 0);

  res.json({
    week,
    kpi: {
      total_hours:     totalHours,
      active_staff:    staffIds.length,
      total_staff:     staffCount,
      avg_hours:       staffIds.length > 0 ? +(totalHours / staffIds.length).toFixed(1) : 0,
    },
    hours_by_staff: staffHours,
    hours_by_day:   byDay,
    hours_by_fn:    fnData,
    leaves_by_type: leavesWeek,
    team_stats:     teamStats,
  });
});

function currentMonday() {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
