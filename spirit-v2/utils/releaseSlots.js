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
 * @returns {Array} snapshot des créneaux supprimés, réutilisable tel quel
 *   avec restoreReleasedSlots() pour les recréer si le congé/indispo est
 *   annulé — cf. audit_pre_ete_2026.md §3.5.
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
  const removed  = []; // résumé par (semaine, fonction) — pour le message de notification
  const snapshot = []; // détail complet par créneau — pour une restauration ultérieure

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
        `SELECT * FROM schedule_slots
         WHERE schedule_id = ? AND staff_id = ? AND day_of_week = ?${whereExtra}`,
        params
      );
      if (!slots.length) continue;

      for (const slot of slots) {
        snapshot.push({
          week_start:     weekStr,
          fn_slug:        sc.fn_slug,
          staff_id:       staffId,
          day_of_week:    dayOfWeek,
          hour_start:     slot.hour_start,
          hour_end:       slot.hour_end,
          task_type:      slot.task_type || null,
          course_slot_id: slot.course_slot_id || null,
        });
        db.run('DELETE FROM schedule_slots WHERE id = ?', [slot.id]);
      }
      removed.push({ weekStr, dayOfWeek, dateStr, fnName: sc.fn_name, count: slots.length });
    }
  }

  if (!removed.length) return snapshot;

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

  return snapshot;
}

/**
 * restoreReleasedSlots — Recrée les créneaux précédemment libérés par
 * releaseStaffSlots (ex: annulation d'un congé/indispo déjà approuvé).
 * Recrée le schedule (semaine+fonction) au besoin, comme addSlot() dans
 * routes/swaps.js. Silencieux sur les conflits (INSERT OR IGNORE) — si le
 * créneau a été réoccupé entre-temps par autre chose, on ne l'écrase pas.
 *
 * @param {object} db instance better-sqlite3 wrappée (db_)
 * @param {Array}  snapshot — tel que retourné par releaseStaffSlots()
 * @returns {number} nombre de créneaux effectivement restaurés
 */
function restoreReleasedSlots(db, snapshot) {
  if (!Array.isArray(snapshot) || !snapshot.length) return 0;
  let restored = 0;
  for (const s of snapshot) {
    const fn = db.get('SELECT id FROM functions WHERE slug=?', [s.fn_slug]);
    if (!fn) continue;

    let sch = db.get(
      'SELECT id FROM schedules WHERE week_start=? AND function_id=?',
      [s.week_start, fn.id]
    );
    if (!sch) {
      const ins = db.run(
        `INSERT INTO schedules (week_start, function_id, note) VALUES (?,?,'')`,
        [s.week_start, fn.id]
      );
      sch = { id: ins.lastInsertRowid };
    }
    const r = db.run(
      `INSERT OR IGNORE INTO schedule_slots
         (schedule_id, staff_id, day_of_week, hour_start, hour_end, task_type, course_slot_id)
       VALUES (?,?,?,?,?,?,?)`,
      [sch.id, s.staff_id, s.day_of_week, s.hour_start, s.hour_end, s.task_type, s.course_slot_id]
    );
    if (r.changes > 0) restored++;
  }
  return restored;
}

module.exports = { releaseStaffSlots, restoreReleasedSlots };
