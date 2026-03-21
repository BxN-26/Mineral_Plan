import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Btn, Modal, Field, inputSt, Tag } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import { useAuth } from '../context/AuthContext';
import { useApp }  from '../App';
import api from '../api/client';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

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

/* ── Composant carte échange ─────────────────────────────────── */
const SwapCard = ({ swap, myStaffId, isManager, onRefresh }) => {
  const st = STATUS_CFG[swap.status] || STATUS_CFG.pending;
  const isRequester  = swap.requester_id === myStaffId;
  const isTarget     = swap.target_id === myStaffId || (!swap.target_id && swap.mode === 'open');
  const canRespond   = isTarget && swap.status === 'pending' && !isRequester;
  const canApprove   = isManager && swap.status === 'matched';
  const canCancel    = (isRequester || isManager) && ['pending', 'matched'].includes(swap.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const action = async (path, body = {}) => {
    setBusy(true);
    try {
      await api.put(`/swaps/${swap.id}/${path}`, body);
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
            {DAYS[swap.day_index]} {swap.hour}h — sem. {swap.week_start?.slice(5)} — {swap.fn_slug}
          </div>
          {swap.swap_week && (
            <div style={{ fontSize: 11, color: '#6B6860' }}>
              ↔ Retour: {DAYS[swap.swap_day_index]} {swap.swap_hour}h — sem. {swap.swap_week?.slice(5)}
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
  const { staff: allStaff, functions, schedules, loadWeekSchedules } = useApp();

  const isManager    = ['admin','manager','superadmin','rh'].includes(user?.role);
  const myStaff      = allStaff.find(s => s.id === user?.staff_id);
  const myStaffId    = myStaff?.id;

  const [swaps,    setSwaps]   = useState([]);
  const [tab,      setTab]     = useState('mine');   // mine | open | manager
  const [modal,    setModal]   = useState(false);
  const [loading,  setLoading] = useState(false);

  /* Formulaire création */
  const [form, setForm] = useState({
    week_start: toMonday(new Date()),
    fn_slug: '', day_index: 0, hour: 8,
    mode: 'open', target_id: '',
    swap_week: '', swap_fn_slug: '', swap_day_index: 0, swap_hour: 8,
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
    const body = {
      week_start: form.week_start,
      fn_slug:    form.fn_slug,
      day_index:  +form.day_index,
      hour:       +form.hour,
      mode:       form.mode,
      target_id:  form.target_id ? +form.target_id : null,
      note:       form.note,
    };
    if (form.bilateral) {
      body.swap_week      = form.swap_week;
      body.swap_fn_slug   = form.swap_fn_slug;
      body.swap_day_index = +form.swap_day_index;
      body.swap_hour      = +form.swap_hour;
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
  const mine    = swaps.filter(s => s.requester_id === myStaffId || s.responder_id === myStaffId);
  const open    = swaps.filter(s => s.mode === 'open' && s.status === 'pending' && s.requester_id !== myStaffId);
  const mgr     = swaps.filter(s => s.status === 'matched');

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
            <SwapCard key={s.id} swap={s} myStaffId={myStaffId} isManager={isManager} onRefresh={load} />
          ))}
        </div>
      </div>

      {/* Modal création */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nouvelle demande d'échange" width={580}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Semaine *">
              <input type="date" value={form.week_start} onChange={e => setF('week_start', e.target.value)} style={inputSt} />
            </Field>
            <Field label="Fonction *">
              <select value={form.fn_slug} onChange={e => setF('fn_slug', e.target.value)} style={inputSt}>
                <option value="">Choisir…</option>
                {functions.filter(f => myFns.includes(f.slug)).map(f => (
                  <option key={f.slug} value={f.slug}>{f.icon} {f.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Jour *">
              <select value={form.day_index} onChange={e => setF('day_index', +e.target.value)} style={inputSt}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="Heure *">
              <select value={form.hour} onChange={e => setF('hour', +e.target.value)} style={inputSt}>
                {HOURS.map(h => <option key={h} value={h}>{h}h</option>)}
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
              <Field label="Semaine retour">
                <input type="date" value={form.swap_week} onChange={e => setF('swap_week', e.target.value)} style={inputSt} />
              </Field>
              <Field label="Fonction retour">
                <select value={form.swap_fn_slug} onChange={e => setF('swap_fn_slug', e.target.value)} style={inputSt}>
                  <option value="">Choisir…</option>
                  {functions.filter(f => myFns.includes(f.slug)).map(f => (
                    <option key={f.slug} value={f.slug}>{f.icon} {f.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Jour retour">
                <select value={form.swap_day_index} onChange={e => setF('swap_day_index', +e.target.value)} style={inputSt}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </Field>
              <Field label="Heure retour">
                <select value={form.swap_hour} onChange={e => setF('swap_hour', +e.target.value)} style={inputSt}>
                  {HOURS.map(h => <option key={h} value={h}>{h}h</option>)}
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
              disabled={!form.week_start || !form.fn_slug}
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
