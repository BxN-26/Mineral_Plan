import { useState, useEffect, useCallback } from 'react';

/* ── Helpers ─────────────────────────────────────────────────── */
const toTime = v => {
  const h = Math.floor(v), m = Math.round((v - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const fromTime = str => {
  const [h, m] = str.split(':').map(Number);
  return h + m / 60;
};
const durStr = (s, e) => {
  const d = e - s, h = Math.floor(d), m = Math.round((d - h) * 60);
  return h > 0 ? (m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m} min`;
};

/* ──────────────────────────────────────────────────────────────
  SpanDetailModal
  Props :
    span        { start, end, taskType, staffId?,
                  isDeclaration?, declStatus?, declId? }
    date        Date object
    staffMember { id, firstname, lastname, initials, color, primary_function }
    fn          function object or null
    tt          task-type object or null
    courseSlot  course-slot object or null
    taskTypes   array (requis si editable)
    onClose     () => void
    editable    bool  (default false)
    onSave      ({ start, end, taskType }) => null | string[]
    onRemove    () => void
─────────────────────────────────────────────────────────────── */
const SpanDetailModal = ({
  span, date, staffMember, fn, tt, courseSlot,
  taskTypes, onClose,
  editable = false, onSave, onRemove,
}) => {
  /* ── Responsive ─── */
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640);
  useEffect(() => {
    const h = () => setWide(window.innerWidth >= 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  /* ── État édition ─── */
  const [editStart,    setEditStart]    = useState(span.start);
  const [editEnd,      setEditEnd]      = useState(span.end);
  const [editTaskType, setEditTaskType] = useState(span.taskType ?? null);
  const [error,        setError]        = useState(null);

  /* ── Fermeture Échap ─── */
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSave = useCallback(() => {
    setError(null);
    if (editEnd <= editStart) { setError("L'heure de fin doit être après le début"); return; }
    const errs = onSave?.({ start: editStart, end: editEnd, taskType: editTaskType });
    if (errs && errs.length > 0) setError(errs[0]);
  }, [editStart, editEnd, editTaskType, onSave]);

  /* ── Dérivés visuels ─── */
  const dateLabel  = date?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const accent     = fn?.color || staffMember?.color || '#5B5855';
  const isPending  = span.declStatus === 'pending';
  const isApproved = span.declStatus === 'approved';
  const declAccent = isPending ? '#A16207' : '#15803D';

  /* ── Styles réutilisables ─── */
  const inp = {
    border: '1.5px solid #E4E0D8', borderRadius: 8, padding: '10px 12px',
    fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
    background: '#FAFAF8', outline: 'none', color: '#1E2235',
  };
  const pad = wide ? '20px 24px' : '16px 18px';
  const cardBR = wide ? 16 : '20px 20px 0 0';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,.40)',
        display: 'flex',
        alignItems: wide ? 'center' : 'flex-end',
        justifyContent: 'center',
        padding: wide ? 20 : 0,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: cardBR,
          boxShadow: wide ? '0 8px 48px rgba(0,0,0,.22)' : '0 -4px 32px rgba(0,0,0,.18)',
          width: '100%',
          maxWidth: wide ? 440 : '100%',
          maxHeight: wide ? 'calc(100vh - 48px)' : '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Poignée mobile ──────────────────────────────── */}
        {!wide && (
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 40, height: 4, background: '#E4E0D8', borderRadius: 2 }} />
          </div>
        )}

        {/* ── Header ──────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          background: span.isDeclaration
            ? (isPending ? '#FFFDF0' : '#F0FDF4')
            : fn ? `${accent}12` : '#F5F3EF',
          borderBottom: `3px solid ${span.isDeclaration ? declAccent : accent}`,
          padding: wide ? '18px 24px 14px' : '12px 18px 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Icône */}
            {span.isDeclaration ? (
              <div style={{ width: 44, height: 44, borderRadius: 12, background: isPending ? '#FEF3C7' : '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⏰</div>
            ) : courseSlot ? (
              <div style={{ width: 44, height: 44, borderRadius: 12, background: courseSlot.bg_color || '#EBF0FE', border: `2px solid ${courseSlot.color || '#5B75DB'}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🎓</div>
            ) : fn ? (
              <div style={{ width: 44, height: 44, borderRadius: 12, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{fn.icon}</div>
            ) : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 800, fontSize: 16,
                color: span.isDeclaration ? declAccent : accent,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {span.isDeclaration ? 'Heure salarié' : courseSlot ? courseSlot.group_name : fn?.name || 'Créneau'}
              </div>
              <div style={{ fontSize: 11, color: '#9B9890', marginTop: 2 }}>{dateLabel}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9B9890', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* ── Corps ───────────────────────────────────────── */}
        <div style={{ flex: 1, padding: pad, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Horaire — éditable ou lecture */}
          {editable ? (
            <div>
              <div style={{ fontSize: 11, color: '#9B9890', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Horaire</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#9B9890', display: 'block', marginBottom: 5 }}>Début</label>
                  <input
                    type="time" min="06:00" max="22:00" step="900"
                    value={toTime(editStart)}
                    onChange={e => { if (e.target.value) setEditStart(fromTime(e.target.value)); }}
                    style={inp}
                  />
                </div>
                <div style={{ paddingBottom: 13, color: '#C0BCB5', fontWeight: 700, fontSize: 18, userSelect: 'none' }}>→</div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#9B9890', display: 'block', marginBottom: 5 }}>Fin</label>
                  <input
                    type="time" min="06:00" max="22:00" step="900"
                    value={toTime(editEnd)}
                    onChange={e => { if (e.target.value) setEditEnd(fromTime(e.target.value)); }}
                    style={inp}
                  />
                </div>
              </div>
              {editEnd > editStart && (
                <div style={{ fontSize: 11, color: '#9B9890', marginTop: 5, textAlign: 'right' }}>
                  Durée : {durStr(editStart, editEnd)}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🕐</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1E2235' }}>{toTime(span.start)} – {toTime(span.end)}</div>
                <div style={{ fontSize: 11, color: '#9B9890', marginTop: 1 }}>{durStr(span.start, span.end)}</div>
              </div>
            </div>
          )}

          {/* Salarié */}
          {staffMember && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: staffMember.color || '#9B9890', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {staffMember.initials?.[0] || staffMember.firstname?.[0] || '?'}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2235' }}>
                  {staffMember.firstname} {staffMember.lastname}
                </div>
                <div style={{ fontSize: 11, color: '#9B9890' }}>{staffMember.primary_function || ''}</div>
              </div>
            </div>
          )}

          {/* Fonction */}
          {fn && !span.isDeclaration && !courseSlot && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accent}15`, border: `1.5px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{fn.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: accent }}>{fn.name}</div>
                <div style={{ fontSize: 11, color: '#9B9890' }}>Fonction</div>
              </div>
            </div>
          )}

          {/* Type de tâche — éditable ou lecture */}
          {!span.isDeclaration && !courseSlot && (
            editable ? (
              <div>
                <div style={{ fontSize: 11, color: '#9B9890', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Type d'activité</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {(taskTypes || []).map(t => {
                    const sel = editTaskType === t.slug;
                    return (
                      <button key={t.slug} onClick={() => setEditTaskType(sel ? null : t.slug)} style={{
                        padding: '6px 13px', borderRadius: 20,
                        border: `1.5px solid ${sel ? t.color : '#E4E0D8'}`,
                        background: sel ? `${t.color}20` : '#fff',
                        color: sel ? t.color : '#9B9890',
                        fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                        fontWeight: sel ? 700 : 400, transition: 'border-color .15s, background .15s',
                      }}>
                        {t.icon} {t.label}
                      </button>
                    );
                  })}
                  <button onClick={() => setEditTaskType(null)} style={{
                    padding: '6px 13px', borderRadius: 20,
                    border: `1.5px solid ${!editTaskType ? '#9B9890' : '#E8E4DE'}`,
                    background: !editTaskType ? '#F5F3EF' : '#fff',
                    color: !editTaskType ? '#5B5855' : '#C0BCB5',
                    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: !editTaskType ? 600 : 400,
                  }}>— Aucune</button>
                </div>
              </div>
            ) : tt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${tt.color}18`, border: `1.5px solid ${tt.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{tt.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: tt.color }}>{tt.label}</div>
                  <div style={{ fontSize: 11, color: '#9B9890' }}>Type de tâche</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, color: '#C0BCB5', flexShrink: 0 }}>⚙</div>
                <div style={{ fontSize: 12, color: '#B0ACA5' }}>Aucun type de tâche</div>
              </div>
            )
          )}

          {/* Cours */}
          {courseSlot && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${courseSlot.color || '#5B75DB'}15`, border: `1.5px solid ${courseSlot.color || '#5B75DB'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🎓</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: courseSlot.color || '#5B75DB' }}>{courseSlot.group_name}</div>
                <div style={{ fontSize: 11, color: '#9B9890' }}>{[courseSlot.level, courseSlot.public_desc].filter(Boolean).join(' · ') || 'Cours assigné'}</div>
              </div>
            </div>
          )}

          {/* Statut déclaration */}
          {span.isDeclaration && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: isPending ? '#FFFBEB' : '#F0FDF4',
              borderRadius: 10, padding: '11px 14px',
              border: `1.5px solid ${declAccent}30`,
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{isPending ? '⏳' : '✅'}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: declAccent }}>
                  {isPending ? "En attente d'approbation" : 'Approuvée'}
                </div>
                <div style={{ fontSize: 11, color: '#9B9890' }}>Heure salarié déclarée</div>
              </div>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div style={{ fontSize: 12, color: '#DC3545', padding: '9px 12px', background: '#FFF0F0', borderRadius: 8, border: '1px solid #FFCDD2' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: wide ? '0 24px 24px' : '0 18px 30px', display: 'flex', gap: 10 }}>
          {editable ? (
            <>
              <button onClick={handleSave} style={{
                flex: 1, padding: '13px', background: '#1E2235', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Mettre à jour
              </button>
              <button onClick={onRemove} title="Supprimer ce créneau" style={{
                padding: '13px 17px', background: '#FFF0F0', color: '#DC3545',
                border: '1.5px solid #FFCDD2', borderRadius: 10, fontSize: 16,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                🗑
              </button>
            </>
          ) : (
            <button onClick={onClose} style={{
              width: '100%', padding: '13px', background: '#F5F3EF',
              border: '1px solid #E4E0D8', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#5B5855',
            }}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpanDetailModal;
