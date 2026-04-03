import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { useApp } from '../App';
import { Btn } from '../components/common';
import api from '../api/client';
import SpanDetailModal from '../components/SpanDetailModal';
import { useIsMobile, useIsTouch } from '../hooks/useDimensions';
import { weekStart, todayDayIdx } from '../utils/dates';
import { getDayDecorations } from '../utils/holidayUtils';

/* ── Injection CSS animation highlight (une seule fois) ──────── */
if (typeof document !== 'undefined' && !document.getElementById('spirit-highlight-style')) {
  const _st = document.createElement('style');
  _st.id = 'spirit-highlight-style';
  _st.textContent = `@keyframes spirit-pulse { 0%,100%{box-shadow:0 0 0 2px #C5753A80,0 0 8px #C5753A40} 50%{box-shadow:0 0 0 5px #C5753AA0,0 0 18px #C5753A60} }`;
  document.head.appendChild(_st);
}

const DAYS    = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SH = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Plage horaire : 7h → 24h
const DAY_START = 7;
const DAY_END   = 24;
const SLOT_H    = 14;   // px par quart d'heure
const HOUR_H    = SLOT_H * 4;
const TOTAL_H   = (DAY_END - DAY_START) * HOUR_H;
const HOUR_LABELS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

const yToTime  = (y) => Math.round(Math.max(DAY_START, Math.min(DAY_END, DAY_START + y / HOUR_H)) * 4) / 4;
const timeToY  = (t) => (t - DAY_START) * HOUR_H;
const fmtTime  = (t) => { const h = Math.floor(t); const m = Math.round((t - h) * 60); return `${h}h${m === 0 ? '' : String(m).padStart(2, '0')}`; };

const cloneSpans = (spans) => {
  const out = {};
  for (let d = 0; d < 7; d++) out[d] = (spans?.[d] ?? spans?.[String(d)] ?? []).map(s => ({ ...s }));
  return out;
};

import AvatarImg from '../components/AvatarImg';
const Avatar = ({ s, size = 28 }) => <AvatarImg s={s} size={size} />;

const totalHoursForStaff = (spans, staffId) => {
  let t = 0;
  for (let d = 0; d < 7; d++) for (const sp of (spans?.[d] ?? [])) if (sp.staffId === staffId) t += sp.end - sp.start;
  return Math.round(t * 100) / 100;
};

/* ─── Bloc span individuel ──────────────────────────────────── */
const SpanBlock = memo(({ span, s, dayIndex, mode, onResizeStart, onMoveStart, onRemove, onTaskTypeChange, col, colCount, highlighted, ttMap = {}, activeFnId = null, onSpanClick }) => {
  const [showTT, setShowTT] = useState(false);
  const [ddPos,  setDdPos]  = useState({ top: 0, left: 0 });
  const badgeRef = useRef(null);

  // Fermeture du dropdown au clic extérieur
  useEffect(() => {
    if (!showTT) return;
    const close = () => setShowTT(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showTT]);

  const top    = timeToY(span.start);
  const height = Math.max(SLOT_H, timeToY(span.end) - top);
  const dur    = span.end - span.start;
  const tt     = span.taskType ? ttMap[span.taskType] : null;
  const stripColor = tt ? tt.color : null;
  const w      = colCount > 1 ? `calc(${100 / colCount}% - 2px)` : 'calc(100% - 4px)';
  const left   = colCount > 1 ? `calc(${col * 100 / colCount}% + 1px)` : '2px';
  return (
    <div
      onPointerDown={e => mode === 'fn' && onMoveStart(e, span, dayIndex)}
      onClick={() => onSpanClick?.(span, dayIndex)}
      style={{ position: 'absolute', top, left, width: w, height,
        background: highlighted ? `${s.color}35` : `${s.color}22`,
        border: highlighted ? '2px solid #C5753A' : `1.5px solid ${s.color}80`,
        animation: highlighted ? 'spirit-pulse 1.6s ease-in-out infinite' : undefined,
        borderRadius: 5, overflow: 'visible', userSelect: 'none',
        cursor: mode === 'fn' ? 'grab' : 'pointer',
        boxSizing: 'border-box', zIndex: 2, display: 'flex', flexDirection: 'column' }}
    >
      {/* Bande colorée tâche (gauche) */}
      {stripColor && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 6, width: 3, background: stripColor, borderRadius: '3px 0 0 3px' }} />
      )}
      <div style={{ flex: 1, padding: '1px 4px 0', overflow: 'hidden', minHeight: 0, paddingLeft: stripColor ? 6 : 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, flexShrink: 0 }}>{s.initials[0]}</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: s.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.firstname || s.name}</span>
          {mode === 'fn' && (
            <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemove(dayIndex, span); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', color: s.color, opacity: .5, fontSize: 9, lineHeight: 1, flexShrink: 0 }}>✕</button>
          )}
        </div>
        {dur >= 0.5 && <div style={{ fontSize: 8, color: s.color, opacity: .7, paddingLeft: 13 }}>{fmtTime(span.start)}–{fmtTime(span.end)}</div>}
        {/* Badge type de tâche */}
        {dur >= 0.75 && mode === 'fn' && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div
              ref={badgeRef}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                if (!showTT && badgeRef.current) {
                  const r = badgeRef.current.getBoundingClientRect();
                  setDdPos({ top: r.bottom + 4, left: r.left });
                }
                setShowTT(v => !v);
              }}
              style={{ marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 2, background: tt ? `${tt.color}18` : '#F0EDE8', border: `1px solid ${tt ? tt.color + '50' : '#E0DDD8'}`, borderRadius: 4, padding: '1px 4px', cursor: 'pointer', fontSize: 8, color: tt ? tt.color : '#9B9890', fontWeight: 600 }}
            >
              {tt ? `${tt.icon} ${tt.label}` : '⚙ tâche'}
            </div>
            {showTT && (
              <div
                onPointerDown={e => e.stopPropagation()}
                style={{ position: 'fixed', top: ddPos.top, left: ddPos.left, zIndex: 9999, background: '#fff', border: '1px solid #E4E0D8', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.18)', padding: 4, minWidth: 140 }}
              >
                <div onClick={e => { e.stopPropagation(); onTaskTypeChange(dayIndex, span, null); setShowTT(false); }} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4, color: '#9B9890', background: !span.taskType ? '#F5F3EF' : 'transparent' }}>— Aucune</div>
                {Object.keys(ttMap).filter(k => ttMap[k].function_id == null || ttMap[k].function_id === activeFnId).map(k => (
                  <div key={k} onClick={e => { e.stopPropagation(); onTaskTypeChange(dayIndex, span, k); setShowTT(false); }}
                    style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4, color: ttMap[k]?.color, background: span.taskType === k ? `${ttMap[k]?.color}15` : 'transparent', fontWeight: span.taskType === k ? 700 : 400 }}>
                    {ttMap[k]?.icon} {ttMap[k]?.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {mode === 'fn' && (
        <div onPointerDown={e => { e.stopPropagation(); onResizeStart(e, span, dayIndex); }}
          onClick={e => e.stopPropagation()}
          style={{ height: 6, background: `${s.color}40`, cursor: 'ns-resize', borderTop: `1px solid ${s.color}50`, flexShrink: 0 }} />
      )}
    </div>
  );
});

/* ─── Grouper les cours par intervalles qui se chevauchent ────── */
function groupOverlapping(slots) {
  if (!slots || !slots.length) return [];
  const sorted = [...slots].sort((a, b) => a.hour_start - b.hour_start);
  const groups = [[sorted[0]]];
  let maxEnd = sorted[0].hour_end;
  for (let i = 1; i < sorted.length; i++) {
    const cs = sorted[i];
    if (cs.hour_start < maxEnd) {
      groups[groups.length - 1].push(cs);
      maxEnd = Math.max(maxEnd, cs.hour_end);
    } else {
      groups.push([cs]);
      maxEnd = cs.hour_end;
    }
  }
  return groups;
}

/* ─── Bloc compact groupé (remplace CourseSlotBand) ─────────────
   Un seul bloc cliquable par groupe de cours qui se chevauchent.
   Badge ×N avec compteur moniteurs assignés / requis.           */
