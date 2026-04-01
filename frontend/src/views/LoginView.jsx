import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Field, inputSt } from '../components/common';

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

  return (
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
  );
};

export default LoginView;
