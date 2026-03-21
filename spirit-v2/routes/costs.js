'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

const MGR = [requireAuth, requireRole('admin','manager','superadmin','rh')];

// ── GET /api/costs?week=YYYY-MM-DD&period=week|month|year ─────
router.get('/', ...MGR, (req, res) => {
  let { week = currentMonday(), period = 'week' } = req.query;

  // Calculer la plage de dates
  const { start, end, label } = getRange(week, period);

  // Récupérer tous les créneaux de la plage
  const slots = db_.all(
    `SELECT ss.staff_id, ss.hour_start, ss.hour_end
     FROM schedule_slots ss
     JOIN schedules sc ON sc.id = ss.schedule_id
     WHERE sc.week_start >= ? AND sc.week_start <= ?`,
    [start, end]
  );

  // Heures par salarié
  const hoursByStaff = {};
  for (const s of slots) {
    hoursByStaff[s.staff_id] = (hoursByStaff[s.staff_id] || 0) + (s.hour_end - s.hour_start);
  }

  // Données financières par salarié
  const staffList = db_.all(
    'SELECT id, firstname, lastname, initials, color, hourly_rate, charge_rate, type FROM staff WHERE active=1',
  );

  let totalGross = 0, totalCharges = 0, totalCost = 0;

  const rows = staffList
    .filter(s => hoursByStaff[s.id])
    .map(s => {
      const hours    = hoursByStaff[s.id] || 0;
      const rate     = s.hourly_rate || 0;
      const chargeR  = s.charge_rate ?? 0.45;
      const gross    = +(hours * rate).toFixed(2);
      const charges  = +(gross * chargeR).toFixed(2);
      const total    = +(gross + charges).toFixed(2);
      totalGross    += gross;
      totalCharges  += charges;
      totalCost     += total;
      return {
        id:          s.id,
        name:        `${s.firstname} ${s.lastname}`,
        initials:    s.initials,
        color:       s.color,
        type:        s.type,
        hours,
        hourly_rate: rate,
        charge_rate: chargeR,
        gross, charges, total,
      };
    })
    .sort((a, b) => b.total - a.total);

  res.json({
    period: { type: period, start, end, label },
    summary: {
      gross:   +totalGross.toFixed(2),
      charges: +totalCharges.toFixed(2),
      total:   +totalCost.toFixed(2),
    },
    rows,
  });
});

function currentMonday() {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function getRange(weekStr, period) {
  const d = new Date(weekStr + 'T12:00:00');
  if (period === 'week') {
    const end = new Date(d); end.setDate(d.getDate() + 6);
    return { start: weekStr, end: end.toISOString().slice(0,10), label: `Semaine du ${fmt(d)}` };
  }
  if (period === 'month') {
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: s.toISOString().slice(0,10), end: e.toISOString().slice(0,10),
      label: s.toLocaleString('fr-FR', { month: 'long', year: 'numeric' }) };
  }
  if (period === 'year') {
    return {
      start: `${d.getFullYear()}-01-01`,
      end:   `${d.getFullYear()}-12-31`,
      label: String(d.getFullYear()),
    };
  }
  return { start: weekStr, end: weekStr, label: weekStr };
}

function fmt(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

module.exports = router;
