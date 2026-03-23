import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import AvatarImg from '../components/AvatarImg';

const DAYS    = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SH = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const DAY_START = 7;
const DAY_END   = 24;
const HOUR_H    = 56;  // 14px × 4 quarts
const TOTAL_H   = (DAY_END - DAY_START) * HOUR_H;
const HOUR_LABELS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
const SLOT_H    = 14;
const todayDayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

const timeToY  = (t) => (t - DAY_START) * HOUR_H;
const fmtTime  = (t) => { const h = Math.floor(t); const m = Math.round((t - h) * 60); return `${h}h${m === 0 ? '' : String(m).padStart(2, '0')}`; };

function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

const MonPlanningView = () => {
  const { user }                                           = useAuth();
  const { staff, functions, schedules, loadWeekSchedules } = useApp();
  const [wk, setWk]                                        = useState(0);
  const [dayMode, setDayMode]   = useState(() => localStorage.getItem('spirit-mon-planning-mode') === 'day');
  const [currentDay, setCurrentDay] = useState(todayDayIdx);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;

  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);

  const myStaff = useMemo(() => {
    if (!user?.staff_id) return null;
    return staff.find(s => s.id === user.staff_id) || null;
  }, [user, staff]);

  // Construire les créneaux personnels sous forme de spans par jour
  // { day: [{ fn, start, end }] }
  const mySpans = useMemo(() => {
    const out = Array.from({ length: 7 }, () => []);
    if (!myStaff) return out;
    const weekData = schedules[currentWeek] || {};
    for (const fn of functions) {
      for (let d = 0; d < 7; d++) {
        const daySpans = weekData[fn.slug]?.[d] ?? weekData[fn.slug]?.[String(d)] ?? [];
        for (const sp of daySpans) {
          if (sp.staffId === myStaff.id) out[d].push({ fn, start: sp.start, end: sp.end });
        }
      }
    }
    return out;
  }, [myStaff, functions, schedules, currentWeek]);

  // Total d'heures planifiées cette semaine
  const totalH = useMemo(() => {
    let t = 0;
    for (const day of mySpans) for (const sp of day) t += sp.end - sp.start;
    return Math.round(t * 100) / 100;
  }, [mySpans]);

  if (!myStaff) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9B9890', fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
        <div>Votre compte n'est pas relié à une fiche salarié.</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Demandez à un administrateur de lier votre compte.</div>
      </div>
    );
  }

  const toggleDayMode = (val) => {
    setDayMode(val);
    localStorage.setItem('spirit-mon-planning-mode', val ? 'day' : 'week');
  };
  const prevDay = () => {
    if (currentDay > 0) { setCurrentDay(d => d - 1); }
    else { setCurrentDay(6); setWk(w => w - 1); }
  };
  const nextDay = () => {
    if (currentDay < 6) { setCurrentDay(d => d + 1); }
    else { setCurrentDay(0); setWk(w => w + 1); }
  };

  const toggleBtnSt = (active) => ({
    padding: '4px 11px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 600 : 400,
    background: active ? '#fff' : 'transparent',
    color: active ? '#1E2235' : '#9B9890',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 130 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E2235' }}>Mon planning</div>
          <div style={{ fontSize: 11, color: '#8B8880' }}>
            {dayMode
              ? (dates[currentDay]?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) || '')
              : weekLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: `${myStaff.color}15`, border: `1.5px solid ${myStaff.color}30`, borderRadius: 8 }}>
          <AvatarImg s={myStaff} size={26} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1E2235' }}>{myStaff.firstname} {myStaff.lastname}</div>
            <div style={{ fontSize: 10, color: '#9B9890' }}>{totalH}h planifiées cette&nbsp;semaine</div>
          </div>
        </div>
        {/* Toggle semaine / jour */}
        <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2, flexShrink: 0 }}>
          <button style={toggleBtnSt(!dayMode)} onClick={() => toggleDayMode(false)}>📅 Semaine</button>
          <button style={toggleBtnSt(dayMode)}  onClick={() => toggleDayMode(true)}>📌 Jour</button>
        </div>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {dayMode ? (
            <>
              <button onClick={prevDay} style={navBtn}>◀</button>
              <button onClick={nextDay} style={navBtn}>▶</button>
            </>
          ) : (
            <>
              <button onClick={() => setWk(w => w - 1)} style={navBtn}>◀</button>
              <button onClick={() => setWk(0)}           style={navBtn}>Auj.</button>
              <button onClick={() => setWk(w => w + 1)} style={navBtn}>▶</button>
            </>
          )}
        </div>
      </div>

      {/* Grille agenda */}
      <div style={{ flex: 1, overflow: 'auto', background: '#FAFAF8' }}>
        {/* Header jours */}
        {!dayMode && (
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7,1fr)', position: 'sticky', top: 0, zIndex: 10, background: '#F5F3EF', borderBottom: '2px solid #E4E0D8' }}>
            <div />
            {DAYS.map((day, di) => {
              const date = dates[di]; const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={day} style={{ padding: '8px 6px 6px', textAlign: 'center', background: isToday?'#FFF4EC':di>=5?'#F9F7F4':'transparent', borderLeft: '1px solid #E4E0D8' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: isToday?'#C5753A':'#9B9890', textTransform: 'uppercase' }}>{DAYS_SH[di]}</div>
                  <div style={{ fontSize: 15, fontWeight: isToday?800:600, color: isToday?'#C5753A':'#1E2235', lineHeight: 1.2, margin: '1px 0' }}>{date.getDate()}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Corps */}
        <div style={{ display: 'flex' }}>
          {/* Axe horaire */}
          <div style={{ width: 44, flexShrink: 0, position: 'relative', height: TOTAL_H, background: '#F5F3EF', borderRight: '1px solid #E4E0D8' }}>
            {HOUR_LABELS.slice(0, -1).map(h => (
              <div key={h} style={{ position: 'absolute', top: (h - DAY_START) * HOUR_H - 7, right: 6, fontSize: 9, color: '#B0ACA5', whiteSpace: 'nowrap' }}>{h}h</div>
            ))}
          </div>

          {/* Colonnes — mode semaine ou mode jour */}
          {(dayMode ? [currentDay] : DAYS.map((_, i) => i)).map((di) => {
            const date = dates[di]; const isToday = date.toDateString() === new Date().toDateString();
            const daySpans = mySpans[di] || [];
            return (
              <div key={di} style={{ flex: 1, position: 'relative', height: TOTAL_H, background: isToday?'#FFFCF9':di>=5?'#FDFBF8':'#fff', borderLeft: '1px solid #E8E5DF' }}>
                {HOUR_LABELS.slice(0, -1).map(h => (
                  <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - DAY_START) * HOUR_H, borderTop: '1px solid #F0EDE8', pointerEvents: 'none' }}>
                    {[1,2,3].map(q => <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q * SLOT_H, borderTop: '1px dashed #F5F2ED', pointerEvents: 'none' }} />)}
                  </div>
                ))}
                {daySpans.map((sp, i) => {
                  const top = timeToY(sp.start);
                  const h   = Math.max(SLOT_H, timeToY(sp.end) - top);
                  return (
                    <div key={i} style={{ position: 'absolute', top, left: 2, right: 2, height: h, background: `${myStaff.color}18`, border: `1.5px solid ${myStaff.color}50`, borderRadius: 5, overflow: 'hidden', boxSizing: 'border-box', zIndex: 2, padding: '2px 5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {sp.fn && <span style={{ fontSize: 9 }}>{sp.fn.icon}</span>}
                        <span style={{ fontSize: 10, fontWeight: 700, color: sp.fn?.color || myStaff.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.fn?.short_name || sp.fn?.name}</span>
                      </div>
                      {(sp.end - sp.start) >= 0.5 && (
                        <div style={{ fontSize: 9, color: '#9B9890', paddingLeft: 2 }}>{fmtTime(sp.start)}–{fmtTime(sp.end)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const navBtn = {
  padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#5B5855',
};

export default MonPlanningView;
