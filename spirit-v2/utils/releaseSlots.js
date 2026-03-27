'use strict';
/**
 * releaseStaffSlots — Libère les créneaux planifiés d'un salarié sur une
 * période donnée et notifie le manager (ou les admins si pas de manager).
 *
 * @param {object} db        — instance better-sqlite3 wrappée (db_)
 * @param {function} notify  — fonction notify(userId, type, title, body, refType, refId)
 * @param {object} opts
 *   staffId   {number}  — id du salarié
 *   dateStart {string}  — YYYY-MM-DD
 *   dateEnd   {string}  — YYYY-MM-DD
 *   allDay    {boolean} — true = journée entière, false = partiel
 *   hourStart {number|null} — heure début (si !allDay)
 *   hourEnd   {number|null} — heure fin   (si !allDay)
 *   label     {string}  — libellé pour le message (ex: "Congé", "Indisponibilité")
 * @returns {Array} liste des créneaux supprimés
 */
function releaseStaffSlots(db, notify, { staffId, dateStart, dateEnd, allDay, hourStart, hourEnd, label }) {
  // 1. Calculer tous les jours inclus dans la période
  const start = new Date(dateStart + 'T12:00:00');
  const end   = new Date(dateEnd   + 'T12:00:00');

  const dayMap = []; // [{ weekStr, dayOfWeek, dateStr }]
  const d = new Date(start);
  while (d <= end) {
    const dayOfWeek = (d.getDay() + 6) % 7; // 0=Lun … 6=Dim
    const mon = new Date(d);
    mon.setDate(d.getDate() - dayOfWeek);
    const pad = n => String(n).padStart(2, '0');
    const weekStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    dayMap.push({ weekStr, dayOfWeek, dateStr });
    d.setDate(d.getDate() + 1);
  }

  // 2. Supprimer les schedule_slots concernés
  const removed = []; // [{ weekStr, dayOfWeek, dateStr, fnName, count }]

  for (const { weekStr, dayOfWeek, dateStr } of dayMap) {
    // Tous les schedules de cette semaine (toutes fonctions)
    const schedules = db.all(
      `SELECT sc.id AS schedule_id, f.slug AS fn_slug, f.name AS fn_name
       FROM schedules sc
       JOIN functions f ON f.id = sc.function_id
       WHERE sc.week_start = ?`,
      [weekStr]
    );

    for (const sc of schedules) {
      // Construire la requête de sélection des slots à libérer
      const params = [sc.schedule_id, staffId, dayOfWeek];
      let whereExtra = '';
      if (!allDay && hourStart != null && hourEnd != null) {
        whereExtra = ' AND hour_start < ? AND hour_end > ?';
        params.push(Number(hourEnd), Number(hourStart));
      }
      const slots = db.all(
        `SELECT id FROM schedule_slots
         WHERE schedule_id = ? AND staff_id = ? AND day_of_week = ?${whereExtra}`,
        params
      );
      if (!slots.length) continue;

      for (const slot of slots) {
        db.run('DELETE FROM schedule_slots WHERE id = ?', [slot.id]);
      }
      removed.push({ weekStr, dayOfWeek, dateStr, fnName: sc.fn_name, count: slots.length });
    }
  }

  if (!removed.length) return removed;

  // 3. Identifier le manager à notifier
  const staffRow = db.get('SELECT firstname, lastname, manager_id FROM staff WHERE id = ?', [staffId]);
  const staffName = staffRow
    ? `${staffRow.firstname} ${staffRow.lastname}`
    : `Salarié #${staffId}`;

  const dayNames = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const summary  = removed
    .map(r => `${dayNames[r.dayOfWeek]} ${r.dateStr.slice(8)}/${r.dateStr.slice(5, 7)} (${r.fnName})`)
    .join(', ');
  const totalRemoved = removed.reduce((s, r) => s + r.count, 0);

  const title = `🗓️ Créneau(x) libéré(s) — ${staffName}`;
  const body  = `${label} du ${dateStart} au ${dateEnd}. `
              + `${totalRemoved} créneau(x) supprimé(s) : ${summary}.`;

  // Chercher le manager du salarié
  const targets = [];
  if (staffRow?.manager_id) {
    const mgr = db.get(
      'SELECT u.id FROM users u JOIN staff ms ON ms.id = u.staff_id WHERE ms.id = ? AND u.active = 1',
      [staffRow.manager_id]
    );
    if (mgr) targets.push(mgr.id);
  }
  // Si pas de manager trouvé → notifier tous les admins
  if (!targets.length) {
    const admins = db.all(
      "SELECT id FROM users WHERE role IN ('admin','superadmin') AND active = 1"
    );
    targets.push(...admins.map(a => a.id));
  }

  for (const uid of targets) {
    notify(uid, 'planning_conflict', title, body, 'staff', staffId, {
      week: removed[0].weekStr,
      staffId,
    });
  }

  return removed;
}

module.exports = { releaseStaffSlots };
