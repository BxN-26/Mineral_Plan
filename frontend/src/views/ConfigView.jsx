import { useState, useMemo } from 'react';
import { useApp } from '../App';
import { useAuth } from '../context/AuthContext';
import { Btn, Modal, Field, PageHeader } from '../components/common';
import api from '../api/client';

/* ─── Onglets disponibles ── */
const TABS = [
  { id: 'equipes',    label: '🏠 Équipes' },
  { id: 'fonctions',  label: '🔧 Fonctions' },
];

const ConfigView = () => {
  const { user }                                      = useAuth();
  const { teams, functions, reloadTeams, reloadFunctions } = useApp();
  const [tab, setTab]                                  = useState('equipes');
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9B9890', fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        Accès réservé aux administrateurs.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageHeader title="Configuration" subtitle="Équipes & fonctions" />

      {/* Onglets */}
      <div style={{ padding: '0 18px', borderBottom: '1px solid #ECEAE4', background: '#fff', display: 'flex', gap: 2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#1E2235' : '#9B9890', borderBottom: tab === t.id ? '2px solid #C5753A' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px' }}>
        {tab === 'equipes'   && <TeamsConfig   teams={teams}     reload={reloadTeams} />}
        {tab === 'fonctions' && <FunctionsConfig functions={functions} reload={reloadFunctions} />}
      </div>
    </div>
  );
};

/* ─── Gestion des équipes ──────────────────────────────── */
const TeamsConfig = ({ teams, reload }) => {
  const [edit,    setEdit]    = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [err,     setErr]     = useState('');

  const handleSave = async (data) => {
    try {
      if (edit) await api.put(`/teams/${edit.id}`, data);
      else      await api.post('/teams', data);
      await reload();
      setShowForm(false);
      setEdit(null);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur de sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette équipe ?')) return;
    try {
      await api.delete(`/teams/${id}`);
      await reload();
    } catch (e) {
      window.alert(e.response?.data?.error || 'Erreur de suppression');
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>Équipes ({teams.length})</span>
        <Btn variant="primary" onClick={() => { setEdit(null); setShowForm(true); setErr(''); }}>+ Nouvelle équipe</Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {teams.map(t => (
          <div key={t.id} style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>{t.name}</div>
              <div style={{ fontSize: 10, color: '#9B9890' }}>{t.slug}</div>
            </div>
            <button onClick={() => { setEdit(t); setShowForm(true); setErr(''); }}
              style={{ padding: '4px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11 }}>✏️</button>
            <button onClick={() => handleDelete(t.id)}
              style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', fontSize: 11, color: '#DC2626' }}>🗑</button>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={edit ? 'Modifier l\'équipe' : 'Nouvelle équipe'}>
          <TeamForm initial={edit} err={err} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
};

const TeamForm = ({ initial, err, onSave, onCancel }) => {
  const [form, setForm] = useState({ name: initial?.name || '', slug: initial?.slug || '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, color: '#DC2626', fontSize: 12 }}>{err}</div>}
      <Field label="Nom"><input value={form.name} onChange={e => set('name', e.target.value)} style={inp} /></Field>
      <Field label="Slug (identifiant)"><input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s/g, '_'))} style={inp} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" onClick={() => onSave(form)}>Enregistrer</Btn>
      </div>
    </div>
  );
};

/* ─── Gestion des fonctions ─────────────────────────── */
const FunctionsConfig = ({ functions, reload }) => {
  const [edit,     setEdit]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [err,      setErr]      = useState('');

  const handleSave = async (data) => {
    try {
      if (edit) await api.put(`/functions/${edit.id}`, data);
      else      await api.post('/functions', data);
      await reload();
      setShowForm(false);
      setEdit(null);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur de sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette fonction ?')) return;
    try {
      await api.delete(`/functions/${id}`);
      await reload();
    } catch (e) {
      window.alert(e.response?.data?.error || 'Erreur de suppression');
    }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>Fonctions ({functions.length})</span>
        <Btn variant="primary" onClick={() => { setEdit(null); setShowForm(true); setErr(''); }}>+ Nouvelle fonction</Btn>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8 }}>
        {functions.map(f => (
          <div key={f.id} style={{ background: '#fff', border: `1px solid ${f.color}30`, borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{f.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: f.color }}>{f.name}</div>
              <div style={{ fontSize: 10, color: '#9B9890' }}>{f.slug}</div>
            </div>
            <button onClick={() => { setEdit(f); setShowForm(true); setErr(''); }}
              style={{ padding: '4px 8px', border: '1px solid #E4E0D8', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 11 }}>✏️</button>
            <button onClick={() => handleDelete(f.id)}
              style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', fontSize: 11, color: '#DC2626' }}>🗑</button>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={edit ? 'Modifier la fonction' : 'Nouvelle fonction'}>
          <FunctionForm initial={edit} err={err} onSave={handleSave} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
};

const FunctionForm = ({ initial, err, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name:     initial?.name     || '',
    slug:     initial?.slug     || '',
    icon:     initial?.icon     || '⚙️',
    color:    initial?.color    || '#6B7280',
    bg_color: initial?.bg_color || '#F9FAFB',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {err && <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, color: '#DC2626', fontSize: 12 }}>{err}</div>}
      <Field label="Nom"><input value={form.name} onChange={e => set('name', e.target.value)} style={inp} /></Field>
      <Field label="Slug"><input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s/g, '_'))} style={inp} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Icône (emoji)"><input value={form.icon} onChange={e => set('icon', e.target.value)} style={inp} /></Field>
        <Field label="Couleur"><input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ ...inp, padding: 2, height: 36 }} /></Field>
        <Field label="Fond"><input type="color" value={form.bg_color} onChange={e => set('bg_color', e.target.value)} style={{ ...inp, padding: 2, height: 36 }} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" onClick={() => onSave(form)}>Enregistrer</Btn>
      </div>
    </div>
  );
};

const inp = { padding: '6px 8px', border: '1px solid #E4E0D8', borderRadius: 6, background: '#F5F3EF', fontSize: 12, width: '100%' };

export default ConfigView;