const CourseSlotCompactBlock = ({ courses, assignments, onOpen, col = 0, colCount = 1 }) => {
  const minS = Math.min(...courses.map(c => c.hour_start));
  const maxE = Math.max(...courses.map(c => c.hour_end));
  const top  = timeToY(minS);
  const h    = Math.max(SLOT_H * 2, timeToY(maxE) - top);
  const primaryColor = courses[0]?.color || '#5B75DB';
  const primaryBg    = courses[0]?.bg_color || '#EBF0FE';
  const totalNeeded   = courses.reduce((s, c) => s + (c.capacity || 2), 0);
  const totalAssigned = courses.reduce((s, c) => s + (assignments[c.id]?.length || 0), 0);
  const ok = totalAssigned >= totalNeeded;
  const w      = colCount > 1 ? `calc(${100 / colCount}% - 2px)` : 'calc(100% - 4px)';
  const left   = colCount > 1 ? `calc(${col * 100 / colCount}% + 1px)` : '2px';
  const narrow = colCount > 1;
  return (
    <div style={{ position: 'absolute', top, left, width: w, height: h, zIndex: 1, pointerEvents: 'none', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: primaryBg, borderLeft: `4px solid ${primaryColor}`, borderTop: `1px solid ${primaryColor}40`, borderBottom: `1px solid ${primaryColor}40`, opacity: 0.72, boxSizing: 'border-box' }} />
      {/* Fond hachuré en points */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${primaryColor}55 1.2px, transparent 1.2px)`, backgroundSize: '7px 7px', opacity: 0.9, boxSizing: 'border-box' }} />
      {/* Tampon COURS centré */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'hidden' }}>
        <span style={{ fontSize: Math.max(13, Math.min(22, h * 0.28)), fontWeight: 900, letterSpacing: '0.18em', color: primaryColor, opacity: 0.38, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', lineHeight: 1, fontFamily: 'Impact, "Arial Black", sans-serif', textShadow: `0 0 0 1px ${primaryColor}40` }}>
          COURS
        </span>
      </div>
      {/* Badge cliquable en haut à droite */}
      <div onClick={onOpen} title={`${courses.length} cours — cliquer pour gérer les moniteurs`} style={{ position: 'absolute', top: 3, right: 3, display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: 'center', gap: narrow ? 2 : 3, background: 'rgba(255,255,255,.96)', border: `1.5px solid ${ok ? '#22C55E50' : '#F59E0B80'}`, borderRadius: 5, padding: narrow ? '3px 2px' : '2px 5px', cursor: 'pointer', pointerEvents: 'auto', boxShadow: '0 1px 4px rgba(0,0,0,.14)', zIndex: 4, userSelect: 'none' }}>
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {courses.slice(0, narrow ? 2 : 3).map((c, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />)}
          {courses.length > (narrow ? 2 : 3) && <span style={{ fontSize: 8, color: '#9B9890' }}>+{courses.length - (narrow ? 2 : 3)}</span>}
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#1E2235' }}>×{courses.length}</span>
        <span style={{ fontSize: 9, fontWeight: 800, color: ok ? '#16A34A' : '#D97706' }}>{totalAssigned}/{totalNeeded}👤</span>
      </div>
      {/* Noms des groupes si assez de hauteur */}
      {h >= 44 && (
        <div style={{ position: 'absolute', bottom: 3, left: 7, right: 60, fontSize: 9, color: primaryColor, fontWeight: 600, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {courses.map(c => c.group_name).join(' · ')}
        </div>
      )}
    </div>
  );
};

/* ─── Colonne d'un jour ─────────────────────────────────────── */
const DayColumn = memo(({ dayIndex, spans, staff, mode, courseSlots, assignments, onOpenCourseGroup, onDragEnter, onDragLeave, isDragOver, colRef, onMoveStart, onResizeStart, onRemove, onTaskTypeChange, isToday, isWeekend, highlightStaffId, ttMap = {}, activeFnId = null, unavailabilities = [], leaves = [], dateStr = '', declSpans = [], onSpanClick, onDeclClick }) => {
  const placed = useMemo(() => {
    // Unification cours + spans + déclarations dans le même algorithme de colonnes
    const courseGroups = groupOverlapping(courseSlots || []);
    const allItems = [
      ...courseGroups.map(g => ({
        type: 'course',
        group: g,
        start: Math.min(...g.map(c => c.hour_start)),
        end:   Math.max(...g.map(c => c.hour_end)),
      })),
      ...spans.filter(sp => !sp.isDeclaration).map(sp => ({ type: 'span', sp, start: sp.start, end: sp.end })),
      ...declSpans
        .filter(d => ['pending', 'approved'].includes(d.status))
        .map(d => ({ type: 'decl', decl: d, start: d.hour_start, end: d.hour_end })),
    ];
    if (!allItems.length) return { result: [] };
    const sorted = [...allItems].sort((a, b) => a.start - b.start || a.end - b.end);

    // ── Clustering par chevauchement transitif ─────────────────
    // Chaque cluster regroupe les items qui s'intersectent directement ou indirectement.
    // Le colCount est calculé par cluster, pas globalement, pour éviter
    // qu'un item isolé hérite du colCount d'items distants dans le temps.
    const clusterIdx = new Array(sorted.length).fill(-1);
    const clusters   = []; // clusters[c] = tableau d'indices dans sorted

    for (let i = 0; i < sorted.length; i++) {
      let assigned = -1;
      for (let c = 0; c < clusters.length; c++) {
        if (!clusters[c].length) continue;
        const clusterMaxEnd = Math.max(...clusters[c].map(j => sorted[j].end));
        if (sorted[i].start < clusterMaxEnd) {
          if (assigned === -1) {
            assigned = c;
            clusters[c].push(i);
          } else {
            // Fusion de deux clusters
            for (const j of clusters[c]) { clusters[assigned].push(j); clusterIdx[j] = assigned; }
            clusters[c] = [];
          }
        }
      }
      if (assigned === -1) { assigned = clusters.length; clusters.push([i]); }
      clusterIdx[i] = assigned;
    }

    // ── Attribution col + colCount par cluster ─────────────────
    const colAssign   = new Array(sorted.length);
    const colCountArr = new Array(sorted.length);

    for (const cluster of clusters) {
      if (!cluster.length) continue;
      const clusterSorted = [...cluster].sort((a, b) => sorted[a].start - sorted[b].start);
      const cols = [];
      for (const i of clusterSorted) {
        let col = cols.findIndex(end => end <= sorted[i].start);
        if (col === -1) { cols.push(sorted[i].end); col = cols.length - 1; }
        else cols[col] = sorted[i].end;
        colAssign[i] = col;
      }
      const cc = Math.max(1, cols.length);
      for (const i of cluster) colCountArr[i] = cc;
    }

    const result = sorted.map((item, i) => ({ ...item, col: colAssign[i], colCount: colCountArr[i] }));
    return { result };
  }, [spans, courseSlots, declSpans]);

  return (
    <div ref={colRef} onDragOver={e => { e.preventDefault(); onDragEnter(dayIndex); }} onDragLeave={onDragLeave}
      style={{ flex: 1, position: 'relative', height: TOTAL_H, background: isDragOver ? 'rgba(197,117,58,.07)' : isToday ? '#FFFCF9' : isWeekend ? '#FDFBF8' : '#fff', borderLeft: '2px solid #D0CBC2' }}>
      {/* Lignes heure */}
      {HOUR_LABELS.slice(0, -1).map(h => (
        <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - DAY_START) * HOUR_H, borderTop: '1px solid #F0EDE8', height: HOUR_H, pointerEvents: 'none' }}>
          {[1,2,3].map(q => <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q * SLOT_H, borderTop: '1px dashed #F5F2ED', pointerEvents: 'none' }} />)}
        </div>
      ))}
      {/* Zones de congés approuvés hachurées (vert) */}
      {dateStr && leaves
        .filter(l => l.start_date <= dateStr && l.end_date >= dateStr)
        .map((l, i) => (
          <div key={`leave-${i}`}
            title={`${l.staff_name || ''} — Congé approuvé${l.type_label ? ' : ' + l.type_label : ''}`}
            style={{
              position: 'absolute', left: 0, right: 0, top: 0, height: TOTAL_H,
              background: 'rgba(16,185,129,0.06)',
              backgroundImage: 'repeating-linear-gradient(135deg,rgba(16,185,129,0.35),rgba(16,185,129,0.35) 3px,transparent 3px,transparent 10px)',
              zIndex: 1, pointerEvents: 'none',
            }} />
        ))
      }
      {/* Blocs cours et spans — placement unifié côte à côte */}
      {placed.result.map((item, idx) => {
        if (item.type === 'course') {
          return (
            <CourseSlotCompactBlock
              key={`course-${item.group[0].id}-${idx}`}
              courses={item.group}
              assignments={assignments || {}}
              onOpen={() => onOpenCourseGroup && onOpenCourseGroup(item.group)}
              col={item.col}
              colCount={item.colCount}
            />
          );
        }
        if (item.type === 'decl') {
          const { decl, col } = item;
          const s = staff.find(x => x.id === decl.staff_id);
          if (!s) return null;
          const top = timeToY(decl.hour_start);
          const h   = Math.max(SLOT_H, timeToY(decl.hour_end) - top);
          const isPending  = decl.status === 'pending';
          const isApproved = decl.status === 'approved';
          const declBg     = isPending ? '#FEF9C3' : isApproved ? '#DCFCE7' : '#F3F4F6';
          const declBorder = isPending ? '#A16207' : isApproved ? '#15803D' : '#9CA3AF';
          const w = item.colCount > 1 ? `calc(${100 / item.colCount}% - 2px)` : 'calc(100% - 4px)';
          const l = item.colCount > 1 ? `calc(${item.col * 100 / item.colCount}% + 1px)` : '2px';
          return (
            <div key={`decl-${decl.id}`}
              onClick={() => onDeclClick?.(decl, dayIndex)}
              style={{
              position: 'absolute', top, left: l, width: w, height: h,
              background: declBg, border: `1.5px dashed ${declBorder}`,
              borderLeft: `3.5px solid ${declBorder}`,
              borderRadius: 5, overflow: 'hidden', padding: '2px 5px',
              fontSize: 9, fontWeight: 600, boxSizing: 'border-box', zIndex: 2,
              cursor: 'pointer',
            }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                <span style={{ fontSize: Math.max(7, Math.min(11, h * 0.20)), fontWeight: 900, letterSpacing: '0.04em', color: declBorder, opacity: 0.28, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: '"Arial Black", Arial, sans-serif', whiteSpace: 'nowrap' }}>H.salarié</span>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', color: declBorder }}>
                <span style={{ fontSize: 8 }}>⏰</span>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800 }}>{s.initials[0]}</div>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
              </div>
              {h >= 28 && <div style={{ position: 'relative', fontSize: 8, color: declBorder, opacity: .8 }}>{fmtTime(decl.hour_start)}–{fmtTime(decl.hour_end)}</div>}
            </div>
          );
        }
        const s = staff.find(x => x.id === item.sp.staffId);
        if (!s) return null;
        return <SpanBlock key={`${item.sp.staffId}-${item.sp.start}-${item.col}`} span={item.sp} s={s} dayIndex={dayIndex} mode={mode} onResizeStart={onResizeStart} onMoveStart={onMoveStart} onRemove={onRemove} onTaskTypeChange={onTaskTypeChange} col={item.col} colCount={item.colCount} highlighted={!!(highlightStaffId && item.sp.staffId === highlightStaffId)} ttMap={ttMap} activeFnId={activeFnId} onSpanClick={onSpanClick} />;
      })}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════ */
/*  Panneau Modèles (templates)                                    */
/* ═══════════════════════════════════════════════════════════════ */
const TemplatePanel = ({ fn, currentWeek, spans, onClose, onApplied }) => {
  const [templates,   setTemplates]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [newName,     setNewName]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [applying,    setApplying]    = useState(null); // id template en cours d'application
  const [applyFrom,   setApplyFrom]   = useState(currentWeek);
  const [applyTo,     setApplyTo]     = useState(currentWeek);
  const [applyStatus, setApplyStatus] = useState(null);

  const load = async () => {
    if (!fn) return;
    setLoading(true);
    try { const r = await api.get(`/templates?function_id=${fn.id}`); setTemplates(Array.isArray(r.data) ? r.data : []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [fn?.id]);

  const handleSaveAs = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const r    = await api.post('/templates', { name: newName.trim(), function_id: fn.id });
      const tplId = r.data.id;
      const slots = [];
      for (let d = 0; d < 7; d++)
        for (const sp of (spans[d] || []))
          slots.push({ staff_id: sp.staffId, day_of_week: d, hour_start: sp.start, hour_end: sp.end, task_type: sp.taskType || null });
      await api.post(`/templates/${tplId}/slots`, { slots });
      setNewName(''); setShowCreate(false);
      await load();
    } finally { setSaving(false); }
  };

  const handleUpdate = async (tplId) => {
    const slots = [];
    for (let d = 0; d < 7; d++)
      for (const sp of (spans[d] || []))
        slots.push({ staff_id: sp.staffId, day_of_week: d, hour_start: sp.start, hour_end: sp.end, task_type: sp.taskType || null });
    try {
      await api.post(`/templates/${tplId}/slots`, { slots });
      alert('Modèle mis à jour !');
    } catch (e) {
      alert('❌ ' + (e.response?.data?.error || e.message));
    }
  };

  const handleApply = async (tplId) => {
    setApplyStatus('loading');
    try {
      const r = await api.post(`/templates/${tplId}/apply`, { from: applyFrom, to: applyTo });
      setApplyStatus(`✅ ${r.data.applied} semaine(s) générée(s)`);
      onApplied?.();
      setTimeout(() => { setApplying(null); setApplyStatus(null); }, 2500);
    } catch (e) { setApplyStatus('❌ ' + (e.response?.data?.error || e.message)); }
  };

  const handleDelete = async (tplId) => {
    if (!window.confirm('Supprimer ce modèle ?')) return;
    await api.delete(`/templates/${tplId}`);
    await load();
  };

  const inp = { fontSize: 11, padding: '4px 7px', border: '1px solid #DDDAFE', borderRadius: 5, fontFamily: 'inherit', outline: 'none', background: '#fff' };
  return (
    <div style={{ width: 260, background: '#fff', borderLeft: '1px solid #E4E0D8', display: 'flex', flexDirection: 'column', flexShrink: 0, fontSize: 12 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #F0EDE8', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1E2235', flex: 1 }}>📋 Modèles</span>
        {fn && <span style={{ fontSize: 10, background: fn.bg_color || '#F5F5F5', color: fn.color, borderRadius: 9, padding: '2px 7px', fontWeight: 600 }}>{fn.icon} {fn.name}</span>}
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: '#9B9890', padding: 0, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ padding: '8px 12px', borderBottom: '1px solid #F0EDE8' }}>
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)} style={{ width: '100%', padding: '7px 10px', background: '#FFF8F2', border: '1.5px dashed #C5753A', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: '#C5753A', fontWeight: 600 }}>
            ➕ Enregistrer cette semaine comme modèle
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 5 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveAs()}
              placeholder="Nom du modèle…"
              style={{ ...inp, flex: 1, border: '1px solid #C5753A' }} />
            <button onClick={handleSaveAs} disabled={saving || !newName.trim()}
              style={{ padding: '4px 9px', background: '#C5753A', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {saving ? '…' : '✓'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(''); }}
              style={{ padding: '4px 7px', background: '#F5F3EF', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#9B9890' }}>✕</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {loading && <div style={{ textAlign: 'center', color: '#9B9890', padding: 16, fontSize: 11 }}>Chargement…</div>}
        {!loading && templates.length === 0 && (
          <div style={{ textAlign: 'center', color: '#C0BCB5', padding: 16, fontSize: 11, fontStyle: 'italic' }}>Aucun modèle pour cette fonction</div>
        )}
        {templates.map(t => (
          <div key={t.id} style={{ borderRadius: 8, border: '1px solid #ECEAE4', marginBottom: 6, overflow: 'hidden' }}>
            <div style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, background: '#FAFAF8' }}>
              <span style={{ flex: 1, fontWeight: 600, color: '#1E2235', fontSize: 11 }}>{t.name}</span>
              {t.is_default === 1 && <span style={{ fontSize: 9, background: '#EBF0FE', color: '#5B75DB', borderRadius: 8, padding: '2px 6px' }}>Défaut</span>}
              <button onClick={() => handleDelete(t.id)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BCB5', fontSize: 12, padding: 0, lineHeight: 1 }}>🗑</button>
            </div>
            {applying === t.id ? (
              <div style={{ padding: '8px 10px', background: '#F9F9FF', borderTop: '1px solid #E8E5F5' }}>
                <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 5 }}>Appliquer du … au :</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                  <input type="date" value={applyFrom} onChange={e => setApplyFrom(e.target.value)} style={{ ...inp, flex: 1, minWidth: 0 }} />
                  <span style={{ color: '#9B9890', fontSize: 10 }}>→</span>
                  <input type="date" value={applyTo} onChange={e => setApplyTo(e.target.value)} style={{ ...inp, flex: 1, minWidth: 0 }} />
                </div>
                {applyStatus ? (
                  <div style={{ fontSize: 10, padding: '4px 0', color: applyStatus.startsWith('✅') ? '#15803D' : '#DC2626' }}>{applyStatus}</div>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => handleApply(t.id)} style={{ flex: 1, padding: '5px', background: '#1E2235', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit' }}>
                      Générer les semaines
                    </button>
                    <button onClick={() => { setApplying(null); setApplyStatus(null); }} style={{ padding: '5px 8px', background: '#F5F3EF', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10, color: '#9B9890', fontFamily: 'inherit' }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '5px 10px 7px', display: 'flex', gap: 4 }}>
                <button onClick={() => { setApplying(t.id); setApplyFrom(currentWeek); setApplyTo(currentWeek); setApplyStatus(null); }}
                  style={{ flex: 1, padding: '5px 8px', background: '#EBF0FE', color: '#5B75DB', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit' }}>
                  📅 Appliquer à…
                </button>
                <button onClick={() => handleUpdate(t.id)} title="Mettre à jour avec la semaine courante"
                  style={{ padding: '5px 8px', background: '#F5F3EF', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  🔄
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  Modal gestion cours (catalogue créneaux de cours)             */
/* ═══════════════════════════════════════════════════════════════ */
const SEASONS = { always: 'Toujours', 'hors-vacances': 'Hors vacances', vacances: 'Vacances', competition: 'Compétition', stage: 'Stage' };
const DAYS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const CourseSlotModal = ({ fn, courseSlots, onClose, onChanged }) => {
  const empty = { day_of_week: 0, hour_start: 9, hour_end: 11, group_name: '', level: '', public_desc: '', season: 'always', color: '#5B75DB', bg_color: '#EBF0FE', capacity: 2 };
  const [form, setForm]     = useState(empty);
  const [editing, setEditing] = useState(null); // id du cours édité
  const [saving, setSaving]   = useState(false);
  const fnCourses = courseSlots.filter(cs => cs.function_id === fn?.id);

  const inp = { fontSize: 11, padding: '4px 7px', border: '1px solid #E4E0D8', borderRadius: 5, fontFamily: 'inherit', outline: 'none', background: '#fff' };

  const startEdit = (cs) => {
    setEditing(cs.id);
    setForm({ day_of_week: cs.day_of_week, hour_start: cs.hour_start, hour_end: cs.hour_end, group_name: cs.group_name, level: cs.level || '', public_desc: cs.public_desc || '', season: cs.season || 'always', color: cs.color, bg_color: cs.bg_color, capacity: cs.capacity });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, function_id: fn.id, hour_start: Number(form.hour_start), hour_end: Number(form.hour_end), day_of_week: Number(form.day_of_week), capacity: Number(form.capacity) };
      if (editing) { await api.put(`/course-slots/${editing}`, payload); }
      else         { await api.post('/course-slots', payload); }
      setForm(empty); setEditing(null);
      onChanged();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce cours ?')) return;
    await api.delete(`/course-slots/${id}`);
    onChanged();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #ECEAE4', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', flex: 1 }}>🎓 Cours — {fn?.icon} {fn?.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B9890' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* Formulaire ajout/édition */}
          <div style={{ border: '1.5px solid #C5753A30', borderRadius: 8, padding: 12, marginBottom: 14, background: '#FFF8F2' }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: '#C5753A', marginBottom: 8 }}>{editing ? '✏️ Modifier le cours' : '➕ Nouveau cours'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Groupe *</div>
                <input value={form.group_name} onChange={e => setForm(f => ({ ...f, group_name: e.target.value }))} placeholder="ex: Adultes niveau 2" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Niveau / Public</div>
                <input value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} placeholder="ex: Intermédiaire" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Jour *</div>
                <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }}>
                  {DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Début</div>
                  <input type="number" min={7} max={22} step={0.25} value={form.hour_start} onChange={e => setForm(f => ({ ...f, hour_start: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Fin</div>
                  <input type="number" min={7} max={22} step={0.25} value={form.hour_end} onChange={e => setForm(f => ({ ...f, hour_end: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Infos public</div>
                <input value={form.public_desc} onChange={e => setForm(f => ({ ...f, public_desc: e.target.value }))} placeholder="ex: 8-12 ans, 6 max" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Saison</div>
                <select value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }}>
                  {Object.entries(SEASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Couleur</div>
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ height: 28, width: 44, padding: 2, border: '1px solid #E4E0D8', borderRadius: 5, cursor: 'pointer' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Fond</div>
                  <input type="color" value={form.bg_color} onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))} style={{ height: 28, width: 44, padding: 2, border: '1px solid #E4E0D8', borderRadius: 5, cursor: 'pointer' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: '#9B9890', marginBottom: 2 }}>Moniteurs max</div>
                  <input type="number" min={1} max={10} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
              <button onClick={handleSave} disabled={saving || !form.group_name}
                style={{ padding: '6px 14px', background: '#1E2235', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                {saving ? '…' : editing ? 'Mettre à jour' : 'Créer le cours'}
              </button>
              {editing && <button onClick={() => { setEditing(null); setForm(empty); }} style={{ padding: '6px 12px', background: '#F5F3EF', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: '#9B9890', fontFamily: 'inherit' }}>Annuler</button>}
            </div>
          </div>

          {/* Liste des cours existants */}
          {fnCourses.length === 0 && <div style={{ textAlign: 'center', color: '#C0BCB5', fontSize: 12, padding: '8px 0' }}>Aucun créneau de cours défini pour cette fonction</div>}
          {fnCourses.map(cs => (
            <div key={cs.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: '1px solid #ECEAE4', marginBottom: 5, background: '#FAFAF8' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: cs.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{DAYS_FULL[cs.day_of_week]} · {fmtTime(cs.hour_start)}–{fmtTime(cs.hour_end)}</div>
                <div style={{ fontSize: 10, color: '#5B5855' }}>{cs.group_name}{cs.level ? ` · ${cs.level}` : ''}{cs.public_desc ? ` · ${cs.public_desc}` : ''}</div>
              </div>
              <span style={{ fontSize: 9, background: '#F0EDE8', color: '#6B6860', borderRadius: 5, padding: '2px 6px' }}>{SEASONS[cs.season] || cs.season}</span>
              <button onClick={() => startEdit(cs)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B9890', fontSize: 13 }}>✏️</button>
              <button onClick={() => handleDelete(cs.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0BCB5', fontSize: 13 }}>🗑</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  Modal assignation moniteurs par cours (Option C popup)        */
/* ═══════════════════════════════════════════════════════════════ */
const CourseGroupModal = ({ courses, week, fnStaff, staff: allStaff, assignments, onClose, onChanged }) => {
  const [localAssign, setLocalAssign] = useState(() => {
    const o = {};
    for (const cs of courses) o[cs.id] = assignments[cs.id] ? [...assignments[cs.id]] : [];
    return o;
  });
  const [busy, setBusy] = useState(false);

  const minS = Math.min(...courses.map(c => c.hour_start));
  const maxE = Math.max(...courses.map(c => c.hour_end));

  const handleAssign = async (csId, staffId) => {
    if (!staffId) return;
    setBusy(true);
    try {
      await api.post(`/course-slots/${csId}/assign`, { staff_id: staffId, week_start: week });
      setLocalAssign(prev => ({ ...prev, [csId]: [...(prev[csId] || []), staffId] }));
      onChanged();
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  const handleUnassign = async (csId, staffId) => {
    setBusy(true);
    try {
      await api.delete(`/course-slots/${csId}/assign`, { params: { staff_id: staffId, week } });
      setLocalAssign(prev => ({ ...prev, [csId]: (prev[csId] || []).filter(id => id !== staffId) }));
      onChanged();
    } catch (e) { alert('❌ ' + (e.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  const weekLabel = (() => {
    try { return new Date(week + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return week; }
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, width: 540, maxHeight: '84vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.22)', overflow: 'hidden' }}>
        {/* En-tête */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #ECEAE4', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>🎓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>Cours — {fmtTime(minS)}–{fmtTime(maxE)}</div>
            <div style={{ fontSize: 11, color: '#9B9890' }}>{courses.length} cours · Semaine du {weekLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9B9890', lineHeight: 1 }}>×</button>
        </div>
        {/* Corps */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courses.map(cs => {
            const assigned    = localAssign[cs.id] || [];
            const remaining   = (cs.capacity || 2) - assigned.length;
            const assignedSet = new Set(assigned);
            const available   = fnStaff.filter(s => !assignedSet.has(s.id));
            const full        = assigned.length >= (cs.capacity || 2);
            return (
              <div key={cs.id} style={{ borderRadius: 10, border: `1.5px solid ${cs.color}40`, overflow: 'hidden', flexShrink: 0 }}>
                {/* Entête du cours */}
                <div style={{ background: cs.bg_color || '#EBF0FE', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${cs.color}30` }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: cs.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cs.color }}>{cs.group_name}</div>
                    {(cs.level || cs.public_desc) && (
                      <div style={{ fontSize: 10, color: cs.color, opacity: .8 }}>
                        {[cs.level, cs.public_desc].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, background: full ? '#D1FAE5' : '#FEF3C7', color: full ? '#065F46' : '#92400E', borderRadius: 8, padding: '2px 7px', fontWeight: 700, flexShrink: 0 }}>
                    {assigned.length}/{cs.capacity || 2} moniteur{(cs.capacity || 2) > 1 ? 's' : ''}
                  </span>
                </div>
                {/* Moniteurs assignés + sélecteur */}
                <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: '#FAFAF8', minHeight: 40 }}>
                  {assigned.map(sid => {
                    const s = allStaff.find(x => x.id === sid);
                    if (!s) return null;
                    return (
                      <div key={sid} style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${s.color}12`, border: `1px solid ${s.color}40`, borderRadius: 20, padding: '3px 8px 3px 5px' }}>
                        <AvatarImg s={s} size={18} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.firstname || s.name}</span>
                        <button disabled={busy} onClick={() => handleUnassign(cs.id, sid)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${s.color}90`, fontSize: 13, padding: '0 2px', lineHeight: 1, marginLeft: 1 }}>✕</button>
                      </div>
                    );
                  })}
                  {!full && available.length > 0 && (
                    <select disabled={busy} value=""
                      onChange={e => { if (e.target.value) handleAssign(cs.id, Number(e.target.value)); }}
                      style={{ fontSize: 11, padding: '3px 8px', border: `1.5px dashed ${cs.color}60`, borderRadius: 20, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#5B5855', outline: 'none' }}>
                      <option value="">➕ Ajouter un moniteur…</option>
                      {available.map(s => <option key={s.id} value={s.id}>{s.firstname || s.name} {s.lastname || ''}</option>)}
                    </select>
                  )}
                  {full && <span style={{ fontSize: 10, color: '#16A34A', fontStyle: 'italic' }}>✅ Complet</span>}
                  {!full && available.length === 0 && assigned.length === 0 && (
                    <span style={{ fontSize: 10, color: '#C0BCB5', fontStyle: 'italic' }}>Aucun moniteur disponible</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  Modal tactile (bottom sheet ajout/édition)                    */
const TouchSpanModal = ({ modal, dayIndex, fnStaff, staff, activeFn, courseSlots, taskTypes, checkConstraints, onSave, onRemove, onClose }) => {
  const isEdit = modal.type === 'edit';
  const span   = isEdit ? modal.span : null;
  const [staffId,  setStaffId]  = useState(isEdit ? span.staffId  : (fnStaff[0]?.id ?? null));
  const [start,    setStart]    = useState(isEdit ? span.start    : modal.start);
  const [end,      setEnd]      = useState(isEdit ? span.end      : modal.end);
  const [taskType, setTaskType] = useState(isEdit ? (span.taskType || 'permanent') : 'permanent');
  const [error,    setError]    = useState(null);

  const dayCourses = courseSlots || [];
  const matchedCourse = dayCourses.find(cs => start >= cs.hour_start && start < cs.hour_end);

  const inp = { border: '1px solid #E4E0D8', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#FAFAF8' };

  const handleSave = () => {
    if (!staffId) { setError('Sélectionnez un salarié'); return; }
    if (end <= start) { setError('L\'heure de fin doit être après le début'); return; }
    const violations = checkConstraints(staffId, dayIndex, start, end, isEdit ? span : null);
    if (violations.length > 0) { setError(violations[0]); return; }
    const courseSlotId = matchedCourse ? matchedCourse.id : null;
    onSave(staffId, start, end, taskType, courseSlotId);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onTouchMove={e => e.stopPropagation()}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '18px 18px 0 0', padding: '0 18px 32px', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 -4px 28px rgba(0,0,0,.18)' }}>
        {/* Poignée */}
        <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: 38, height: 4, background: '#E4E0D8', borderRadius: 2, display: 'inline-block' }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#1E2235', marginBottom: 18 }}>
          {isEdit ? 'Modifier le créneau' : 'Nouveau créneau'}
        </div>

        {/* Salarié */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Salarié</div>
          <select value={staffId ?? ''} onChange={e => setStaffId(Number(e.target.value))} style={inp}>
            {fnStaff.map(s => <option key={s.id} value={s.id}>{s.firstname || s.name} {s.lastname || ''}</option>)}
          </select>
        </div>

        {/* Horaires */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Début</div>
            <input type="number" min={DAY_START} max={DAY_END} step={0.25} value={start}
              onChange={e => setStart(parseFloat(e.target.value))} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Fin</div>
            <input type="number" min={DAY_START} max={DAY_END} step={0.25} value={end}
              onChange={e => setEnd(parseFloat(e.target.value))} style={inp} />
          </div>
        </div>

        {matchedCourse && (
          <div style={{ fontSize: 11, color: '#4A8C6E', background: '#EBF5F0', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
            📚 Cours associé : {matchedCourse.group_name} ({fmtTime(matchedCourse.hour_start)}–{fmtTime(matchedCourse.hour_end)})
          </div>
        )}

        {/* Type tâche */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: '#9B9890', marginBottom: 7, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Type d'activité</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(taskTypes||[]).map(t => {
              const k = t.slug; const tt = t; const sel = taskType === k;
              return (
                <button key={k} onClick={() => setTaskType(k)} style={{
                  padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${sel ? tt.color : '#E4E0D8'}`,
                  background: sel ? tt.color + '22' : '#fff', color: sel ? tt.color : '#9B9890',
                  fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: sel ? 700 : 400,
                }}>
                  {tt.icon} {tt.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div style={{ color: '#DC3545', fontSize: 12, marginBottom: 12, padding: '7px 10px', background: '#FFF0F0', borderRadius: 7 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} style={{ flex: 1, padding: '13px', background: '#1E2235', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {isEdit ? 'Mettre à jour' : 'Créer le créneau'}
          </button>
          {isEdit && (
            <button onClick={onRemove} style={{ padding: '13px 16px', background: '#FFF0F0', color: '#DC3545', border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
const PlanningView = () => {
  const { staff, functions, taskTypes, teams, schedules, setSchedules, loadWeekSchedules, planningFocus, setPlanningFocus, settings, publicHolidays, schoolHolidays } = useApp();
  const ttMap = useMemo(() => Object.fromEntries((taskTypes||[]).map(t => [t.slug, t])), [taskTypes]);
  const isMobile  = useIsMobile();
  const isTouch   = useIsTouch();
  const [wk,       setWk]      = useState(0);
  const [activeFn, setActiveFn] = useState(() => functions[0]?.slug || '');
  const [mode,     setMode]    = useState('fn');
  // États mode tactile
  const [touchDay,   setTouchDay]   = useState(todayDayIdx);
  const [touchModal, setTouchModal] = useState(null); // null | {type:'add',start,end} | {type:'edit',span}
  const [dragMode,   setDragMode]   = useState(false); // basculer vers drag & drop sur tablette
  const [highlightStaffId, setHighlightStaffId] = useState(null);
  // Modale détail/édition créneau
  const [spanDetailModal, setSpanDetailModal] = useState(null);
  // { span, dayIndex, fn, editable }

  const panelDragStaff = useRef(null);
  const [dragOverDay,  setDragOverDay]  = useState(null);
  const interact  = useRef(null);
  const [ghost,   setGhost]   = useState(null);
  const colRefs   = useRef({});
  const saveTimer = useRef(null);

  // ── Contraintes horaires (depuis settings) ───────────────────
  const constraintMap = useMemo(
    () => Object.fromEntries((settings || []).map(s => [s.key, s.value])),
    [settings]
  );
  const maxAmpEnabled = constraintMap['planning_max_amplitude_enabled'] === 'true';
  const maxAmpH       = parseFloat(constraintMap['planning_max_amplitude_hours'] || '12');
  const minRestEnabled= constraintMap['planning_min_rest_enabled'] === 'true';
  const minRestH      = parseFloat(constraintMap['planning_min_rest_hours'] || '11');

  // Créneaux de cours : slugs de fonctions pour lesquelles les afficher
  const courseSlotsFns = useMemo(() => {
    try { return JSON.parse(constraintMap['planning_course_slots_fns'] || '[]'); } catch { return []; }
  }, [constraintMap]);

  const [constraintWarn, setConstraintWarn] = useState(null);
  useEffect(() => {
    if (!constraintWarn) return;
    const t = setTimeout(() => setConstraintWarn(null), 6000);
    return () => clearTimeout(t);
  }, [constraintWarn]);

  // ── Templates & cours (chargés localement) ───────────────────
  const [showTemplates,  setShowTemplates]  = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseSlots,    setCourseSlots]    = useState([]);
  const [assignments,    setAssignments]    = useState({});  // { [courseSlotId]: [staffId, ...] }
  const [courseGroupModal, setCourseGroupModal] = useState(null); // null | { courses }
  const [unavailabilities, setUnavailabilities] = useState([]);
  const [leaves,           setLeaves]           = useState([]);
  const [declarations,     setDeclarations]     = useState([]);

  const loadCourseSlots = useCallback(async () => {
    try { const r = await api.get('/course-slots'); setCourseSlots(Array.isArray(r.data) ? r.data : []); }
    catch (_) {}
  }, []);

  const loadAssignments = useCallback(async (week, fnId) => {
    if (!fnId) return;
    try {
      const r = await api.get(`/course-slots/assignments?week=${week}&function_id=${fnId}`);
      const map = {};
      for (const a of (r.data || [])) {
        if (!map[a.course_slot_id]) map[a.course_slot_id] = [];
        map[a.course_slot_id].push(a.staff_id);
      }
      setAssignments(map);
    } catch (_) {}
  }, []);

  useEffect(() => { loadCourseSlots(); }, []);

  useEffect(() => { if (!activeFn && functions.length) setActiveFn(functions[0].slug); }, [functions]);

  const currentWeek = useMemo(() => weekStart(wk), [wk]);

  useEffect(() => { loadWeekSchedules(currentWeek); }, [currentWeek]);

  /* ── Réaction au planningFocus (notification congé → deep link) ── */
  useEffect(() => {
    if (!planningFocus) return;
    const focusMon = new Date(planningFocus.week + 'T12:00:00');
    const nowMon   = new Date();
    const nowDay   = nowMon.getDay();
    nowMon.setDate(nowMon.getDate() + (nowDay === 0 ? -6 : 1 - nowDay));
    nowMon.setHours(12, 0, 0, 0);
    const diffWeeks = Math.round((focusMon - nowMon) / (7 * 24 * 3600 * 1000));
    setWk(diffWeeks);
    setHighlightStaffId(planningFocus.staffId ?? null);
    setPlanningFocus(null); // consommer le focus
    const t = setTimeout(() => setHighlightStaffId(null), 8000);
    return () => clearTimeout(t);
  }, [planningFocus]);
  const dates = useMemo(() => {
    const mon = new Date(currentWeek + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  }, [currentWeek]);
  const weekLabel = `${dates[0].getDate()} – ${dates[6].getDate()} ${dates[6].toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;
  const fn = functions.find(f => f.slug === activeFn);
  const activeFnId = fn?.id ?? null;
  useEffect(() => { loadAssignments(currentWeek, activeFnId); }, [currentWeek, activeFnId]);

  // M2 — protection race condition : ignore les réponses d'une semaine périmée
  useEffect(() => {
    let ignore = false;
    const mon = new Date(currentWeek + 'T12:00:00');
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const to = sun.toISOString().slice(0, 10);
    api.get(`/unavailabilities?from=${currentWeek}&to=${to}`)
      .then(d => { if (!ignore) setUnavailabilities(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []); })
      .catch(() => {});
    api.get(`/leaves?status=approved&from=${currentWeek}&to=${to}`)
      .then(d => { if (!ignore) setLeaves(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []); })
      .catch(() => {});
    api.get(`/hour-declarations?from=${currentWeek}&to=${to}`)
      .then(d => { if (!ignore) setDeclarations(Array.isArray(d.data) ? d.data : []); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [currentWeek]);
  // Tâches filtrées pour la fonction active (communes + spécifiques à cette fn)
  const fnTaskTypes = useMemo(
    () => (taskTypes||[]).filter(t => t.function_id == null || t.function_id === activeFnId),
    [taskTypes, activeFnId]
  );

  // Bouton Cours visible seulement si des membres de l'équipe active ont show_course_slots
  const showCourseBtn = useMemo(() => {
    if (!fn) return false;
    const courseTeamIds = new Set((teams||[]).filter(t => t.show_course_slots).map(t => t.id));
    if (courseTeamIds.size === 0) return false;
    return staff.some(s =>
      s.functions?.includes(activeFn) &&
      (s.team_ids || []).some(tid => courseTeamIds.has(tid))
    );
  }, [fn, activeFn, staff, teams]);

  const spans = useMemo(() => cloneSpans(schedules[currentWeek]?.[activeFn]), [schedules, currentWeek, activeFn]);

  const allSpans = useMemo(() => {
    const out = Array.from({ length: 7 }, () => []);
    const weekData = schedules[currentWeek] || {};
    for (const f of functions)
      for (let d = 0; d < 7; d++)
        for (const sp of (weekData[f.slug]?.[d] ?? weekData[f.slug]?.[String(d)] ?? []))
          if (!sp.isDeclaration) out[d].push({ ...sp, fn: f }); // isDeclaration géré séparément
    // Déclarations d'heures reliquat (pending + approved)
    const weekMon = new Date(currentWeek + 'T12:00:00');
    for (const decl of declarations) {
      if (!['pending', 'approved'].includes(decl.status)) continue;
      const staffMember = staff.find(s => s.id === decl.staff_id);
      if (!staffMember) continue;
      const declDate = new Date(decl.date + 'T12:00:00');
      const dayIdx = Math.round((declDate - weekMon) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) continue;
      out[dayIdx].push({
        staffId:       decl.staff_id,
        start:         decl.hour_start,
        end:           decl.hour_end,
        fn:            null,
        taskType:      null,
        isDeclaration: true,
        declId:        decl.id,
        declStatus:    decl.status,
      });
    }
    return out;
  }, [schedules, currentWeek, functions, declarations, staff]);

  const fnStaff = staff.filter(s => s.functions?.includes(activeFn));

  // ── Vérification des contraintes horaires ────────────────────
  // Retourne un tableau de messages de violation (vide = OK)
  const checkConstraints = useCallback((staffId, dayIndex, newStart, newEnd, excludeOrigSpan = null) => {
    const violations = [];

    // 1. Amplitude journalière max
    if (maxAmpEnabled) {
      // Tous les créneaux du salarié ce jour (toutes fonctions), sauf celui en cours de déplacement
      const daySlots = allSpans[dayIndex]
        .filter(sp => sp.staffId === staffId)
        .filter(sp => excludeOrigSpan
          ? !(sp.fn?.slug === activeFn && sp.start === excludeOrigSpan.start)
          : true
        );
      const allStarts = [...daySlots.map(sp => sp.start), newStart];
      const allEnds   = [...daySlots.map(sp => sp.end),   newEnd];
      const amplitude = Math.max(...allEnds) - Math.min(...allStarts);
      if (amplitude > maxAmpH) {
        const s0 = Math.min(...allStarts);
        const e0 = Math.max(...allEnds);
        violations.push(
          `Amplitude journalière dépassée : ${fmtTime(s0)} → ${fmtTime(e0)} = ${amplitude.toFixed(1)}h (maximum : ${maxAmpH}h)`
        );
      }
    }

    // 2. Repos minimum entre deux postes (inter-journée uniquement)
    // La règle des 11h de repos quotidien s'applique entre deux journées de travail,
    // pas entre deux créneaux d'une même journée (travail en split shift autorisé).
    if (minRestEnabled) {
      const newStartAbs = dayIndex * 24 + newStart;
      const newEndAbs   = dayIndex * 24 + newEnd;
      for (let d = 0; d < 7; d++) {
        if (d === dayIndex) continue; // même jour → pas de contrainte de repos inter-journée
        for (const sp of allSpans[d]) {
          if (sp.staffId !== staffId) continue;
          // Exclure le créneau déplacé
          if (excludeOrigSpan && sp.fn?.slug === activeFn && sp.start === excludeOrigSpan.start) continue;
          const spStartAbs = d * 24 + sp.start;
          const spEndAbs   = d * 24 + sp.end;
          // Repos entre fin du créneau existant et début du nouveau
          if (spEndAbs <= newStartAbs) {
            const gap = newStartAbs - spEndAbs;
            if (gap < minRestH) {
              const dayName = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][d];
              violations.push(
                `Repos insuffisant : ${gap.toFixed(1)}h depuis la fin de poste à ${fmtTime(sp.end)} (${dayName}) — minimum requis : ${minRestH}h`
              );
            }
          }
          // Repos entre fin du nouveau et début d'un créneau existant
          if (newEndAbs <= spStartAbs) {
            const gap = spStartAbs - newEndAbs;
            if (gap < minRestH) {
              const dayName = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][d];
              violations.push(
                `Repos insuffisant : ${gap.toFixed(1)}h avant la prise de poste à ${fmtTime(sp.start)} (${dayName}) — minimum requis : ${minRestH}h`
              );
            }
          }
        }
      }
    }

    // 3. Indisponibilité déclarée
    if (dates && dates[dayIndex]) {
      const dateStr = dates[dayIndex].toISOString().slice(0, 10);
      for (const u of unavailabilities) {
        if (u.staff_id !== staffId) continue;
        if (u.status === 'refused') continue;
        if (u.date_start > dateStr || u.date_end < dateStr) continue;
        const overlapAll     = !!u.all_day;
        const overlapPartial = !u.all_day && u.hour_start < newEnd && u.hour_end > newStart;
        if (overlapAll || overlapPartial) {
          violations.push(
            `⚠️ Indisponibilité${u.status === 'pending' ? ' (en attente)' : ''} déclarée${ u.all_day ? ' toute la journée' : ` de ${fmtTime(u.hour_start)} à ${fmtTime(u.hour_end)}`}`
          );
          break;
        }
      }

      // 4. Congé approuvé
      for (const l of leaves) {
        if (l.staff_id !== staffId) continue;
        if (l.start_date > dateStr || l.end_date < dateStr) continue;
        violations.push(`🌿 Attribution impossible : congé approuvé${l.type_label ? ` (${l.type_label})` : ''} sur cette période`);
        break;
      }
    }

    return violations;
  }, [allSpans, activeFn, maxAmpEnabled, maxAmpH, minRestEnabled, minRestH, unavailabilities, leaves, dates]);

  // ── Sauvegarde debounced ──────────────────────────────────────
  const debounceSave = useCallback((fnSlug, newSpans) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await api.post(`/schedules/week/${currentWeek}/function/${fnSlug}`, { spans: newSpans }); }
      catch (e) { console.error('[PlanningView] Erreur sauvegarde', e); }
    }, 600);
  }, [currentWeek]);

  const updateSpans = useCallback((newSpans) => {
    setSchedules(prev => {
      debounceSave(activeFn, newSpans);
      return { ...prev, [currentWeek]: { ...(prev[currentWeek] || {}), [activeFn]: newSpans } };
    });
  }, [activeFn, currentWeek, debounceSave, setSchedules]);

  const removeSpan = useCallback((dayIndex, span) => {
    const next = cloneSpans(spans);
    next[dayIndex] = next[dayIndex].filter(s => !(s.staffId === span.staffId && s.start === span.start));
    updateSpans(next);
  }, [spans, updateSpans]);

  const onTaskTypeChange = useCallback((dayIndex, span, newType) => {
    const nx = cloneSpans(spans);
    const i  = nx[dayIndex].findIndex(s => s.staffId === span.staffId && s.start === span.start);
    if (i !== -1) { nx[dayIndex][i] = { ...nx[dayIndex][i], taskType: newType }; updateSpans(nx); }
  }, [spans, updateSpans]);

  // ── Drag depuis panneau ───────────────────────────────────────
  const onPanelDragStart = useCallback((e, staffId) => {
    panelDragStaff.current = staffId;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', String(staffId));
  }, []);

  const getYFromClientY = useCallback((clientY, dayIndex) => {
    const el = colRefs.current[dayIndex];
    if (!el) return 0;
    return Math.max(0, clientY - el.getBoundingClientRect().top);
  }, []);

  const onColumnDrop = useCallback((dayIndex, clientY) => {
    const staffId = panelDragStaff.current;
    setDragOverDay(null);
    if (!staffId || mode !== 'fn') return;
    const y        = getYFromClientY(clientY, dayIndex);
    const dropTime = yToTime(y);

    // Snap automatique sur un créneau de cours si applicable
    const dayCourses = courseSlotsFns.includes(activeFn)
      ? courseSlots.filter(cs => cs.fn_slug === activeFn && cs.day_of_week === dayIndex)
      : [];
    const match      = dayCourses.find(cs => dropTime >= cs.hour_start && dropTime < cs.hour_end);

    const start        = match ? match.hour_start : dropTime;
    const end          = match ? match.hour_end   : Math.min(DAY_END, dropTime + 1);
    const courseSlotId = match ? match.id         : null;

    // ── Vérification des contraintes ──
    const violations = checkConstraints(staffId, dayIndex, start, end);
    if (violations.length > 0) { setConstraintWarn(violations); return; }

    const next = cloneSpans(spans);
    next[dayIndex] = [...next[dayIndex], { staffId, start, end, courseSlotId }];
    updateSpans(next);
  }, [mode, spans, updateSpans, getYFromClientY, courseSlots, activeFn, checkConstraints, setConstraintWarn]);

  // ── Déplacement d'un bloc existant ───────────────────────────
  const onMoveStart = useCallback((e, span, dayIndex) => {
    if (mode !== 'fn') return;
    e.preventDefault();
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    interact.current = { type: 'move', staffId: span.staffId, dayIndex, span, origY: e.clientY, origStart: span.start, origEnd: span.end };
    setGhost({ dayIndex, start: span.start, end: span.end, staffId: span.staffId });
  }, [mode]);

  // ── Resize d'un bloc ─────────────────────────────────────────
  const onResizeStart = useCallback((e, span, dayIndex) => {
    e.preventDefault();
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    interact.current = { type: 'resize', staffId: span.staffId, dayIndex, span, origY: e.clientY, origEnd: span.end };
    setGhost({ dayIndex, start: span.start, end: span.end, staffId: span.staffId });
  }, []);

  // ── Gestionnaires globaux mousemove/mouseup ───────────────────
  useEffect(() => {
    const onMove = (e) => {
      const cur = interact.current;
      if (!cur) return;
      if (cur.type === 'resize') {
        const dy = e.clientY - cur.origY;
        const newEnd = Math.round(Math.max(cur.span.start + 0.25, Math.min(DAY_END, cur.origEnd + dy / HOUR_H)) * 4) / 4;
        setGhost(g => g ? { ...g, end: newEnd } : null);
      } else if (cur.type === 'move') {
        const dy  = e.clientY - cur.origY;
        const dur = cur.origEnd - cur.origStart;
        const ns  = Math.round(Math.max(DAY_START, Math.min(DAY_END - dur, cur.origStart + dy / HOUR_H)) * 4) / 4;
        setGhost(g => g ? { ...g, start: ns, end: ns + dur } : null);
      }
    };
    const onUp = (e) => {
      const cur = interact.current;
      if (!cur) return;
      interact.current = null;
      setGhost(null);
      if (cur.type === 'resize') {
        const dy = e.clientY - cur.origY;
        const ne = Math.round(Math.max(cur.span.start + 0.25, Math.min(DAY_END, cur.origEnd + dy / HOUR_H)) * 4) / 4;
        // Vérification contraintes (exclure la position d'origine)
        const viol = checkConstraints(cur.staffId, cur.dayIndex, cur.span.start, ne, cur.span);
        if (viol.length > 0) { setConstraintWarn(viol); return; }
        const nx = cloneSpans(spans);
        const i  = nx[cur.dayIndex].findIndex(s => s.staffId === cur.span.staffId && s.start === cur.span.start);
        if (i !== -1) { nx[cur.dayIndex][i] = { ...nx[cur.dayIndex][i], end: ne }; updateSpans(nx); }
      } else if (cur.type === 'move') {
        const dy  = e.clientY - cur.origY;
        const dur = cur.origEnd - cur.origStart;
        const ns  = Math.round(Math.max(DAY_START, Math.min(DAY_END - dur, cur.origStart + dy / HOUR_H)) * 4) / 4;
        // Vérification contraintes (exclure la position d'origine)
        const viol = checkConstraints(cur.staffId, cur.dayIndex, ns, ns + dur, cur.span);
        if (viol.length > 0) { setConstraintWarn(viol); return; }
        const nx  = cloneSpans(spans);
        const i   = nx[cur.dayIndex].findIndex(s => s.staffId === cur.span.staffId && s.start === cur.span.start);
        if (i !== -1) { nx[cur.dayIndex][i] = { ...nx[cur.dayIndex][i], start: ns, end: ns + dur }; updateSpans(nx); }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [spans, updateSpans, checkConstraints, setConstraintWarn]);

  /* ─── Vue globale — colonne lecture seule ─────────────────── */
  const AllSpansColumn = ({ dayIndex, isToday, isWeekend }) => {
    const daySpans = allSpans[dayIndex] || [];
    const dateStr  = dates[dayIndex].toISOString().slice(0, 10);

    // Cours : toutes fonctions autorisées (courseSlotsFns)
    const dayCourses = courseSlots.filter(cs =>
      courseSlotsFns.includes(cs.fn_slug) && cs.day_of_week === dayIndex
    );

    const placed = useMemo(() => {
      const courseGroups = groupOverlapping(dayCourses);
      const allItems = [
        ...courseGroups.map(g => ({
          type: 'course', group: g,
          start: Math.min(...g.map(c => c.hour_start)),
          end:   Math.max(...g.map(c => c.hour_end)),
        })),
        ...daySpans.map(sp => ({ type: 'span', sp, start: sp.start, end: sp.end })),
      ];
      if (!allItems.length) return { result: [] };
      const sorted = [...allItems].sort((a, b) => a.start - b.start || a.end - b.end);
      // Clustering par chevauchement transitif → colCount local par cluster
      const clusterIdx = new Array(sorted.length).fill(-1);
      const clusters   = [];
      for (let i = 0; i < sorted.length; i++) {
        let assigned = -1;
        for (let c = 0; c < clusters.length; c++) {
          if (!clusters[c].length) continue;
          const maxEnd = Math.max(...clusters[c].map(j => sorted[j].end));
          if (sorted[i].start < maxEnd) {
            if (assigned === -1) { assigned = c; clusters[c].push(i); }
            else { for (const j of clusters[c]) { clusters[assigned].push(j); clusterIdx[j] = assigned; } clusters[c] = []; }
          }
        }
        if (assigned === -1) { assigned = clusters.length; clusters.push([i]); }
        clusterIdx[i] = assigned;
      }
      const colAssign   = new Array(sorted.length);
      const colCountArr = new Array(sorted.length);
      for (const cluster of clusters) {
        if (!cluster.length) continue;
        const cs = [...cluster].sort((a, b) => sorted[a].start - sorted[b].start);
        const cols = [];
        for (const i of cs) {
          let col = cols.findIndex(end => end <= sorted[i].start);
          if (col === -1) { cols.push(sorted[i].end); col = cols.length - 1; } else cols[col] = sorted[i].end;
          colAssign[i] = col;
        }
        const cc = Math.max(1, cols.length);
        for (const i of cluster) colCountArr[i] = cc;
      }
      const result = sorted.map((item, i) => ({ ...item, col: colAssign[i], colCount: colCountArr[i] }));
      return { result };
    }, [daySpans, dayCourses]);

    return (
      <div style={{ flex: 1, position: 'relative', height: TOTAL_H, background: isToday ? '#FFFCF9' : isWeekend ? '#FDFBF8' : '#fff', borderLeft: '2px solid #D0CBC2' }}>
        {HOUR_LABELS.slice(0, -1).map(h => (
          <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - DAY_START) * HOUR_H, borderTop: '1px solid #F0EDE8', pointerEvents: 'none' }}>
            {[1,2,3].map(q => <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q * SLOT_H, borderTop: '1px dashed #F5F2ED', pointerEvents: 'none' }} />)}
          </div>
        ))}
        {/* Zones d'indisponibilité hachurées */}
        {unavailabilities
          .filter(u => u.status !== 'refused' && u.date_start <= dateStr && u.date_end >= dateStr)
          .map((u, i) => {
            const top    = u.all_day ? 0 : Math.max(0, timeToY(u.hour_start));
            const bottom = u.all_day ? TOTAL_H : Math.max(top + SLOT_H, timeToY(u.hour_end));
            const isP    = u.status === 'pending';
            return (
              <div key={`unavail-${i}`}
                title={`${u.firstname} ${u.lastname}${u.note ? ' — ' + u.note : ''}${isP ? ' (en attente)' : ''}`}
                style={{
                  position: 'absolute', left: 0, right: 0, top, height: bottom - top,
                  background: isP ? 'rgba(251,191,36,0.07)' : 'rgba(229,231,235,0.35)',
                  backgroundImage: isP
                    ? 'repeating-linear-gradient(45deg,rgba(251,191,36,0.3),rgba(251,191,36,0.3) 3px,transparent 3px,transparent 10px)'
                    : 'repeating-linear-gradient(45deg,#D1D5DB,#D1D5DB 3px,transparent 3px,transparent 10px)',
                  zIndex: 1, pointerEvents: 'none',
                }} />
            );
          })
        }
        {/* Zones de congés approuvés hachurées (vert) */}
        {leaves
          .filter(l => l.start_date <= dateStr && l.end_date >= dateStr)
          .map((l, i) => (
            <div key={`leave-${i}`}
              title={`${l.staff_name || ''} — Congé approuvé${l.type_label ? ' : ' + l.type_label : ''}`}
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: TOTAL_H,
                background: 'rgba(16,185,129,0.06)',
                backgroundImage: 'repeating-linear-gradient(135deg,rgba(16,185,129,0.35),rgba(16,185,129,0.35) 3px,transparent 3px,transparent 10px)',
                zIndex: 1, pointerEvents: 'none',
              }} />
          ))
        }
        {/* Blocs cours + spans — placement unifié côte à côte */}
        {placed.result.map((item, idx) => {
          if (item.type === 'course') {
            return (
              <CourseSlotCompactBlock
                key={`g${idx}-${item.group[0].id}`}
                courses={item.group}
                assignments={assignments}
                onOpen={() => setCourseGroupModal({ courses: item.group })}
                col={item.col}
                colCount={item.colCount}
              />
            );
          }
          const { sp } = item;
          const s = staff.find(x => x.id === sp.staffId);
          if (!s) return null;
          const top = timeToY(sp.start);
          const h   = Math.max(SLOT_H, timeToY(sp.end) - top);
          const w   = item.colCount > 1 ? `calc(${100 / item.colCount}% - 2px)` : 'calc(100% - 4px)';
          const l   = item.colCount > 1 ? `calc(${item.col * 100 / item.colCount}% + 1px)` : '2px';

          // ── Déclaration reliquat ──────────────────────────────
          if (sp.isDeclaration) {
            const isPending  = sp.declStatus === 'pending';
            const isApproved = sp.declStatus === 'approved';
            const declBg     = isPending ? '#FEF9C3' : isApproved ? '#DCFCE7' : '#F3F4F6';
            const declBorder = isPending ? '#A16207' : isApproved ? '#15803D' : '#9CA3AF';
            return (
              <div key={`decl-${sp.declId}`}
                onClick={() => setSpanDetailModal({ span: sp, dayIndex, fn: sp.fn || null, editable: false })}
                style={{
                position: 'absolute', top, left: l, width: w, height: h,
                background: declBg, border: `1.5px dashed ${declBorder}`,
                borderLeft: `3.5px solid ${declBorder}`,
                borderRadius: 5, overflow: 'hidden', padding: '2px 5px',
                fontSize: 9, fontWeight: 600, boxSizing: 'border-box', zIndex: 2,
                cursor: 'pointer',
              }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                  <span style={{ fontSize: Math.max(7, Math.min(11, h * 0.20)), fontWeight: 900, letterSpacing: '0.04em', color: declBorder, opacity: 0.28, transform: 'rotate(-18deg)', textTransform: 'uppercase', userSelect: 'none', fontFamily: '"Arial Black", Arial, sans-serif', whiteSpace: 'nowrap' }}>H.salarié</span>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', color: declBorder }}>
                  <span style={{ fontSize: 8 }}>⏰</span>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800 }}>{s.initials[0]}</div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
                </div>
                {h >= 28 && <div style={{ position: 'relative', fontSize: 8, color: declBorder, opacity: .8 }}>{fmtTime(sp.start)}–{fmtTime(sp.end)}</div>}
              </div>
            );
          }

          return (
            <div key={`${sp.staffId}-${sp.start}-${sp.fn?.slug}`}
              onClick={() => setSpanDetailModal({ span: sp, dayIndex, fn: sp.fn || null, editable: false })}
              style={{ position: 'absolute', top, left: l, width: w, height: h, background: `${s.color}18`, border: `1.5px solid ${s.color}60`, borderRadius: 5, overflow: 'hidden', boxSizing: 'border-box', zIndex: 2, cursor: 'pointer' }}>
              <div style={{ padding: '1px 4px', display: 'flex', alignItems: 'center', gap: 2 }}>
                {sp.fn && <span style={{ fontSize: 8 }}>{sp.fn.icon}</span>}
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800 }}>{s.initials[0]}</div>
                <span style={{ fontSize: 9, fontWeight: 700, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ─── Navigation tactile (day) ────────────────────────────── */
  const touchPrevDay = useCallback(() => {
    if (touchDay > 0) { setTouchDay(d => d - 1); }
    else { setTouchDay(6); setWk(w => w - 1); }
  }, [touchDay]);
  const touchNextDay = useCallback(() => {
    if (touchDay < 6) { setTouchDay(d => d + 1); }
    else { setTouchDay(0); setWk(w => w + 1); }
  }, [touchDay]);

  /* ─── TOUCH (mobile + tablette <1024px, sauf si dragMode) ─── */
  if (isTouch && !dragMode) {
    const touchDate   = dates[touchDay];
    const isToday     = touchDate?.toDateString() === new Date().toDateString();
    const daySpans    = (spans[touchDay] || []);
    const dayCourses  = courseSlotsFns.includes(activeFn)
      ? courseSlots.filter(cs => cs.fn_slug === activeFn && cs.day_of_week === touchDay)
      : [];
    const touchDayLabel = touchDate
      ? touchDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : '';
    const dayNavBtn = { padding: '8px 14px', background: '#F5F3EF', border: '1px solid #E4E0D8', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: '#1E2235' };

    // Calcul des positions de spans (évite chevauchements)
    const sorted = [...daySpans].sort((a, b) => a.start - b.start);
    const cols = []; const placed = sorted.map(sp => {
      let col = cols.findIndex(end => end <= sp.start);
      if (col === -1) { cols.push(sp.end); col = cols.length - 1; } else cols[col] = sp.end;
      return { sp, col };
    });
    const colCount = Math.max(1, cols.length);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Toolbar tactile */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #ECEAE4', background: '#fff', flexShrink: 0 }}>
          {/* Ligne 1: Titre + toggle drag (tablette) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235' }}>Planning</div>
              <div style={{ fontSize: 10, color: '#9B9890' }}>{weekLabel}</div>
            </div>
            <div style={{ flex: 1 }} />
            {!isMobile && (
              <button onClick={() => setDragMode(true)} style={{
                padding: '6px 12px', background: '#F0EDE8', border: '1px solid #E4E0D8',
                borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                color: '#5B5855', display: 'flex', alignItems: 'center', gap: 5,
              }}>🖱️ Souris/stylet</button>
            )}
          </div>
          {/* Ligne 2: Chips fonctions */}
          {mode === 'fn' && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {functions.map(f => (
                <button key={f.slug} onClick={() => setActiveFn(f.slug)} style={{
                  padding: '5px 11px', borderRadius: 20, border: `1.5px solid ${activeFn===f.slug?f.color:'#E4E0D8'}`,
                  background: activeFn===f.slug?(f.bg_color||'#F5F5F5'):'#fff',
                  color: activeFn===f.slug?f.color:'#9B9890', cursor: 'pointer',
                  fontSize: 11, fontWeight: activeFn===f.slug?700:400, fontFamily: 'inherit',
                }}>{f.icon} {f.name}</button>
              ))}
            </div>
          )}
          {/* Ligne 3: Navigation jour */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={touchPrevDay} style={dayNavBtn}>‹</button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#C5753A' : '#1E2235', textTransform: 'capitalize' }}>{touchDayLabel}</div>
            </div>
            <button onClick={touchNextDay} style={dayNavBtn}>›</button>
          </div>
        </div>

        {/* Avertissement contraintes */}
        {constraintWarn && (
          <div style={{ background: '#FFF0F0', borderBottom: '1px solid #FECACA', padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              {constraintWarn.map((v, i) => <div key={i} style={{ color: '#DC3545', fontSize: 12 }}>• {v}</div>)}
            </div>
            <button onClick={() => setConstraintWarn(null)} style={{ background: 'none', border: 'none', color: '#9B9890', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Grille jour tactile */}
        <div style={{ flex: 1, overflow: 'auto', background: '#FAFAF8' }}>
          <div style={{ display: 'flex', minHeight: TOTAL_H }}>
            {/* Axe horaire */}
            <div style={{ width: 44, flexShrink: 0, position: 'relative', height: TOTAL_H, background: '#F5F3EF', borderRight: '1px solid #E4E0D8' }}>
              {HOUR_LABELS.slice(0, -1).map(h => (
                <div key={h} style={{ position: 'absolute', top: (h-DAY_START)*HOUR_H - 7, right: 6, fontSize: 9, color: '#B0ACA5', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}h</div>
              ))}
            </div>
            {/* Colonne jour (tappable) */}
            <div style={{ flex: 1, position: 'relative', height: TOTAL_H, background: isToday?'#FFFCF9':'#fff' }}
              onClick={e => {
                if (mode !== 'fn') return;
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const t = Math.round(Math.max(DAY_START, Math.min(DAY_END - 1, DAY_START + y / HOUR_H)) * 4) / 4;
                // Snap sur cours si applicable
                const match = dayCourses.find(cs => t >= cs.hour_start && t < cs.hour_end);
                const s = match ? match.hour_start : t;
                const en = match ? match.hour_end   : Math.min(DAY_END, t + 1);
                setTouchModal({ type: 'add', start: s, end: en });
              }}
            >
              {/* Lignes horaires */}
              {HOUR_LABELS.slice(0, -1).map(h => (
                <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h-DAY_START)*HOUR_H, borderTop: '1px solid #F0EDE8', pointerEvents: 'none' }}>
                  {[1,2,3].map(q => <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q*SLOT_H, borderTop: '1px dashed #F5F2ED', pointerEvents: 'none' }} />)}
                </div>
              ))}
              {/* Cours compacts (blocs groupés cliquables) */}
              {groupOverlapping(dayCourses).map((group, gi) => (
                <CourseSlotCompactBlock
                  key={`tg${gi}-${group[0].id}`}
                  courses={group}
                  assignments={assignments}
                  onOpen={() => setCourseGroupModal({ courses: group })}
                />
              ))}
              {/* Blocs existants */}
              {placed.map(({ sp, col }) => {
                const s = staff.find(x => x.id === sp.staffId);
                if (!s) return null;
                const top  = timeToY(sp.start);
                const h    = Math.max(SLOT_H * 2, timeToY(sp.end) - top);
                const w    = colCount > 1 ? `calc(${100/colCount}% - 3px)` : 'calc(100% - 4px)';
                const left = colCount > 1 ? `calc(${col*100/colCount}% + 2px)` : '2px';
                const tt   = sp.taskType ? ttMap[sp.taskType] : null;
                return (
                  <div key={`${sp.staffId}-${sp.start}`}
                    onClick={e => { e.stopPropagation(); setTouchModal({ type: 'edit', span: sp }); }}
                    style={{
                      position: 'absolute', top, left, width: w, height: h,
                      background: `${s.color}22`, border: `2px solid ${s.color}80`,
                      borderRadius: 8, overflow: 'hidden', boxSizing: 'border-box',
                      zIndex: 3, cursor: 'pointer', padding: '4px 7px',
                      touchAction: 'none',
                    }}
                  >
                    {tt && <div style={{ width: 3, position: 'absolute', left: 0, top: 0, bottom: 0, background: tt.color, borderRadius: '8px 0 0 8px' }} />}
                    <div style={{ paddingLeft: tt ? 5 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Avatar s={s} size={16} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.firstname || s.name}</span>
                      </div>
                      {(sp.end - sp.start) >= 0.5 && (
                        <div style={{ fontSize: 10, color: '#9B9890', marginTop: 1 }}>{fmtTime(sp.start)}–{fmtTime(sp.end)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Indicateur «touchez pour ajouter» (si pas de spans) — mode fn uniquement */}
              {mode === 'fn' && daySpans.length === 0 && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: '#C0BCB5', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>👆</div>
                  <div style={{ fontSize: 12 }}>Touchez la grille pour ajouter un créneau</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modale ajout/édition */}
        {touchModal && (
          <TouchSpanModal
            modal={touchModal}
            dayIndex={touchDay}
            fnStaff={fnStaff}
            staff={staff}
            activeFn={activeFn}
            courseSlots={dayCourses}
            taskTypes={fnTaskTypes}
            checkConstraints={checkConstraints}
            onSave={(staffId, start, end, taskType, courseSlotId) => {
              const next = cloneSpans(spans);
              if (touchModal.type === 'add') {
                next[touchDay] = [...(next[touchDay] || []), { staffId, start, end, taskType, courseSlotId }];
              } else {
                const i = next[touchDay].findIndex(s => s.staffId === touchModal.span.staffId && s.start === touchModal.span.start);
                if (i !== -1) next[touchDay][i] = { ...next[touchDay][i], staffId, start, end, taskType, courseSlotId };
              }
              updateSpans(next);
              setTouchModal(null);
            }}
            onRemove={() => {
              if (touchModal.type !== 'edit') return;
              removeSpan(touchDay, touchModal.span);
              setTouchModal(null);
            }}
            onClose={() => setTouchModal(null)}
          />
        )}

        {/* Modal gestion des créneaux de cours */}
        {showCourseModal && fn && (
          <CourseSlotModal fn={fn} courseSlots={courseSlots.filter(cs => cs.fn_slug === fn.slug)}
            onClose={() => setShowCourseModal(false)} onChanged={loadCourseSlots} />
        )}
        {/* Popup assignation moniteurs (Option C) */}
        {courseGroupModal && (
          <CourseGroupModal
            courses={courseGroupModal.courses}
            week={currentWeek}
            fnStaff={fnStaff}
            staff={staff}
            assignments={assignments}
            onClose={() => setCourseGroupModal(null)}
            onChanged={() => loadAssignments(currentWeek, activeFnId)}
          />
        )}
      </div>
    );
  }

  /* ─── DESKTOP (ou mode drag tablette) ─────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {isTouch && dragMode && (
        <div style={{ padding: '8px 18px', background: '#EBF0FE', borderBottom: '1px solid #C7D2F8', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#3B4FC4', flex: 1 }}>🖱️ Souris/stylet (glisser-déposer)</span>
          <button onClick={() => setDragMode(false)} style={{ padding: '4px 12px', background: '#fff', border: '1px solid #C7D2F8', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: '#3B4FC4', fontFamily: 'inherit' }}>
            Retour mode tactile
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid #ECEAE4', background: '#fff', flexShrink: 0 }}>

        {/* Ligne 1 : titre + toggle fn/all + nav semaine */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', whiteSpace: 'nowrap' }}>Planning</div>
            <div style={{ fontSize: 10, color: '#8B8880', whiteSpace: 'nowrap' }}>{weekLabel}</div>
          </div>
          <div style={{ display: 'flex', gap: 2, background: '#F5F3EF', borderRadius: 7, padding: 2, flexShrink: 0 }}>
            {[['fn','📋 Par fonction'],['all','👥 Vue globale']].map(([v,l]) => (
              <button key={v} onClick={() => setMode(v)} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode===v?'#fff':'transparent', color: mode===v?'#1E2235':'#9B9890', fontWeight: mode===v?600:400, fontSize: 11, boxShadow: mode===v?'0 1px 3px rgba(0,0,0,.1)':'none', whiteSpace: 'nowrap' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <Btn onClick={() => setWk(w => w-1)} small>◀</Btn>
            <Btn onClick={() => setWk(0)} small>Auj.</Btn>
            <Btn onClick={() => setWk(w => w+1)} small>▶</Btn>
          </div>
        </div>

        {/* Ligne 2 : chips fonctions + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Tout = Vue globale */}
          <button onClick={() => setMode('all')} style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${mode === 'all' ? '#1E2235' : '#E4E0D8'}`, background: mode === 'all' ? '#EEF2FF' : '#fff', color: mode === 'all' ? '#1E2235' : '#9B9890', cursor: 'pointer', fontSize: 11, fontWeight: mode === 'all' ? 700 : 400, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Tout</button>
          {functions.map(f => (
            <button key={f.slug} onClick={() => { setMode('fn'); setActiveFn(f.slug); }} style={{ padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${mode === 'fn' && activeFn===f.slug ? f.color : '#E4E0D8'}`, background: mode === 'fn' && activeFn===f.slug ? (f.bg_color||'#F5F5F5') : '#fff', color: mode === 'fn' && activeFn===f.slug ? f.color : '#9B9890', cursor: 'pointer', fontSize: 11, fontWeight: mode === 'fn' && activeFn===f.slug ? 700 : 400, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {f.icon} {f.name}
            </button>
          ))}
          {mode === 'fn' && fn && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }}>
              {showCourseBtn && <Btn onClick={() => { setShowCourseModal(true); setShowTemplates(false); }} small title="Gérer les créneaux de cours">🎓 Cours</Btn>}
              <Btn onClick={() => setShowTemplates(v => !v)} small style={{ background: showTemplates ? '#EBF0FE' : undefined, color: showTemplates ? '#5B75DB' : undefined }}>📋 Modèles</Btn>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Grille */}
        <div style={{ flex: 1, overflow: 'auto', background: '#FAFAF8', position: 'relative', userSelect: interact.current ? 'none' : 'auto' }}>
          {/* Header jours */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7,1fr)', position: 'sticky', top: 0, zIndex: 20, background: '#F5F3EF', borderBottom: '2px solid #E4E0D8' }}>
            <div />
            {DAYS.map((day, di) => {
              const date = dates[di]; const isToday = date.toDateString() === new Date().toDateString();
              const dateStr = date.toLocaleDateString('en-CA');
              const decos = getDayDecorations(dateStr, publicHolidays, schoolHolidays);
              return (
                <div key={day} style={{ padding: '8px 6px 6px', textAlign: 'center', background: decos.isHoliday ? 'rgba(239,68,68,0.07)' : decos.isSchoolHoliday ? 'rgba(99,102,241,0.06)' : isToday?'#FFF4EC':di>=5?'#F9F7F4':'transparent', borderLeft: '2px solid #D0CBC2' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: isToday?'#C5753A':'#9B9890', textTransform: 'uppercase' }}>{DAYS_SH[di]}</div>
                  <div style={{ fontSize: 15, fontWeight: isToday?800:600, color: isToday?'#C5753A':'#1E2235', lineHeight: 1.2, margin: '1px 0' }}>{date.getDate()}</div>
                  {decos.isHoliday && <div style={{ fontSize: 8, color: '#DC2626', lineHeight: 1.2, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔴 {decos.holidayLabel}</div>}
                  {decos.isSchoolHoliday && <div style={{ fontSize: 8, color: '#4F46E5', lineHeight: 1.2, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🏫 {decos.schoolLabel}</div>}
                </div>
              );
            })}
          </div>

          {/* Corps */}
          <div style={{ display: 'flex' }}>
            {/* Axe horaire */}
            <div style={{ width: 44, flexShrink: 0, position: 'relative', height: TOTAL_H, background: '#F5F3EF', borderRight: '1px solid #E4E0D8' }}>
              {HOUR_LABELS.slice(0,-1).map(h => (
                <div key={h} style={{ position: 'absolute', top: (h-DAY_START)*HOUR_H - 7, right: 6, fontSize: 9, color: '#B0ACA5', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}h</div>
              ))}
            </div>

            {/* Colonnes */}
            {DAYS.map((_, di) => {
              const date = dates[di]; const isToday = date.toDateString() === new Date().toDateString();
              if (mode === 'all') return <AllSpansColumn key={di} dayIndex={di} isToday={isToday} isWeekend={di>=5} />;
              return (
                <DayColumn
                  key={di}
                  dayIndex={di}
                  spans={spans[di] || []}
                  staff={staff}
                  mode={mode}
                  courseSlots={courseSlotsFns.includes(activeFn) ? courseSlots.filter(cs => cs.fn_slug === activeFn && cs.day_of_week === di) : []}
                  assignments={assignments}
                  onOpenCourseGroup={(courses) => setCourseGroupModal({ courses })}
                  onDragEnter={setDragOverDay}
                  onDragLeave={() => setDragOverDay(null)}
                  isDragOver={dragOverDay === di}
                  colRef={el => { if (el) colRefs.current[di] = el; }}
                  onMoveStart={onMoveStart}
                  onResizeStart={onResizeStart}
                  onRemove={removeSpan}
                  onTaskTypeChange={onTaskTypeChange}
                  isToday={isToday}
                  isWeekend={di >= 5}
                  highlightStaffId={highlightStaffId}
                  ttMap={ttMap}
                  activeFnId={activeFnId}
                  unavailabilities={[]}
                  leaves={leaves.filter(l => fnStaff.some(s => s.id === l.staff_id))}
                  dateStr={dates[di].toISOString().slice(0, 10)}
                  declSpans={declarations.filter(d => d.date === dates[di].toISOString().slice(0, 10))}
                  onSpanClick={(span, dIdx) => setSpanDetailModal({
                    span,
                    dayIndex: dIdx,
                    fn,
                    editable: mode === 'fn' && !span.isDeclaration,
                  })}
                  onDeclClick={(decl, dIdx) => setSpanDetailModal({
                    span: { start: decl.hour_start, end: decl.hour_end, staffId: decl.staff_id, taskType: null, isDeclaration: true, declStatus: decl.status, declId: decl.id },
                    dayIndex: dIdx,
                    fn: functions.find(f => f.slug === decl.function_slug) || null,
                    editable: false,
                  })}
                />
              );
            })}
          </div>

          {/* Ghost pendant interaction */}
          {ghost && (() => {
            const s = staff.find(x => x.id === ghost.staffId);
            if (!s) return null;
            const colEl     = colRefs.current[ghost.dayIndex];
            const bodyEl    = colEl?.parentElement;
            const colLeft   = (colEl && bodyEl) ? colEl.getBoundingClientRect().left - bodyEl.getBoundingClientRect().left : 0;
            const colW      = colEl?.offsetWidth || 0;
            const headerH   = 44;
            return (
              <div style={{ position: 'absolute', top: headerH + timeToY(ghost.start), left: 44 + colLeft, width: colW, height: Math.max(SLOT_H, timeToY(ghost.end) - timeToY(ghost.start)), background: `${s.color}30`, border: `2px dashed ${s.color}`, borderRadius: 5, pointerEvents: 'none', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{fmtTime(ghost.start)} → {fmtTime(ghost.end)}</span>
              </div>
            );
          })()}
        </div>

        {/* Panneau staff / Modèles */}
        {mode === 'fn' && showTemplates ? (
          <TemplatePanel
            fn={fn}
            currentWeek={currentWeek}
            spans={spans}
            onClose={() => setShowTemplates(false)}
            onApplied={async () => {
              try {
                const r = await api.get(`/schedules?week=${currentWeek}`);
                setSchedules(prev => ({ ...prev, [currentWeek]: r.data }));
              } catch (_) {}
            }}
          />
        ) : mode === 'fn' && (
          <div style={{ width: 220, background: '#fff', borderLeft: '1px solid #E4E0D8', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #F0EDE8' }}>
              {fn && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', background: fn.bg_color||'#F5F5F5', borderRadius: 7, border: `1px solid ${fn.color}30`, marginBottom: 7 }}>
                  <span style={{ fontSize: 15 }}>{fn.icon}</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: fn.color }}>{fn.name}</div>
                </div>
              )}
              <div style={{ fontSize: 11, color: '#9B9890', lineHeight: 1.5 }}>Glisser un salarié sur la grille.<br/><span style={{ fontSize: 10 }}>Tirer le bas du bloc pour ajuster la durée.</span></div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
              <div style={{ fontSize: 10, color: '#C0BCB5', textTransform: 'uppercase', letterSpacing: '.5px', padding: '3px 3px 5px', fontWeight: 700 }}>Habilités à ce poste</div>
              {fnStaff.length === 0 && <div style={{ fontSize: 11, color: '#C0BCB5', padding: '8px 4px', fontStyle: 'italic' }}>Aucun salarié assigné</div>}
              {fnStaff.map(s => {
                const h = totalHoursForStaff(spans, s.id);
                return (
                  <div key={s.id} draggable onDragStart={e => onPanelDragStart(e, s.id)}
                    style={{ padding: '7px 8px', borderRadius: 8, marginBottom: 4, border: '1.5px solid #ECEAE4', background: '#FAFAF8', cursor: 'grab' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Avatar s={s} size={22} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1E2235' }}>{s.firstname||s.name}</div>
                        <div style={{ fontSize: 9, color: '#9B9890' }}>{s.type==='renfort'?'Vacation':'Salarié'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: h>0?s.color:'#C0BCB5' }}>{h>0?`${h}h`:'–'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal gestion des créneaux de cours */}
      {showCourseModal && fn && (
        <CourseSlotModal
          fn={fn}
          courseSlots={courseSlots.filter(cs => cs.fn_slug === fn.slug)}
          onClose={() => setShowCourseModal(false)}
          onChanged={loadCourseSlots}
        />
      )}

      {/* Popup assignation moniteurs (Option C) */}
      {courseGroupModal && (
        <CourseGroupModal
          courses={courseGroupModal.courses}
          week={currentWeek}
          fnStaff={fnStaff}
          staff={staff}
          assignments={assignments}
          onClose={() => setCourseGroupModal(null)}
          onChanged={() => loadAssignments(currentWeek, activeFnId)}
        />
      )}

      {/* Toast contraintes horaires */}
      {constraintWarn && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: '#1E2235', color: '#fff', borderRadius: 10,
          padding: '12px 18px', fontSize: 12, maxWidth: 500, width: 'calc(100% - 48px)',
          boxShadow: '0 4px 24px rgba(0,0,0,.3)', display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Assignation refusée — contrainte horaire</div>
            {constraintWarn.map((v, i) => (
              <div key={i} style={{ color: '#FCA5A5', marginBottom: i < constraintWarn.length - 1 ? 3 : 0, lineHeight: 1.4 }}>• {v}</div>
            ))}
          </div>
          <button onClick={() => setConstraintWarn(null)}
            style={{ background: 'none', border: 'none', color: '#9B9890', cursor: 'pointer', fontSize: 16, padding: '0 0 0 6px', flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* Overlay de drop (captures drag depuis panneau) */}
      {dragOverDay !== null && DAYS.map((_, di) => {
        const col = colRefs.current[di];
        if (!col) return null;
        const r = col.getBoundingClientRect();
        return (
          <div key={di}
            onDragOver={e => { e.preventDefault(); setDragOverDay(di); }}
            onDrop={e => { e.preventDefault(); onColumnDrop(di, e.clientY); }}
            onDragLeave={() => setDragOverDay(null)}
            style={{ position: 'fixed', top: r.top, left: r.left, width: r.width, height: r.height, zIndex: 100, cursor: 'copy' }}
          />
        );
      })}

      {/* ── Modale détail / édition créneau ──────────────── */}
      {spanDetailModal && (() => {
        const { span, dayIndex, editable } = spanDetailModal;
        const sm  = staff.find(x => x.id === span.staffId);
        const fnObj = spanDetailModal.fn || null;
        const ttObj = span.taskType ? ttMap[span.taskType] : null;
        const cs  = span.courseSlotId ? courseSlots.find(c => c.id === span.courseSlotId) : null;
        return (
          <SpanDetailModal
            span={span}
            date={dates[dayIndex]}
            staffMember={sm}
            fn={fnObj}
            tt={ttObj}
            courseSlot={cs}
            taskTypes={taskTypes}
            onClose={() => setSpanDetailModal(null)}
            editable={editable}
            onSave={editable ? ({ start, end, taskType }) => {
              const violations = checkConstraints(span.staffId, dayIndex, start, end, span);
              if (violations.length > 0) return violations;
              const next = cloneSpans(spans);
              const i = next[dayIndex].findIndex(s => s.staffId === span.staffId && s.start === span.start);
              if (i !== -1) next[dayIndex][i] = { ...next[dayIndex][i], start, end, taskType: taskType || null };
              updateSpans(next);
              setSpanDetailModal(null);
              return null;
            } : undefined}
            onRemove={editable ? () => { removeSpan(dayIndex, span); setSpanDetailModal(null); } : undefined}
          />
        );
      })()}
    </div>
  );
};

export default PlanningView;
