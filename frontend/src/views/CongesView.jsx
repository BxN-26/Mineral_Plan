import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { Btn, BtnSpinner, Modal, Field, PageHeader, ConfirmModal } from '../components/common';
import { SkeletonLeaves } from '../components/Skeleton';
import AvatarImg from '../components/AvatarImg';
import api from '../api/client';
import { isMyApproval } from '../utils/leaveUtils';

const STATUS_CONFIG = {
  pending:     { label: 'En attente',              bg: '#FEF9C3', color: '#A16207', icon: '⏳' },
  approved_n1: { label: 'Validé N1 — attente N2',  bg: '#DBEAFE', color: '#1D4ED8', icon: '🔄' },
  approved_n2: { label: 'Validé N2 — attente N3',  bg: '#EDE9FE', color: '#6D28D9', icon: '🔄' },
  approved:    { label: 'Approuvé',                 bg: '#DCFCE7', color: '#15803D', icon: '✅' },
  refused:     { label: 'Refusé',                   bg: '#FEE2E2', color: '#DC2626', icon: '❌' },
  cancelled:   { label: 'Annulé',                   bg: '#F3F4F6', color: '#6B7280', icon: '🚫' },
};

const CongesView = () => {
  const { user }                                                = useAuth();
  const { staff, leaves, leaveTypes, setLeaves, reloadLeaves } = useApp();
  const [filterStatus, setFilterStatus]                         = useState('all');
  const [filterType,   setFilterType]                           = useState('all');
  const [tab,          setTab]                                  = useState('all'); // 'all' | 'mine'
  const [showForm,     setShowForm]                             = useState(false);
  const [refuseModal,  setRefuseModal]                          = useState(null); // { id, label }
  const [confirmDelete, setConfirmDelete]                       = useState(null); // { id, label }
  const [err,          setErr]                                  = useState('');
  const [loadingIds,   setLoadingIds]                           = useState({});   // { [id]: 'approve'|'refuse'|'delete' }
  const [skeletonDone, setSkeletonDone]                         = useState(false); // true une fois les feuilles chargées au moins une fois

  const isAdmin    = ['admin', 'superadmin'].includes(user?.role);
  const isMgr      = ['manager', 'rh', 'admin', 'superadmin'].includes(user?.role);
  const myStaffId  = staff.find(s => s.id === user?.staff_id)?.id || null;

  // Utilise la fonction centralisée isMyApproval
  const checkApproval = useCallback((l) => isMyApproval(l, user), [user?.id]);

  const canApproveOrRefuse = (l) => {
    if (!['pending','approved_n1','approved_n2'].includes(l.status)) return false;
    return isAdmin || checkApproval(l);
  };

  const leaveTypesMap = useMemo(
    () => Object.fromEntries(leaveTypes.map(lt => [lt.slug, lt])),
    [leaveTypes]
  );

  const filtered = useMemo(() => {
    return leaves.filter(l => {
      if (!isMgr && l.staff_id !== myStaffId) return false;
      if (tab === 'mine' && !checkApproval(l)) return false;
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      if (filterType   !== 'all' && l.type_slug !== filterType)  return false;
      return true;
    });
  }, [leaves, filterStatus, filterType, isMgr, myStaffId, tab, checkApproval]);

  const grouped = useMemo(() => {
    const g = {};
    for (const l of filtered) {
      const sid = l.staff_id;
      if (!g[sid]) g[sid] = [];
      g[sid].push(l);
    }
    return g;
  }, [filtered]);

  const staffMap       = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff]);
  const myApprovalsCount = useMemo(() => leaves.filter(l => checkApproval(l)).length, [leaves, checkApproval]);

  // Marquer le skeleton comme terminé dès que les données sont disponibles
  useEffect(() => { if (leaves.length > 0 || staff.length > 0) setSkeletonDone(true); }, [leaves.length, staff.length]);

  const setLoading = (id, action) => setLoadingIds(p => ({ ...p, [id]: action }));
  const clearLoading = (id) => setLoadingIds(p => { const n = { ...p }; delete n[id]; return n; });

  const handleApprove = async (id) => {
    setLoading(id, 'approve');
    // Optimistic : retire immédiatement de la vue "Mes approbations"
    setLeaves(prev => prev.map(l => l.id === id
      ? { ...l, n1_status: l.n1_approver_id === user.id ? 'approved' : l.n1_status,
                n2_status: l.n2_approver_id === user.id ? 'approved' : l.n2_status,
                n3_status: l.n3_approver_id === user.id ? 'approved' : l.n3_status }
      : l
    ));
    try {
      await api.put(`/leaves/${id}/approve`);
      toast.success('Congé approuvé ✓');
      reloadLeaves();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de l\'approbation');
      reloadLeaves(); // rétablir l'état réel
    } finally {
      clearLoading(id);
    }
  };

  const handleRefuse = async (id, comment) => {
    setLoading(id, 'refuse');
    try {
      await api.put(`/leaves/${id}/refuse`, { comment });
      toast.success('Congé refusé');
      reloadLeaves();
      setRefuseModal(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors du refus');
    } finally {
      clearLoading(id);
    }
  };

  const handleDelete = async (id) => {
    setLoading(id, 'delete');
    try {
      await api.delete(`/leaves/${id}`);
      // Optimistic : retirer immédiatement de la liste locale
      setLeaves(prev => prev.filter(l => l.id !== id));
      toast.success('Demande annulée');
      setConfirmDelete(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erreur lors de la suppression');
    } finally {
      clearLoading(id);
    }
  };

  const canDelete = (l) => {
    if (isAdmin) return true;
    if (isMgr && l.status !== 'approved') return true;
    return l.staff_id === myStaffId && l.status === 'pending';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Congés & absences" subtitle={`${leaves.length} demande${leaves.length !== 1 ? 's' : ''}`}>
        <Btn variant="primary" onClick={() => { setShowForm(true); setErr(''); }}>+ Nouvelle demande</Btn>
      </PageHeader>

      {/* Tabs pour managers/RH */}
      {isMgr && (
        <div style={{ display: 'flex', gap: 4, padding: '8px 18px 0', borderBottom: '1px solid #ECEAE4', background: '#fff' }}>
          {[
            { id: 'all',  label: 'Toutes les demandes' },
            { id: 'mine', label: `Mes approbations`, badge: myApprovalsCount },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? '#C5753A' : '#6B6860', fontFamily: 'inherit',
              borderBottom: tab === t.id ? '2px solid #C5753A' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ background: '#C5753A', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
        {!skeletonDone && <SkeletonLeaves rows={5} />}
        {skeletonDone && Object.entries(grouped).length === 0 && (
          <div style={{ textAlign: 'center', color: '#9B9890', padding: 40, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🌴</div>
            {tab === 'mine' ? 'Aucune approbation en attente' : 'Aucune demande'}
          </div>
        )}
        {skeletonDone && Object.entries(grouped).map(([sid, sidLeaves]) => {
          const s = staffMap[Number(sid)];
          return (
            <div key={sid} style={{ marginBottom: 16 }}>
              {isMgr && s && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <AvatarImg s={s} size={24} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1E2235' }}>{s.firstname} {s.lastname}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sidLeaves.map(l => {
                  const lt  = leaveTypesMap[l.type_slug] || {};
                  const st  = STATUS_CONFIG[l.status]    || STATUS_CONFIG.pending;
                  const myStep = isMyApproval(l) && !isAdmin;
                  return (
                    <div key={l.id} style={{
                      background: '#fff', border: `1px solid ${myStep ? '#FDE68A' : '#ECEAE4'}`,
                      borderLeft: myStep ? '3px solid #D97706' : '1px solid #ECEAE4',
                      borderRadius: 10, padding: '10px 14px',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      {/* Badge type */}
                      <div style={{ padding: '3px 8px', borderRadius: 12, background: lt.bg_color || '#F5F5F5', color: lt.color || '#9B9890', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {lt.short_label || lt.slug || '?'}
                      </div>
                      {/* Infos */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>
                          {formatDate(l.start_date)} → {formatDate(l.end_date)}
                          {l.days_count > 0 && <span style={{ color: '#9B9890', fontWeight: 400, fontSize: 11 }}> · {l.days_count}j</span>}
                        </div>
                        {l.reason && <div style={{ fontSize: 11, color: '#9B9890', marginTop: 2 }}>{l.reason}</div>}
                        {/* Document justificatif */}
                        {l.document_url && (
                          <a href={l.document_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#5B75DB', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            📎 Justificatif
                          </a>
                        )}
                        {/* Commentaires approbateurs */}
                        {(l.n1_comment || l.n2_comment || l.n3_comment) && (
                          <div style={{ fontSize: 10, color: '#6B6860', marginTop: 3, fontStyle: 'italic' }}>
                            {[l.n1_comment, l.n2_comment, l.n3_comment].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                      {/* Statut + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <div style={{ padding: '3px 8px', borderRadius: 12, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                          {st.icon} {st.label}
                        </div>
                        {canApproveOrRefuse(l) && (
                          <>
                            <button
                              onClick={() => handleApprove(l.id)}
                              disabled={!!loadingIds[l.id]}
                              title="Approuver"
                              aria-label="Approuver ce congé"
                              style={{ padding: '4px 8px', border: '1px solid #BBF7D0', borderRadius: 6, background: '#F0FDF4', cursor: loadingIds[l.id] ? 'default' : 'pointer', fontSize: 11, color: '#15803D', fontFamily: 'inherit', opacity: loadingIds[l.id] ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {loadingIds[l.id] === 'approve' ? <BtnSpinner /> : '✓'}
                            </button>
                            <button
                              onClick={() => setRefuseModal({ id: l.id, label: `${lt.label || 'congé'} du ${formatDate(l.start_date)} au ${formatDate(l.end_date)}` })}
                              disabled={!!loadingIds[l.id]}
                              title="Refuser"
                              aria-label="Refuser ce congé"
                              style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 6, background: '#FEF2F2', cursor: loadingIds[l.id] ? 'default' : 'pointer', fontSize: 11, color: '#DC2626', fontFamily: 'inherit', opacity: loadingIds[l.id] ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {loadingIds[l.id] === 'refuse' ? <BtnSpinner /> : '✕'}
                            </button>
                          </>
                        )}
                        {canDelete(l) && (
                          <button
                            onClick={() => setConfirmDelete({ id: l.id, label: `la demande du ${formatDate(l.start_date)} au ${formatDate(l.end_date)}` })}
                            disabled={!!loadingIds[l.id]}
                            title="Annuler"
                            aria-label="Annuler cette demande de congé"
                            style={{ padding: '4px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#fff', cursor: loadingIds[l.id] ? 'default' : 'pointer', fontSize: 11, color: '#9B9890', fontFamily: 'inherit', opacity: loadingIds[l.id] ? .6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {loadingIds[l.id] === 'delete' ? <BtnSpinner /> : '🗑'}
                          </button>
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

      {/* Modal refus avec commentaire */}
      {refuseModal && (
        <RefuseModal
          label={refuseModal.label}
          onConfirm={(comment) => handleRefuse(refuseModal.id, comment)}
          onClose={() => setRefuseModal(null)}
        />
      )}

      {/* Modal confirmation annulation */}
      {confirmDelete && (
        <ConfirmModal
          message={`Annuler ${confirmDelete.label} ?`}
          confirmLabel="Oui, annuler"
          onConfirm={() => handleDelete(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {/* Formulaire nouvelle demande */}
      {showForm && (
        <NewLeaveModal
          staff={isMgr ? staff : staff.filter(s => s.id === myStaffId)}
          leaveTypes={leaveTypes}
          myStaffId={myStaffId}
          isMgr={isMgr}
          err={err}
          setErr={setErr}
          onSave={async (data, docFile) => {
            try {
              const res = await api.post('/leaves', data);
              const { id, balance_warning } = res.data;
              // Upload justificatif si fourni
              if (docFile && id) {
                const fd = new FormData();
                fd.append('document', docFile);
                try { await api.post(`/leaves/${id}/document`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); }
                catch (_) {
                  // E6 — informer l'utilisateur : la demande est créée mais le justificatif n'a pas été envoyé
                  toast.warning('La demande a été créée, mais le justificatif n\'a pas pu être envoyé. Vous pouvez le joindre ultérieurement.');
                }
              }
              await reloadLeaves();
              setShowForm(false);
              if (balance_warning) toast.warning(balance_warning);
              else toast.success('Demande de congé envoyée ✓');
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

// ── Modale de refus avec commentaire ────────────────────────
const RefuseModal = ({ label, onConfirm, onClose }) => {
  const [comment, setComment] = useState('');
  return (
    <Modal open onClose={onClose} title="Refuser la demande">
      <p style={{ fontSize: 13, color: '#1E2235', marginBottom: 12 }}>
        Vous êtes sur le point de refuser :<br />
        <strong>{label}</strong>
      </p>
      <Field label="Motif du refus (optionnel)">
        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Précisez la raison si nécessaire…"
          rows={3}
          style={{ padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
      </Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <Btn onClick={onClose}>Annuler</Btn>
        <Btn variant="danger" onClick={() => onConfirm(comment)}>Confirmer le refus</Btn>
      </div>
    </Modal>
  );
};

// ── Formulaire de création ───────────────────────────────────
const NewLeaveModal = ({ staff, leaveTypes, myStaffId, isMgr, err, setErr, onSave, onClose }) => {
  const { user } = useAuth();

  const [form, setForm] = useState({
    staff_id:   myStaffId || (staff[0]?.id ?? ''),
    type_id:    leaveTypes[0]?.id ?? '',
    start_date: '',
    end_date:   '',
    reason:     '',
    half_start: false,
    half_end:   false,
  });
  const [docFile,      setDocFile]      = useState(null);
  const [balanceInfo,  setBalanceInfo]  = useState(null); // { bal, slug }
  const [loadingBal,   setLoadingBal]   = useState(false);
  const [holidays,     setHolidays]     = useState([]); // dates YYYY-MM-DD
  const docRef = useRef();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedType = leaveTypes.find(lt => lt.id === Number(form.type_id));
  const requiresDoc  = selectedType?.requires_doc === 1;
  const isHoursType  = selectedType?.count_method === 'hours';

  // Charger le solde quand staff_id ou type change (CP/RTT seulement)
  useEffect(() => {
    if (!form.staff_id || !selectedType) return;
    if (!['cp','rtt'].includes(selectedType.slug)) { setBalanceInfo(null); return; }
    setLoadingBal(true);
    api.get(`/leaves/balance/${form.staff_id}`)
      .then(r => {
        const bal = selectedType.slug === 'cp'
          ? r.data.balances?.cp_balance
          : r.data.balances?.rtt_balance;
        setBalanceInfo({ bal: bal ?? 0, slug: selectedType.slug });
      })
      .catch(() => setBalanceInfo(null))
      .finally(() => setLoadingBal(false));
  }, [form.staff_id, form.type_id]);

  // Charger les jours fériés pour l'année sélectionnée (+ suivante si besoin)
  useEffect(() => {
    if (!form.start_date) return;
    const year = new Date(form.start_date + 'T12:00:00').getFullYear();
    Promise.all([
      api.get(`/holidays?year=${year}`),
      api.get(`/holidays?year=${year + 1}`),
    ]).then(([r1, r2]) => {
      const dates = new Set([...(r1.data || []), ...(r2.data || [])].map(h => h.date));
      setHolidays([...dates]);
    }).catch(() => {});
  }, [form.start_date]);

  // Calculer nb jours approximatif côté frontend pour l'aperçu (exclut week-end + fériés)
  const approxDays = useMemo(() => {
    if (!form.start_date || !form.end_date || isHoursType) return null;
    const s = new Date(form.start_date + 'T12:00:00');
    const e = new Date(form.end_date + 'T12:00:00');
    if (e < s) return null;
    const holidaySet = new Set(holidays);
    let days = 0;
    const d = new Date(s);
    while (d <= e) {
      const dow = d.getDay();
      const ds  = d.toISOString().slice(0, 10);
      if (dow !== 0 && !holidaySet.has(ds)) days++;
      d.setDate(d.getDate() + 1);
    }
    if (form.half_start) days -= 0.5;
    if (form.half_end)   days -= 0.5;
    return Math.max(0, days);
  }, [form.start_date, form.end_date, form.half_start, form.half_end, isHoursType, holidays]);

  const isSingleDay  = form.start_date && form.end_date && form.start_date === form.end_date;
  const isMultiDay   = form.start_date && form.end_date && form.start_date < form.end_date;
  const balanceOk    = balanceInfo === null || approxDays === null || approxDays <= balanceInfo.bal;

  const inputSt = { padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%', fontFamily: 'inherit' };
  const checkSt = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5B5855', cursor: 'pointer', userSelect: 'none' };

  return (
    <Modal open onClose={onClose} title="Nouvelle demande de congé">
      {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Salarié (managers et admins seulement) */}
        {isMgr && (
          <Field label="Salarié">
            <select value={form.staff_id} onChange={e => set('staff_id', Number(e.target.value))} style={inputSt}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.firstname} {s.lastname}</option>)}
            </select>
          </Field>
        )}

        {/* Type d'absence */}
        <Field label="Type d'absence">
          <select value={form.type_id} onChange={e => set('type_id', Number(e.target.value))} style={inputSt}>
            {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.label}</option>)}
          </select>
          {/* Info chaîne d'approbation */}
          {selectedType?.approval_levels && (
            <div style={{ fontSize: 10, color: '#9B9890', marginTop: 3 }}>
              Approbation requise : {(Array.isArray(selectedType.approval_levels)
                ? selectedType.approval_levels
                : JSON.parse(selectedType.approval_levels || '[]')
              ).map(lvl => ({ manager: 'Manager', rh: 'RH', direction: 'Direction' }[lvl] || lvl)).join(' → ')}
            </div>
          )}
        </Field>

        {/* Solde */}
        {balanceInfo !== null && (
          <div style={{
            padding: '6px 10px', borderRadius: 7,
            background: balanceOk ? '#F0FDF4' : '#FEF9C3',
            border: `1px solid ${balanceOk ? '#BBF7D0' : '#FDE68A'}`,
            fontSize: 11, color: balanceOk ? '#15803D' : '#92400E',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {loadingBal ? '⏳ Chargement solde…' : (
              <>
                {balanceOk ? '✅' : '⚠️'}
                <span>
                  Solde {balanceInfo.slug === 'cp' ? 'CP' : 'RTT'} disponible : <strong>{balanceInfo.bal} jour{balanceInfo.bal !== 1 ? 's' : ''}</strong>
                  {approxDays !== null && <> · Demande : <strong>{approxDays} jour{approxDays !== 1 ? 's' : ''}</strong></>}
                  {!balanceOk && <> · <em>Solde insuffisant — la demande sera quand même transmise.</em></>}
                </span>
              </>
            )}
          </div>
        )}

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Début">
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={inputSt} />
          </Field>
          <Field label="Fin">
            <input type="date" value={form.end_date}
              min={form.start_date || undefined}
              onChange={e => set('end_date', e.target.value)} style={inputSt} />
          </Field>
        </div>

        {/* Options demi-journée */}
        {(isSingleDay || isMultiDay) && !isHoursType && (
          <div style={{ background: '#F9F8F6', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #ECEAE4' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B6860', marginBottom: 2 }}>Options demi-journée</div>
            {isSingleDay ? (
              // Congé sur un seul jour
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label style={checkSt}>
                  <input type="radio" name="halfDay" checked={!form.half_start && !form.half_end}
                    onChange={() => { set('half_start', false); set('half_end', false); }} />
                  Journée entière
                </label>
                <label style={checkSt}>
                  <input type="radio" name="halfDay" checked={form.half_start && !form.half_end}
                    onChange={() => { set('half_start', true); set('half_end', false); }} />
                  Après-midi seulement (0,5 j)
                </label>
                <label style={checkSt}>
                  <input type="radio" name="halfDay" checked={!form.half_start && form.half_end}
                    onChange={() => { set('half_start', false); set('half_end', true); }} />
                  Matin seulement (0,5 j)
                </label>
              </div>
            ) : (
              // Congé multi-jours
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label style={checkSt}>
                  <input type="checkbox" checked={!!form.half_start} onChange={e => set('half_start', e.target.checked)} />
                  1er jour : après-midi seulement (−0,5 j)
                </label>
                <label style={checkSt}>
                  <input type="checkbox" checked={!!form.half_end} onChange={e => set('half_end', e.target.checked)} />
                  Dernier jour : matin seulement (−0,5 j)
                </label>
              </div>
            )}
            {approxDays !== null && (
              <div style={{ fontSize: 11, color: '#9B9890' }}>
                Décompte estimé : <strong>{approxDays} jour{approxDays !== 1 ? 's' : ''}</strong> (selon jours ouvrés)
              </div>
            )}
          </div>
        )}

        {/* Document justificatif */}
        {requiresDoc && (
          <Field label={`Justificatif ${requiresDoc ? '(obligatoire)' : '(optionnel)'}`}>
            <input type="file" ref={docRef} accept="image/*,.pdf"
              onChange={e => setDocFile(e.target.files?.[0] || null)}
              style={{ fontSize: 12 }} />
            {docFile && <div style={{ fontSize: 10, color: '#15803D', marginTop: 3 }}>📎 {docFile.name}</div>}
          </Field>
        )}

        {/* Motif */}
        <Field label="Motif (optionnel)">
          <input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="ex. Vacances d'été…" style={inputSt} />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" onClick={() => onSave({
            staff_id:   form.staff_id,
            type_id:    form.type_id,
            start_date: form.start_date,
            end_date:   form.end_date,
            reason:     form.reason,
            half_start: form.half_start ? 1 : 0,
            half_end:   form.half_end   ? 1 : 0,
          }, docFile)}>Envoyer la demande</Btn>
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
