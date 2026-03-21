import { useState, useEffect } from 'react';
import { Field, Btn, inputSt } from './common';

const COLORS = ['#6366F1','#EC4899','#14B8A6','#F97316','#8B5CF6','#06B6D4','#22C55E','#EF4444','#F59E0B','#A855F7','#0EA5E9','#C5753A','#4A8C6E','#64748B'];

const EMPTY = {
  firstname: '', lastname: '', initials: '', contract_h: 0,
  team_ids: [],
  type: 'salarie', hourly_rate: 12, charge_rate: 0.45, color: '#6366F1',
  functions: [], primary_function: '', manager_id: null,
  cp_balance: 25, rtt_balance: 5, phone: '', email: '', hire_date: '', note: '',
  permission_level: 'standard', initial_password: '',
};

const toTeamIds = (s) => {
  if (Array.isArray(s?.team_ids) && s.team_ids.length) return s.team_ids.map(Number);
  if (s?.team_id) return [Number(s.team_id)];
  return [];
};

const StaffForm = ({ initial, teams, functions, onSave, onClose }) => {
  const [f, setF] = useState(() => initial ? {
    ...EMPTY,
    ...initial,
    team_ids:         toTeamIds(initial),
    cp_balance:       initial.cp_balance  ?? 0,
    rtt_balance:      initial.rtt_balance ?? 0,
    functions:        initial.functions || [],
    primary_function: initial.primary_function || '',
    manager_id:       initial.manager_id || null,
  } : { ...EMPTY });

  useEffect(() => {
    setF(initial ? { ...EMPTY, ...initial, team_ids: toTeamIds(initial), cp_balance: initial.cp_balance ?? 0, rtt_balance: initial.rtt_balance ?? 0, charge_rate: initial.charge_rate ?? 0.45, functions: initial.functions || [], primary_function: initial.primary_function || '', manager_id: initial.manager_id || null, permission_level: initial.permission_level || 'standard', initial_password: '' } : { ...EMPTY });
  }, [initial]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleFn = id => setF(p => ({
    ...p,
    functions: p.functions.includes(id) ? p.functions.filter(x => x !== id) : [...p.functions, id],
  }));
  const toggleTeam = id => setF(p => ({
    ...p,
    team_ids: p.team_ids.includes(id) ? p.team_ids.filter(x => x !== id) : [...p.team_ids, id],
  }));

  const save = () => {
    if (!f.firstname.trim()) return;
    const initials = f.initials || (f.firstname.slice(0, 1) + (f.lastname?.slice(0, 1) || f.firstname.slice(1, 2))).toUpperCase();
    onSave({ ...f, initials, team_ids: f.team_ids });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Prénom *"><input value={f.firstname} onChange={e => set('firstname', e.target.value)} style={inputSt} placeholder="Prénom" autoFocus /></Field>
        <Field label="Nom"><input value={f.lastname || ''} onChange={e => set('lastname', e.target.value)} style={inputSt} placeholder="Nom de famille" /></Field>
        <Field label="Initiales"><input value={f.initials || ''} onChange={e => set('initials', e.target.value)} style={inputSt} placeholder="Ex: MA" /></Field>
      </div>

      <Field label="Équipes (sélection multiple)">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {teams.map(t => {
            const sel = f.team_ids.includes(Number(t.id));
            return (
              <button key={t.id} onClick={() => toggleTeam(Number(t.id))} type="button" style={{
                padding: '4px 10px', borderRadius: 20,
                border: `1.5px solid ${sel ? t.color : '#E4E0D8'}`,
                background: sel ? (t.bg_color || t.color + '22') : '#fff',
                color: sel ? t.color : '#9B9890',
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: sel ? 700 : 400,
              }}>
                {t.icon} {t.name}
              </button>
            );
          })}
        </div>
        {f.team_ids.length === 0 && <div style={{ fontSize: 11, color: '#C5753A', marginTop: 4 }}>Aucune équipe sélectionnée</div>}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Type de contrat">
          <select value={f.type} onChange={e => set('type', e.target.value)} style={inputSt}>
            <option value="salarie">Salarié(e)</option>
            <option value="renfort">Renfort / Vacation</option>
            <option value="independant">Indépendant</option>
            <option value="benevole">Bénévole</option>
          </select>
        </Field>
        <Field label="Heures / sem"><input type="number" value={f.contract_h} onChange={e => set('contract_h', +e.target.value)} style={inputSt} /></Field>
        <Field label="Taux horaire (€)"><input type="number" step="0.5" value={f.hourly_rate} onChange={e => set('hourly_rate', +e.target.value)} style={inputSt} /></Field>
        <Field label="Taux charges (%)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" step="1" min="0" max="100"
              value={Math.round((f.charge_rate ?? 0.45) * 100)}
              onChange={e => set('charge_rate', +e.target.value / 100)}
              style={{ ...inputSt, width: 80 }} />
            <span style={{ fontSize: 12, color: '#8B8880' }}>% (charges patronales)</span>
          </div>
        </Field>
        <Field label="Email"><input type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} style={inputSt} /></Field>
        <Field label="Téléphone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} style={inputSt} /></Field>
        <Field label="Date d'entrée"><input type="date" value={f.hire_date || ''} onChange={e => set('hire_date', e.target.value)} style={inputSt} /></Field>
        <Field label="Solde CP (jours)"><input type="number" value={f.cp_balance} onChange={e => set('cp_balance', +e.target.value)} style={inputSt} /></Field>
        <Field label="Solde RTT (jours)"><input type="number" value={f.rtt_balance} onChange={e => set('rtt_balance', +e.target.value)} style={inputSt} /></Field>
      </div>

      <Field label="Couleur d'identification">
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
          {COLORS.map(c => (
            <button key={c} onClick={() => set('color', c)} style={{
              width: 26, height: 26, borderRadius: 6, background: c,
              border: `3px solid ${f.color === c ? '#1E2235' : 'transparent'}`, cursor: 'pointer',
            }} />
          ))}
        </div>
      </Field>

      <Field label="Postes / Fonctions habilitées">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
          {functions.map(fn => {
            const sel = f.functions.includes(fn.slug);
            return (
              <button key={fn.slug} onClick={() => toggleFn(fn.slug)} style={{
                padding: '3px 9px', borderRadius: 20,
                border: `1.5px solid ${sel ? fn.color : '#E4E0D8'}`,
                background: sel ? (fn.bg_color || fn.bg || fn.color + '22') : '#fff',
                color: sel ? fn.color : '#9B9890',
                cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: sel ? 700 : 400,
              }}>
                {fn.icon} {fn.name}
              </button>
            );
          })}
        </div>
        {f.functions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#6B6860', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 600 }}>Fonction principale</div>
            <select value={f.primary_function || ''} onChange={e => set('primary_function', e.target.value)} style={{ ...inputSt, width: 'auto' }}>
              <option value="">Aucune</option>
              {f.functions.map(slug => {
                const fn = functions.find(x => x.slug === slug);
                return fn ? <option key={slug} value={slug}>{fn.icon} {fn.name}</option> : null;
              })}
            </select>
          </div>
        )}
      </Field>

      <Field label="Note interne">
        <textarea value={f.note || ''} onChange={e => set('note', e.target.value)} rows={2}
          style={{ ...inputSt, resize: 'vertical' }} placeholder="Informations complémentaires…" />
      </Field>

      {/* Accès application */}
      <div style={{ borderTop: '2px solid #F0EDE8', paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Accès application</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Niveau d'accès">
            <select value={f.permission_level || 'standard'} onChange={e => set('permission_level', e.target.value)} style={inputSt}>
              <option value="standard">Standard — Planning &amp; profil</option>
              <option value="bureau">Bureau/Admin — + Équipe &amp; congés</option>
              <option value="direction">Direction — Accès complet</option>
            </select>
          </Field>
          {!initial ? (
            <Field label="Mot de passe initial">
              <input type="password" value={f.initial_password || ''}
                onChange={e => set('initial_password', e.target.value)} style={inputSt}
                placeholder="Laisser vide = pas de compte" />
            </Field>
          ) : (
            <div style={{ paddingTop: 18 }}>
              {initial.user_role
                ? <span style={{ fontSize: 11, background: '#EBF5F0', color: '#4A8C6E', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>✅ Compte actif — rôle : {initial.user_role}</span>
                : <span style={{ fontSize: 11, background: '#FFF4EC', color: '#C5753A', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>⚠️ Aucun compte lié</span>
              }
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid #F0EDE8' }}>
        <Btn onClick={save} variant="primary" style={{ flex: 1, justifyContent: 'center' }}>
          ✓ {initial ? 'Enregistrer les modifications' : 'Créer le membre'}
        </Btn>
        <Btn onClick={onClose}>Annuler</Btn>
      </div>
    </div>
  );
};

export default StaffForm;
