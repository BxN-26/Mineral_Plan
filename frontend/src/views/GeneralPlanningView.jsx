import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import api from '../api/client';

const DAYS      = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAY_START = 7;
const DAY_END   = 24;
const HOUR_H    = 56;
const SLOT_H    = 14;
const TOTAL_H   = (DAY_END - DAY_START) * HOUR_H;
const HOURS     = Array.from({ length: DAY_END - DAY_START }, (_, i) => i + DAY_START);

const timeToY     = (t) => (t - DAY_START) * HOUR_H;
const fmtTime     = (t) => `${Math.floor(t)}h${String(Math.round((t % 1) * 60)).padStart(2, '0').replace(/^0$/, '')}`;
const todayDayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}
/* ─── Algorithme de placement en colonnes (anti-chevauchement) ── */
function computeColumns(items) {
  if (!items.length) return { result: [], colCount: 1 };
  const withIdx = items.map((item, idx) => ({ ...item, _idx: idx }));
  const sorted  = [...withIdx].sort((a, b) => a.start - b.start);
  const cols    = [];
  for (const item of sorted) {
    let col = cols.findIndex(end => end <= item.start);
    if (col === -1) { cols.push(item.end); col = cols.length - 1; }
    else cols[col] = item.end;
    item.col = col;
  }
  const colCount = Math.max(1, cols.length);
  const result   = new Array(items.length);
  for (const item of sorted) result[item._idx] = item;
  return { result, colCount };
}
/* ─── Grille lecture seule (agenda) ────────────────────────── */
const ROGrid = ({ spans, staff, functions, dates, ttMap = {} }) => {
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
        const { result: placedSpans, colCount } = computeColumns(daySpans);
        return (
          <div key={d} style={{ flex: 1, minWidth: 100, position: 'relative' }}>
            <div style={{
              textAlign: 'center', padding: '5px 2px', fontSize: 11, fontWeight: 700,
              color: isToday ? '#C5753A' : '#1E2235',
              background: isToday ? '#FFF4EC' : '#F5F3EF',
              borderBottom: `2px solid ${isToday ? '#C5753A' : '#ECEAE4'}`,
              whiteSpace: 'nowrap',
            }}>
              {DAYS[d].slice(0, 3)} {date.getDate()}/{date.getMonth() + 1}
            </div>
            <div style={{
              position: 'relative', height: TOTAL_H,
              background: isToday ? '#FFFCF8' : '#fff',
              borderRight: '2px solid #D0CBC2',
            }}>
              {HOURS.map(h => (
                <div key={h} style={{
                  position: 'absolute', top: timeToY(h), left: 0, right: 0,
                  borderTop: `1px solid ${h % 2 === 0 ? '#ECEAE4' : '#F5F3EF'}`,
                  pointerEvents: 'none',
                }} />
              ))}
              {placedSpans.map((sp, si) => {
                const s = staff.find(x => x.id === sp.staffId);
                if (!s) return null;
                const fn  = functions.find(f => f.slug === sp.fnSlug);
                const tt  = sp.taskType ? ttMap[sp.taskType] : null;
                const top = timeToY(sp.start);
                const h   = Math.max(SLOT_H, timeToY(sp.end) - timeToY(sp.start));
                const col = sp.col ?? 0;
                const spW = colCount > 1 ? `calc(${100 / colCount}% - 2px)` : 'calc(100% - 4px)';
                const spL = colCount > 1 ? `calc(${col * 100 / colCount}% + 1px)` : '2px';

                // ── Déclaration reliquat ───────────────────────────────────────
                if (sp.isDeclaration) {
                  const isPending  = sp.declStatus === 'pending';
                  const isApproved = sp.declStatus === 'approved';
                  const declBg     = isPending ? '#FEF9C3' : isApproved ? '#DCFCE7' : '#F3F4F6';
                  const declBorder = isPending ? '#A16207' : isApproved ? '#15803D' : '#9CA3AF';
                  return (
                    <div key={si} style={{
                      position: 'absolute', top, left: spL, width: spW, height: h,
                      background: declBg, border: `1.5px dashed ${declBorder}`,
                      borderLeft: `3.5px solid ${declBorder}`,
                      borderRadius: 5, overflow: 'hidden', padding: '2px 5px',
                      fontSize: 9, fontWeight: 600, boxSizing: 'border-box', zIndex: 2,
                    }}>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                        <span style={{ fontSize: Math.max(7, Math.min(11, h * 0.20)), fontWeight: 900, letterSpacing: '0.04em', color: declBorder, opacity: 0.28, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: '"Arial Black", Arial, sans-serif', whiteSpace: 'nowrap' }}>H.salarié</span>
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

                return (
                  <div key={si} style={{
                    position: 'absolute', top, left: spL, width: spW, height: h,
                    background: `${s.color}20`,
                    border: `1.5px solid ${s.color}50`,
                    borderRadius: 6, overflow: 'hidden', padding: '2px 5px',
                    fontSize: 9, color: s.color, fontWeight: 600,
                    boxSizing: 'border-box', paddingLeft: tt ? 8 : 5,
                  }}>
                    {tt && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tt.color, borderRadius: '3px 0 0 3px' }} />}
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
                    {tt && h >= 32 && (
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
const GeneralPlanningView = () => {
  const { staff, functions, taskTypes, schedules, loadWeekSchedules } = useApp();
  const [wk,           setWk]           = useState(0);
  const [selFns,       setSelFns]       = useState(null);
  const [dayMode,      setDayMode]      = useState(() => localStorage.getItem('spirit-general-planning-mode') === 'day');
  const [currentDay,   setCurrentDay]   = useState(todayDayIdx);
  const [declarations, setDeclarations] = useState([]);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);
  const ttMap = useMemo(() => Object.fromEntries((taskTypes||[]).map(t => [t.slug, t])), [taskTypes]);

  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);
  useEffect(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const to = sun.toISOString().slice(0, 10);
    api.get(`/hour-declarations?from=${currentWeek}&to=${to}`)
      .then(d => setDeclarations(Array.isArray(d.data) ? d.data : []))
      .catch(() => {});
  }, [currentWeek]);

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel = dates.length
    ? `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`
    : '';

  // Fonctions actives selon filtre
  const activeFns = useMemo(
    () => selFns === null ? functions : functions.filter(f => selFns.includes(f.slug)),
    [functions, selFns]
  );

  const toggleFn = (slug) => setSelFns(prev => {
    const base = prev === null ? functions.map(f => f.slug) : prev;
    return base.includes(slug) ? base.filter(s => s !== slug) : [...base, slug];
  });

  const toggleDayMode = (val) => {
    setDayMode(val);
    localStorage.setItem('spirit-general-planning-mode', val ? 'day' : 'week');
  };
  const prevDay = () => {
    if (currentDay > 0) { setCurrentDay(d => d - 1); }
    else { setCurrentDay(6); setWk(w => w - 1); }
  };
  const nextDay = () => {
    if (currentDay < 6) { setCurrentDay(d => d + 1); }
    else { setCurrentDay(0); setWk(w => w + 1); }
  };

  // Spans filtrés selon fonctions actives + déclarations reliquat
  const spans = useMemo(() => {
    const weekData = schedules[currentWeek] || {};
    const s = Array.from({ length: 7 }, () => []);
    for (const fn of activeFns) {
      const fnData = weekData[fn.slug] || {};
      for (let d = 0; d < 7; d++) {
        for (const sp of (fnData[d] || [])) {
          if (sp.isDeclaration) continue; // géré par la section déclarations
          s[d].push({ ...sp, fnSlug: fn.slug });
        }
      }
    }
    // Déclarations d'heures reliquat (pending + approved)
    const weekMon = new Date(currentWeek + 'T12:00:00');
    for (const decl of declarations) {
      if (!['pending', 'approved'].includes(decl.status)) continue;
      const declDate = new Date(decl.date + 'T12:00:00');
      const dayIdx = Math.round((declDate - weekMon) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) continue;
      s[dayIdx].push({
        staffId:       decl.staff_id,
        start:         decl.hour_start,
        end:           decl.hour_end,
        fnSlug:        null,
        taskType:      null,
        isDeclaration: true,
        declId:        decl.id,
        declStatus:    decl.status,
      });
    }
    return s;
  }, [schedules, currentWeek, activeFns, declarations]);

  // Grille selon mode
  const displayDates = dayMode ? [dates[currentDay]] : dates;
  const displaySpans = dayMode ? [spans[currentDay] || []] : spans;
  const dayLabel     = dates[currentDay]
    ? dates[currentDay].toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  // Total créneaux planifiés visible
  const totalSlots = useMemo(() => spans.reduce((acc, day) => acc + day.length, 0), [spans]);

  const btnSt = { background: 'none', border: '1px solid #E4E0D8', borderRadius: 6, cursor: 'pointer', padding: '5px 12px', fontSize: 13, color: '#5B5855', fontFamily: 'inherit' };
  const chipSt = (fn, sel) => ({
    padding: '3px 9px', borderRadius: 20, cursor: 'pointer',
    border: `1.5px solid ${sel ? fn.color : '#E4E0D8'}`,
    background: sel ? (fn.bg_color || fn.color + '22') : '#fff',
    color: sel ? fn.color : '#9B9890',
    fontSize: 11, fontFamily: 'inherit', fontWeight: sel ? 700 : 400,
  });
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
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E2235', marginRight: 4 }}>Planning Général</div>
          {/* Toggle semaine / jour */}
          <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2, flexShrink: 0 }}>
            <button style={toggleBtnSt(!dayMode)} onClick={() => toggleDayMode(false)}>📅 Semaine</button>
            <button style={toggleBtnSt(dayMode)}  onClick={() => toggleDayMode(true)}>📌 Jour</button>
          </div>
          <span style={{ fontSize: 11, background: '#F5F3EF', color: '#6B6860', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
            {totalSlots} créneaux
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
      </div>

      {/* Filtre fonctions */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#FAFAF8', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9B9890', marginRight: 4 }}>Afficher :</span>
        {/* Bouton toggle tout/rien */}
        <button
          onClick={() => setSelFns(selFns === null ? [] : null)}
          style={{ ...chipSt({ color: '#1E2235', bg_color: '#EEF2FF' }, selFns === null), border: `1.5px solid ${selFns === null ? '#1E2235' : '#E4E0D8'}`, color: selFns === null ? '#1E2235' : '#9B9890', background: selFns === null ? '#EEF2FF' : '#fff' }}
        >
          {selFns === null ? 'Tout masquer' : 'Tout afficher'}
        </button>
        {functions.map(fn => {
          const sel = selFns === null || selFns.includes(fn.slug);
          return (
            <button key={fn.slug} onClick={() => toggleFn(fn.slug)} style={chipSt(fn, sel)}>
              {fn.icon} {fn.name}
            </button>
          );
        })}
      </div>

      {/* Grille */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <ROGrid spans={displaySpans} staff={staff.filter(s => s.active)} functions={functions} dates={displayDates} ttMap={ttMap} />
      </div>
    </div>
  );
};

export default GeneralPlanningView;
