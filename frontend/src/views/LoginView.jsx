import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Field, inputSt } from '../components/common';
import api from '../api/client';

// F1 — credentials démo via .env.local (jamais en dur dans le source)
// Définir VITE_DEMO_PASS_ADMIN, _MANAGER, _STAFF, _VACATION dans frontend/.env.local
const PRESETS = [
  { label: 'Admin',            email: 'admin@mineral-spirit.fr',     pass: import.meta.env.VITE_DEMO_PASS_ADMIN    || '', color: '#C5753A' },
  { label: 'Marion (Manager)', email: 'marion@mineral-spirit.fr',    pass: import.meta.env.VITE_DEMO_PASS_MANAGER  || '', color: '#6366F1' },
  { label: 'Eva (Salarié)',    email: 'eva@mineral-spirit.fr',       pass: import.meta.env.VITE_DEMO_PASS_STAFF    || '', color: '#14B8A6' },
  { label: 'Matéo (Vacation)', email: 'mateo@email.fr',              pass: import.meta.env.VITE_DEMO_PASS_VACATION || '', color: '#F59E0B' },
];

const LoginView = () => {
  const { login } = useAuth();
  const [email,   setEmail]   = useState('');
  const [pass,    setPass]    = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  // ── État modal "Mot de passe oublié" ────────────────────────
  const [forgotOpen,    setForgotOpen]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotDone,    setForgotDone]    = useState(false);
  const [forgotErr,     setForgotErr]     = useState('');

  const handle = async e => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email.toLowerCase().trim(), pass);
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async e => {
    e.preventDefault();
    setForgotErr('');
    setForgotLoading(true);
    try {
      await api.post('/auth/reset-request', { email: forgotEmail.toLowerCase().trim() });
      setForgotDone(true);
    } catch (ex) {
      // 503 = SMTP non configuré, on l'affiche explicitement
      if (ex.response?.status === 503) {
        setForgotErr(ex.response.data?.error || 'Reset par email non disponible sur ce serveur.');
      } else {
        // Pour toute autre erreur, message générique (pas d'info téchnique)
        setForgotErr('Une erreur est survenue. Réessayez dans quelques instants.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  return (
  <>
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#181C2E', padding: 16, position: 'relative', overflow: 'hidden' }}>

      {/* Filigrane propriété */}
      <div style={{
        position: 'absolute', bottom: 40, right: 30,
        transform: 'rotate(-12deg)',
        transformOrigin: 'bottom left',
        pointerEvents: 'none', userSelect: 'none',
        opacity: 0.07, width: 340, zIndex: 0,
      }}>
        <img src="/logo_mineral_noir_et_blanc.png" alt="" style={{ width: '100%', filter: 'invert(1)' }} />
      </div>

      {/* Copyright bas de page */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0, right: 0,
        textAlign: 'center', fontSize: 10,
        color: 'rgba(255,255,255,.12)', letterSpacing: '1px',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        © {new Date().getFullYear()} Minéral Spirit — Tous droits réservés
      </div>
      <div className="fade-in" style={{ width: 400, background: '#fff', borderRadius: 16, padding: 36, boxShadow: '0 24px 80px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <img src="/logo_mineral_plan.png" alt="minéral Spirit" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#1E2235' }}>Minéral Plan.</div>
            <div style={{ fontSize: 12, color: '#8B8880' }}>Gestion du personnel & Plannings</div>
          </div>
        </div>

        <form onSubmit={handle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <Field label="Email">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={inputSt} placeholder="votre@email.fr" required autoFocus />
            </Field>
            <Field label="Mot de passe">
              <input type="password" value={pass} onChange={e => setPass(e.target.value)}
                style={inputSt} placeholder="••••••••" required />
            </Field>
          </div>
          {err && (
            <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCD0D0', borderRadius: 7, fontSize: 12, color: '#EF4444', marginBottom: 14 }}>
              {err}
            </div>
          )}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: 11, background: loading ? '#E4E0D8' : '#C5753A',
            border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {loading ? 'Connexion en cours…' : 'Se connecter →'}
          </button>
        </form>

        {/* Lien mot de passe oublié */}
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            onClick={() => { setForgotOpen(true); setForgotEmail(email); setForgotDone(false); setForgotErr(''); }}
            style={{ background: 'none', border: 'none', color: '#9B9890', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}
          >
            Mot de passe oublié ?
          </button>
        </div>

        <div style={{ marginTop: 24 }}>
          {import.meta.env.DEV && (
            <>
              <div style={{ fontSize: 10, color: '#C0BCB5', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Accès rapide — démonstration
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {PRESETS.map(p => (
                  <button key={p.email} onClick={() => { setEmail(p.email); setPass(p.pass); }}
                    style={{ padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${p.color}30`, background: `${p.color}10`, color: p.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {/* ── Modal Mot de passe oublié ─────────────────────────── */}
    {forgotOpen && (
      <div
        role="dialog" aria-modal="true" aria-labelledby="forgot-title"
        style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      >
        {/* Backdrop */}
        <div
          onClick={() => setForgotOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }}
          aria-hidden="true"
        />
        <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>
          <button
            onClick={() => setForgotOpen(false)}
            aria-label="Fermer"
            style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9B9890', lineHeight: 1, padding: 0 }}
          >×</button>

          <div id="forgot-title" style={{ fontWeight: 700, fontSize: 16, color: '#1E2235', marginBottom: 6 }}>
            Mot de passe oublié
          </div>

          {!forgotDone ? (
            <>
              <p style={{ fontSize: 13, color: '#5B5855', marginBottom: 18, lineHeight: 1.5 }}>
                Saisissez votre adresse email. Si un compte actif lui est associé, vous recevrez un lien de réinitialisation valable <strong>30 minutes</strong>.
              </p>
              <form onSubmit={handleForgot}>
                <Field label="Email">
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    style={inputSt}
                    placeholder="votre@email.fr"
                    required
                    autoFocus
                  />
                </Field>
                {forgotErr && (
                  <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCD0D0', borderRadius: 7, fontSize: 12, color: '#EF4444', margin: '10px 0 0' }}>
                    {forgotErr}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={forgotLoading}
                  style={{ width: '100%', marginTop: 16, padding: 11, background: forgotLoading ? '#E4E0D8' : '#C5753A', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: forgotLoading ? 'default' : 'pointer', fontFamily: 'inherit' }}
                >
                  {forgotLoading ? 'Envoi en cours…' : 'Envoyer le lien →'}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#1E2235', marginBottom: 8 }}>
                Email envoyé
              </p>
              <p style={{ fontSize: 13, color: '#5B5855', lineHeight: 1.5 }}>
                Si l'adresse <strong>{forgotEmail}</strong> correspond à un compte actif, vous allez recevoir un email avec un lien de réinitialisation.
              </p>
              <button
                onClick={() => setForgotOpen(false)}
                style={{ marginTop: 20, padding: '9px 24px', background: '#1E2235', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Retour à la connexion
              </button>
            </div>
          )}
        </div>
      </div>
    )}
  </>
  );
};

export default LoginView;
