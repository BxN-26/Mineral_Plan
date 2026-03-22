// ── Composants de base partagés ────────────────────────────────
// Extraits et fidèles au design de spirit-staff-v3.html
import AvatarImg from './AvatarImg';

/** Affiche la photo si disponible, sinon les initiales colorées */
export const Avatar = ({ s, size = 30 }) => <AvatarImg s={s} size={size} />;

export const Tag = ({ color, bg, children, style: extra = {} }) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
    color, background: bg,
    display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
    ...extra,
  }}>
    {children}
  </span>
);

const VARIANTS = {
  default: { background: '#fff',      border: '1px solid #E4E0D8', color: '#1E2235' },
  primary: { background: '#C5753A',   border: 'none',               color: '#fff' },
  danger:  { background: '#FEF2F2',   border: '1px solid #FCD0D0',  color: '#EF4444' },
  success: { background: '#EBF5F0',   border: '1px solid #C8E8D8',  color: '#4A8C6E' },
  ghost:   { background: 'transparent', border: '1px solid #E4E0D8', color: '#8B8880' },
};

export const Btn = ({ onClick, children, variant = 'default', small, disabled, style: extra = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? '4px 10px' : '7px 14px',
    borderRadius: 7, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: small ? 11 : 13, fontWeight: 500, fontFamily: 'inherit',
    opacity: disabled ? .5 : 1, ...VARIANTS[variant], ...extra,
  }}>
    {children}
  </button>
);

export const inputSt = {
  width: '100%', padding: '8px 10px', border: '1px solid #E4E0D8',
  borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};

export const Field = ({ label, children }) => (
  <div>
    <div style={{
      fontSize: 11, fontWeight: 600, color: '#6B6860', marginBottom: 4,
      textTransform: 'uppercase', letterSpacing: '.4px',
    }}>{label}</div>
    {children}
  </div>
);

export const Modal = ({ open = true, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div className="fade-in" style={{
        position: 'relative', width, maxWidth: '95vw', maxHeight: '92vh',
        overflow: 'auto', background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,.2)', zIndex: 1,
      }}>
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid #ECEAE4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#fff', zIndex: 2,
        }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E2235' }}>{title}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, color: '#9B9890', fontSize: 18, display: 'flex',
          }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px 22px' }}>{children}</div>
      </div>
    </div>
  );
};

export const PageHeader = ({ title, sub, subtitle, actions, children }) => {
  const label = sub || subtitle;
  const btns  = children || actions;
  return (
    <div style={{
      padding: '18px 24px 14px', borderBottom: '1px solid #ECEAE4', background: '#fff',
      display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#1E2235' }}>{title}</div>
        {label && <div style={{ fontSize: 12, color: '#8B8880', marginTop: 2 }}>{label}</div>}
      </div>
      {btns && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{btns}</div>}
    </div>
  );
};

export const Spinner = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#181C2E',
  }}>
    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
      <img src="/logo_mineral_plan.png" alt="minéral Spirit" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', marginBottom: 12, opacity: 0.85 }} />
      <div style={{ fontSize: 14 }}>Chargement…</div>
    </div>
  </div>
);
