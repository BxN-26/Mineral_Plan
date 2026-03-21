import { useState, useMemo } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { Avatar, Btn, Modal, PageHeader } from '../components/common';
import StaffForm from '../components/StaffForm';
import api from '../api/client';

const EquipeView = () => {
  const { user }                                                         = useAuth();
  const { staff, teams, functions, reloadStaff }                        = useApp();
  const [filterTeam, setFilterTeam]                                      = useState('all');
  const [filterType, setFilterType]                                      = useState('all');
  const [search,     setSearch]                                          = useState('');
  const [editStaff,  setEditStaff]                                       = useState(null);
  const [showForm,   setShowForm]                                        = useState(false);
  const [err,        setErr]                                             = useState('');

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

  const handleSave = async (data) => {
    try {
      if (editStaff) {
        await api.put(`/staff/${editStaff.id}`, data);
      } else {
        await api.post('/staff', data);
      }
      await reloadStaff();
      setShowForm(false);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur de sauvegarde');
    }
  };

  const handleToggleActive = async (s) => {
    try {
      await api.put(`/staff/${s.id}`, { active: s.active ? 0 : 1 });
      await reloadStaff();
    } catch (e) {
      console.error(e);
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {filtered.map(s => {
            const team  = teamMap[s.team_id];
            const fns   = (s.functions || []).map(slug => functions.find(f => f.slug === slug)).filter(Boolean);
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ECEAE4', padding: '14px 14px 12px', opacity: s.active ? 1 : .55, transition: 'box-shadow .15s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <Avatar s={s} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1E2235', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {s.firstname} {s.lastname}
                      {!s.active && <span style={{ fontSize: 9, background: '#F5EEE8', color: '#C5753A', borderRadius: 8, padding: '1px 6px' }}>Inactif</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9890' }}>{team?.name || '—'} · {s.initials}</div>
                    <div style={{ fontSize: 10, color: '#B0ACA5', marginTop: 2 }}>{s.type?.toUpperCase()} {s.contract_h ? `· ${s.contract_h}h` : ''}</div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => openEdit(s)}
                        style={{ padding: '3px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#5B5855' }}>✏️</button>
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
      </div>

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
