import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../App';
import { Btn } from '../components/common';
import api from '../api/client';

const DAYS    = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SH = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS   = Array.from({ length: 14 }, (_, i) => i + 8);

function useIsMobile() {
  const [v, set] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => set(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

const buildGrid = () => {
  const g = {};
  for (let d = 0; d < 7; d++) { g[d] = {}; for (let h = 8; h < 22; h++) g[d][h] = []; }
  return g;
};

/** Calcule le Monday (YYYY-MM-DD) d'un déphasage en semaines */
function weekStart(offset) {
  const now  = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

const Avatar = ({ s, size = 30 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .32, fontWeight: 700, flexShrink: 0 }}>
    {s.initials}
  </div>
);

/* ─── Grille d'une seule journée (mobile) ─────────────────────── */
const DayGrid = ({ dayIndex, grid, allGrid, mode, staff, fn, selStaff, selS, toggleCell, removeSlot }) => {
  const today = new Date().getDay();
  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {HOURS.map(h => {
            const items = mode === 'fn'
              ? (grid[dayIndex]?.[h] || []).map(id => ({ id, fid: fn?.slug, fn }))
              : (allGrid[dayIndex]?.[h] || []);
            const hasSel = selStaff && items.some(x => x.id === selStaff);
            return (
              <tr key={h}>
                <td style={{ width: 36, padding: '0 4px', textAlign: 'right', fontSize: 10, color: '#C0BCB5', verticalAlign: 'top', paddingTop: 6, borderTop: '1px solid #ECEAE4', background: '#F5F3EF' }}>{h}h</td>
                <td onClick={() => mode === 'fn' && toggleCell(dayIndex, h)}
                  style={{ verticalAlign: 'top', padding: '3px 5px', borderTop: '1px solid #ECEAE4', background: hasSel ? `${selS?.color}12` : '#fff', cursor: mode === 'fn' && selStaff ? 'crosshair' : 'default', minHeight: 28 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, minHeight: 24 }}>
                    {items.map((ci, ii) => {
                      const s = staff.find(x => x.id === ci.id);
                      if (!s) return null;
                      return (
                        <div key={`${ci.id}-${ci.fid}-${ii}`} style={{ display: 'flex', alignItems: 'center', gap: 3, background: `${s.color}18`, border: `1px solid ${s.color}35`, borderRadius: 5, padding: '2px 5px', userSelect: 'none' }}>
                          {mode === 'all' && ci.fn && <span style={{ fontSize: 10 }}>{ci.fn.icon}</span>}
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800 }}>{s.initials[0]}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
                          {mode === 'fn' && <button onClick={e => removeSlot(dayIndex, h, s.id, e)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: s.color, opacity: .5, fontSize: 10 }}>✕</button>}
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PlanningView = () => {
  const { staff, functions, schedules, setSchedules } = useApp();
  const isMobile = useIsMobile();
  const [wk,        setWk]        = useState(0);
  const [activeFn,  setActiveFn]  = useState(functions[0]?.slug || '');
  const [selStaff,  setSelStaff]  = useState(null);
  const [mode,      setMode]      = useState('fn');
  const [activeDay, setActiveDay] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  });
  // Drag & Drop state
  const [dragOver,  setDragOver]  = useState(null);  // {day, hour}
  const dragRef = useRef(null);  // {type:'staff'|'move', staffId, fromDay?, fromHour?}
  const saveTimer = useRef(null);

  // Mettre à jour activeFn si functions chargées après le montage
  useEffect(() => {
    if (!activeFn && functions.length) setActiveFn(functions[0].slug);
  }, [functions]);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);

  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [currentWeek]);

  const weekLabel = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;
  const fn  = functions.find(f => f.slug === activeFn);
  const grid = useMemo(() => schedules[currentWeek]?.[activeFn] || buildGrid(), [schedules, currentWeek, activeFn]);

  // Sauvegarde debounced — 600ms après la dernière modification
  const debounceSave = useCallback((fnSlug, newGrid) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.post(`/schedules/week/${currentWeek}/function/${fnSlug}`, { grid: newGrid });
      } catch (e) {
        console.error('[PlanningView] Erreur de sauvegarde', e);
      }
    }, 600);
  }, [currentWeek]);

  const toggleCell = useCallback((d, h) => {
    if (!selStaff) return;
    setSchedules(prev => {
      const week  = currentWeek;
      const prevW = prev[week] || {};
      const prevG = JSON.parse(JSON.stringify(prevW[activeFn] || buildGrid()));
      const cell  = prevG[d][h];
      prevG[d][h] = cell.includes(selStaff) ? cell.filter(x => x !== selStaff) : [...cell, selStaff];
      const next  = { ...prev, [week]: { ...prevW, [activeFn]: prevG } };
      debounceSave(activeFn, prevG);
      return next;
    });
  }, [selStaff, activeFn, currentWeek, debounceSave]);

  const removeSlot = useCallback((d, h, sid, e) => {
    e?.stopPropagation();
    setSchedules(prev => {
      const week  = currentWeek;
      const prevW = prev[week] || {};
      const prevG = JSON.parse(JSON.stringify(prevW[activeFn] || buildGrid()));
      prevG[d][h] = (prevG[d][h] || []).filter(x => x !== sid);
      const next  = { ...prev, [week]: { ...prevW, [activeFn]: prevG } };
      debounceSave(activeFn, prevG);
      return next;
    });
  }, [activeFn, currentWeek, debounceSave]);

  // ── Drag & Drop handlers ───────────────────────────────────
  const onDragStart = useCallback((e, payload) => {
    dragRef.current = payload;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', payload.type);
  }, []);

  const onDragOver = useCallback((e, day, hour) => {
    if (mode !== 'fn') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ day, hour });
  }, [mode]);

  const onDragLeave = useCallback(() => setDragOver(null), []);

  const onDrop = useCallback((e, day, hour) => {
    e.preventDefault();
    setDragOver(null);
    if (mode !== 'fn') return;
    const payload = dragRef.current;
    if (!payload) return;

    if (payload.type === 'staff') {
      // Assigner depuis panneau → ajouter dans cellule si pas déjà présent
      const sid = payload.staffId;
      setSchedules(prev => {
        const prevW = prev[currentWeek] || {};
        const prevG = JSON.parse(JSON.stringify(prevW[activeFn] || buildGrid()));
        if (!prevG[day][hour].includes(sid)) prevG[day][hour] = [...prevG[day][hour], sid];
        debounceSave(activeFn, prevG);
        return { ...prev, [currentWeek]: { ...prevW, [activeFn]: prevG } };
      });
    } else if (payload.type === 'move') {
      // Déplacer chip existant
      const { staffId, fromDay, fromHour } = payload;
      if (fromDay === day && fromHour === hour) return;  // Même cellule
      setSchedules(prev => {
        const prevW = prev[currentWeek] || {};
        const prevG = JSON.parse(JSON.stringify(prevW[activeFn] || buildGrid()));
        prevG[fromDay][fromHour] = (prevG[fromDay][fromHour] || []).filter(x => x !== staffId);
        if (!prevG[day][hour].includes(staffId)) prevG[day][hour] = [...prevG[day][hour], staffId];
        debounceSave(activeFn, prevG);
        return { ...prev, [currentWeek]: { ...prevW, [activeFn]: prevG } };
      });
    }
    dragRef.current = null;
  }, [mode, activeFn, currentWeek, debounceSave]);

  // Vue globale : toutes fonctions superposées
  const allGrid = useMemo(() => {
    const g = buildGrid();
    const weekData = schedules[currentWeek] || {};
    for (const f of functions) {
      const fg = weekData[f.slug] || buildGrid();
      for (let d = 0; d < 7; d++)
        for (const h of HOURS)
          for (const id of (fg[d]?.[h] || []))
            g[d][h].push({ id, fid: f.slug, fn: f });
    }
    return g;
  }, [schedules, currentWeek, functions]);

  const fnStaff = staff.filter(s => s.functions?.includes(activeFn));
  const selS    = staff.find(s => s.id === selStaff);

  /* ─── MOBILE ─────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
        {/* Toolbar compacte */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => setWk(w => w - 1)} style={mNavBtn}>◀</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#1E2235' }}>{weekLabel}</span>
          <button onClick={() => setWk(0)} style={mNavBtn}>Auj.</button>
          <button onClick={() => setWk(w => w + 1)} style={mNavBtn}>▶</button>
        </div>

        {/* Sélecteur mode + fonction */}
        <div style={{ padding: '6px 10px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2 }}>
            {[['fn', '📋'], ['all', '👥']].map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)}
                style={{ padding: '4px 9px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode === v ? '#fff' : 'transparent', color: mode === v ? '#1E2235' : '#9B9890', fontWeight: mode === v ? 700 : 400, fontSize: 13, boxShadow: mode === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{l}</button>
            ))}
          </div>
          {mode === 'fn' && (
            <select value={activeFn} onChange={e => setActiveFn(e.target.value)}
              style={{ flex: 1, padding: '5px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, fontFamily: 'inherit' }}>
              {functions.map(f => <option key={f.slug} value={f.slug}>{f.icon} {f.name}</option>)}
            </select>
          )}
        </div>

        {/* Tabs jours */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '2px solid #E4E0D8', background: '#F5F3EF', flexShrink: 0 }}>
          {DAYS_SH.map((d, di) => {
            const date    = dates[di];
            const isToday = date.toDateString() === new Date().toDateString();
            const active  = activeDay === di;
            return (
              <button key={di} onClick={() => setActiveDay(di)}
                style={{ flex: '0 0 auto', padding: '7px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: active ? '#fff' : 'transparent', borderBottom: active ? '2px solid #C5753A' : '2px solid transparent', marginBottom: -2 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: isToday ? '#C5753A' : '#9B9890', textTransform: 'uppercase' }}>{d}</div>
                <div style={{ fontSize: 14, fontWeight: active ? 800 : 600, color: isToday ? '#C5753A' : '#1E2235' }}>{date.getDate()}</div>
              </button>
            );
          })}
        </div>

        {/* Grille jour actif */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <DayGrid
            dayIndex={activeDay} grid={grid} allGrid={allGrid}
            mode={mode} staff={staff} fn={fn}
            selStaff={selStaff} selS={selS}
            toggleCell={toggleCell} removeSlot={removeSlot}
          />
        </div>

        {/* Panneau staff (mode fn) — accordéon bas */}
        {mode === 'fn' && (
          <div style={{ borderTop: '1px solid #E4E0D8', background: '#fff', flexShrink: 0, maxHeight: 180, overflow: 'auto' }}>
            <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {fn?.icon} {fn?.name} — Sélectionner pour assigner
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 10px' }}>
              {fnStaff.map(s => {
                const h = DAYS.reduce((a, _, di) => a + HOURS.filter(hr => (grid[di]?.[hr] || []).includes(s.id)).length, 0);
                const isSel = selStaff === s.id;
                return (
                  <div key={s.id} onClick={() => setSelStaff(p => p === s.id ? null : s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 20, border: `1.5px solid ${isSel ? s.color : '#ECEAE4'}`, background: isSel ? `${s.color}0D` : '#FAFAF8', cursor: 'pointer' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: s.color, color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.initials[0]}</div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname}</span>
                    {h > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{h}h</span>}
                    {isSel && <span style={{ fontSize: 10, color: s.color }}>✓</span>}
                  </div>
                );
              })}
              {fnStaff.length === 0 && <span style={{ fontSize: 11, color: '#C0BCB5', fontStyle: 'italic' }}>Aucun salarié assigné</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── DESKTOP ─────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100vh' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 130 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E2235' }}>Planning</div>
          <div style={{ fontSize: 11, color: '#8B8880' }}>{weekLabel}</div>
        </div>

        <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2 }}>
          {[['fn', '📋 Par fonction'], ['all', '👥 Vue globale']].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode === v ? '#fff' : 'transparent', color: mode === v ? '#1E2235' : '#9B9890', fontWeight: mode === v ? 600 : 400, fontSize: 11, boxShadow: mode === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{l}</button>
          ))}
        </div>

        {mode === 'fn' && (
          <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
            {functions.map(f => (
              <button key={f.slug} onClick={() => setActiveFn(f.slug)} style={{ padding: '3px 9px', borderRadius: 20, border: `1.5px solid ${activeFn === f.slug ? f.color : '#E4E0D8'}`, background: activeFn === f.slug ? (f.bg_color || '#F5F5F5') : '#fff', color: activeFn === f.slug ? f.color : '#9B9890', cursor: 'pointer', fontSize: 10, fontWeight: activeFn === f.slug ? 700 : 400, fontFamily: 'inherit' }}>
                {f.icon} {f.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 'auto' }}>
          <Btn onClick={() => setWk(w => w - 1)} small>◀</Btn>
          <Btn onClick={() => setWk(0)} small>Auj.</Btn>
          <Btn onClick={() => setWk(w => w + 1)} small>▶</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Grille */}
        <div style={{ flex: 1, overflow: 'auto', background: '#FAFAF8' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7,1fr)', position: 'sticky', top: 0, zIndex: 10, background: '#F5F3EF', borderBottom: '2px solid #E4E0D8' }}>
            <div />
            {DAYS.map((day, di) => {
              const date = dates[di];
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={day} style={{ padding: '8px 6px 6px', textAlign: 'center', background: isToday ? '#FFF4EC' : di >= 5 ? '#F9F7F4' : 'transparent', borderLeft: '1px solid #E4E0D8' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: isToday ? '#C5753A' : '#9B9890', textTransform: 'uppercase' }}>{DAYS_SH[di]}</div>
                  <div style={{ fontSize: 15, fontWeight: isToday ? 800 : 600, color: isToday ? '#C5753A' : '#1E2235', lineHeight: 1.2, margin: '1px 0' }}>{date.getDate()}</div>
                </div>
              );
            })}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 44 }} />{DAYS.map((_, i) => <col key={i} />)}</colgroup>
            <tbody>
              {HOURS.map(h => (
                <tr key={h}>
                  <td style={{ padding: '0 5px', textAlign: 'right', fontSize: 9, color: '#C0BCB5', verticalAlign: 'top', paddingTop: 4, borderTop: '1px solid #ECEAE4', position: 'sticky', left: 0, background: '#F5F3EF', zIndex: 5 }}>{h}h</td>
                  {DAYS.map((_, di) => {
                    const items = mode === 'fn'
                      ? (grid[di]?.[h] || []).map(id => ({ id, fid: activeFn, fn }))
                      : (allGrid[di]?.[h] || []);
                    const hasSel = selStaff && items.some(x => x.id === selStaff);
                    const isDragTarget = dragOver?.day === di && dragOver?.hour === h && mode === 'fn';
                    return (
                      <td key={di}
                        onClick={() => mode === 'fn' && toggleCell(di, h)}
                        onDragOver={e => onDragOver(e, di, h)}
                        onDragLeave={onDragLeave}
                        onDrop={e => onDrop(e, di, h)}
                        style={{ verticalAlign: 'top', padding: '2px 3px', borderLeft: '1px solid #E4E0D8', borderTop: '1px solid #ECEAE4', background: isDragTarget ? 'rgba(197,117,58,.18)' : hasSel ? `${selS?.color}12` : di >= 5 ? '#FDFBF8' : '#fff', cursor: mode === 'fn' && selStaff ? 'crosshair' : 'default', minHeight: 24, transition: 'background .1s' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, minHeight: 20 }}>
                          {items.map((ci, ii) => {
                            const s = staff.find(x => x.id === ci.id);
                            if (!s) return null;
                            return (
                              <div key={`${ci.id}-${ci.fid}-${ii}`}
                                draggable={mode === 'fn'}
                                onDragStart={e => { e.stopPropagation(); onDragStart(e, { type: 'move', staffId: s.id, fromDay: di, fromHour: h }); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 2, background: `${s.color}18`, border: `1px solid ${s.color}35`, borderRadius: 4, padding: '1px 3px', userSelect: 'none', cursor: mode === 'fn' ? 'grab' : 'default' }}>
                                {mode === 'all' && ci.fn && <span style={{ fontSize: 8 }}>{ci.fn.icon}</span>}
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800 }}>{s.initials[0]}</div>
                                <span style={{ fontSize: 9, fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
                                {mode === 'fn' && <button onClick={e => removeSlot(di, h, s.id, e)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: s.color, opacity: .4, display: 'flex', fontSize: 9, lineHeight: 1 }}>✕</button>}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panneau droit */}
        {mode === 'fn' && (
          <div style={{ width: 220, background: '#fff', borderLeft: '1px solid #E4E0D8', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #F0EDE8' }}>
              {fn && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', background: fn.bg_color || '#F5F5F5', borderRadius: 7, border: `1px solid ${fn.color}30`, marginBottom: 7 }}>
                  <span style={{ fontSize: 15 }}>{fn.icon}</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: fn.color }}>{fn.name}</div>
                </div>
              )}
              <div style={{ fontSize: 11, color: '#9B9890' }}>
                {selStaff ? `✓ ${selS?.firstname || selS?.name} — cliquer les cellules` : 'Sélectionner pour assigner'}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
              <div style={{ fontSize: 10, color: '#C0BCB5', textTransform: 'uppercase', letterSpacing: '.5px', padding: '3px 3px 5px', fontWeight: 700 }}>
                Habilités à ce poste
              </div>
              {fnStaff.length === 0 && <div style={{ fontSize: 11, color: '#C0BCB5', padding: '8px 4px', fontStyle: 'italic' }}>Aucun salarié assigné</div>}
              {fnStaff.map(s => {
                const h = DAYS.reduce((a, _, di) => a + HOURS.filter(hr => (grid[di]?.[hr] || []).includes(s.id)).length, 0);
                const isSel = selStaff === s.id;
                return (
                  <div key={s.id}
                    draggable
                    onDragStart={e => onDragStart(e, { type: 'staff', staffId: s.id })}
                    onClick={() => setSelStaff(p => p === s.id ? null : s.id)}
                    style={{ padding: '7px 8px', borderRadius: 8, marginBottom: 4, border: `1.5px solid ${isSel ? s.color : '#ECEAE4'}`, background: isSel ? `${s.color}0D` : '#FAFAF8', cursor: 'grab' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Avatar s={s} size={22} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname || s.name} {isSel && '✓'}</div>
                        <div style={{ fontSize: 9, color: '#9B9890' }}>{s.type === 'renfort' ? 'Vacation' : 'Salarié'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: h > 0 ? s.color : '#C0BCB5' }}>{h}h</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const mNavBtn = {
  padding: '5px 9px', border: '1px solid #E4E0D8', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#5B5855',
};

export default PlanningView;
