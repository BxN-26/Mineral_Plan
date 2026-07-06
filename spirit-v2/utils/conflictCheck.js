'use strict';
/**
 * checkStaffConflict — vérifie si un salarié a un congé ou une
 * indisponibilité déjà APPROUVÉ(E) qui chevauche la date/heure donnée.
 *
 * Non-bloquant par design (retourne un message d'avertissement ou null) :
 * un manager peut avoir une bonne raison de passer outre (erreur de saisie
 * du congé, urgence...), donc on avertit sans empêcher l'affectation —
 * cf. audit_pre_ete_2026.md §3.7.
 *
 * @param {object} db_       — instance better-sqlite3 wrappée
 * @param {number} staffId
 * @param {string} dateStr   — YYYY-MM-DD, date réelle du créneau
 * @param {number} hourStart
 * @param {number} hourEnd
 * @returns {string|null}
 */
function checkStaffConflict(db_, staffId, dateStr, hourStart, hourEnd) {
  const leave = db_.get(
    `SELECT l.id, lt.label FROM leaves l JOIN leave_types lt ON lt.id = l.type_id
     WHERE l.staff_id = ? AND l.status = 'approved'
       AND l.start_date <= ? AND l.end_date >= ?`,
    [staffId, dateStr, dateStr]
  );
  if (leave) return `Salarié en congé (${leave.label}) ce jour-là`;

  const unavail = db_.get(
    `SELECT id FROM unavailabilities
     WHERE staff_id = ? AND status = 'approved'
       AND date_start <= ? AND date_end >= ?
       AND (all_day = 1 OR (hour_start < ? AND hour_end > ?))`,
    [staffId, dateStr, dateStr, hourEnd ?? 24, hourStart ?? 0]
  );
  if (unavail) return 'Salarié indisponible sur ce créneau';

  return null;
}

module.exports = { checkStaffConflict };
