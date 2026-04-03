import { useState, useEffect } from 'react';
import api from '../api/client';
import { Field, inputSt } from '../components/common';

/**
 * ResetPasswordView — Page de saisie du nouveau mot de passe
 * Accessible via le lien email : /?reset_token=xxxx
 * Utilise le token en query param, jamais stocké en localStorage.
 */
const ResetPasswordView = ({ token, onDone }) => {
  const [pass,     setPass]     = useState('');
  const [passConf, setPassConf] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [err,      setErr]      = useState('');
  const [showPass, setShowPass] = useState(false);

  // Validation locale avant envoi
  const validate = () => {
    if (pass.length < 8)       return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (pass !== passConf)     return 'Les deux mots de passe ne correspondent pas.';
    // Exigences minimales de complexité
    if (!/[A-Z]/.test(pass))   return 'Le mot de passe doit contenir au moins une majuscule.';
    if (!/[0-9]/.test(pass))   return 'Le mot de passe doit contenir au moins un chiffre.';
    return null;
  };

  const handle = async e => {
    e.preventDefault();
    const validationErr = validate();
    if (validationErr) { setErr(validationErr); return; }

    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/reset-confirm', { token, new_password: pass });
      setSuccess(true);
      // Nettoyer l'URL (retirer le token de la barre d'adresse)
      if (window.history?.replaceState) {
        window.history.replaceState({}, '', '/');
      }
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Une erreur est survenue. Ce lien est peut-être expiré.');
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    if (!pass) return null;
    let score = 0;
    if (pass.length >= 8)   score++;
    if (pass.length >= 12)  score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^a-zA-Z0-9]/.test(pass)) score++;
    if (score <= 2) return { label: 'Faible',   color: '#EF4444' };
    if (score <= 3) return { label: 'Moyen',    color: '#F59E0B' };
    return              { label: 'Fort',     color: '#22C55E' };
  })();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#181C2E', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, padding: 36, boxShadow: '0 24px 80px rgba(0,0,0,.4)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <img src="/logo_mineral_plan.png" alt="Minéral Plan" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#1E2235' }}>Minéral Plan.</div>
            <div style={{ fontSize: 12, color: '#8B8880' }}>Réinitialisation du mot de passe</div>
          </div>
        </div>

        {success ? (
          /* ── Succès ─────────────────────────────────────────── */
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#1E2235', marginBottom: 8 }}>
              Mot de passe mis à jour !
            </p>
            <p style={{ fontSize: 13, color: '#5B5855', lineHeight: 1.5, marginBottom: 24 }}>
              Votre mot de passe a été réinitialisé avec succès.<br />
              Toutes vos sessions précédentes ont été déconnectées.
            </p>
            <button
              onClick={onDone}
              style={{ width: '100%', padding: 11, background: '#C5753A', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Se connecter →
            </button>
          </div>
        ) : (
          /* ── Formulaire ─────────────────────────────────────── */
          <>
            <p style={{ fontSize: 13, color: '#5B5855', marginBottom: 20, lineHeight: 1.5 }}>
              Choisissez un nouveau mot de passe sécurisé. Il doit contenir au moins 8 caractères, une majuscule et un chiffre.
            </p>

            <form onSubmit={handle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>

                {/* Nouveau mot de passe */}
                <Field label="Nouveau mot de passe">
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={pass}
                      onChange={e => { setPass(e.target.value); setErr(''); }}
                      style={{ ...inputSt, paddingRight: 40 }}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9B9890', padding: 0, lineHeight: 1 }}
                      tabIndex={-1}
                      aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {/* Indicateur de force */}
                  {strength && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#E4E0D8', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: strength.label === 'Faible' ? '33%' : strength.label === 'Moyen' ? '66%' : '100%', background: strength.color, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: strength.color, fontWeight: 600, minWidth: 32 }}>{strength.label}</span>
                    </div>
                  )}
                </Field>

                {/* Confirmation */}
                <Field label="Confirmer le mot de passe">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={passConf}
                    onChange={e => { setPassConf(e.target.value); setErr(''); }}
                    style={{ ...inputSt, borderColor: passConf && pass !== passConf ? '#EF4444' : undefined }}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                  />
                  {passConf && pass !== passConf && (
                    <span style={{ fontSize: 11, color: '#EF4444', marginTop: 3, display: 'block' }}>
                      Les mots de passe ne correspondent pas
                    </span>
                  )}
                </Field>
              </div>

              {err && (
                <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCD0D0', borderRadius: 7, fontSize: 12, color: '#EF4444', marginBottom: 14 }}>
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: 11, background: loading ? '#E4E0D8' : '#C5753A', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {loading ? 'Enregistrement…' : 'Définir le nouveau mot de passe →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordView;
