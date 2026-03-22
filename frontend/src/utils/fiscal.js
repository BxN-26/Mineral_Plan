/**
 * Calcule les bornes de l'exercice comptable.
 *
 * @param {Array}    settingsArray  — tableau { key, value } depuis useApp().settings
 * @param {Date}     refDate        — date de référence (défaut : aujourd'hui)
 * @param {number}   offset         — 0 = exercice en cours, -1 = précédent, +1 = suivant
 * @returns {{ start, end, label, year, isCalendar }}
 */

/** Formate une Date en 'YYYY-MM-DD' en heure locale (sans décalage UTC). */
function localIso(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function computeFiscalYear(settingsArray, refDate = new Date(), offset = 0) {
  const map  = Object.fromEntries((settingsArray || []).map(s => [s.key, s.value]));
  const type = map['fiscal_year_type'] || 'calendar';
  const ref  = typeof refDate === 'string' ? new Date(refDate + 'T12:00:00') : new Date(refDate);

  if (type === 'calendar') {
    const y = ref.getFullYear() + offset;
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y), year: y, isCalendar: true };
  }

  // Exercice personnalisé
  const sm = parseInt(map['fiscal_year_start_month'] || '9', 10);
  const sd = parseInt(map['fiscal_year_start_day']   || '1', 10);
  const ry = ref.getFullYear();
  const rm = ref.getMonth() + 1;
  const rd = ref.getDate();

  // Déterminer l'année de départ de l'exercice contenant refDate
  let startYear = (rm > sm || (rm === sm && rd >= sd)) ? ry : ry - 1;
  startYear += offset;

  const startStr  = `${startYear}-${String(sm).padStart(2,'0')}-${String(sd).padStart(2,'0')}`;
  // La date de fin = veille du début de l'exercice suivant.
  // On crée la date de début de l'exercice suivant en heure locale,
  // puis on recule d'un jour avec setDate pour avoir le bon dernier jour du mois
  // (gère correctement les mois de 28/29/30/31 jours et les années bissextiles).
  const endDt = new Date(startYear + 1, sm - 1, sd);
  endDt.setDate(endDt.getDate() - 1);
  const endStr = localIso(endDt);

  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  return { start: startStr, end: endStr, label: `${fmt(startStr)} → ${fmt(endStr)}`, year: startYear, isCalendar: false };
}
