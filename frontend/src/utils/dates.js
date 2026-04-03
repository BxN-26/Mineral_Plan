/**
 * utils/dates.js — Helpers date centralisés
 * Partagé par PlanningView, MonPlanningView, TeamPlanningView,
 * StatsView, RelevesView, SwapView et App.jsx.
 */

/** Retourne la date du lundi de la semaine courante + offset semaines (format YYYY-MM-DD) */
export function weekStart(offset = 0) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return toDateStr(mon);
}

/** Avance ou recule d'un nombre de semaines à partir d'un string YYYY-MM-DD */
export function addWeeks(weekStr, n) {
  const d = new Date(weekStr + 'T12:00:00');
  d.setDate(d.getDate() + n * 7);
  return toDateStr(d);
}

/** Avance ou recule d'un nombre de mois à partir d'un string YYYY-MM (retourne YYYY-MM) */
export function addMonths(monthStr, n) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Mois courant au format YYYY-MM */
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Convertit une Date JS en string YYYY-MM-DD */
export function toDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Retourne le lundi de la semaine contenant la date fournie (Date ou YYYY-MM-DD) */
export function toMonday(d) {
  const date = d instanceof Date ? d : new Date(d + 'T12:00:00');
  const diff = date.getDay() === 0 ? -6 : 1 - date.getDay();
  const mon  = new Date(date);
  mon.setDate(date.getDate() + diff);
  return toDateStr(mon);
}

/** Libellé court de semaine : "14/4" */
export function fmtWeekShort(w) {
  const d = new Date(w + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Libellé long de semaine : "14 avr. 2025" */
export function fmtWeek(w) {
  const d = new Date(w + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Libellé de mois : "avril 2025" */
export function fmtMonth(monthStr) {
  return new Date(monthStr + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/** Formate une date YYYY-MM-DD en "JJ/MM/AAAA" */
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Indice du jour courant (0=lun … 6=dim) */
export function todayDayIdx() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}
