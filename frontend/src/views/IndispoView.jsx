import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../App';
import { Btn, Modal, Field, inputSt, PageHeader, Tag } from '../components/common';
import api from '../api/client';

const STATUS_CFG = {
  approved: { label: 'Acceptée',   bg: '#DCFCE7', color: '#15803D' },
  pending:  { label: 'En attente', bg: '#FEF9C3', color: '#A16207' },
  refused:  { label: 'Refusée',    bg: '#FEE2E2', color: '#DC2626' },
};

const RECUR_LABELS = { none: 'Ponctuelle', weekly: 'Hebdomadaire', biweekly: 'Toutes les 2 semaines' };

function hhmm(h) {
  if (h == null) return '—';
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/* ── Formulaire de déclaration ─────────────────────────────── */
function IndispoForm({ myStaffId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    date_start: '', date_end: '', all_day: true,
    hour_start: '', hour_end: '',
    note: '', recurrence: 'none', recurrence_end: '',
  });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.date_start || !form.date_end) { setErr('Dates requises.'); return; }
    if (form.date_end < form.date_start)    { setErr('La date de fin doit être après la date de début.'); return; }
    if (!form.all_day) {
      if (form.hour_start === '' || form.hour_end === '') { setErr('Heures requises.'); return; }
      if (Number(form.hour_end) <= Number(form.hour_start)) { setErr('L\'heure de fin doit être après l\'heure de début.'); return; }
    }
    try {
      setSaving(true);
      await api.post('/unavailabilities', {
        staff_id: myStaffId,
        date_start: form.date_start,
        date_end: form.date_end,
        all_day: form.all_day ? 1 : 0,
        hour_start: form.all_day ? null : Number(form.hour_start),
        hour_end:   form.all_day ? null : Number(form.hour_end),
        note: form.note || null,
        recurrence: form.recurrence,
        recurrence_end: form.recurrence !== 'none' ? (form.recurrence_end || null) : null,
      });
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur lors de la soumission.');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Date de début *">
          <input type="date" style={inputSt} value={form.date_start}
            onChange={e => set('date_start', e.target.value)} required />
        </Field>
        <Field label="Date de fin *">
          <input type="date" style={inputSt} value={form.date_end}
            onChange={e => set('date_end', e.target.value)} required />
        </Field>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
        <input type="checkbox" checked={form.all_day}
          onChange={e => set('all_day', e.target.checked)} />
        Journée entière
      </label>

      {!form.all_day && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Heure de début *">
            <input type="time" style={inputSt} value={
                form.hour_start === '' ? '' : `${String(Math.floor(Number(form.hour_start))).padStart(2,'0')}:${String(Math.round((Number(form.hour_start)%1)*60)).padStart(2,'0')}`
              }
              onChange={e => {
                const [h, m] = e.target.value.split(':');
                set('hour_start', Number(h) + Number(m) / 60);
              }} required />
          </Field>
          <Field label="Heure de fin *">
            <input type="time" style={inputSt} value={
                form.hour_end === '' ? '' : `${String(Math.floor(Number(form.hour_end))).padStart(2,'0')}:${String(Math.round((Number(form.hour_end)%1)*60)).padStart(2,'0')}`
              }
              onChange={e => {
                const [h, m] = e.target.value.split(':');
                set('hour_end', Number(h) + Number(m) / 60);
              }} required />
          </Field>
        </div>
      )}

      <Field label="Récurrence">
        <select style={inputSt} value={form.recurrence}
          onChange={e => set('recurrence', e.target.value)}>
          <option value="none">Ponctuelle</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="biweekly">Toutes les 2 semaines</option>
        </select>
      </Field>

      {form.recurrence !== 'none' && (
        <Field label="Date de fin de récurrence">
          <input type="date" style={inputSt} value={form.recurrence_end}
            onChange={e => set('recurrence_end', e.target.value)} />
        </Field>
      )}

      <Field label="Motif (optionnel)">
        <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 70 }}
          value={form.note} placeholder="Raison, contexte…"
          onChange={e => set('note', e.target.value)} />
      </Field>

      {err && <p style={{ color: '#DC2626', margin: 0, fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" onClick={onCancel} type="button">Annuler</Btn>
        <Btn variant="primary" type="submit" disabled={saving}>
          {saving ? 'Envoi…' : 'Déclarer'}
        </Btn>
      </div>
    </form>
  );
}

/* ── Modale de révision (manager) ──────────────────────────── */
function ReviewModal({ item, onClose, onDone }) {
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (status) => {
    setSaving(true);
    try {
      await api.put(`/unavailabilities/${item.id}/review`, { status, review_note: reviewNote });
      onDone();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Valider l'indisponibilité" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong>{item.firstname} {item.lastname}</strong> — du{' '}
          <strong>{formatDate(item.date_start)}</strong> au{' '}
          <strong>{formatDate(item.date_end)}</strong>
          {!item.all_day && <> ({hhmm(item.hour_start)} – {hhmm(item.hour_end)})</>}
          {item.recurrence !== 'none' && <> · {RECUR_LABELS[item.recurrence]}</>}
        </p>
        {item.note && (
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280', background: '#F9FAFB',
                      border: '1px solid #E5E7EB', borderRadius: 6, padding: '8px 12px' }}>
            {item.note}
          </p>
        )}
        <Field label="Commentaire (facultatif)">
          <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 60 }}
            value={reviewNote} placeholder="Raison du refus, remarque…"
            onChange={e => setReviewNote(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose} type="button">Annuler</Btn>
          <Btn variant="danger" onClick={() => submit('refused')} disabled={saving} type="button">
            ❌ Refuser
          </Btn>
          <Btn variant="primary" onClick={() => submit('approved')} disabled={saving} type="button">
            ✅ Accepter
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ── Carte indisponibilité ───────────────────────────────────── */
function IndispoCard({ item, canDelete, onDelete }) {
  const st = STATUS_CFG[item.status] || STATUS_CFG.pending;
  const today = new Date().toISOString().slice(0, 10);
  const isDeletable = canDelete && item.date_start >= today && item.status === 'pending';

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 16px',
      boxShadow: '0 1px 6px rgba(0,0,0,.06)', borderLeft: `4px solid ${st.color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: isDeletable ? 8 : 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1E2235' }}>
            {formatDate(item.date_start)}
            {item.date_start !== item.date_end && ` → ${formatDate(item.date_end)}`}
            {!item.all_day && (
              <span style={{ fontWeight: 400, color: '#6B6860', marginLeft: 6, fontSize: 12 }}>
                · {hhmm(item.hour_start)} – {hhmm(item.hour_end)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6B6860', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{item.all_day ? '🗓️ Journée entière' : '🕐 Plage horaire'}</span>
            {item.recurrence !== 'none' && (
              <span style={{ background: '#EEF2FF', color: '#6366F1', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>
                🔁 {RECUR_LABELS[item.recurrence]}
              </span>
            )}
          </div>
          {item.note && (
            <div style={{ fontSize: 12, color: '#9B9890', fontStyle: 'italic', marginTop: 4 }}>"{item.note}"</div>
          )}
          {item.status === 'refused' && item.review_note && (
            <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>↩ Note : {item.review_note}</div>
          )}
        </div>
        <Tag color={st.color} bg={st.bg}>{st.label}</Tag>
      </div>
      {isDeletable && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small variant="ghost" onClick={() => onDelete(item.id)} type="button">Supprimer</Btn>
        </div>
      )}
    </div>
  );
}

/* ── Vue principale ─────────────────────────────────────────── */
export default function IndispoView() {
  const { user }         = useAuth();
  const { staff }        = useApp();

  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  const isMgr   = isAdmin || user?.role === 'manager';

  const myStaffId = user?.staff_id || (staff.find(s => s.user_id === user?.id)?.id) || null;

  const [tab, setTab]           = useState('mine');
  const [modal, setModal]       = useState(false);
  const [myList, setMyList]     = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [reviewItem, setReviewItem]   = useState(null);
  const [loading, setLoading]         = useState(false);

  const loadMyList = useCallback(async () => {
    if (!myStaffId) return;
    try {
      const r = await api.get(`/unavailabilities?staff_id=${myStaffId}`);
      setMyList(Array.isArray(r.data) ? r.data : []);
    } catch { setMyList([]); }
  }, [myStaffId]);

  const loadPending = useCallback(async () => {
    if (!isMgr) return;
    try {
      const r = await api.get('/unavailabilities?status=pending');
      setPendingList(Array.isArray(r.data) ? r.data : []);
    } catch { setPendingList([]); }
  }, [isMgr]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMyList(), loadPending()]).finally(() => setLoading(false));
  }, [loadMyList, loadPending]);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette indisponibilité ?')) return;
    try {
      await api.delete(`/unavailabilities/${id}`);
      await loadMyList();
    } catch (e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const handleSaved = async () => {
    setModal(false);
    await loadMyList();
  };

  const handleReviewDone = async () => {
    setReviewItem(null);
    await Promise.all([loadMyList(), loadPending()]);
  };

  const tabs = [
    { id: 'mine',    label: `Mes indisponibilités (${myList.length})` },
    ...(isMgr ? [{ id: 'pending', label: `À valider (${pendingList.length})` }] : []),
  ];

  const shown = tab === 'mine' ? myList : pendingList;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader
        title="📵 Indisponibilités"
        sub="Déclarez vos périodes d'indisponibilité et consultez leur statut"
        actions={
          myStaffId ? (
            <Btn variant="primary" onClick={() => setModal(true)}>+ Déclarer</Btn>
          ) : null
        }
      />

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid #E4E0D8', background: '#fff' }}>
        {tabs.map(t => (
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
            {tab === 'mine' ? 'Aucune indisponibilité déclarée.' : 'Aucune indisponibilité en attente de validation.'}
          </div>
        )}

        {/* ── Mes indisponibilités ── */}
        {tab === 'mine' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            {myList.map(item => (
              <IndispoCard key={item.id} item={item} canDelete={true} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* ── À valider (manager) ── */}
        {tab === 'pending' && isMgr && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
            {pendingList.map(item => {
              const st = STATUS_CFG.pending;
              return (
                <div key={item.id} style={{
                  background: '#fff', borderRadius: 12, padding: '14px 16px',
                  boxShadow: '0 1px 6px rgba(0,0,0,.06)', borderLeft: `4px solid ${st.color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1E2235' }}>
                        {item.firstname} {item.lastname}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B6860', marginTop: 3 }}>
                        Du {formatDate(item.date_start)} au {formatDate(item.date_end)}
                        {!item.all_day && <> · {hhmm(item.hour_start)} – {hhmm(item.hour_end)}</>}
                        {item.recurrence !== 'none' && <> · 🔁 {RECUR_LABELS[item.recurrence]}</>}
                      </div>
                      {item.note && (
                        <div style={{ fontSize: 12, color: '#9B9890', fontStyle: 'italic', marginTop: 4 }}>"{item.note}"</div>
                      )}
                    </div>
                    <Tag color={st.color} bg={st.bg}>{st.label}</Tag>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn small variant="primary" onClick={() => setReviewItem(item)} type="button">Décision</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal formulaire */}
      {modal && (
        <Modal title="Déclarer une indisponibilité" onClose={() => setModal(false)} width={520}>
          <IndispoForm myStaffId={myStaffId} onSaved={handleSaved} onCancel={() => setModal(false)} />
        </Modal>
      )}

      {reviewItem && (
        <ReviewModal
          item={reviewItem}
          onClose={() => setReviewItem(null)}
          onDone={handleReviewDone} />
      )}
    </div>
  );
}
