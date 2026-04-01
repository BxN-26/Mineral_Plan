import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Btn, Field, inputSt, Tag } from '../components/common';
import AvatarImg from '../components/AvatarImg';
import { useAuth } from '../context/AuthContext';
import { useApp }  from '../App';
import api from '../api/client';

const LEAVE_STATUS_COLOR = {
  pending:     { color: '#F97316', bg: '#FFF3E0', label: 'En attente' },
  approved_n1: { color: '#6366F1', bg: '#EEF2FF', label: 'Approuvé N1' },
  approved:    { color: '#4A8C6E', bg: '#EBF5F0', label: 'Approuvé' },
  refused:     { color: '#EF4444', bg: '#FEF2F2', label: 'Refusé' },
  cancelled:   { color: '#9B9890', bg: '#F5F3EF', label: 'Annulé' },
};

export default function MonProfilView() {
  const { user } = useAuth();
  const { staff: allStaff, reloadStaff, leaves: allLeaves } = useApp();

  const myStaff = allStaff.find(s => s.id === user?.staff_id) || null;
  const myLeaves = (allLeaves || [])
    .filter(l => l.staff_id === user?.staff_id)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  /* ── État formulaires ──────────────────────────────────────── */
  const [pwForm,  setPwForm]  = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwOk,    setPwOk]    = useState('');
  const [saving,  setSaving]  = useState(false);

  const setPw = (k, v) => setPwForm(p => ({ ...p, [k]: v }));

  const changePassword = async () => {
    setPwError(''); setPwOk('');
    if (!pwForm.current || !pwForm.next) return setPwError('Remplissez tous les champs.');
    if (pwForm.next !== pwForm.confirm)  return setPwError('Les mots de passe ne correspondent pas.');
    if (pwForm.next.length < 8)          return setPwError('8 caractères minimum.');
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password:     pwForm.next,
      });
      setPwOk('Mot de passe modifié avec succès !');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (e) {
      setPwError(e.response?.data?.error || 'Erreur lors du changement.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpdate = useCallback((updatedStaff) => {
    reloadStaff?.();
  }, [reloadStaff]);

  const s = myStaff;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageHeader title="Mon Profil" sub="Informations personnelles et paramètres" />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Photo & identité ──────────────────────────────── */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', marginBottom: 18 }}>Identité</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              {s ? (
                <AvatarImg
                  s={s} size={80}
                  editable={true}
                  onUpdate={handleAvatarUpdate}
                />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: 14, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>👤</div>
              )}
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1E2235' }}>
                  {s ? `${s.firstname} ${s.lastname}` : user?.email}
                </div>
                {s && <div style={{ fontSize: 13, color: '#6B6860', marginTop: 4 }}>{s.team_name || 'Aucune équipe'}</div>}
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Tag color="#6366F1" bg="#EEF2FF">{user?.role}</Tag>
                  {s?.type && <Tag color="#14B8A6" bg="#E0F7FA">{s.type}</Tag>}
                  {s?.functions_detail?.map(fn => (
                    <Tag key={fn.slug} color={fn.color} bg={fn.bg_color || fn.color + '22'}>{fn.icon} {fn.name}</Tag>
                  ))}
                </div>
              </div>
            </div>

            {s && (
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Email',          value: s.email    || '—' },
                  { label: 'Téléphone',      value: s.phone    || '—' },
                  { label: 'Contrat',        value: (() => {
                    if (s.contract_base === 'aucune')    return 'Sans base horaire';
                    if (s.contract_base === 'annualise') return `${s.contract_h || '?'} h/an (Annualisé)`;
                    return `${s.contract_h || '?'} h/sem (Hebdomadaire)`;
                  })() },
                  { label: 'Embauche',       value: s.hire_date ? new Date(s.hire_date).toLocaleDateString('fr-FR') : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#F9F7F4', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#1E2235', marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Soldes congés ─────────────────────────────────── */}
          {s && (
            <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', marginBottom: 16 }}>Soldes de congés</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Congés payés (CP)', value: s.cp_balance ?? 0, unit: 'jours', color: '#C5753A' },
                  { label: 'RTT',               value: s.rtt_balance ?? 0, unit: 'jours', color: '#6366F1' },
                ].map(({ label, value, unit, color }) => (
                  <div key={label} style={{
                    flex: 1, minWidth: 150, borderRadius: 10, padding: '16px 20px',
                    background: color + '12', borderLeft: `4px solid ${color}`,
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 12, color: '#6B6860', marginTop: 2 }}>{unit}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E2235', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Historique congés ─────────────────────────────── */}
          {myLeaves.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', marginBottom: 16 }}>
                Historique des demandes ({myLeaves.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myLeaves.slice(0, 20).map(l => {
                  const st = LEAVE_STATUS_COLOR[l.status] || LEAVE_STATUS_COLOR.pending;
                  return (
                    <div key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 8, background: '#F9F7F4',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E2235' }}>
                          {l.leave_type || l.type || 'Congé'}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B6860', marginTop: 1 }}>
                          Du {new Date(l.start_date).toLocaleDateString('fr-FR')} au {new Date(l.end_date).toLocaleDateString('fr-FR')}
                          {l.days_count ? ` — ${l.days_count} j` : ''}
                        </div>
                      </div>
                      <Tag color={st.color} bg={st.bg}>{st.label}</Tag>
                    </div>
                  );
                })}
                {/* M1 — indiquer si la liste est tronquée */}
                {myLeaves.length > 20 && (
                  <div style={{ fontSize: 12, color: '#9B9890', textAlign: 'center', paddingTop: 4 }}>
                    {myLeaves.length - 20} demande(s) plus ancienne(s) non affichée(s) — consultez l'onglet Congés pour l'historique complet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Changer mot de passe ──────────────────────────── */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', marginBottom: 18 }}>Changer le mot de passe</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
              <Field label="Mot de passe actuel">
                <input type="password" value={pwForm.current}
                  onChange={e => setPw('current', e.target.value)}
                  style={inputSt} placeholder="••••••••" autoComplete="current-password" />
              </Field>
              <Field label="Nouveau mot de passe">
                <input type="password" value={pwForm.next}
                  onChange={e => setPw('next', e.target.value)}
                  style={inputSt} placeholder="8 caractères minimum" autoComplete="new-password" />
              </Field>
              <Field label="Confirmer le nouveau mot de passe">
                <input type="password" value={pwForm.confirm}
                  onChange={e => setPw('confirm', e.target.value)}
                  style={inputSt} placeholder="••••••••" autoComplete="new-password" />
              </Field>

              {pwError && <div style={{ color: '#EF4444', fontSize: 13 }}>{pwError}</div>}
              {pwOk    && <div style={{ color: '#4A8C6E', fontSize: 13 }}>{pwOk}</div>}

              <Btn onClick={changePassword} variant="primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
                {saving ? 'Enregistrement…' : '🔒 Changer le mot de passe'}
              </Btn>
            </div>
          </div>

          {/* ── Documentation ─────────────────────────────────── */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', marginBottom: 16 }}>Documentation</div>
            <p style={{ fontSize: 13, color: '#6B6860', marginBottom: 16, lineHeight: 1.6 }}>
              Ce guide vous explique comment utiliser l'application : consulter votre planning, déposer des congés, déclarer une indisponibilité, proposer un échange…
            </p>
            <a
              href="/docs/manuel_staff.pdf"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: '#4A8C6E', color: '#fff', textDecoration: 'none',
                boxShadow: '0 1px 4px rgba(74,140,110,.25)',
              }}
            >
              📄 Ouvrir le guide du personnel (PDF)
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
