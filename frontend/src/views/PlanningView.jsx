import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../App';
import { Btn } from '../components/common';
import api from '../api/client';

/* ── Injection CSS animation highlight (une seule fois) ──────── */
if (typeof document !== 'undefined' && !document.getElementById('spirit-highlight-style')) {
  const _st = document.createElement('style');
  _st.id = 'spirit-highlight-style';
  _st.textContent = `@keyframes spirit-pulse { 0%,100%{box-shadow:0 0 0 2px #C5753A80,0 0 8px #C5753A40} 50%{box-shadow:0 0 0 5px #C5753AA0,0 0 18px #C5753A60} }`;
  document.head.appendChild(_st);
}

const DAYS    = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SH = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Plage horaire : 7h → 22h
const DAY_START = 7;
const DAY_END   = 22;
const SLOT_H    = 14;   // px par quart d'heure
const HOUR_H    = SLOT_H * 4;
const TOTAL_H   = (DAY_END - DAY_START) * HOUR_H;
const HOUR_LABELS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

const yToTime  = (y) => Math.round(Math.max(DAY_START, Math.min(DAY_END, DAY_START + y / HOUR_H)) * 4) / 4;
const timeToY  = (t) => (t - DAY_START) * HOUR_H;
const fmtTime  = (t) => { const h = Math.floor(t); const m = Math.round((t - h) * 60); return `${h}h${m === 0 ? '' : String(m).padStart(2, '0')}`; };

/* ─── Types de tâches ouvreurs ──────────────────────────────── */
const TASK_TYPES = {
  permanent:       { label: 'Permanence',     icon: '🏬', color: '#5B75DB' },
  ouverture_blocs: { label: 'Ouvert. blocs',  icon: '🪨', color: '#E8820C' },
  ouverture_voies: { label: 'Ouvert. voies',  icon: '🧗', color: '#DC3545' },
  demontage:       { label: 'Démontage',      icon: '🔧', color: '#6B7280' },
};
const TASK_TYPE_KEYS = Object.keys(TASK_TYPES);

