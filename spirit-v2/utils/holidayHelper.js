/**
 * utils/holidayHelper.js — Helpers jours fériés & vacances scolaires (backend)
 *
 * Centralise la logique calendaire partagée entre les routes :
 *   - leaves.js        (calcul jours de congé)
 *   - templates.js     (application de modèles)
 *   - course-slots.js  (filtrage par saison)
 *   - schedules.js     (vérifications futures)
 *
 * Toutes les fonctions sont pures (sans effet de bord) sauf celles qui
 * acceptent explicitement `db` en paramètre.
 */
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// Calcul : dates de la semaine
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retourne les 7 dates (YYYY-MM-DD) d'une semaine à partir du lundi.
 * @param {string} weekStart — YYYY-MM-DD (lundi)
 * @returns {string[]}
 */
function getWeekDates(weekStart) {
  const d = new Date(weekStart + 'T12:00:00Z');
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

/**
 * Retourne la liste des lundis dans la plage [from, to] inclus.
 * @param {string} from — YYYY-MM-DD
 * @param {string} to   — YYYY-MM-DD
 * @returns {string[]}
 */
function mondaysBetween(from, to) {
  const mondays = [];
  const d   = new Date(from + 'T12:00:00Z');
  const end = new Date(to   + 'T12:00:00Z');
  // Avancer jusqu'au premier lundi
  const dow = d.getUTCDay(); // 0=dim, 1=lun…
  if (dow !== 1) d.setUTCDate(d.getUTCDate() + (dow === 0 ? 1 : 8 - dow));
  while (d <= end) {
    mondays.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return mondays;
}

// ──────────────────────────────────────────────────────────────────────────────
// Jours fériés
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Construit un Set<YYYY-MM-DD> de tous les jours fériés couvrant la plage.
 * Les jours récurrents (recurring=1) sont développés sur chaque année de la plage.
 *
 * @param {string} startStr — YYYY-MM-DD
 * @param {string} endStr   — YYYY-MM-DD
 * @param {object[]} holidays — rows de la table public_holidays
 * @returns {Set<string>}
 */
function buildHolidaySet(startStr, endStr, holidays) {
  const startYear = new Date(startStr + 'T12:00:00').getFullYear();
  const endYear   = new Date(endStr   + 'T12:00:00').getFullYear();
  const set = new Set();
  for (const h of holidays) {
    if (h.recurring) {
      const mmdd = h.date.slice(5); // "MM-DD"
      for (let y = startYear; y <= endYear; y++) set.add(`${y}-${mmdd}`);
    } else {
      set.add(h.date);
    }
  }
  return set;
}

/**
 * Retourne true si la date fournie est un jour férié.
 * @param {string}   dateStr   — YYYY-MM-DD
 * @param {object[]} holidays  — rows de la table public_holidays
 * @returns {boolean}
 */
function isPublicHoliday(dateStr, holidays) {
  if (!holidays?.length) return false;
  const mmdd = dateStr.slice(5);
  return holidays.some(h =>
    h.date === dateStr ||
    (h.recurring && h.date.slice(5) === mmdd)
  );
}

/**
 * Retourne le label du jour férié pour une date, ou null.
 * @param {string}   dateStr
 * @param {object[]} holidays
 * @returns {string|null}
 */
function getPublicHolidayLabel(dateStr, holidays) {
  if (!holidays?.length) return null;
  const mmdd = dateStr.slice(5);
  const h = holidays.find(h => h.date === dateStr || (h.recurring && h.date.slice(5) === mmdd));
  return h?.label || null;
}

/**
 * Retourne true si la semaine contient au moins un jour férié.
 * @param {string}   weekStart — YYYY-MM-DD (lundi)
 * @param {object[]} holidays
 * @returns {boolean}
 */
function weekContainsPublicHoliday(weekStart, holidays) {
  if (!holidays?.length) return false;
  const dates = getWeekDates(weekStart);
  return dates.some(d => isPublicHoliday(d, holidays));
}

// ──────────────────────────────────────────────────────────────────────────────
// Vacances scolaires
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retourne true si la date appartient à une période de vacances scolaires.
 * Convention : start_date inclus, end_date exclusif (premier jour de rentrée).
 *
 * @param {string}   dateStr       — YYYY-MM-DD
 * @param {object[]} schoolHolidays — rows de la table school_holidays
 * @returns {boolean}
 */
function isSchoolHoliday(dateStr, schoolHolidays) {
  if (!schoolHolidays?.length) return false;
  return schoolHolidays.some(h => h.start_date <= dateStr && dateStr < h.end_date);
}

/**
 * Retourne la description des vacances scolaires pour une date, ou null.
 * @param {string}   dateStr
 * @param {object[]} schoolHolidays
 * @returns {string|null}
 */
function getSchoolHolidayLabel(dateStr, schoolHolidays) {
  if (!schoolHolidays?.length) return null;
  const found = schoolHolidays.find(h => h.start_date <= dateStr && dateStr < h.end_date);
  return found?.description || null;
}

/**
 * Retourne le % de jours de la semaine qui sont en vacances scolaires (0.0 à 1.0).
 * @param {string}   weekStart
 * @param {object[]} schoolHolidays
 * @returns {number}  0.0 = aucun jour en vacances, 1.0 = toute la semaine
 */
function schoolHolidayWeekRatio(weekStart, schoolHolidays) {
  if (!schoolHolidays?.length) return 0;
  const dates = getWeekDates(weekStart);
  const count = dates.filter(d => isSchoolHoliday(d, schoolHolidays)).length;
  return count / 7;
}

/**
 * Retourne true si la semaine est entièrement en vacances scolaires (7/7 jours).
 */
function isFullSchoolHolidayWeek(weekStart, schoolHolidays) {
  return schoolHolidayWeekRatio(weekStart, schoolHolidays) === 1;
}

/**
 * Retourne true si la semaine est une "semaine de vacances" du point de vue des cours.
 *
 * Algorithme : ne compte que les jours ouvrés (lundi → vendredi, indices 0-4 dans
 * getWeekDates) pour éviter que les jours du week-end d'un pont court
 * (ex : Pont de l'Ascension = jeudi + vendredi + samedi + dimanche) gonflent
 * artificiellement le ratio et fassent qualifier la semaine de "vacances".
 *
 * Seuil : ≥ 3 jours ouvrés sur 5 en vacances scolaires.
 *
 * Exemples :
 *  - Semaine "Vacances d'Hiver" (lun-ven tous en vacances) : 5/5 ≥ 3 → vacances ✓
 *  - Semaine du Pont de l'Ascension (jeu+ven en vacances) :  2/5 < 3 → pas vacances ✓
 *  - Semaine où les vacances débutent mercredi (mer-ven en vacances) : 3/5 ≥ 3 → vacances ✓
 *
 * @param {string}   weekStart      — YYYY-MM-DD (lundi)
 * @param {object[]} schoolHolidays
 * @returns {boolean}
 */
function isVacationWeek(weekStart, schoolHolidays) {
  if (!schoolHolidays?.length) return false;
  const dates = getWeekDates(weekStart);
  let count = 0;
  for (let i = 0; i < 5; i++) { // lundi (0) → vendredi (4) uniquement
    if (isSchoolHoliday(dates[i], schoolHolidays)) count++;
  }
  return count >= 3;
}

/**
 * Retourne true si la semaine est partiellement ou entièrement en vacances.
 */
function hasSchoolHoliday(weekStart, schoolHolidays) {
  return schoolHolidayWeekRatio(weekStart, schoolHolidays) > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Chargement depuis la DB (helpers avec db en paramètre)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Charge les jours fériés depuis la DB.
 * @param {object} db_ — instance better-sqlite3 wrappée
 * @returns {object[]}
 */
function loadPublicHolidays(db_) {
  return db_.all('SELECT date, label, recurring FROM public_holidays');
}

/**
 * Charge les vacances scolaires pour une zone et une plage d'années depuis la DB.
 * @param {object} db_
 * @param {string} zone         — ex. 'Zone B'
 * @param {number} yearFrom
 * @param {number} yearTo
 * @returns {object[]}
 */
function loadSchoolHolidays(db_, zone, yearFrom, yearTo) {
  return db_.all(
    `SELECT zone, description, start_date, end_date FROM school_holidays
     WHERE zone = ? AND start_date < ? AND end_date > ?
     ORDER BY start_date`,
    [zone, `${yearTo + 1}-01-01`, `${yearFrom - 1}-01-01`]
  );
}

/**
 * Lit la zone scolaire configurée dans les settings.
 * @param {object} db_
 * @returns {string}  ex. 'Zone B'
 */
function getConfiguredSchoolZone(db_) {
  const s = db_.get("SELECT value FROM settings WHERE key='school_holidays_zone'");
  return s?.value || 'Zone C';
}

// ──────────────────────────────────────────────────────────────────────────────
// Filtrage des course slots par saison
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Détermine si un créneau de cours doit être actif pour une semaine donnée,
 * en tenant compte de :
 *  - course_slot.season   ('always'|'hors-vacances'|'vacances'|'competition'|'stage')
 *  - course_slot.valid_from / valid_until
 *  - L'état week en vacances scolaires ou non
 *
 * @param {object}   cs             — row course_slots
 * @param {string}   weekStart      — YYYY-MM-DD (lundi)
 * @param {boolean}  isVacationWeek — true si la semaine est en vacances scolaires
 * @returns {boolean}
 */
function isCourseSlotActiveForWeek(cs, weekStart, isVacationWeek) {
  // Vérifier valid_from / valid_until
  if (cs.valid_from  && weekStart < cs.valid_from)  return false;
  if (cs.valid_until && weekStart > cs.valid_until) return false;

  // Filtrage par saison
  const season = cs.season || 'always';
  if (season === 'hors-vacances') return !isVacationWeek;
  if (season === 'vacances')      return isVacationWeek;
  // 'always', 'competition', 'stage', etc. => toujours visible (géré par valid_from/until)
  return true;
}

/**
 * Filtre un tableau de course slots pour ne garder que ceux actifs pour la semaine.
 *
 * @param {object[]} courseSlots
 * @param {string}   weekStart
 * @param {object[]} schoolHolidays
 * @returns {object[]}
 */
function filterCourseSlotsByWeek(courseSlots, weekStart, schoolHolidays) {
  const vacation = isVacationWeek(weekStart, schoolHolidays);
  return courseSlots.filter(cs => isCourseSlotActiveForWeek(cs, weekStart, vacation));
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
  // Calcul de dates
  getWeekDates,
  mondaysBetween,

  // Jours fériés
  buildHolidaySet,
  isPublicHoliday,
  getPublicHolidayLabel,
  weekContainsPublicHoliday,

  // Vacances scolaires
  isSchoolHoliday,
  getSchoolHolidayLabel,
  schoolHolidayWeekRatio,
  isFullSchoolHolidayWeek,
  isVacationWeek,
  hasSchoolHoliday,

  // Chargement DB
  loadPublicHolidays,
  loadSchoolHolidays,
  getConfiguredSchoolZone,

  // Course slots
  isCourseSlotActiveForWeek,
  filterCourseSlotsByWeek,
};
