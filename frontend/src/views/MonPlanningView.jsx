import { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import AvatarImg from '../components/AvatarImg';
import api from '../api/client';

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

/* ─── Modale détail créneau ────────────────────────────────── */
const SpanDetailModal = ({ sp, date, myStaff, ttMap, onClose }) => {
  const tt  = sp.taskType ? ttMap[sp.taskType] : null;
  const dur = sp.end - sp.start;
  const h   = Math.floor(dur);
  const m   = Math.round((dur - h) * 60);
  const durLabel = h > 0 ? (m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`) : `${m} min`;
  const dateLabel = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,.18)', width: '100%', maxWidth: 340, overflow: 'hidden' }}>
        {/* Bandeau couleur fonction */}
        <div style={{ background: sp.fn ? `${sp.fn.color}18` : '#F5F3EF', borderBottom: `3px solid ${sp.fn?.color || '#E4E0D8'}`, padding: '16px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {sp.fn && (
              <div style={{ width: 36, height: 36, borderRadius: 10, background: sp.fn.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {sp.fn.icon}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: sp.fn?.color || '#1E2235' }}>{sp.fn?.name || 'Créneau'}</div>
              <div style={{ fontSize: 11, color: '#9B9890', marginTop: 1 }}>{dateLabel}</div>
            </div>
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, color: '#9B9890', cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
          </div>
        </div>
        {/* Détails */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Horaire */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🕐</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2235' }}>{fmtTime(sp.start)} – {fmtTime(sp.end)}</div>
              <div style={{ fontSize: 11, color: '#9B9890' }}>{durLabel}</div>
            </div>
          </div>
          {/* Salarié */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: myStaff.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
              {myStaff.initials?.[0] || myStaff.firstname?.[0] || '?'}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2235' }}>{myStaff.firstname} {myStaff.lastname}</div>
              <div style={{ fontSize: 11, color: '#9B9890' }}>{myStaff.primary_function || ''}</div>
            </div>
          </div>
          {/* Type de tâche ou cours */}
          {sp.isCourse ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${sp.courseSlot.color}15`, border: `1.5px solid ${sp.courseSlot.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🎓</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: sp.courseSlot.color }}>{sp.courseSlot.group_name}</div>
                <div style={{ fontSize: 11, color: '#9B9890' }}>{[sp.courseSlot.level, sp.courseSlot.public_desc].filter(Boolean).join(' · ') || 'Cours assigné'}</div>
              </div>
            </div>
          ) : tt ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${tt.color}15`, border: `1.5px solid ${tt.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{tt.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: tt.color }}>{tt.label}</div>
                <div style={{ fontSize: 11, color: '#9B9890' }}>Type de tâche</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, color: '#C0BCB5' }}>⚙</div>
              <div style={{ fontSize: 12, color: '#B0ACA5' }}>Aucun type de tâche</div>
            </div>
          )}
        </div>
        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', background: '#F5F3EF', border: '1px solid #E4E0D8', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#5B5855' }}>Fermer</button>
        </div>
      </div>
    </div>
  );
};

const MonPlanningView = () => {
  const { user }                                           = useAuth();
  const { staff, functions, taskTypes, schedules, loadWeekSchedules } = useApp();
  const [wk, setWk]                                        = useState(0);
  const [dayMode, setDayMode]   = useState(() => localStorage.getItem('spirit-mon-planning-mode') === 'day');
  const [currentDay, setCurrentDay] = useState(todayDayIdx);
  const [selectedSpan, setSelectedSpan] = useState(null); // { sp, date }
  const [courseSlots,       setCourseSlots]       = useState([]);
  const [courseAssignments, setCourseAssignments] = useState([]);
  const [myUnavailabilities, setMyUnavailabilities] = useState([]);
  const [myLeaves,           setMyLeaves]           = useState([]);
  const [myDeclarations,     setMyDeclarations]     = useState([]);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);
  const ttMap = useMemo(() => Object.fromEntries((taskTypes||[]).map(t => [t.slug, t])), [taskTypes]);

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;

  const loadCourseData = useCallback(async (week) => {
    try {
      const [cs, ca] = await Promise.all([
        api.get('/course-slots'),
        api.get(`/course-slots/assignments?week=${week}`)
      ]);
      setCourseSlots(Array.isArray(cs.data) ? cs.data : []);
      setCourseAssignments(Array.isArray(ca.data) ? ca.data : []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);
  useEffect(() => { loadCourseData(currentWeek); }, [currentWeek]);
  useEffect(() => {
    if (!user?.staff_id) return;
    const mon = new Date(currentWeek + 'T12:00:00');
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const to = sun.toISOString().slice(0, 10);
    api.get(`/unavailabilities?staff_id=${user.staff_id}&from=${currentWeek}&to=${to}`)
      .then(d => setMyUnavailabilities(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
    api.get(`/leaves?status=approved&from=${currentWeek}&to=${to}`)
      .then(d => setMyLeaves(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
    api.get('/hour-declarations')
      .then(d => setMyDeclarations(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, [currentWeek, user?.staff_id]);

  const myStaff = useMemo(() => {
    if (!user?.staff_id) return null;
    return staff.find(s => s.id === user.staff_id) || null;
  }, [user, staff]);

  // Construire les créneaux personnels sous forme de spans par jour
  // { day: [{ fn, start, end, isCourse?, courseSlot?, isDeclaration?, declStatus? }] }
  const mySpans = useMemo(() => {
    const out = Array.from({ length: 7 }, () => []);
    if (!myStaff) return out;
    const weekData = schedules[currentWeek] || {};
    for (const fn of functions) {
      for (let d = 0; d < 7; d++) {
        const daySpans = weekData[fn.slug]?.[d] ?? weekData[fn.slug]?.[String(d)] ?? [];
        for (const sp of daySpans) {
          if (sp.staffId === myStaff.id && !sp.isDeclaration) out[d].push({ fn, start: sp.start, end: sp.end, taskType: sp.taskType });
        }
      }
    }
    // Ajouter les cours assignés
    for (const a of courseAssignments) {
      if (a.staff_id !== myStaff.id) continue;
      const cs = courseSlots.find(c => c.id === a.course_slot_id);
      if (!cs) continue;
      const fn = functions.find(f => f.id === cs.function_id) || null;
      out[cs.day_of_week].push({ fn, start: cs.hour_start, end: cs.hour_end, taskType: null, isCourse: true, courseSlot: cs });
    }
    // Ajouter les déclarations d'heures reliquat de la semaine courante
    const weekMon = new Date(currentWeek + 'T12:00:00');
    for (const decl of myDeclarations) {
      if (!['pending', 'approved'].includes(decl.status)) continue;
      const declDate = new Date(decl.date + 'T12:00:00');
      const dayIdx = Math.round((declDate - weekMon) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) continue;
      out[dayIdx].push({ fn: null, start: decl.hour_start, end: decl.hour_end, taskType: null, isDeclaration: true, declId: decl.id, declStatus: decl.status });
    }
    return out;
  }, [myStaff, functions, schedules, currentWeek, courseSlots, courseAssignments, myDeclarations]);

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
                {/* Zones d'indisponibilité hachurées */}
                {(() => {
                  const dateStr = dates[di].toISOString().slice(0, 10);
                  return myUnavailabilities
                    .filter(u => u.date_start <= dateStr && u.date_end >= dateStr && u.status !== 'refused')
                    .map((u, i) => {
                      const top    = u.all_day ? 0 : Math.max(0, timeToY(u.hour_start));
                      const bottom = u.all_day ? TOTAL_H : Math.max(top + SLOT_H, timeToY(u.hour_end));
                      const h      = bottom - top;
                      const isP    = u.status === 'pending';
                      return (
                        <div key={`indispo-${i}`}
                          title={u.note || (isP ? 'Indisponibilité en attente de validation' : 'Indisponible')}
                          style={{
                            position: 'absolute', left: 0, right: 0, top, height: h,
                            background: isP ? 'rgba(251,191,36,0.06)' : 'rgba(229,231,235,0.35)',
                            backgroundImage: isP
                              ? 'repeating-linear-gradient(45deg,rgba(251,191,36,0.25),rgba(251,191,36,0.25) 3px,transparent 3px,transparent 10px)'
                              : 'repeating-linear-gradient(45deg,#D1D5DB,#D1D5DB 3px,transparent 3px,transparent 10px)',
                            zIndex: 1, pointerEvents: 'none',
                          }} />
                      );
                    });
                })()}
                {/* Zones de congés approuvés hachurées (vert) */}
                {(() => {
                  const dateStr = dates[di].toISOString().slice(0, 10);
                  return myLeaves
                    .filter(l => l.start_date <= dateStr && l.end_date >= dateStr)
                    .map((l, i) => (
                      <div key={`leave-${i}`}
                        title={`Congé approuvé${l.type_label ? ' : ' + l.type_label : ''}`}
                        style={{
                          position: 'absolute', left: 0, right: 0, top: 0, height: TOTAL_H,
                          background: 'rgba(16,185,129,0.06)',
                          backgroundImage: 'repeating-linear-gradient(135deg,rgba(16,185,129,0.35),rgba(16,185,129,0.35) 3px,transparent 3px,transparent 10px)',
                          zIndex: 1, pointerEvents: 'none',
                        }} />
                    ));
                })()}
                {daySpans.map((sp, i) => {
                  const top = timeToY(sp.start);
                  const h   = Math.max(SLOT_H, timeToY(sp.end) - top);
                  const tt  = sp.taskType ? ttMap[sp.taskType] : null;
                  const cs  = sp.courseSlot;

                  // ── Déclaration reliquat ─────────────────────────────
                  if (sp.isDeclaration) {
                    const isPending  = sp.declStatus === 'pending';
                    const isApproved = sp.declStatus === 'approved';
                    const declBg     = isPending ? '#FEF9C3' : isApproved ? '#DCFCE7' : '#F3F4F6';
                    const declBorder = isPending ? '#A16207' : isApproved ? '#15803D' : '#9CA3AF';
                    return (
                      <div key={i} style={{
                        position: 'absolute', top, left: 2, right: 2, height: h,
                        background: declBg,
                        border: `1.5px dashed ${declBorder}`,
                        borderLeft: `3.5px solid ${declBorder}`,
                        borderRadius: 5, overflow: 'hidden', boxSizing: 'border-box',
                        zIndex: 2, padding: '2px 5px', cursor: 'default',
                      }}>
                        {/* Tampon REL diagonal */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                          <span style={{ fontSize: Math.max(10, Math.min(18, h * 0.28)), fontWeight: 900, letterSpacing: '0.18em', color: declBorder, opacity: 0.3, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: 'Impact, "Arial Black", sans-serif' }}>REL</span>
                        </div>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 9 }}>⏰</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: declBorder, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Reliquat</span>
                        </div>
                        {(sp.end - sp.start) >= 0.5 && (
                          <div style={{ position: 'relative', fontSize: 9, color: '#9B9890', paddingLeft: 2 }}>{fmtTime(sp.start)}–{fmtTime(sp.end)}</div>
                        )}
                      </div>
                    );
                  }

                  const blockColor = cs ? cs.color : (sp.fn?.color || myStaff.color);
                  const blockBg    = cs ? (cs.bg_color || '#EBF0FE') : `${myStaff.color}18`;
                  return (
                    <div key={i} onClick={() => setSelectedSpan({ sp, date: dates[di] })} style={{ position: 'absolute', top, left: 2, right: 2, height: h, background: cs ? (cs.bg_color || '#EBF0FE') : blockBg, border: `1.5px solid ${blockColor}60`, borderLeft: `3.5px solid ${blockColor}`, borderRadius: 5, overflow: 'hidden', boxSizing: 'border-box', zIndex: 2, padding: '2px 5px', cursor: 'pointer' }}>
                      {/* Fond hachuré points si cours */}
                      {cs && <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${blockColor}55 1.2px, transparent 1.2px)`, backgroundSize: '7px 7px', opacity: 0.9, pointerEvents: 'none' }} />}
                      {/* Tampon COURS centré */}
                      {cs && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                        <span style={{ fontSize: Math.max(10, Math.min(18, h * 0.28)), fontWeight: 900, letterSpacing: '0.18em', color: blockColor, opacity: 0.32, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: 'Impact, "Arial Black", sans-serif' }}>COURS</span>
                      </div>}
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3 }}>
                        {cs ? <span style={{ fontSize: 9 }}>🎓</span> : sp.fn && <span style={{ fontSize: 9 }}>{sp.fn.icon}</span>}
                        <span style={{ fontSize: 10, fontWeight: 700, color: blockColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cs ? cs.group_name : (sp.fn?.short_name || sp.fn?.name)}</span>
                      </div>
                      {(sp.end - sp.start) >= 0.5 && (
                        <div style={{ position: 'relative', fontSize: 9, color: '#9B9890', paddingLeft: 2 }}>{fmtTime(sp.start)}–{fmtTime(sp.end)}</div>
                      )}
                      {cs && h >= 44 && cs.level && (
                        <div style={{ position: 'relative', fontSize: 8, color: cs.color, opacity: .8, paddingLeft: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cs.level}</div>
                      )}
                      {!cs && tt && h >= 44 && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: `${tt.color}18`, border: `1px solid ${tt.color}40`, borderRadius: 3, padding: '0px 3px', fontSize: 8, color: tt.color, fontWeight: 600, marginTop: 1 }}>
                          {tt.icon} {tt.label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {/* Modale détail créneau */}
      {selectedSpan && (
        <SpanDetailModal
          sp={selectedSpan.sp}
          date={selectedSpan.date}
          myStaff={myStaff}
          ttMap={ttMap}
          onClose={() => setSelectedSpan(null)}
        />
      )}
    </div>
  );
};

const navBtn = {
  padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#5B5855',
};

export default MonPlanningView;