function useIsMobile() {
  const [v, set] = useState(() => window.innerWidth < 768);
  useEffect(() => { const h = () => set(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return v;
}

function weekStart(offset) {
  const now = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  return mon.toISOString().slice(0, 10);
}

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
const SpanBlock = ({ span, s, dayIndex, mode, onResizeStart, onMoveStart, onRemove, onTaskTypeChange, col, colCount, highlighted }) => {
  const [showTT, setShowTT] = useState(false);
  const top    = timeToY(span.start);
  const height = Math.max(SLOT_H, timeToY(span.end) - top);
  const dur    = span.end - span.start;
  const tt     = span.taskType ? TASK_TYPES[span.taskType] : null;
  const stripColor = tt ? tt.color : null;
  const w      = colCount > 1 ? `calc(${100 / colCount}% - 2px)` : 'calc(100% - 4px)';
  const left   = colCount > 1 ? `calc(${col * 100 / colCount}% + 1px)` : '2px';
  return (
    <div
      onMouseDown={e => mode === 'fn' && onMoveStart(e, span, dayIndex)}
      style={{ position: 'absolute', top, left, width: w, height,
        background: highlighted ? `${s.color}35` : `${s.color}22`,
        border: highlighted ? '2px solid #C5753A' : `1.5px solid ${s.color}80`,
        animation: highlighted ? 'spirit-pulse 1.6s ease-in-out infinite' : undefined,
        borderRadius: 5, overflow: 'visible', userSelect: 'none',
        cursor: mode === 'fn' ? 'grab' : 'default',
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
            <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemove(dayIndex, span); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', color: s.color, opacity: .5, fontSize: 9, lineHeight: 1, flexShrink: 0 }}>✕</button>
          )}
        </div>
        {dur >= 0.5 && <div style={{ fontSize: 8, color: s.color, opacity: .7, paddingLeft: 13 }}>{fmtTime(span.start)}–{fmtTime(span.end)}</div>}
        {/* Badge type de tâche */}
        {dur >= 0.75 && mode === 'fn' && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setShowTT(v => !v); }}
              style={{ marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 2, background: tt ? `${tt.color}18` : '#F0EDE8', border: `1px solid ${tt ? tt.color + '50' : '#E0DDD8'}`, borderRadius: 4, padding: '1px 4px', cursor: 'pointer', fontSize: 8, color: tt ? tt.color : '#9B9890', fontWeight: 600 }}
            >
              {tt ? `${tt.icon} ${tt.label}` : '⚙ tâche'}
            </div>
            {showTT && (
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid #E4E0D8', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.12)', padding: 4, minWidth: 130 }}
              >
                <div onClick={e => { e.stopPropagation(); onTaskTypeChange(dayIndex, span, null); setShowTT(false); }} style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4, color: '#9B9890', background: !span.taskType ? '#F5F3EF' : 'transparent' }}>— Aucune</div>
                {TASK_TYPE_KEYS.map(k => (
                  <div key={k} onClick={e => { e.stopPropagation(); onTaskTypeChange(dayIndex, span, k); setShowTT(false); }}
                    style={{ padding: '4px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4, color: TASK_TYPES[k].color, background: span.taskType === k ? `${TASK_TYPES[k].color}15` : 'transparent', fontWeight: span.taskType === k ? 700 : 400 }}>
                    {TASK_TYPES[k].icon} {TASK_TYPES[k].label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {mode === 'fn' && (
        <div onMouseDown={e => { e.stopPropagation(); onResizeStart(e, span, dayIndex); }}
          style={{ height: 6, background: `${s.color}40`, cursor: 'ns-resize', borderTop: `1px solid ${s.color}50`, flexShrink: 0 }} />
      )}
    </div>
  );
};

/* ─── Bande de cours en arrière-plan ────────────────────────── */
const CourseSlotBand = ({ cs }) => {
  const top = timeToY(cs.hour_start);
  const h   = Math.max(SLOT_H * 2, timeToY(cs.hour_end) - top);
  return (
    <div style={{
      position: 'absolute', top, left: 0, right: 0, height: h,
      background: cs.bg_color || '#EBF0FE',
      borderLeft: `4px solid ${cs.color}`,
      borderTop: `1px solid ${cs.color}40`,
      borderBottom: `1px solid ${cs.color}40`,
      opacity: .80, pointerEvents: 'none', zIndex: 1,
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      padding: '3px 6px 4px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: cs.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '.2px' }}>
        {cs.group_name}
        {cs.level && <span style={{ fontWeight: 500, opacity: .85, marginLeft: 4 }}>· {cs.level}</span>}
      </div>
      {cs.public_desc && h >= 40 && (
        <div style={{ fontSize: 9, color: cs.color, opacity: .75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cs.public_desc}</div>
      )}
    </div>
  );
};

/* ─── Colonne d'un jour ─────────────────────────────────────── */
const DayColumn = ({ dayIndex, spans, staff, mode, courseSlots, onDragEnter, onDragLeave, isDragOver, colRef, onMoveStart, onResizeStart, onRemove, onTaskTypeChange, isToday, isWeekend, highlightStaffId }) => {
  const placed = useMemo(() => {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const cols = [];
    const result = sorted.map(sp => {
      let col = cols.findIndex(end => end <= sp.start);
      if (col === -1) { cols.push(sp.end); col = cols.length - 1; } else cols[col] = sp.end;
      return { sp, col };
    });
    return { result, colCount: Math.max(1, cols.length) };
  }, [spans]);

  return (
    <div ref={colRef} onDragOver={e => { e.preventDefault(); onDragEnter(dayIndex); }} onDragLeave={onDragLeave}
      style={{ flex: 1, position: 'relative', height: TOTAL_H, background: isDragOver ? 'rgba(197,117,58,.07)' : isToday ? '#FFFCF9' : isWeekend ? '#FDFBF8' : '#fff', borderLeft: '1px solid #E8E5DF' }}>
      {/* Lignes heure */}
      {HOUR_LABELS.slice(0, -1).map(h => (
        <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - DAY_START) * HOUR_H, borderTop: '1px solid #F0EDE8', height: HOUR_H, pointerEvents: 'none' }}>
          {[1,2,3].map(q => <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q * SLOT_H, borderTop: '1px dashed #F5F2ED', pointerEvents: 'none' }} />)}
        </div>
      ))}
      {/* Bandes de cours */}
      {(courseSlots || []).map(cs => <CourseSlotBand key={cs.id} cs={cs} />)}
      {/* Blocs spans */}
      {placed.result.map(({ sp, col }) => {
        const s = staff.find(x => x.id === sp.staffId);
        if (!s) return null;
        return <SpanBlock key={`${sp.staffId}-${sp.start}-${col}`} span={sp} s={s} dayIndex={dayIndex} mode={mode} onResizeStart={onResizeStart} onMoveStart={onMoveStart} onRemove={onRemove} onTaskTypeChange={onTaskTypeChange} col={col} colCount={placed.colCount} highlighted={!!(highlightStaffId && sp.staffId === highlightStaffId)} />;
      })}
    </div>
  );
};

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
const PlanningView = () => {
  const { staff, functions, schedules, setSchedules, loadWeekSchedules, planningFocus, setPlanningFocus, settings } = useApp();
  const isMobile  = useIsMobile();
  const [wk,       setWk]      = useState(0);
  const [activeFn, setActiveFn] = useState(() => functions[0]?.slug || '');
  const [mode,     setMode]    = useState('fn');
  const [highlightStaffId, setHighlightStaffId] = useState(null);

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

  const loadCourseSlots = useCallback(async () => {
    try { const r = await api.get('/course-slots'); setCourseSlots(Array.isArray(r.data) ? r.data : []); }
    catch (_) {}
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

  const spans = useMemo(() => cloneSpans(schedules[currentWeek]?.[activeFn]), [schedules, currentWeek, activeFn]);

  const allSpans = useMemo(() => {
    const out = Array.from({ length: 7 }, () => []);
    const weekData = schedules[currentWeek] || {};
    for (const f of functions)
      for (let d = 0; d < 7; d++)
        for (const sp of (weekData[f.slug]?.[d] ?? weekData[f.slug]?.[String(d)] ?? []))
          out[d].push({ ...sp, fn: f });
    return out;
  }, [schedules, currentWeek, functions]);

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

    // 2. Repos minimum entre deux postes
    if (minRestEnabled) {
      const newStartAbs = dayIndex * 24 + newStart;
      const newEndAbs   = dayIndex * 24 + newEnd;
      for (let d = 0; d < 7; d++) {
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

    return violations;
  }, [allSpans, activeFn, maxAmpEnabled, maxAmpH, minRestEnabled, minRestH]);

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
    const dayCourses = courseSlots.filter(cs => cs.fn_slug === activeFn && cs.day_of_week === dayIndex);
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
    interact.current = { type: 'move', staffId: span.staffId, dayIndex, span, origY: e.clientY, origStart: span.start, origEnd: span.end };
    setGhost({ dayIndex, start: span.start, end: span.end, staffId: span.staffId });
  }, [mode]);

  // ── Resize d'un bloc ─────────────────────────────────────────
  const onResizeStart = useCallback((e, span, dayIndex) => {
    e.preventDefault();
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
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [spans, updateSpans, checkConstraints, setConstraintWarn]);

  /* ─── Vue globale — colonne lecture seule ─────────────────── */
  const AllSpansColumn = ({ dayIndex, isToday, isWeekend }) => {
    const daySpans = allSpans[dayIndex] || [];
    const placed = useMemo(() => {
      const sorted = [...daySpans].sort((a, b) => a.start - b.start);
      const cols = [];
      const result = sorted.map(sp => {
        let col = cols.findIndex(end => end <= sp.start);
        if (col === -1) { cols.push(sp.end); col = cols.length - 1; } else cols[col] = sp.end;
        return { sp, col };
      });
      return { result, colCount: Math.max(1, cols.length) };
    }, [daySpans]);

    return (
      <div style={{ flex: 1, position: 'relative', height: TOTAL_H, background: isToday ? '#FFFCF9' : isWeekend ? '#FDFBF8' : '#fff', borderLeft: '1px solid #E8E5DF' }}>
        {HOUR_LABELS.slice(0, -1).map(h => (
          <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - DAY_START) * HOUR_H, borderTop: '1px solid #F0EDE8', pointerEvents: 'none' }}>
            {[1,2,3].map(q => <div key={q} style={{ position: 'absolute', left: 0, right: 0, top: q * SLOT_H, borderTop: '1px dashed #F5F2ED', pointerEvents: 'none' }} />)}
          </div>
        ))}
        {placed.result.map(({ sp, col }) => {
          const s = staff.find(x => x.id === sp.staffId);
          if (!s) return null;
          const top = timeToY(sp.start);
          const h   = Math.max(SLOT_H, timeToY(sp.end) - top);
          const w   = placed.colCount > 1 ? `calc(${100 / placed.colCount}% - 2px)` : 'calc(100% - 4px)';
          const l   = placed.colCount > 1 ? `calc(${col * 100 / placed.colCount}% + 1px)` : '2px';
          return (
            <div key={`${sp.staffId}-${sp.start}-${sp.fn?.slug}`} style={{ position: 'absolute', top, left: l, width: w, height: h, background: `${s.color}18`, border: `1.5px solid ${s.color}60`, borderRadius: 5, overflow: 'hidden', boxSizing: 'border-box', zIndex: 2 }}>
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

  /* ─── MOBILE ──────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#9B9890', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🖥️</div>
        L'édition du planning est optimisée pour desktop.
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
          {[['fn','📋 Par fonction'],['all','👥 Vue globale']].map(([v,l]) => (
            <button key={v} onClick={() => setMode(v)} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode===v?'#fff':'transparent', color: mode===v?'#1E2235':'#9B9890', fontWeight: mode===v?600:400, fontSize: 11, boxShadow: mode===v?'0 1px 3px rgba(0,0,0,.1)':'none' }}>{l}</button>
          ))}
        </div>
        {mode === 'fn' && (
          <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
            {functions.map(f => (
              <button key={f.slug} onClick={() => setActiveFn(f.slug)} style={{ padding: '3px 9px', borderRadius: 20, border: `1.5px solid ${activeFn===f.slug?f.color:'#E4E0D8'}`, background: activeFn===f.slug?(f.bg_color||'#F5F5F5'):'#fff', color: activeFn===f.slug?f.color:'#9B9890', cursor: 'pointer', fontSize: 10, fontWeight: activeFn===f.slug?700:400, fontFamily: 'inherit' }}>
                {f.icon} {f.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 'auto' }}>
          {mode === 'fn' && fn && (
            <>
              <Btn onClick={() => { setShowCourseModal(true); setShowTemplates(false); }} small title="Gérer les créneaux de cours">🎓 Cours</Btn>
              <Btn onClick={() => setShowTemplates(v => !v)} small style={{ background: showTemplates ? '#EBF0FE' : undefined, color: showTemplates ? '#5B75DB' : undefined }}>📋 Modèles</Btn>
            </>
          )}
          <Btn onClick={() => setWk(w => w-1)} small>◀</Btn>
          <Btn onClick={() => setWk(0)} small>Auj.</Btn>
          <Btn onClick={() => setWk(w => w+1)} small>▶</Btn>
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
              return (
                <div key={day} style={{ padding: '8px 6px 6px', textAlign: 'center', background: isToday?'#FFF4EC':di>=5?'#F9F7F4':'transparent', borderLeft: '1px solid #E4E0D8' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: isToday?'#C5753A':'#9B9890', textTransform: 'uppercase' }}>{DAYS_SH[di]}</div>
                  <div style={{ fontSize: 15, fontWeight: isToday?800:600, color: isToday?'#C5753A':'#1E2235', lineHeight: 1.2, margin: '1px 0' }}>{date.getDate()}</div>
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
                  courseSlots={courseSlots.filter(cs => cs.fn_slug === activeFn && cs.day_of_week === di)}
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
    </div>
  );
};

export default PlanningView;
