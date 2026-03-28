import { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const DAYS     = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SH  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_START = 7;
const DAY_END   = 24;
const HOUR_H    = 56; // px par heure
const SLOT_H    = 14; // px par quart d'heure
const TOTAL_H   = (DAY_END - DAY_START) * HOUR_H;
const HOURS     = Array.from({ length: DAY_END - DAY_START }, (_, i) => i + DAY_START);

const timeToY  = (t) => (t - DAY_START) * HOUR_H;
const fmtTime  = (t) => `${Math.floor(t)}h${String(Math.round((t % 1) * 60)).padStart(2, '0').replace(/^0$/, '')}`;
const todayDayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

/* ─── Grouper les cours par intervalles qui se chevauchent ──── */
function groupCoursesByOverlap(courses) {
  const sorted = [...courses].sort((a, b) => a.hour_start - b.hour_start);
  const groups = [];
  let group = [], maxEnd = -Infinity;
  for (const c of sorted) {
    if (c.hour_start < maxEnd) {
      group.push(c); maxEnd = Math.max(maxEnd, c.hour_end);
    } else {
      if (group.length) groups.push(group);
      group = [c]; maxEnd = c.hour_end;
    }
  }
  if (group.length) groups.push(group);
  return groups;
}

/* ─── Bande cours lecture seule ─────────────────────────────── */
const ROCourseBand = ({ courses }) => {
  const minS = Math.min(...courses.map(c => c.hour_start));
  const maxE = Math.max(...courses.map(c => c.hour_end));
  const top  = timeToY(minS);
  const h    = Math.max(SLOT_H * 2, timeToY(maxE) - top);
  const primaryColor = courses[0]?.color || '#5B75DB';
  const primaryBg    = courses[0]?.bg_color || '#EBF0FE';
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, height: h, zIndex: 1, pointerEvents: 'none', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', inset: 0, background: primaryBg, borderLeft: `4px solid ${primaryColor}`, opacity: 0.65, boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${primaryColor}55 1.2px, transparent 1.2px)`, backgroundSize: '7px 7px', opacity: 0.9 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <span style={{ fontSize: Math.max(11, Math.min(20, h * 0.28)), fontWeight: 900, letterSpacing: '0.18em', color: primaryColor, opacity: 0.35, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: 'Impact, "Arial Black", sans-serif' }}>COURS</span>
      </div>
      {h >= 36 && (
        <div style={{ position: 'absolute', bottom: 3, left: 6, right: 4, fontSize: 8, color: primaryColor, fontWeight: 600, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {courses.map(c => c.group_name).join(' · ')}
        </div>
      )}
    </div>
  );
};

/* ─── Grille lecture seule (agenda) ────────────────────────── */
const ROGrid = ({ spans, staff, functions, dates, ttMap = {}, courseSlots = [], courseSlotsFns = [] }) => {
  return (
    <div style={{ display: 'flex', overflowX: 'auto' }}>
      {/* Colonne heures */}
      <div style={{ width: 40, flexShrink: 0, position: 'relative', height: TOTAL_H, userSelect: 'none' }}>
        {HOURS.map(h => (
          <div key={h} style={{
            position: 'absolute', top: timeToY(h), right: 4,
            fontSize: 9, color: '#C0BCB5', lineHeight: 1,
          }}>{h}h</div>
        ))}
      </div>
      {/* Colonnes jours */}
      {dates.map((date, d) => {
        const isToday = date.toDateString() === new Date().toDateString();
        const daySpans = spans[d] || [];
        // Cours visibles = uniquement ceux auxquels au moins un membre visible est assigné
        const visibleCourseIds = new Set(daySpans.filter(sp => sp.courseSlotId).map(sp => sp.courseSlotId));
        const dayCourses = courseSlots.filter(cs =>
          cs.day_of_week === d &&
          (courseSlotsFns.length === 0 || courseSlotsFns.includes(cs.fn_slug)) &&
          visibleCourseIds.has(cs.id)
        );
        const courseGroups = groupCoursesByOverlap(dayCourses);
        return (
          <div key={d} style={{ flex: 1, minWidth: 100, position: 'relative' }}>
            {/* En-tête jour */}
            <div style={{
              textAlign: 'center', padding: '5px 2px', fontSize: 11, fontWeight: 700,
              color: isToday ? '#C5753A' : '#1E2235',
              background: isToday ? '#FFF4EC' : '#F5F3EF',
              borderBottom: `2px solid ${isToday ? '#C5753A' : '#ECEAE4'}`,
              whiteSpace: 'nowrap',
            }}>
              {DAYS[d].slice(0, 3)} {date.getDate()}/{date.getMonth() + 1}
            </div>
            {/* Zone grille */}
            <div style={{
              position: 'relative', height: TOTAL_H,
              background: isToday ? '#FFFCF8' : '#fff',
              borderRight: '1px solid #F0EDE8',
            }}>
              {/* Lignes heure */}
              {HOURS.map(h => (
                <div key={h} style={{
                  position: 'absolute', top: timeToY(h), left: 0, right: 0,
                  borderTop: `1px solid ${h % 2 === 0 ? '#ECEAE4' : '#F5F3EF'}`,
                  pointerEvents: 'none',
                }} />
              ))}
              {/* Bandes cours */}
              {courseGroups.map((group, gi) => <ROCourseBand key={gi} courses={group} />)}
              {/* Blocs spans */}
              {daySpans.map((sp, si) => {
                const s = staff.find(x => x.id === sp.staffId);
                if (!s) return null;
                const fn = functions.find(f => f.slug === sp.fnSlug);
                const tt = sp.taskType ? ttMap[sp.taskType] : null;
                const cs = sp.courseSlotId ? courseSlots.find(c => c.id === sp.courseSlotId) : null;
                const top = timeToY(sp.start);
                const h   = Math.max(SLOT_H, timeToY(sp.end) - timeToY(sp.start));

                // ── Déclaration reliquat ──────────────────────────────
                if (sp.isDeclaration) {
                  const isPending  = sp.declStatus === 'pending';
                  const isApproved = sp.declStatus === 'approved';
                  const declBg     = isPending ? '#FEF9C3' : isApproved ? '#DCFCE7' : '#F3F4F6';
                  const declBorder = isPending ? '#A16207' : isApproved ? '#15803D' : '#9CA3AF';
                  return (
                    <div key={si} style={{
                      position: 'absolute', top, left: 2, right: 2, height: h,
                      background: declBg,
                      border: `1.5px dashed ${declBorder}`,
                      borderLeft: `3.5px solid ${declBorder}`,
                      borderRadius: 5, overflow: 'hidden', padding: '2px 5px',
                      fontSize: 9, fontWeight: 600,
                      boxSizing: 'border-box', zIndex: 2,
                    }}>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                        <span style={{ fontSize: Math.max(9, Math.min(16, h * 0.28)), fontWeight: 900, letterSpacing: '0.16em', color: declBorder, opacity: 0.3, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: 'Impact, "Arial Black", sans-serif' }}>REL</span>
                      </div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', color: declBorder }}>
                        <span style={{ fontSize: 8 }}>⏰</span>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800, flexShrink: 0 }}>{(s.firstname || s.name || '?')[0]}</div>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
                      </div>
                      {h >= 28 && <div style={{ position: 'relative', fontSize: 8, color: declBorder, opacity: .8 }}>{fmtTime(sp.start)}–{fmtTime(sp.end)}</div>}
                    </div>
                  );
                }

                const blockColor = cs ? (cs.color || '#5B75DB') : s.color;
                const blockBg    = cs ? (cs.bg_color || '#EBF0FE') : `${s.color}20`;
                return (
                  <div key={si} style={{
                    position: 'absolute', top, left: 2, right: 2, height: h,
                    background: blockBg,
                    border: `1.5px solid ${blockColor}50`,
                    borderLeft: `3.5px solid ${blockColor}`,
                    borderRadius: 5, overflow: 'hidden', padding: '2px 5px',
                    fontSize: 9, color: blockColor, fontWeight: 600,
                    boxSizing: 'border-box', zIndex: 2,
                  }}>
                    {/* Fond points si cours */}
                    {cs && <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${blockColor}55 1.2px, transparent 1.2px)`, backgroundSize: '7px 7px', opacity: 0.9, pointerEvents: 'none' }} />}
                    {/* Tampon COURS */}
                    {cs && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                      <span style={{ fontSize: Math.max(9, Math.min(16, h * 0.28)), fontWeight: 900, letterSpacing: '0.16em', color: blockColor, opacity: 0.3, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: 'Impact, "Arial Black", sans-serif' }}>COURS</span>
                    </div>}
                    {!cs && tt && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tt.color, borderRadius: '3px 0 0 3px' }} />}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
                      {cs ? <span style={{ fontSize: 8 }}>🎓</span> : fn && <span style={{ fontSize: 8 }}>{fn.icon}</span>}
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: blockColor, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 6, fontWeight: 800, flexShrink: 0,
                      }}>{(s.firstname || s.name || '?')[0]}</div>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cs ? cs.group_name : (s.firstname || s.name)}
                      </span>
                    </div>
                    {h >= 28 && (
                      <div style={{ position: 'relative', fontSize: 8, opacity: .8 }}>
                        {fmtTime(sp.start)}–{fmtTime(sp.end)}
                      </div>
                    )}
                    {!cs && tt && h >= 32 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: `${tt.color}18`, border: `1px solid ${tt.color}40`, borderRadius: 3, padding: '0px 3px', fontSize: 8, color: tt.color, fontWeight: 600, marginTop: 1 }}>
                        {tt.icon} {tt.label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Vue principale ─────────────────────────────────────────── */
const TeamPlanningView = () => {
  const { user }                                             = useAuth();
  const { staff, teams, functions, taskTypes, schedules, loadWeekSchedules, settings } = useApp();
  const [wk, setWk]                                          = useState(0);
  const [selectedTeamIds, setSelectedTeamIds]                = useState(null); // null = toutes
  const [hiddenStaffIds,  setHiddenStaffIds]                 = useState(new Set());
  const [courseSlots,       setCourseSlots]       = useState([]);
  const [courseAssignments, setCourseAssignments] = useState([]);
  const [dayMode, setDayMode]  = useState(() => localStorage.getItem('spirit-teamplanning-mode') === 'day');
  const [currentDay, setCurrentDay] = useState(todayDayIdx);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);
  const ttMap = useMemo(() => Object.fromEntries((taskTypes||[]).map(t => [t.slug, t])), [taskTypes]);

  const courseSlotsFns = useMemo(() => {
    const s = Array.isArray(settings)
      ? settings.find(s => s.key === 'planning_course_slots_fns')
      : settings?.planning_course_slots_fns != null ? { value: JSON.stringify(settings.planning_course_slots_fns) } : null;
    try { return s ? JSON.parse(s.value) : []; } catch { return []; }
  }, [settings]);

  const loadCourseData = useCallback(async (week) => {
    try {
      const [cs, ca] = await Promise.all([
        api.get('/course-slots'),
        api.get(`/course-slots/assignments?week=${week}`),
      ]);
      setCourseSlots(Array.isArray(cs.data) ? cs.data : []);
      setCourseAssignments(Array.isArray(ca.data) ? ca.data : []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);
  useEffect(() => { loadCourseData(currentWeek); }, [currentWeek, loadCourseData]);

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel = dates.length
    ? `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`
    : '';

  // Équipes de l'utilisateur connecté
  const myStaff    = useMemo(() => staff.find(s => s.id === user?.staff_id), [staff, user]);
  const myTeamIds  = useMemo(() => {
    if (myStaff?.team_ids?.length) return myStaff.team_ids.map(Number);
    if (myStaff?.team_id) return [Number(myStaff.team_id)];
    return [];
  }, [myStaff]);

  const myTeams = useMemo(() => {
    if (myTeamIds.length === 0) return teams;
    return teams.filter(t => myTeamIds.includes(t.id));
  }, [teams, myTeamIds]);

  const toggleTeam = (tid) => {
    setSelectedTeamIds(prev => {
      const allIds = myTeams.map(t => t.id);
      const base   = prev === null ? new Set(allIds) : new Set(prev);
      if (base.has(tid)) { base.delete(tid); } else { base.add(tid); }
      if (base.size === allIds.length) return null; // tout sélectionné ↔ null
      return base;
    });
  };

  const toggleDayMode = (val) => {
    setDayMode(val);
    localStorage.setItem('spirit-teamplanning-mode', val ? 'day' : 'week');
  };

  const prevDay = () => {
    if (currentDay > 0) { setCurrentDay(d => d - 1); }
    else { setCurrentDay(6); setWk(w => w - 1); }
  };
  const nextDay = () => {
    if (currentDay < 6) { setCurrentDay(d => d + 1); }
    else { setCurrentDay(0); setWk(w => w + 1); }
  };

  const toggleStaff = (sid) => {
    setHiddenStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(sid)) { next.delete(sid); } else { next.add(sid); }
      return next;
    });
  };

  // Membres de ces équipes (fallback sur team_id pour compatibilité anciens salariés)
  const staffInTeams = useCallback((s, teamIdSet) =>
    s.team_ids?.some(tid => teamIdSet.has(tid)) ||
    (s.team_id != null && teamIdSet.has(s.team_id))
  , []);

  // Périmètre total du planificateur (toutes les équipes accessibles)
  const teamStaff = useMemo(() => {
    if (myTeamIds.length === 0) return staff.filter(s => s.active);
    const mySet = new Set(myTeamIds);
    return staff.filter(s => s.active && staffInTeams(s, mySet));
  }, [staff, myTeamIds, staffInTeams]);

  // Périmètre réduit aux équipes actuellement cochées (chips équipes)
  const scopedStaff = useMemo(() => {
    if (selectedTeamIds === null) return teamStaff;
    if (selectedTeamIds.size === 0) return [];
    return teamStaff.filter(s => staffInTeams(s, selectedTeamIds));
  }, [teamStaff, selectedTeamIds, staffInTeams]);

  // Réinitialiser les chips personnes quand le scope équipes change
  useEffect(() => { setHiddenStaffIds(new Set()); }, [selectedTeamIds]);

  // Membres finaux affichés (scope équipes − chips personnes masqués)
  const filteredTeamStaff = useMemo(() =>
    scopedStaff.filter(s => !hiddenStaffIds.has(s.id))
  , [scopedStaff, hiddenStaffIds]);

  const filteredStaffSet = useMemo(() => new Set(filteredTeamStaff.map(s => s.id)), [filteredTeamStaff]);

  // Spans filtrés (schedule_slots + course_slot_assignments pour les membres visibles)
  const spans = useMemo(() => {
    const weekData = schedules[currentWeek] || {};
    const s = Array.from({ length: 7 }, () => []);

    // Fonctions "du scope" : union des fn_slugs configurées sur les équipes sélectionnées.
    // Si une équipe n'a pas de fn_slugs défini → pas de restriction pour ses membres
    //   (sauf si d'autres équipes sélectionnées ont des fn_slugs → intersection retirée).
    // On n'applique le filtre que pour les membres présents dans PLUSIEURS équipes,
    // dont certaines sont hors du scope actuel.
    let scopeFnSet = null; // null = pas de restriction
    if (selectedTeamIds !== null && selectedTeamIds.size > 0) {
      const slugsPerTeam = [];
      for (const tid of selectedTeamIds) {
        const team = myTeams.find(t => t.id === tid);
        if (!team) continue;
        let parsed = null;
        try { parsed = team.fn_slugs ? JSON.parse(team.fn_slugs) : null; } catch { parsed = null; }
        if (Array.isArray(parsed) && parsed.length > 0) slugsPerTeam.push(new Set(parsed));
      }
      if (slugsPerTeam.length > 0) {
        // union de toutes les fn_slugs des équipes sélectionnées qui en ont
        scopeFnSet = new Set();
        for (const fnSet of slugsPerTeam) for (const slug of fnSet) scopeFnSet.add(slug);
      }
    }

    // 1. Créneaux classiques depuis schedule_slots
    for (const fn of functions) {
      const fnData = weekData[fn.slug] || {};
      for (let d = 0; d < 7; d++) {
        for (const sp of (fnData[d] || [])) {
          if (!filteredStaffSet.has(sp.staffId)) continue;
          // Pour un membre multi-équipes avec des équipes hors scope : filtrer par fonctions du scope
          if (scopeFnSet) {
            const member = scopedStaff.find(m => m.id === sp.staffId);
            const isMultiOutside = member?.team_ids?.some(tid => !selectedTeamIds.has(Number(tid)));
            if (isMultiOutside && !scopeFnSet.has(fn.slug)) continue;
          }
          s[d].push({ ...sp, fnSlug: fn.slug });
        }
      }
    }
    // 2. Cours depuis course_slot_assignments (non dupliqués avec schedule_slots)
    const alreadyKeyed = new Set(
      s.flat().filter(sp => sp.courseSlotId).map(sp => `${sp.staffId}:${sp.courseSlotId}`)
    );
    for (const a of courseAssignments) {
      if (!filteredStaffSet.has(a.staff_id)) continue;
      const cs = courseSlots.find(c => c.id === a.course_slot_id);
      if (!cs) continue;
      if (scopeFnSet) {
        const member = scopedStaff.find(m => m.id === a.staff_id);
        const isMultiOutside = member?.team_ids?.some(tid => !selectedTeamIds.has(Number(tid)));
        if (isMultiOutside && !scopeFnSet.has(cs.fn_slug)) continue;
      }
      const key = `${a.staff_id}:${cs.id}`;
      if (alreadyKeyed.has(key)) continue;
      s[cs.day_of_week].push({
        staffId:      a.staff_id,
        start:        cs.hour_start,
        end:          cs.hour_end,
        courseSlotId: cs.id,
        fnSlug:       cs.fn_slug || null,
        taskType:     null,
      });
    }
    return s;
  }, [schedules, currentWeek, functions, filteredStaffSet, scopedStaff, selectedTeamIds, myTeams, courseAssignments, courseSlots]);

  const teamNames = useMemo(() => {
    if (myTeamIds.length === 0) return 'Toutes équipes';
    return teams.filter(t => myTeamIds.includes(t.id)).map(t => `${t.icon} ${t.name}`).join(' · ');
  }, [teams, myTeamIds]);

  // Grille selon mode
  const displayDates = dayMode ? [dates[currentDay]] : dates;
  const displaySpans = dayMode ? [spans[currentDay] || []] : spans;
  const dayLabel     = dates[currentDay]
    ? dates[currentDay].toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const btnSt = { background: 'none', border: '1px solid #E4E0D8', borderRadius: 6, cursor: 'pointer', padding: '5px 12px', fontSize: 13, color: '#5B5855', fontFamily: 'inherit' };
  const toggleBtnSt = (active) => ({
    padding: '4px 11px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 600 : 400,
    background: active ? '#fff' : 'transparent',
    color: active ? '#1E2235' : '#9B9890',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* En-tête */}
      <div style={{ padding: '12px 18px 8px', borderBottom: '1px solid #ECEAE4', background: '#fff', flexShrink: 0 }}>

        {/* Ligne 1 : titre + toggle semaine/jour + badge + nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E2235', marginRight: 4 }}>Planning Équipe</div>
          {/* Toggle semaine / jour */}
          <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2, flexShrink: 0 }}>
            <button style={toggleBtnSt(!dayMode)} onClick={() => toggleDayMode(false)}>📅 Semaine</button>
            <button style={toggleBtnSt(dayMode)}  onClick={() => toggleDayMode(true)}>📌 Jour</button>
          </div>
          <span style={{ fontSize: 11, background: '#EBF5F0', color: '#4A8C6E', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
            {filteredTeamStaff.length}/{scopedStaff.length} membres
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
            {dayMode ? (
              <>
                <button onClick={prevDay} style={btnSt}>‹</button>
                <span style={{ fontWeight: 600, fontSize: 12, color: '#1E2235', padding: '5px 8px', whiteSpace: 'nowrap' }}>{dayLabel}</span>
                <button onClick={nextDay} style={btnSt}>›</button>
              </>
            ) : (
              <>
                <button onClick={() => setWk(w => w - 1)} style={btnSt}>‹</button>
                <span style={{ fontWeight: 600, fontSize: 12, color: '#1E2235', padding: '5px 8px', whiteSpace: 'nowrap' }}>{weekLabel}</span>
                {wk !== 0 && <button onClick={() => setWk(0)} style={{ ...btnSt, fontSize: 11 }}>Auj.</button>}
                <button onClick={() => setWk(w => w + 1)} style={btnSt}>›</button>
              </>
            )}
          </div>
        </div>

        {/* Ligne 2 : chips équipes (wrappables) */}
        {myTeams.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Bouton toggle tout/rien équipes */}
            <button onClick={() => setSelectedTeamIds(selectedTeamIds === null ? new Set() : null)} style={{
              fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderRadius: 20, padding: '3px 10px',
              background: selectedTeamIds === null ? '#C5753A' : '#E8E5DF',
              color: selectedTeamIds === null ? '#fff' : '#8B8880',
              transition: 'all .15s', fontFamily: 'inherit',
            }}>{selectedTeamIds === null ? 'Tout masquer' : 'Tout afficher'}</button>
            {myTeams.map(t => {
              const active = selectedTeamIds === null || selectedTeamIds.has(t.id);
              return (
                <button key={t.id} onClick={() => toggleTeam(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                  borderRadius: 20, padding: '3px 10px',
                  background: active ? '#C5753A' : '#E8E5DF',
                  color: active ? '#fff' : '#8B8880',
                  opacity: active ? 1 : 0.65, transition: 'all .15s',
                  fontFamily: 'inherit',
                }}>{t.icon} {t.name}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Légende membres (cliquables) — scoped aux équipes actives */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#FAFAF8', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {scopedStaff.length > 0 && (
          /* Bouton toggle tout/rien membres (dans le scope équipes actif) */
          <button
            onClick={() => setHiddenStaffIds(
              hiddenStaffIds.size < scopedStaff.length
                ? new Set(scopedStaff.map(s => s.id))
                : new Set()
            )}
            title={hiddenStaffIds.size < scopedStaff.length ? 'Masquer tous les membres' : 'Afficher tous les membres'}
            style={{
              display: 'flex', alignItems: 'center',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: hiddenStaffIds.size < scopedStaff.length ? '#1E223522' : '#F0EDE8',
              border: `1px solid ${hiddenStaffIds.size < scopedStaff.length ? '#1E2235' : '#DEDAD4'}`,
              borderRadius: 14, padding: '2px 8px',
              color: hiddenStaffIds.size < scopedStaff.length ? '#1E2235' : '#B0ACA8',
              textDecoration: hiddenStaffIds.size >= scopedStaff.length ? 'line-through' : 'none',
              transition: 'all .15s', fontFamily: 'inherit',
            }}>{hiddenStaffIds.size < scopedStaff.length ? 'Tout masquer' : 'Tout afficher'}</button>
        )}
        {scopedStaff.map(s => {
          const hidden = hiddenStaffIds.has(s.id);
          return (
            <button key={s.id} onClick={() => toggleStaff(s.id)} title={hidden ? 'Afficher' : 'Masquer'} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: hidden ? '#F0EDE8' : `${s.color}15`,
              border: `1px solid ${hidden ? '#DEDAD4' : s.color + '30'}`,
              borderRadius: 14, padding: '2px 8px',
              color: hidden ? '#B0ACA8' : s.color,
              opacity: hidden ? 0.55 : 1,
              textDecoration: hidden ? 'line-through' : 'none',
              transition: 'all .15s', fontFamily: 'inherit',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hidden ? '#C8C4BE' : s.color, display: 'inline-block', flexShrink: 0 }} />
              {s.firstname || s.name}
            </button>
          );
        })}
        {scopedStaff.length === 0 && <span style={{ fontSize: 12, color: '#9B9890' }}>Aucun membre sélectionné</span>}
      </div>

      {/* Grille */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <ROGrid spans={displaySpans} staff={filteredTeamStaff} functions={functions} dates={displayDates} ttMap={ttMap} courseSlots={courseSlots} courseSlotsFns={courseSlotsFns} />
      </div>
    </div>
  );
};

export default TeamPlanningView;
