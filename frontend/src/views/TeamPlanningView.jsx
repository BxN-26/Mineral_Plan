import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';

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

/* ─── Grille lecture seule (agenda) ────────────────────────── */
const ROGrid = ({ spans, staff, functions, dates }) => {
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
              {/* Blocs spans */}
              {daySpans.map((sp, si) => {
                const s = staff.find(x => x.id === sp.staffId);
                if (!s) return null;
                const fn = functions.find(f => f.slug === sp.fnSlug);
                const top = timeToY(sp.start);
                const h   = Math.max(SLOT_H, timeToY(sp.end) - timeToY(sp.start));
                return (
                  <div key={si} style={{
                    position: 'absolute', top, left: 2, right: 2, height: h,
                    background: `${s.color}20`,
                    border: `1.5px solid ${s.color}50`,
                    borderRadius: 6, overflow: 'hidden', padding: '2px 5px',
                    fontSize: 9, color: s.color, fontWeight: 600,
                    boxSizing: 'border-box',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden' }}>
                      {fn && <span style={{ fontSize: 8 }}>{fn.icon}</span>}
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: s.color, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 6, fontWeight: 800, flexShrink: 0,
                      }}>{(s.firstname || s.name || '?')[0]}</div>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.firstname || s.name}
                      </span>
                    </div>
                    {h >= 28 && (
                      <div style={{ fontSize: 8, opacity: .8 }}>
                        {fmtTime(sp.start)}–{fmtTime(sp.end)}
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
  const { staff, teams, functions, schedules, loadWeekSchedules } = useApp();
  const [wk, setWk]                                          = useState(0);
  const [selectedTeamIds, setSelectedTeamIds]                = useState(null); // null = toutes
  const [hiddenStaffIds,  setHiddenStaffIds]                 = useState(new Set());
  const [dayMode, setDayMode]  = useState(() => localStorage.getItem('spirit-teamplanning-mode') === 'day');
  const [currentDay, setCurrentDay] = useState(todayDayIdx);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);

  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);

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

  // Membres de ces équipes
  const teamStaff = useMemo(() => {
    if (myTeamIds.length === 0) return staff.filter(s => s.active);
    return staff.filter(s => s.active && s.team_ids?.some(tid => myTeamIds.includes(tid)));
  }, [staff, myTeamIds]);

  const effectiveTeamIds = useMemo(() => {
    if (selectedTeamIds !== null) return selectedTeamIds;
    return new Set(myTeams.map(t => t.id));
  }, [selectedTeamIds, myTeams]);

  const filteredTeamStaff = useMemo(() => {
    return teamStaff.filter(s => {
      const inTeam = effectiveTeamIds.size === 0 ||
        s.team_ids?.some(tid => effectiveTeamIds.has(tid));
      return inTeam && !hiddenStaffIds.has(s.id);
    });
  }, [teamStaff, effectiveTeamIds, hiddenStaffIds]);

  const filteredStaffSet = useMemo(() => new Set(filteredTeamStaff.map(s => s.id)), [filteredTeamStaff]);

  // Spans filtrés (toutes fonctions, uniquement membres filtrés)
  const spans = useMemo(() => {
    const weekData = schedules[currentWeek] || {};
    const s = Array.from({ length: 7 }, () => []);
    for (const fn of functions) {
      const fnData = weekData[fn.slug] || {};
      for (let d = 0; d < 7; d++) {
        for (const sp of (fnData[d] || [])) {
          if (filteredStaffSet.has(sp.staffId)) {
            s[d].push({ ...sp, fnSlug: fn.slug });
          }
        }
      }
    }
    return s;
  }, [schedules, currentWeek, functions, filteredStaffSet]);

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
            {filteredTeamStaff.length}/{teamStaff.length} membres
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

      {/* Légende membres (cliquables) */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#FAFAF8', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {teamStaff.map(s => {
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
        {teamStaff.length === 0 && <span style={{ fontSize: 12, color: '#9B9890' }}>Aucun membre dans votre équipe</span>}
      </div>

      {/* Grille */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <ROGrid spans={displaySpans} staff={filteredTeamStaff} functions={functions} dates={displayDates} />
      </div>
    </div>
  );
};

export default TeamPlanningView;
