import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../App';
import { Btn, Modal, Field, inputSt, PageHeader, Tag } from '../components/common';
import api from '../api/client';

const STATUS_CFG = {
  pending:   { label: 'En attente',  bg: '#FEF9C3', color: '#A16207' },
  approved:  { label: 'Approuvée',   bg: '#DCFCE7', color: '#15803D' },
  refused:   { label: 'Refusée',     bg: '#FEE2E2', color: '#DC2626' },
  cancelled: { label: 'Annulée',     bg: '#F3F4F6', color: '#6B7280' },
};

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

function toTimeInput(h) {
  if (h === '' || h == null) return '';
  const n = Number(h);
  return `${String(Math.floor(n)).padStart(2, '0')}:${String(Math.round((n % 1) * 60)).padStart(2, '0')}`;
}

function timeInputToReal(val) {
  const [h, m] = val.split(':');
  return Number(h) + Number(m) / 60;
}

/* ── Formulaire de déclaration ─────────────────────────────── */
function DeclForm({ staffFunctions, onSaved, onCancel }) {
  const [form, setForm] = useState({
    date: '', function_id: '', hour_start: '', hour_end: '', note: '',
  });
  const [err, setSaving_] = useState(''); // reuse as err state
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setErr = setSaving_;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.date) { setErr('Date requise.'); return; }
    if (form.hour_start === '' || form.hour_end === '') { setErr('Heures requises.'); return; }
    const start = timeInputToReal(form.hour_start);
    const end   = timeInputToReal(form.hour_end);
    if (end <= start) { setErr('L\'heure de fin doit être après l\'heure de début.'); return; }
    if (end - start < 0.25) { setErr('Durée minimale : 15 minutes.'); return; }

    try {
      setSaving(true);
      await api.post('/hour-declarations', {
        date: form.date,
        function_id: form.function_id ? Number(form.function_id) : null,
        hour_start: start,
        hour_end: end,
        note: form.note || null,
      });
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur lors de la soumission.');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Date *">
        <input type="date" style={inputSt} value={form.date}
          onChange={e => set('date', e.target.value)} required />
      </Field>
      <Field label="Fonction concernée">
        <select style={inputSt} value={form.function_id}
          onChange={e => set('function_id', e.target.value)}>
          <option value="">— Non précisée —</option>
          {staffFunctions.map(f => (
            <option key={f.id} value={f.id}>{f.icon ? `${f.icon} ` : ''}{f.name}</option>
          ))}
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Heure de début *">
          <input type="time" style={inputSt} value={form.hour_start}
            onChange={e => set('hour_start', e.target.value)} required />
        </Field>
        <Field label="Heure de fin *">
          <input type="time" style={inputSt} value={form.hour_end}
            onChange={e => set('hour_end', e.target.value)} required />
        </Field>
      </div>
      <Field label="Note (optionnel)">
        <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 70 }}
          value={form.note} placeholder="Contexte, motif du reliquat…"
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
      await api.put(`/hour-declarations/${item.id}/review`, { status, review_note: reviewNote });
      onDone();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    } finally { setSaving(false); }
  };

  const hours = Math.round((item.hour_end - item.hour_start) * 100) / 100;

  return (
    <Modal title="Validation de la déclaration" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong>{item.firstname} {item.lastname}</strong> — le {formatDate(item.date)}{' '}
          ({hhmm(item.hour_start)} – {hhmm(item.hour_end)}, <strong>{hours}h</strong>)
          {item.function_name && <> · {item.function_icon} {item.function_name}</>}
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
            ✅ Approuver
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ── Carte déclaration ───────────────────────────────────────── */
function DeclCard({ item, canCancel, onCancel }) {
  const st = STATUS_CFG[item.status] || STATUS_CFG.pending;
  const hours = Math.round((item.hour_end - item.hour_start) * 100) / 100;
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '14px 16px',
      boxShadow: '0 1px 6px rgba(0,0,0,.06)', borderLeft: `4px solid ${st.color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: canCancel && item.status === 'pending' ? 8 : 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1E2235' }}>
            {formatDate(item.date)}
            <span style={{ fontWeight: 400, color: '#6B6860', marginLeft: 8, fontSize: 12 }}>
              {hhmm(item.hour_start)} – {hhmm(item.hour_end)} · <strong>{hours}h</strong>
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#6B6860', marginTop: 3 }}>
            {item.function_name
              ? <>{item.function_icon} {item.function_name}</>
              : <span style={{ color: '#B0ACA5' }}>Fonction non précisée</span>
            }
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
      {canCancel && item.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn small variant="ghost" onClick={() => onCancel(item.id)} type="button">Annuler</Btn>
        </div>
      )}
    </div>
  );
}

/* ── Vue principale ─────────────────────────────────────────── */
export default function HourDeclarationView() {
  const { user }         = useAuth();
  const { staff } = useApp();

  const isManager = ['admin', 'manager', 'superadmin'].includes(user?.role);

  // Fonctions attribuées au salarié connecté (filtre le dropdown de déclaration)
  const staffMember   = staff.find(s => s.id === user?.staff_id);
  const myFunctions   = staffMember?.functions_detail ?? [];

  const [tab, setTab]             = useState('mine');
  const [modal, setModal]         = useState(false);
  const [myList, setMyList]       = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [reviewItem, setReviewItem]   = useState(null);
  const [loading, setLoading]         = useState(false);

  const loadMyList = useCallback(async () => {
    try {
      const r = await api.get('/hour-declarations');
      setMyList(Array.isArray(r.data) ? r.data : []);
    } catch { setMyList([]); }
  }, []);

  const loadPending = useCallback(async () => {
    if (!isManager) return;
    try {
      const r = await api.get('/hour-declarations?status=pending');
      setPendingList(Array.isArray(r.data) ? r.data : []);
    } catch { setPendingList([]); }
  }, [isManager]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMyList(), loadPending()]).finally(() => setLoading(false));
  }, [loadMyList, loadPending]);

  const handleCancel = async (id) => {
    if (!window.confirm('Annuler cette déclaration ?')) return;
    try {
      await api.delete(`/hour-declarations/${id}`);
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
    { id: 'mine',    label: `Mes déclarations (${myList.length})` },
    ...(isManager ? [{ id: 'pending', label: `À approuver (${pendingList.length})` }] : []),
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader
        title="⏰ Heures reliquat"
        sub="Déclarez vos heures de reliquat à effectuer et consultez leur statut"
        actions={
          user?.staff_id ? (
            <Btn variant="primary" onClick={() => setModal(true)}>+ Déclarer des heures</Btn>
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

        {/* ── Mes déclarations ── */}
        {tab === 'mine' && !loading && (
          <>
            {myList.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#9B9890', background: '#fff', borderRadius: 12 }}>
                Aucune déclaration pour le moment.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
              {myList.map(item => (
                <DeclCard key={item.id} item={item} canCancel={true} onCancel={handleCancel} />
              ))}
            </div>
          </>
        )}

        {/* ── À approuver (manager) ── */}
        {tab === 'pending' && isManager && !loading && (
          <>
            {pendingList.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#9B9890', background: '#fff', borderRadius: 12 }}>
                Aucune déclaration en attente d'approbation.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
              {pendingList.map(item => {
                const st = STATUS_CFG.pending;
                const hours = Math.round((item.hour_end - item.hour_start) * 100) / 100;
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
                          {formatDate(item.date)} · {hhmm(item.hour_start)} – {hhmm(item.hour_end)} · <strong>{hours}h</strong>
                          {item.function_name && <> · {item.function_icon} {item.function_name}</>}
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
          </>
        )}
      </div>

      {/* Modal formulaire */}
      {modal && (
        <Modal title="Déclarer des heures reliquat" onClose={() => setModal(false)} width={520}>
          <DeclForm staffFunctions={myFunctions} onSaved={handleSaved} onCancel={() => setModal(false)} />
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
