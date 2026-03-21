'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const MGR = [requireAuth, requireRole('admin','manager','superadmin','rh')];

// ── GET /api/stats?period=week&week=YYYY-MM-DD (défaut)
//                  ?period=month&month=YYYY-MM
//                  ?period=year&year=YYYY
router.get('/', ...MGR, (req, res) => {
  const { period = 'week', week, month, year } = req.query;

  // Calculer les semaines à traiter
  let weeksToProcess = [];
  let periodRef = '';
  if (period === 'month') {
    const m = month || currentMonth();
    periodRef = m;
    weeksToProcess = weeksInMonth(m);
  } else if (period === 'year') {
    const y = year || String(new Date().getFullYear());
    periodRef = y;
    weeksToProcess = weeksInYear(y);
  } else {
    periodRef = week || currentMonday();
    weeksToProcess = [periodRef];
  }

  // Récupérer tous les slots de toutes les semaines
  const allSlots = [];
  for (const w of weeksToProcess) {
    const slots = db_.all(
      `SELECT ss.staff_id, ss.day_of_week, ss.hour_start, ss.hour_end, f.slug AS fn_slug
       FROM schedule_slots ss
       JOIN schedules sc ON sc.id = ss.schedule_id
       JOIN functions f  ON f.id  = sc.function_id
       WHERE sc.week_start = ?`,
      [w]
    );
    for (const s of slots) allSlots.push({ ...s, week: w });
  }

  const staffIds   = [...new Set(allSlots.map(s => s.staff_id))];
  const totalHours = allSlots.reduce((a, s) => a + (s.hour_end - s.hour_start), 0);
  const staffCount = db_.get('SELECT COUNT(*) AS c FROM staff WHERE active=1').c;

  // Heures par salarié (total periode)
  const byStaff = {};
  for (const s of allSlots) byStaff[s.staff_id] = (byStaff[s.staff_id] || 0) + (s.hour_end - s.hour_start);

  // Heures par fonction (total periode)
  const byFn = {};
  for (const s of allSlots) byFn[s.fn_slug] = (byFn[s.fn_slug] || 0) + (s.hour_end - s.hour_start);

  // Couverture par jour (week uniquement)
  const byDay = Array(7).fill(0);
  if (period === 'week') {
    for (const s of allSlots) byDay[s.day_of_week] += (s.hour_end - s.hour_start);
  }

  // Données salariés enrichies
  const staffList = db_.all(
    `SELECT s.id, s.firstname, s.lastname, s.initials, s.color, s.avatar_url,
            t.name AS team_name
     FROM staff s LEFT JOIN teams t ON t.id = s.team_id
     WHERE s.active = 1 ORDER BY s.firstname`
  );
  const staffHours = staffList.map(s => ({
    id: s.id, name: `${s.firstname} ${s.lastname}`, initials: s.initials,
    color: s.color, avatar_url: s.avatar_url, team: s.team_name,
    hours: byStaff[s.id] || 0,
  }));

  // Fonctions
  const functions = db_.all('SELECT id, name, slug, color FROM functions WHERE active=1');
  const fnData = functions.map(f => ({ name: f.name, slug: f.slug, color: f.color, hours: byFn[f.slug] || 0 }))
    .filter(f => f.hours > 0);

  // Congés de la période
  const periodStart = weeksToProcess[0];
  const periodEnd   = addDays(weeksToProcess[weeksToProcess.length - 1], 6);
  const leavesWeek  = db_.all(
    `SELECT lt.slug, lt.label, lt.color, COUNT(*) as count
     FROM leaves l JOIN leave_types lt ON lt.id = l.type_id
     WHERE l.start_date <= ? AND l.end_date >= ?
       AND l.status IN ('approved','approved_n1','approved_n2')
     GROUP BY lt.slug`,
    [periodEnd, periodStart]
  );

  // Équipes
  const teams = db_.all('SELECT id, name, color FROM teams WHERE active=1');
  const teamStats = teams.map(t => {
    const members = db_.all('SELECT id FROM staff WHERE team_id=? AND active=1', [t.id]);
    const h = members.reduce((a, m) => a + (byStaff[m.id] || 0), 0);
    return { id: t.id, name: t.name, color: t.color, members: members.length, hours: h };
  }).filter(t => t.members > 0);

  // ── Évolution par sous-période (pour graphique)
  let byPeriod = null;
  if (period === 'month') {
    byPeriod = weeksToProcess.map(w => {
      const ws = allSlots.filter(s => s.week === w);
      return {
        key: w,
        label: fmtWeekShort(w),
        hours: +ws.reduce((a, s) => a + (s.hour_end - s.hour_start), 0).toFixed(1),
        active: new Set(ws.map(s => s.staff_id)).size,
      };
    });
  } else if (period === 'year') {
    const yr = parseInt(periodRef);
    const monthMap = {};
    for (const slot of allSlots) {
      const d = new Date(slot.week + 'T12:00:00');
      if (d.getFullYear() !== yr) continue;
      const mi  = d.getMonth() + 1;
      const key = `${yr}-${String(mi).padStart(2,'0')}`;
      if (!monthMap[key]) monthMap[key] = { key, label: d.toLocaleDateString('fr-FR', { month: 'short' }), hours: 0, staffSet: new Set() };
      monthMap[key].hours += slot.hour_end - slot.hour_start;
      monthMap[key].staffSet.add(slot.staff_id);
    }
    byPeriod = Object.values(monthMap)
      .map(({ key, label, hours, staffSet }) => ({ key, label, hours: +hours.toFixed(1), active: staffSet.size }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  // ── Heures par salarié et par sous-période (pour Relevés)
  let staffByPeriod = null;
  if (period === 'month') {
    staffByPeriod = {};
    for (const slot of allSlots) {
      if (!staffByPeriod[slot.staff_id]) staffByPeriod[slot.staff_id] = {};
      staffByPeriod[slot.staff_id][slot.week] = (staffByPeriod[slot.staff_id][slot.week] || 0) + (slot.hour_end - slot.hour_start);
    }
  } else if (period === 'year') {
    const yr = parseInt(periodRef);
    staffByPeriod = {};
    for (const slot of allSlots) {
      const d = new Date(slot.week + 'T12:00:00');
      if (d.getFullYear() !== yr) continue;
      const key = `${yr}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!staffByPeriod[slot.staff_id]) staffByPeriod[slot.staff_id] = {};
      staffByPeriod[slot.staff_id][key] = (staffByPeriod[slot.staff_id][key] || 0) + (slot.hour_end - slot.hour_start);
    }
  }

  res.json({
    period, ref: periodRef,
    week: period === 'week' ? periodRef : undefined,      // compat
    weeks_in_period: weeksToProcess,
    kpi: {
      total_hours:  totalHours,
      active_staff: staffIds.length,
      total_staff:  staffCount,
      avg_hours:    staffIds.length > 0 ? +(totalHours / staffIds.length).toFixed(1) : 0,
      leaves_count: leavesWeek.reduce((a, l) => a + l.count, 0),
    },
    hours_by_staff: staffHours,
    hours_by_day:   period === 'week' ? byDay : null,
    hours_by_fn:    fnData,
    leaves_by_type: leavesWeek,
    team_stats:     teamStats,
    by_period:      byPeriod,
    staff_by_period: staffByPeriod,
  });
});

/* ── Helpers ─────────────────────────────────────────────────── */
function currentMonday() {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  const y = mon.getFullYear(), m = String(mon.getMonth()+1).padStart(2,'0'), d = String(mon.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function weeksInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1, 12, 0, 0);
  const lastDay  = new Date(y, m,     0, 12, 0, 0);
  const d = new Date(firstDay);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const weeks = [];
  while (d <= lastDay) {
    const yy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    weeks.push(`${yy}-${mm}-${dd}`);
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}
function weeksInYear(yearStr) {
  const year = parseInt(yearStr);
  const allWeeks = new Set();
  for (let m = 1; m <= 12; m++) {
    for (const w of weeksInMonth(`${year}-${String(m).padStart(2,'0')}`)) allWeeks.add(w);
  }
  return [...allWeeks].sort();
}
function fmtWeekShort(w) {
  const d = new Date(w + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth()+1}`;
}

module.exports = router;

