/**
 * Utilitaires jours fériés + vacances scolaires
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
