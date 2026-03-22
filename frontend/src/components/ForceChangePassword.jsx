import { useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Modal bloquante affichée à la première connexion quand must_change_password = 1.
 * L'utilisateur ne peut PAS accéder à l'application sans avoir défini son mot de passe.
 */
export default function ForceChangePassword() {
  const { refreshUser } = useAuth();
  const [pw,  setPw]  = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [ok,  setOk]  = useState(false);

  const handleSubmit = async () => {
    setErr('');
    if (pw.length < 8)  return setErr('Le mot de passe doit contenir au moins 8 caractères.');
    if (pw !== pw2)     return setErr('Les deux mots de passe ne correspondent pas.');

    try {
      await api.post('/auth/force-change-password', { new_password: pw });
      setOk(true);
      // Recharge l'utilisateur — must_change_password sera 0
      setTimeout(() => refreshUser(), 800);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erreur lors du changement de mot de passe.');
    }
  };

  const inp = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #DEDAD4',
    fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    /* Overlay plein écran bloquant */
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(30,34,53,.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%',
        boxShadow: '0 24px 60px rgba(0,0,0,.3)',
      }}>
        {/* Icône */}
        <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 12 }}>🔐</div>

        <div style={{ fontWeight: 800, fontSize: 18, color: '#1E2235', textAlign: 'center', marginBottom: 6 }}>
          Définissez votre mot de passe
        </div>
        <div style={{ fontSize: 13, color: '#6B6860', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
          Pour des raisons de sécurité, vous devez choisir un mot de passe personnel
          avant d'accéder à l'application.<br />
          <strong>Ce mot de passe restera strictement confidentiel.</strong>
        </div>

        {ok ? (
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10,
            padding: '14px 16px', textAlign: 'center', color: '#16A34A', fontWeight: 600, fontSize: 14,
          }}>
            ✅ Mot de passe défini avec succès ! Chargement en cours…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {err && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
                padding: '10px 12px', color: '#DC2626', fontSize: 13,
              }}>{err}</div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B6860', display: 'block', marginBottom: 4 }}>
                Nouveau mot de passe
              </label>
              <input
                type="password" value={pw} onChange={e => setPw(e.target.value)}
                style={inp} placeholder="Au moins 8 caractères"
                autoFocus
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B6860', display: 'block', marginBottom: 4 }}>
                Confirmez le mot de passe
              </label>
              <input
                type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                style={inp} placeholder="Répétez le mot de passe"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {/* Indicateur de force */}
            {pw.length > 0 && (
              <div style={{ fontSize: 11, color: pw.length >= 8 ? '#16A34A' : '#C5753A' }}>
                {pw.length >= 12 ? '💪 Mot de passe fort' : pw.length >= 8 ? '✅ Longueur minimale atteinte' : `⚠️ ${8 - pw.length} caractère(s) manquant(s)`}
              </div>
            )}

            <button
              onClick={handleSubmit}
              style={{
                marginTop: 4, padding: '12px', borderRadius: 10, border: 'none',
                background: '#C5753A', color: '#fff', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Confirmer mon mot de passe
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
