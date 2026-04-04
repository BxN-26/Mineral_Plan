/**
 * Utilitaires jours fériés + vacances scolaires (frontend)
 * Centralisés ici pour éviter la duplication dans les 4 vues calendrier.
 */

/**
 * Retourne le label du jour férié pour une date donnée, ou null.
 *
 * Gère :
 *  - Jours récurrents (recurring=1) : même MM-DD quelle que soit l'année
 *  - Jours ponctuels (recurring=0)  : date exacte YYYY-MM-DD seulement
 *
 * @param {string} dateStr  — YYYY-MM-DD
 * @param {Array}  publicHolidays — tableau d'objets { date, label, recurring }
 * @returns {string|null}
 */
export function getPublicHoliday(dateStr, publicHolidays) {
  if (!publicHolidays?.length || !dateStr) return null;
  const mmdd = dateStr.slice(5); // "MM-DD"

  // 1. Date exacte (ponctuel ou récurrent avec la bonne année)
  const exact = publicHolidays.find(h => h.date === dateStr);
  if (exact) return exact.label;

  // 2. Récurrent : même MM-DD, quelle que soit l'année de référence
  const recur = publicHolidays.find(h => h.recurring && h.date.slice(5) === mmdd);
  return recur?.label || null;
}

/**
 * Retourne la description de la période de vacances scolaires si la date y appartient, ou null.
 *
 * Convention de stockage :
 *  - start_date = premier jour de vacances (inclus)
 *  - end_date   = premier jour de rentrée  (exclusif)
 *
 * @param {string} dateStr      — YYYY-MM-DD
 * @param {Array}  schoolHolidays — tableau d'objets { start_date, end_date, description }
 * @returns {string|null}
 */
export function getSchoolHoliday(dateStr, schoolHolidays) {
  if (!schoolHolidays?.length || !dateStr) return null;
  const found = schoolHolidays.find(h => h.start_date <= dateStr && dateStr < h.end_date);
  return found?.description || null;
}

/**
 * Calcule l'ensemble des décorations calendrier pour un jour donné.
 *
 * @param {string} dateStr
 * @param {Array}  publicHolidays
 * @param {Array}  schoolHolidays
 * @returns {{
 *   isHoliday: boolean,
 *   holidayLabel: string|null,
 *   isSchoolHoliday: boolean,
 *   schoolLabel: string|null,
 * }}
 */
