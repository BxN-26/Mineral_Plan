import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../App';
import { Btn, Modal, Field, inputSt, PageHeader } from '../components/common';
import api from '../api/client';

/* ── Badges statut ──────────────────────────────────────────── */
const STATUS_CFG = {
  approved: { label: 'Acceptée',   bg: '#DCFCE7', color: '#15803D' },
  pending:  { label: 'En attente', bg: '#FEF9C3', color: '#A16207' },
  refused:  { label: 'Refusée',    bg: '#FEE2E2', color: '#DC2626' },
};

const RECUR_LABELS = { none: 'Ponctuelle', weekly: 'Hebdomadaire', biweekly: 'Toutes les 2 semaines' };

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 12,
                   background: c.bg, color: c.color, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}

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

/* ── Ligne indisponibilité ─────────────────────────────────── */
function IndispoRow({ item, canDelete, onDelete }) {
  const today = new Date().toISOString().slice(0, 10);
  const isDeletable = canDelete && item.date_start >= today;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          {formatDate(item.date_start)}{item.date_start !== item.date_end ? ` → ${formatDate(item.date_end)}` : ''}
          {!item.all_day && <span style={{ color: '#6B7280', fontSize: 13 }}> · {hhmm(item.hour_start)} – {hhmm(item.hour_end)}</span>}
          {item.recurrence !== 'none' && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#6366F1', background: '#EEF2FF',
                           padding: '1px 7px', borderRadius: 999 }}>
              🔁 {RECUR_LABELS[item.recurrence]}
            </span>
          )}
        </div>
        {item.note && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{item.note}</div>}
        {item.status === 'refused' && item.review_note && (
          <div style={{ fontSize: 12, color: '#DC2626', marginTop: 2 }}>Note : {item.review_note}</div>
        )}
      </div>
      <StatusBadge status={item.status} />
      {isDeletable && (
        <Btn variant="danger" small onClick={() => onDelete(item.id)} type="button">Supprimer</Btn>
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

  // Trouver le staffId de l'utilisateur courant
  const myStaffId = user?.staff_id || (staff.find(s => s.user_id === user?.id)?.id) || null;

  const [tab, setTab]         = useState('mine');
  const [showForm, setShowForm] = useState(false);
  const [myList, setMyList]     = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [reviewItem, setReviewItem]   = useState(null);
  const [loading, setLoading]         = useState(false);

  const loadMyList = useCallback(async () => {
    if (!myStaffId) return;
    try {
      const data = await api.get(`/unavailabilities?staff_id=${myStaffId}`);
      setMyList(Array.isArray(data) ? data : []);
    } catch { setMyList([]); }
  }, [myStaffId]);

  const loadPending = useCallback(async () => {
    if (!isMgr) return;
    try {
      const data = await api.get('/unavailabilities?status=pending');
      setPendingList(Array.isArray(data) ? data : []);
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
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const handleSaved = async () => {
    setShowForm(false);
    await loadMyList();
  };

  const handleReviewDone = async () => {
    setReviewItem(null);
    await Promise.all([loadMyList(), loadPending()]);
  };

  const TabBtn = ({ id, label, badge }) => (
    <button type="button"
      onClick={() => setTab(id)}
      style={{
        padding: '6px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
        fontWeight: tab === id ? 700 : 400, fontSize: 14,
        background: tab === id ? '#6366F1' : '#F3F4F6',
        color: tab === id ? '#fff' : '#374151',
        position: 'relative',
      }}>
      {label}
      {badge > 0 && (
        <span style={{ position: 'absolute', top: -4, right: -6, background: '#EF4444',
                       color: '#fff', borderRadius: '50%', width: 18, height: 18,
                       display: 'flex', alignItems: 'center', justifyContent: 'center',
                       fontSize: 10, fontWeight: 700 }}>{badge}</span>
      )}
    </button>
  );

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760, margin: '0 auto' }}>
      <PageHeader title="📵 Indisponibilités"
                  sub="Déclarez vos périodes d'indisponibilité et consultez leur statut." />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <TabBtn id="mine"    label="Mes indisponibilités" />
        {isMgr && <TabBtn id="pending" label="À valider" badge={pendingList.length} />}
      </div>

      {/* ── Onglet : mes indisponibilités ── */}
      {tab === 'mine' && (
        <div>
          {!showForm && (
            <div style={{ marginBottom: 20 }}>
              <Btn variant="primary" onClick={() => setShowForm(true)}>
                + Déclarer une indisponibilité
              </Btn>
            </div>
          )}

          {showForm && (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
                          padding: '20px 24px', marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
                Nouvelle indisponibilité
              </h3>
              <IndispoForm
                myStaffId={myStaffId}
                onSaved={handleSaved}
                onCancel={() => setShowForm(false)} />
            </div>
          )}

          {loading && <p style={{ color: '#6B7280', fontSize: 14 }}>Chargement…</p>}

          {!loading && myList.length === 0 && (
            <p style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
              Aucune indisponibilité déclarée.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myList.map(item => (
              <IndispoRow key={item.id} item={item}
                canDelete={true}
                onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* ── Onglet : à valider (manager) ── */}
      {tab === 'pending' && isMgr && (
        <div>
          {loading && <p style={{ color: '#6B7280', fontSize: 14 }}>Chargement…</p>}

          {!loading && pendingList.length === 0 && (
            <p style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
              Aucune indisponibilité en attente de validation.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingList.map(item => (
              <div key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                         background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {item.firstname} {item.lastname}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
                    Du {formatDate(item.date_start)} au {formatDate(item.date_end)}
                    {!item.all_day && <> · {hhmm(item.hour_start)} – {hhmm(item.hour_end)}</>}
                    {item.recurrence !== 'none' && <> · 🔁 {RECUR_LABELS[item.recurrence]}</>}
                  </div>
                  {item.note && (
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{item.note}</div>
                  )}
                </div>
                <Btn variant="primary" small onClick={() => setReviewItem(item)} type="button">
                  Décision
                </Btn>
              </div>
            ))}
          </div>
        </div>
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
