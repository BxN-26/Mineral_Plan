import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Btn, Modal, Field, inputSt, Tag } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import { useAuth } from '../context/AuthContext';
import { useApp }  from '../App';
import api from '../api/client';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Plages quart-horaires de `from` à `to` inclus, pas 0.25 */
function timeOpts(from, to) {
  const r = [];
  for (let t = from; t <= to; t = Math.round((t + 0.25) * 100) / 100) {
    const h = Math.floor(t), m = Math.round((t - h) * 60);
    r.push({ val: t, label: `${h}h${m === 0 ? '00' : String(m).padStart(2, '0')}` });
  }
  return r;
}
const START_OPTS = timeOpts(7, 23.75);
const END_OPTS   = timeOpts(7.25, 24);

function fmtH(h) {
  if (h == null) return '–';
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}h${mm === 0 ? '00' : String(mm).padStart(2, '0')}`;
}

const STATUS_CFG = {
  pending:   { label: 'En attente',  color: '#F97316', bg: '#FFF3E0' },
  matched:   { label: 'Accepté',     color: '#6366F1', bg: '#EEF2FF' },
  approved:  { label: 'Approuvé ✓', color: '#4A8C6E', bg: '#EBF5F0' },
  refused:   { label: 'Refusé',      color: '#EF4444', bg: '#FEF2F2' },
  cancelled: { label: 'Annulé',      color: '#9B9890', bg: '#F5F3EF' },
};

function toMonday(d) {
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const m = new Date(d); m.setDate(d.getDate() + diff);
  return m.toISOString().slice(0, 10);
}
function toDayIndex(dateStr) {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 ? 6 : dow - 1; // 0=lun … 6=dim
}

/* ── Composant carte échange ─────────────────────────────────── */
const SwapCard = ({ swap, myStaffId, isManager, allStaff, onRefresh, onInvalidateWeek }) => {
  const st = STATUS_CFG[swap.status] || STATUS_CFG.pending;
  const isRequester  = swap.requester_id === myStaffId;
  const isTarget     = swap.target_id === myStaffId ||
                       (!swap.target_id && swap.mode === 'open') ||
                       (swap.mode === 'open' && swap.status === 'pending');
  const canRespond   = isTarget && swap.status === 'pending' && !isRequester;
  const canApprove   = isManager && swap.status === 'matched';
  const canAssign    = isManager && (swap.status === 'pending' || (swap.status === 'refused' && swap.urgent_alert_sent));
  const canCancel    = (isRequester || isManager) && ['pending', 'matched'].includes(swap.status);
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);

  // Collègues éligibles pour le créneau (même fonction, hors demandeur)
  const eligible = (allStaff || []).filter(
    s => s.id !== swap.requester_id && s.functions?.includes(swap.fn_slug)
  );

  const action = async (path, body = {}) => {
    setBusy(true);
    try {
      await api.put(`/swaps/${swap.id}/${path}`, body);
      if (path === 'approve' || path === 'assign') {
        onInvalidateWeek(swap.week_start);
        if (swap.swap_week) onInvalidateWeek(swap.swap_week);
      }
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 18px',
      boxShadow: '0 1px 6px rgba(0,0,0,.06)', borderLeft: `4px solid ${st.color}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <AvatarImg s={{ initials: swap.requester_initials, color: swap.requester_color, avatar_url: null }} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1E2235' }}>
            {swap.requester_name}
            {swap.mode === 'targeted' && swap.target_id && ` → ${swap.responder_name || '?'}`}
          </div>
          <div style={{ fontSize: 11, color: '#6B6860', marginTop: 2 }}>
            {DAYS[swap.day_index]} {fmtH(swap.hour_start)}–{fmtH(swap.hour_end)} — sem. {swap.week_start?.slice(5)} — {swap.fn_slug}
          </div>
          {swap.swap_week && (
            <div style={{ fontSize: 11, color: '#6B6860' }}>
              ↔ Retour: {DAYS[swap.swap_day_index]} {fmtH(swap.swap_hour_start)}–{fmtH(swap.swap_hour_end)} — sem. {swap.swap_week?.slice(5)}
            </div>
          )}
          {swap.note && <div style={{ fontSize: 11, color: '#9B9890', fontStyle: 'italic', marginTop: 2 }}>"{swap.note}"</div>}
        </div>
        <Tag color={st.color} bg={st.bg}>{st.label}</Tag>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canRespond && (
          <>
            <Btn small variant="success" onClick={() => action('respond', { accept: true })} disabled={busy}>✓ Accepter</Btn>
            <Btn small variant="danger"  onClick={() => action('respond', { accept: false })} disabled={busy}>✗ Refuser</Btn>
          </>
        )}
        {canApprove && (
          <>
            <Btn small variant="success" onClick={() => action('approve', { note })} disabled={busy}>✓ Approuver</Btn>
            <Btn small variant="danger"  onClick={() => action('refuse', { note })} disabled={busy}>✗ Refuser</Btn>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Note manager (optionnel)"
              style={{ ...inputSt, width: 200, fontSize: 12, padding: '4px 8px' }} />
          </>
        )}
        {canAssign && eligible.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4,
            padding: '8px 10px', background: '#FFF8F0', borderRadius: 8, border: '1px solid #FDDCB5', width: '100%' }}>
            <span style={{ fontSize: 11, color: '#9B5D1A', fontWeight: 600 }}>📋 Désigner un remplaçant :</span>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              style={{ ...inputSt, fontSize: 12, padding: '3px 8px', flex: 1, minWidth: 160 }}>
              <option value="">Choisir…</option>
              {eligible.map(s => (
                <option key={s.id} value={s.id}>{s.firstname} {s.lastname}</option>
              ))}
            </select>
            <Btn small variant="primary"
              onClick={() => assigneeId && action('assign', { assignee_id: +assigneeId })}
              disabled={busy || !assigneeId}>Valider</Btn>
          </div>
        )}
        {canCancel && (
          <Btn small variant="ghost" onClick={() => action('cancel')} disabled={busy}>Annuler</Btn>
        )}
      </div>
    </div>
  );
};