export function getDayDecorations(dateStr, publicHolidays, schoolHolidays) {
  const holidayLabel = getPublicHoliday(dateStr, publicHolidays);
  const schoolLabel  = getSchoolHoliday(dateStr, schoolHolidays);
  return {
    isHoliday:       !!holidayLabel,
    holidayLabel,
    isSchoolHoliday: !!schoolLabel,
    schoolLabel,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de semaine
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retourne les 7 dates (YYYY-MM-DD) d'une semaine à partir du lundi.
 * @param {string} weekStart — YYYY-MM-DD (lundi)
 * @returns {string[]}
 */
export function getWeekDates(weekStart) {
  const d = new Date(weekStart + 'T12:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

/**
 * Retourne le ratio de jours en vacances scolaires pour une semaine (0.0 → 1.0).
 * Compte les 7 jours (utile pour affichage / calcul brut).
 * @param {string} weekStart
 * @param {Array}  schoolHolidays
 * @returns {number}
 */
export function schoolHolidayWeekRatio(weekStart, schoolHolidays) {
  if (!schoolHolidays?.length) return 0;
  const dates = getWeekDates(weekStart);
  const count = dates.filter(d => !!getSchoolHoliday(d, schoolHolidays)).length;
  return count / 7;
}

/**
 * Retourne true si au moins un jour de la semaine est en vacances scolaires.
 * @param {string} weekStart
 * @param {Array}  schoolHolidays
 * @returns {boolean}
 */
export function hasSchoolHolidayInWeek(weekStart, schoolHolidays) {
  return schoolHolidayWeekRatio(weekStart, schoolHolidays) > 0;
}

/**
 * Retourne true si la semaine est une "semaine de vacances" du point de vue des cours.
 *
 * Utilise uniquement les jours ouvrés (lun-ven) pour ne pas laisser les deux
 * jours du week-end d'un pont court (ex : Pont de l'Ascension = jeu+ven+sam+dim)
 * gonfler artificiellement le ratio et qualifier la semaine de "vacances".
 *
 * Seuil : ≥ 3 jours ouvrés (lun-ven) sur 5 en vacances scolaires.
 *
 * @param {string} weekStart
 * @param {Array}  schoolHolidays
 * @returns {boolean}
 */
export function isVacationWeek(weekStart, schoolHolidays) {
  if (!schoolHolidays?.length) return false;
  const dates = getWeekDates(weekStart);
  let count = 0;
  for (let i = 0; i < 5; i++) { // lundi (0) → vendredi (4) uniquement
    if (getSchoolHoliday(dates[i], schoolHolidays)) count++;
  }
  return count >= 3;
}

/**
 * Retourne true si au moins un jour de la semaine est un jour férié.
 * @param {string} weekStart
 * @param {Array}  publicHolidays
 * @returns {boolean}
 */
export function hasPublicHolidayInWeek(weekStart, publicHolidays) {
  if (!publicHolidays?.length) return false;
  return getWeekDates(weekStart).some(d => !!getPublicHoliday(d, publicHolidays));
}

// ──────────────────────────────────────────────────────────────────────────────
// Filtrage des course slots par saison
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Détermine si un créneau de cours est actif pour une semaine donnée.
 *
 * @param {object}  cs            — objet course_slot { season, valid_from, valid_until, ... }
 * @param {string}  weekStart     — YYYY-MM-DD (lundi)
 * @param {boolean} isVacation    — true si la semaine est "en vacances" (≥4/7 jours)
 * @returns {boolean}
 */
export function isCourseSlotActiveForWeek(cs, weekStart, isVacation) {
  if (cs.valid_from  && weekStart < cs.valid_from)  return false;
  if (cs.valid_until && weekStart > cs.valid_until) return false;

  const season = cs.season || 'always';
  if (season === 'hors-vacances') return !isVacation;
  if (season === 'vacances')      return isVacation;
  return true; // 'always', 'competition', 'stage' → toujours affiché
}

/**
 * Filtre un tableau de course_slots pour ne garder que ceux actifs pour la semaine.
 *
 * @param {object[]} courseSlots
 * @param {string}   weekStart
 * @param {Array}    schoolHolidays
 * @returns {object[]}
 */
export function filterCourseSlotsByWeek(courseSlots, weekStart, schoolHolidays) {
  const vacation = isVacationWeek(weekStart, schoolHolidays);
  return courseSlots.filter(cs => isCourseSlotActiveForWeek(cs, weekStart, vacation));
}

// ──────────────────────────────────────────────────────────────────────────────
// Calcul de jours ouvrés (frontend — pour prévisualisation des congés)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compte les jours ouvrés entre deux dates (inclus) en excluant les jours fériés.
 *
 * Respecte le paramètre `leave_working_days` (Set de getDay() 0=Dim…6=Sam).
 * Si non fourni, exclut dimanche (getDay()===0) par défaut.
 *
 * @param {string}  startStr
 * @param {string}  endStr
 * @param {Array}   publicHolidays
 * @param {Set|null} workingDaysSet  — Set<number> des getDay() considérés ouvrés
 * @param {boolean} halfStart
 * @param {boolean} halfEnd
 * @returns {number}
 */
export function calcLeaveDays(
  startStr, endStr,
  publicHolidays,
  workingDaysSet = null,
  halfStart = false, halfEnd = false,
) {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(endStr   + 'T12:00:00');
  if (e < s) return 0;

  let days = 0;
  const d = new Date(s);
  while (d <= e) {
    const dow     = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    const isWorking = workingDaysSet ? workingDaysSet.has(dow) : dow !== 0;
    if (isWorking && !getPublicHoliday(dateStr, publicHolidays)) days++;
    d.setDate(d.getDate() + 1);
  }
  if (halfStart) days -= 0.5;
  if (halfEnd)   days -= 0.5;
  return Math.max(0, days);
}
