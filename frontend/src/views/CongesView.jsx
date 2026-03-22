import { useState, useMemo } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { Btn, Modal, Field, PageHeader } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import api from '../api/client';

const STATUS_CONFIG = {
  pending:     { label: 'En attente',    bg: '#FEF9C3', color: '#A16207', icon: '⏳' },
  approved_n1: { label: 'Validé N1 — en attente N2', bg: '#DBEAFE', color: '#1D4ED8', icon: '🔄' },
  approved_n2: { label: 'Validé N2 — en attente N3', bg: '#EDE9FE', color: '#6D28D9', icon: '🔄' },
  approved:    { label: 'Approuvé',      bg: '#DCFCE7', color: '#15803D', icon: '✅' },
  refused:     { label: 'Refusé',        bg: '#FEE2E2', color: '#DC2626', icon: '❌' },
  partial:     { label: 'Partiel',       bg: '#DBEAFE', color: '#1D4ED8', icon: '🔵' },
};

const CongesView = () => {
  const { user }                                                 = useAuth();
  const { staff, leaves, leaveTypes, setLeaves, reloadLeaves }  = useApp();
  const [filterStatus, setFilterStatus]                          = useState('all');
  const [filterType,   setFilterType]                            = useState('all');
  const [showForm,     setShowForm]                              = useState(false);
  const [err,          setErr]                                   = useState('');

  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  const myStaffId = staff.find(s => s.id === user?.staff_id)?.id || null;

  // Map leaveTypes par slug
  const leaveTypesMap = useMemo(
    () => Object.fromEntries(leaveTypes.map(lt => [lt.slug, lt])),
    [leaveTypes]
  );

  const filtered = useMemo(() => {
    return leaves.filter(l => {
      if (!isAdmin && l.staff_id !== myStaffId) return false;
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      if (filterType   !== 'all' && l.type_slug !== filterType)  return false;
      return true;
    });
  }, [leaves, filterStatus, filterType, isAdmin, myStaffId]);

  const grouped = useMemo(() => {
    const g = {};
    for (const l of filtered) {
      const sid = l.staff_id;
      if (!g[sid]) g[sid] = [];
      g[sid].push(l);
    }
    return g;
  }, [filtered]);

  const handleApprove = async (id) => {
    try {
      await api.put(`/leaves/${id}/approve`);
      await reloadLeaves();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefuse = async (id) => {
    try {
      await api.put(`/leaves/${id}/refuse`);
      await reloadLeaves();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette demande ?')) return;
    try {
      await api.delete(`/leaves/${id}`);
      await reloadLeaves();
    } catch (e) {
      console.error(e);
    }
  };

  const staffMap = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const pendingCount = leaves.filter(l => l.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Congés & absences" subtitle={pendingCount > 0 ? `${pendingCount} en attente d'approbation` : `${leaves.length} demande${leaves.length !== 1 ? 's' : ''}`}>
        <Btn variant="primary" onClick={() => { setShowForm(true); setErr(''); }}>+ Nouvelle demande</Btn>
      </PageHeader>

      {/* Filtres */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, cursor: 'pointer' }}>
          <option value="all">Tous statuts</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, cursor: 'pointer' }}>
          <option value="all">Tous types</option>
          {leaveTypes.map(lt => <option key={lt.slug} value={lt.slug}>{lt.label}</option>)}
        </select>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {Object.entries(grouped).length === 0 && (
          <div style={{ textAlign: 'center', color: '#9B9890', padding: 40, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🌴</div>Aucune demande
          </div>
        )}
        {Object.entries(grouped).map(([sid, sidLeaves]) => {
          const s = staffMap[Number(sid)];
          return (
            <div key={sid} style={{ marginBottom: 16 }}>
              {isAdmin && s && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <AvatarImg s={s} size={24} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1E2235' }}>{s.firstname} {s.lastname}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sidLeaves.map(l => {
                  const lt  = leaveTypesMap[l.type_slug] || {};
                  const st  = STATUS_CONFIG[l.status]     || STATUS_CONFIG.pending;
                  const canAct = isAdmin && ['pending', 'approved_n1', 'approved_n2'].includes(l.status);
                  return (
                    <div key={l.id} style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {/* Badge type */}
                      <div style={{ padding: '3px 8px', borderRadius: 12, background: lt.bg_color || '#F5F5F5', color: lt.color || '#9B9890', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {lt.short_label || lt.slug || '?'}
                      </div>
                      {/* Dates */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>
                          {formatDate(l.start_date)} → {formatDate(l.end_date)}
                          {l.days_count && <span style={{ color: '#9B9890', fontWeight: 400, fontSize: 11 }}> · {l.days_count}j</span>}
                        </div>
                        {l.reason && <div style={{ fontSize: 11, color: '#9B9890', marginTop: 2 }}>{l.reason}</div>}
                      </div>
                      {/* Statut */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <div style={{ padding: '3px 8px', borderRadius: 12, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                          {st.icon} {st.label}
                        </div>
                        {canAct && (
                          <>
                            <button onClick={() => handleApprove(l.id)}
                              style={{ padding: '4px 8px', border: '1px solid #BBF7D0', borderRadius: 6, background: '#F0FDF4', cursor: 'pointer', fontSize: 10, color: '#15803D' }}>✓</button>
                            <button onClick={() => handleRefuse(l.id)}
                              style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 6, background: '#FEF2F2', cursor: 'pointer', fontSize: 10, color: '#DC2626' }}>✕</button>
                          </>
                        )}
                        {(isAdmin || l.status === 'pending') && (
                          <button onClick={() => handleDelete(l.id)}
                            style={{ padding: '4px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 10, color: '#9B9890' }}>🗑</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulaire nouvelle demande */}
      {showForm && (
        <NewLeaveModal
          staff={isAdmin ? staff : staff.filter(s => s.id === myStaffId)}
          leaveTypes={leaveTypes}
          myStaffId={myStaffId}
          err={err}
          setErr={setErr}
          onSave={async (data) => {
            try {
              await api.post('/leaves', data);
              await reloadLeaves();
              setShowForm(false);
            } catch (e) {
              setErr(e.response?.data?.error || 'Erreur lors de la création');
            }
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

const NewLeaveModal = ({ staff, leaveTypes, myStaffId, err, setErr, onSave, onClose }) => {
  const { user } = useAuth();
  const isAdmin  = ['admin', 'superadmin'].includes(user?.role);

  const [form, setForm] = useState({
    staff_id:   myStaffId || (staff[0]?.id ?? ''),
    type_id:    leaveTypes[0]?.id ?? '',
    start_date: '',
    end_date:   '',
    reason:     '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Modal open onClose={onClose} title="Nouvelle demande de congé">
      {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isAdmin && (
          <Field label="Salarié">
            <select value={form.staff_id} onChange={e => set('staff_id', Number(e.target.value))}
              style={{ padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' }}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.firstname} {s.lastname}</option>)}
            </select>
          </Field>
        )}
        <Field label="Type d'absence">
          <select value={form.type_id} onChange={e => set('type_id', Number(e.target.value))}
            style={{ padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' }}>
            {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Début">
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
              style={{ padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' }} />
          </Field>
          <Field label="Fin">
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
              style={{ padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' }} />
          </Field>
        </div>
        <Field label="Motif (optionnel)">
          <input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="ex. Vacances d'été…"
            style={{ padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' }} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" onClick={() => onSave(form)}>Envoyer la demande</Btn>
        </div>
      </div>
    </Modal>
  );
};

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default CongesView;
