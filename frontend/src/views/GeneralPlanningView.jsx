import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';

const DAYS      = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAY_START = 7;
const DAY_END   = 22;
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

/* ─── Grille lecture seule (agenda) ────────────────────────── */
const ROGrid = ({ spans, staff, functions, dates }) => {
  const tod = todayDayIdx();
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
        const isToday = d === tod;
        const daySpans = spans[d] || [];
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
              borderRight: '1px solid #F0EDE8',
            }}>
              {HOURS.map(h => (
                <div key={h} style={{
                  position: 'absolute', top: timeToY(h), left: 0, right: 0,
                  borderTop: `1px solid ${h % 2 === 0 ? '#ECEAE4' : '#F5F3EF'}`,
                  pointerEvents: 'none',
                }} />
              ))}
              {daySpans.map((sp, si) => {
                const s = staff.find(x => x.id === sp.staffId);
                if (!s) return null;
                const fn  = functions.find(f => f.slug === sp.fnSlug);
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
const GeneralPlanningView = () => {
  const { staff, functions, schedules, loadWeekSchedules } = useApp();
  const [wk,      setWk]      = useState(0);
  const [selFns,  setSelFns]  = useState([]); // [] = toutes

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

  // Fonctions actives selon filtre
  const activeFns = useMemo(
    () => selFns.length === 0 ? functions : functions.filter(f => selFns.includes(f.slug)),
    [functions, selFns]
  );

  const toggleFn = (slug) => setSelFns(prev =>
    prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
  );

  // Spans filtrés selon fonctions actives
  const spans = useMemo(() => {
    const weekData = schedules[currentWeek] || {};
    const s = Array.from({ length: 7 }, () => []);
    for (const fn of activeFns) {
      const fnData = weekData[fn.slug] || {};
      for (let d = 0; d < 7; d++) {
        for (const sp of (fnData[d] || [])) {
          s[d].push({ ...sp, fnSlug: fn.slug });
        }
      }
    }
    return s;
  }, [schedules, currentWeek, activeFns]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* En-tête */}
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #ECEAE4', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#1E2235', flex: 1 }}>Planning Général</div>
          <span style={{ fontSize: 11, background: '#F5F3EF', color: '#6B6860', borderRadius: 20, padding: '3px 10px' }}>
            {totalSlots} créneaux
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setWk(w => w - 1)} style={btnSt}>‹</button>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#1E2235', flex: 1, textAlign: 'center' }}>{weekLabel}</span>
          {wk !== 0 && <button onClick={() => setWk(0)} style={{ ...btnSt, fontSize: 11 }}>Auj.</button>}
          <button onClick={() => setWk(w => w + 1)} style={btnSt}>›</button>
        </div>
      </div>

      {/* Filtre fonctions */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#FAFAF8', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9B9890', marginRight: 4 }}>Afficher :</span>
        <button
          onClick={() => setSelFns([])}
          style={{ ...chipSt({ color: '#1E2235', bg_color: '#EEF2FF' }, selFns.length === 0), border: `1.5px solid ${selFns.length === 0 ? '#1E2235' : '#E4E0D8'}`, color: selFns.length === 0 ? '#1E2235' : '#9B9890', background: selFns.length === 0 ? '#EEF2FF' : '#fff' }}
        >
          Toutes fonctions
        </button>
        {functions.map(fn => {
          const sel = selFns.includes(fn.slug);
          return (
            <button key={fn.slug} onClick={() => toggleFn(fn.slug)} style={chipSt(fn, sel)}>
              {fn.icon} {fn.name}
            </button>
          );
        })}
      </div>

      {/* Grille */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <ROGrid spans={spans} staff={staff.filter(s => s.active)} functions={functions} dates={dates} />
      </div>
    </div>
  );
};

export default GeneralPlanningView;