/* ── Vue principale ───────────────────────────────────────────── */
export default function SwapView() {
  const { user } = useAuth();
  const { staff: allStaff, functions, schedules, loadWeekSchedules, setSchedules, swapTab, setSwapTab } = useApp();

  const isManager    = ['admin','manager','superadmin','rh'].includes(user?.role);
  const myStaff      = allStaff.find(s => s.id === user?.staff_id);
  const myStaffId    = myStaff?.id;

  const [swaps,    setSwaps]   = useState([]);
  const [tab,      setTab]     = useState(swapTab || 'mine');   // mine | open | manager
  const [modal,    setModal]   = useState(false);
  const [loading,  setLoading] = useState(false);

  // Sync onglet si deep-link depuis une notification
  useEffect(() => {
    if (swapTab) { setTab(swapTab); setSwapTab(null); }
  }, [swapTab, setSwapTab]);

  /* Formulaire création */
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    fn_slug: '', hour_start: 9, hour_end: 10,
    mode: 'open', target_id: '',
    swap_date: '', swap_fn_slug: '', swap_hour_start: 9, swap_hour_end: 10,
    bilateral: false, note: '',
  });
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/swaps');
      setSwaps(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSwap = async () => {
    const dateObj = new Date(form.date + 'T12:00:00');
    const body = {
      week_start: toMonday(dateObj),
      fn_slug:    form.fn_slug,
      day_index:  toDayIndex(form.date),
      hour_start: +form.hour_start,
      hour_end:   +form.hour_end,
      mode:       form.mode,
      target_id:  form.target_id ? +form.target_id : null,
      note:       form.note,
    };
    if (form.bilateral && form.swap_date) {
      body.swap_week       = toMonday(new Date(form.swap_date + 'T12:00:00'));
      body.swap_fn_slug    = form.swap_fn_slug;
      body.swap_day_index  = toDayIndex(form.swap_date);
      body.swap_hour_start = +form.swap_hour_start;
      body.swap_hour_end   = +form.swap_hour_end;
    }
    try {
      await api.post('/swaps', body);
      setModal(false);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  /* Filtrage par onglet */
  const mine    = swaps.filter(s => s.requester_id === myStaffId || s.responder_id === myStaffId || s.target_id === myStaffId);
  const open    = swaps.filter(s => s.mode === 'open' && s.status === 'pending' && s.requester_id !== myStaffId);
  // pending urgents (alerte déclenchée) + matched en attente d'approbation + refused urgents à assigner
  const mgr     = swaps.filter(s => s.status === 'matched' ||
    ((s.status === 'pending' || s.status === 'refused') && s.urgent_alert_sent));

  const shown = tab === 'mine' ? mine : tab === 'open' ? open : mgr;

  /* Collègues de la même fonction pour les échanges ciblés */
  const myFns = myStaff?.functions || [];
  const colleagues = allStaff.filter(s => s.id !== myStaffId && s.functions?.some(f => myFns.includes(f)));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader
        title="Échanges de créneaux"
        sub="Demander, accepter et gérer les échanges de planning"
        actions={
          myStaffId ? (
            <Btn variant="primary" onClick={() => setModal(true)}>+ Nouvelle demande</Btn>
          ) : null
        }
      />

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid #E4E0D8', background: '#fff' }}>
        {[
          { id: 'mine', label: `Mes échanges (${mine.length})` },
          { id: 'open', label: `Demandes ouvertes (${open.length})` },
          ...(isManager ? [{ id: 'manager', label: `À approuver (${mgr.length})` }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: 'transparent', color: tab === t.id ? '#C5753A' : '#6B6860',
            borderBottom: `2px solid ${tab === t.id ? '#C5753A' : 'transparent'}`,
            fontWeight: tab === t.id ? 700 : 400, fontSize: 13, transition: 'all .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9B9890' }}>Chargement…</div>}
        {!loading && shown.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9B9890', background: '#fff', borderRadius: 12 }}>
            {tab === 'mine' ? 'Aucun échange en cours.' :
             tab === 'open' ? 'Aucune demande ouverte disponible.' :
             'Aucun échange en attente d\'approbation.'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
          {shown.map(s => (
            <SwapCard key={s.id} swap={s} myStaffId={myStaffId} isManager={isManager} allStaff={allStaff} onRefresh={load}
              onInvalidateWeek={week => {
                setSchedules(prev => { const n = { ...prev }; delete n[week]; return n; });
                loadWeekSchedules(week);
              }}
            />
          ))}
        </div>
      </div>

      {/* Modal création */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nouvelle demande d'échange" width={580}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Jour du créneau *">
              <input type="date" value={form.date}
                onChange={e => setF('date', e.target.value)}
                style={inputSt} />
            </Field>
            <Field label="Fonction *">
              <select value={form.fn_slug} onChange={e => setF('fn_slug', e.target.value)} style={inputSt}>
                <option value="">Choisir…</option>
                {functions.filter(f => myFns.includes(f.slug)).map(f => (
                  <option key={f.slug} value={f.slug}>{f.icon} {f.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Début *">
              <select value={form.hour_start} onChange={e => { const v = +e.target.value; setF('hour_start', v); if (form.hour_end <= v) setF('hour_end', Math.min(v + 1, 24)); }} style={inputSt}>
                {START_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Fin *">
              <select value={form.hour_end} onChange={e => setF('hour_end', +e.target.value)} style={inputSt}>
                {END_OPTS.filter(o => o.val > form.hour_start).map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Mode">
            <div style={{ display: 'flex', gap: 8 }}>
              {[['open', '🌐 Ouvert (n\'importe qui)'], ['targeted', '🎯 Ciblé (un collègue)']].map(([v, l]) => (
                <button key={v} onClick={() => setF('mode', v)} style={{
                  padding: '6px 14px', borderRadius: 7, border: `1.5px solid ${form.mode === v ? '#C5753A' : '#E4E0D8'}`,
                  background: form.mode === v ? '#FFF3E0' : '#fff', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'inherit', fontWeight: form.mode === v ? 700 : 400, color: form.mode === v ? '#C5753A' : '#6B6860',
                }}>{l}</button>
              ))}
            </div>
          </Field>

          {form.mode === 'targeted' && (
            <Field label="Collègue ciblé">
              <select value={form.target_id} onChange={e => setF('target_id', e.target.value)} style={inputSt}>
                <option value="">Choisir…</option>
                {colleagues.map(c => (
                  <option key={c.id} value={c.id}>{c.firstname} {c.lastname}</option>
                ))}
              </select>
            </Field>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.bilateral} onChange={e => setF('bilateral', e.target.checked)} />
            Je propose aussi un créneau en retour (échange bilatéral)
          </label>

          {form.bilateral && (
            <div style={{ background: '#F9F7F4', borderRadius: 8, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Jour du créneau retour">
                <input type="date" value={form.swap_date} onChange={e => setF('swap_date', e.target.value)} style={inputSt} />
              </Field>
              <Field label="Fonction retour">
                <select value={form.swap_fn_slug} onChange={e => setF('swap_fn_slug', e.target.value)} style={inputSt}>
                  <option value="">Choisir…</option>
                  {functions.filter(f => myFns.includes(f.slug)).map(f => (
                    <option key={f.slug} value={f.slug}>{f.icon} {f.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Début retour">
                <select value={form.swap_hour_start} onChange={e => { const v = +e.target.value; setF('swap_hour_start', v); if (form.swap_hour_end <= v) setF('swap_hour_end', Math.min(v + 1, 24)); }} style={inputSt}>
                  {START_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Fin retour">
                <select value={form.swap_hour_end} onChange={e => setF('swap_hour_end', +e.target.value)} style={inputSt}>
                  {END_OPTS.filter(o => o.val > form.swap_hour_start).map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          )}

          <Field label="Note (optionnel)">
            <textarea value={form.note} onChange={e => setF('note', e.target.value)}
              rows={2} style={{ ...inputSt, resize: 'vertical' }} placeholder="Raison, contrainte…" />
          </Field>

          <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
            <Btn variant="primary" onClick={createSwap}
              disabled={!form.date || !form.fn_slug}
              style={{ flex: 1, justifyContent: 'center' }}>
              ➤ Envoyer la demande
            </Btn>
            <Btn onClick={() => setModal(false)}>Annuler</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
