// ── Composants de base partagés ────────────────────────────────
// Extraits et fidèles au design de spirit-staff-v3.html
import { useState, useEffect, useRef, forwardRef } from 'react';
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

export const Btn = forwardRef(({ onClick, children, variant = 'default', small, disabled, style: extra = {} }, ref) => (
  <button ref={ref} onClick={onClick} disabled={disabled} style={{
    padding: small ? '4px 10px' : '7px 14px',
    borderRadius: 7, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: small ? 11 : 13, fontWeight: 500, fontFamily: 'inherit',
    opacity: disabled ? .5 : 1, ...VARIANTS[variant], ...extra,
  }}>
    {children}
  </button>
));

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
  const dialogRef = useRef(null);

  // Fermeture sur Escape
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Focus trap minimal : ramener le focus dans la modal si Tab sort
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} aria-hidden="true" />
      <div ref={dialogRef} className="fade-in" style={{
        position: 'relative', width, maxWidth: '95vw', maxHeight: '92vh',
        overflow: 'auto', background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,.2)', zIndex: 1,
      }}>
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid #ECEAE4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#fff', zIndex: 2,
        }}>
          <div id="modal-title" style={{ fontWeight: 700, fontSize: 16, color: '#1E2235' }}>{title}</div>
          <button onClick={onClose} aria-label="Fermer" style={{
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

/** Petit spinner inline pour les boutons en attente */
export const BtnSpinner = () => (
  <span style={{
    display: 'inline-block', width: 12, height: 12,
    border: '2px solid currentColor', borderTopColor: 'transparent',
    borderRadius: '50%', animation: 'spin .6s linear infinite',
  }} />
);

// Injecter l'animation spin une seule fois
if (typeof document !== 'undefined' && !document.getElementById('spirit-spin-style')) {
  const el = document.createElement('style');
  el.id = 'spirit-spin-style';
  el.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(el);
}

/**
 * Modale de confirmation native-free.
 * Props : message, confirmLabel, onConfirm, onClose, variant ('danger'|'default')
 */
export const ConfirmModal = ({ message, confirmLabel = 'Confirmer', onConfirm, onClose, variant = 'danger' }) => {
  const btnRef = useRef(null);
  // Focus trap : focus sur le bouton de confirmation à l'ouverture
  useEffect(() => { btnRef.current?.focus(); }, []);
  // Fermeture sur Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} aria-hidden="true" />
      <div style={{
        position: 'relative', background: '#fff', borderRadius: 12, padding: '24px 28px',
        maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        zIndex: 1,
      }}>
        <div id="confirm-modal-title" style={{ fontWeight: 700, fontSize: 15, color: '#1E2235', marginBottom: 12 }}>
          Confirmation requise
        </div>
        <p style={{ fontSize: 13, color: '#4B4840', marginBottom: 20, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn ref={btnRef} variant={variant} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
};

/** Skeleton block animé (placeholder de chargement) */
export const SkeletonBlock = ({ width = '100%', height = 14, borderRadius = 6, style: extra = {} }) => (
  <div style={{
    width, height, borderRadius,
    background: 'linear-gradient(90deg, #F0EDE8 25%, #E8E4DF 50%, #F0EDE8 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.4s infinite',
    ...extra,
  }} />
);

// Injecter l'animation skeleton une seule fois
if (typeof document !== 'undefined' && !document.getElementById('spirit-skeleton-style')) {
  const el = document.createElement('style');
  el.id = 'spirit-skeleton-style';
  el.textContent = '@keyframes skeleton-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }';
  document.head.appendChild(el);
}
