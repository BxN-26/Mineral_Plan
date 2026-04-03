import { useState, useMemo } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { Avatar, Btn, Modal, PageHeader } from '../components/common';
import { SkeletonCards } from '../components/Skeleton';
import StaffForm from '../components/StaffForm';
import api from '../api/client';
import { toast } from 'sonner';

const EquipeView = () => {
  const { user }                                                         = useAuth();
  const { staff, teams, functions, reloadStaff }                        = useApp();
  const [filterTeam, setFilterTeam]                                      = useState('all');
  const [filterType, setFilterType]                                      = useState('all');
  const [search,     setSearch]                                          = useState('');
  const [editStaff,  setEditStaff]                                       = useState(null);
  const [showForm,   setShowForm]                                        = useState(false);
  const [err,        setErr]                                             = useState('');
  const [hoveredCard, setHoveredCard]                                    = useState(null); // id de la carte survolée
  const [isReloading, setIsReloading]                                    = useState(false);
  const [resetTarget, setResetTarget]                                    = useState(null);
  const [resetPwd,    setResetPwd]                                       = useState('');
  const [resetPwd2,   setResetPwd2]                                      = useState('');
  const [resetLoading,setResetLoading]                                   = useState(false);
  const [resetErr,    setResetErr]                                       = useState('');

  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter(s => {
      if (!s.active && !isAdmin) return false;
      if (filterTeam !== 'all' && s.team_id !== Number(filterTeam)) return false;
      if (filterType !== 'all' && s.type !== filterType) return false;
      if (q && !(`${s.firstname} ${s.lastname} ${s.initials}`).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [staff, filterTeam, filterType, search, isAdmin]);

  const openNew  = () => { setEditStaff(null); setShowForm(true); setErr(''); };
  const openEdit = s  => { setEditStaff(s);    setShowForm(true); setErr(''); };

  const openReset = s => { setResetTarget(s); setResetPwd(''); setResetPwd2(''); setResetErr(''); };

  const handleReset = async () => {
    if (resetPwd.length < 8) return setResetErr('8 caractères minimum');
    if (resetPwd !== resetPwd2) return setResetErr('Les mots de passe ne correspondent pas');
    setResetLoading(true); setResetErr('');
    try {
      await api.post(`/staff/${resetTarget.id}/reset-password`, { new_password: resetPwd });
      toast.success(`Mot de passe de ${resetTarget.firstname} réinitialisé. Il devra le changer à la prochaine connexion.`);
      setResetTarget(null);
    } catch (e) {
      setResetErr(e.response?.data?.error || 'Erreur lors de la réinitialisation');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editStaff) {
        await api.put(`/staff/${editStaff.id}`, data);
        toast.success('Salarié mis à jour');
      } else {
        await api.post('/staff', data);
        toast.success('Salarié créé');
      }
      setShowForm(false);
      setIsReloading(true);
      await reloadStaff();
      setIsReloading(false);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur de sauvegarde');
    }
  };

  const handleToggleActive = async (s) => {
    try {
      await api.put(`/staff/${s.id}`, { active: s.active ? 0 : 1 });
      toast.success(s.active ? 'Salarié désactivé' : 'Salarié réactivé');
      setIsReloading(true);
      await reloadStaff();
      setIsReloading(false);
    } catch (e) {
      setIsReloading(false);
      toast.error('Erreur lors de la modification');
    }
  };

  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Équipe" subtitle={`${filtered.length} salarié${filtered.length !== 1 ? 's' : ''}`}>
        {isAdmin && <Btn variant="primary" onClick={openNew}>+ Nouveau salarié</Btn>}
      </PageHeader>

      {/* Filtres */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher…"
          style={{ padding: '5px 10px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, outline: 'none', minWidth: 160 }}
        />
        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, cursor: 'pointer' }}>
          <option value="all">Toutes équipes</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, cursor: 'pointer' }}>
          <option value="all">Tous types</option>
          <option value="cdi">CDI</option>
          <option value="cdd">CDD</option>
          <option value="renfort">Renfort/Vacation</option>
        </select>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {isReloading ? <SkeletonCards count={Math.max(filtered.length, 6)} /> : (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {filtered.map(s => {
            const team  = teamMap[s.team_id];
            const fns   = (s.functions || []).map(slug => functions.find(f => f.slug === slug)).filter(Boolean);
            return (
              <div key={s.id}
                style={{ background: '#fff', borderRadius: 12, border: '1px solid #ECEAE4', padding: '14px 14px 12px',
                  opacity: s.active ? 1 : .55,
                  transition: 'box-shadow .15s',
                  boxShadow: hoveredCard === s.id ? '0 2px 12px rgba(0,0,0,.08)' : 'none',
                }}
                onMouseEnter={() => setHoveredCard(s.id)}
                onMouseLeave={() => setHoveredCard(null)}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <Avatar s={s} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {s.firstname} {s.lastname}
                      {!s.active && <span style={{ fontSize: 9, background: '#F5EEE8', color: '#C5753A', borderRadius: 8, padding: '1px 6px' }}>Inactif</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9890' }}>{team?.name || '—'} · {s.initials}</div>
                    <div style={{ fontSize: 10, color: '#B0ACA5', marginTop: 2 }}>
                      {s.type?.toUpperCase()}
                      {s.contract_base === 'aucune' ? '' :
                        s.contract_h ? ` · ${s.contract_h}h/${s.contract_base === 'annualise' ? 'an' : 'sem'}` : ''}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => openEdit(s)}
                        style={{ padding: '3px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#5B5855' }}>✏️</button>
                      {user?.role === 'superadmin' || (user?.role === 'admin' && s.user_role !== 'superadmin') ? (
                      <button onClick={() => openReset(s)}
                        title="Réinitialiser le mot de passe"
                        style={{ padding: '3px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#5B5855' }}>🔑</button>
                      ) : null}
                      <button onClick={() => handleToggleActive(s)}
                        style={{ padding: '3px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#5B5855' }}
                        title={s.active ? 'Désactiver' : 'Réactiver'}>
                        {s.active ? '🚫' : '✅'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Fonctions */}
                {fns.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {fns.map(fn => (
                      <span key={fn.slug} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 12, background: fn.bg_color || '#F5F5F5', color: fn.color, border: `1px solid ${fn.color}30`, fontWeight: 600 }}>
                        {fn.icon} {fn.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Soldes */}
                <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 8, borderTop: '1px solid #F0EDE8' }}>
                  <div style={{ fontSize: 10, color: '#9B9890' }}>CP <strong style={{ color: '#1E2235' }}>{s.cp_balance ?? '—'}j</strong></div>
                  <div style={{ fontSize: 10, color: '#9B9890' }}>RTT <strong style={{ color: '#1E2235' }}>{s.rtt_balance ?? '—'}j</strong></div>
                  {s.email && <div style={{ fontSize: 10, color: '#9B9890', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✉️ {s.email}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9B9890', padding: 40, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>Aucun résultat
          </div>
        )}
        </>
        )}
      </div>

      {/* Modal réinitialisation mot de passe */}
      {resetTarget && (
        <Modal onClose={() => setResetTarget(null)} title={`Réinitialiser le mot de passe — ${resetTarget.firstname} ${resetTarget.lastname}`}>
          {resetErr && <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{resetErr}</div>}
          <p style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 16 }}>
            Un nouveau mot de passe temporaire sera attribué. L'utilisateur devra le modifier à sa prochaine connexion.
          </p>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#1E2235' }}>Nouveau mot de passe</label>
            <input type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)}
              placeholder="8 caractères minimum"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E4E0D8', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#1E2235' }}>Confirmer le mot de passe</label>
            <input type="password" value={resetPwd2} onChange={e => setResetPwd2(e.target.value)}
              placeholder="Même mot de passe"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E4E0D8', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="secondary" onClick={() => setResetTarget(null)}>Annuler</Btn>
            <Btn variant="primary" onClick={handleReset} disabled={resetLoading}>
              {resetLoading ? 'En cours…' : 'Réinitialiser'}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editStaff ? 'Modifier un salarié' : 'Nouveau salarié'}>
          {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#DC2626', fontSize: 12, marginBottom: 10 }}>{err}</div>}
          <StaffForm
            initial={editStaff}
            teams={teams}
            functions={functions}
            staff={staff}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
};

export default EquipeView;
