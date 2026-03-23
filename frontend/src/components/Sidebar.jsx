import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotifBell from './NotifBell';

const Sidebar = ({ view, setView, leaves, isOpen = true, isMobile = false, onClose = () => {} }) => {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);
  const isMgr   = ['manager', 'rh', 'admin', 'superadmin'].includes(user?.role);
  const isRh    = ['rh', 'admin', 'superadmin'].includes(user?.role);
  const isStaff = !isMgr;
  const pending  = leaves.filter(l => l.status === 'pending' || l.status === 'approved_n1').length;

  const nav = [
    { id: 'mon-planning',       label: 'Mon Planning',        icon: '👤', sub: 'Ma vue personnelle' },
    { id: 'planning-equipe',    label: 'Planning Équipe',     icon: '🗓️', sub: 'Ma / mes équipes' },
    ...(isStaff ? [{ id: 'planning-general', label: 'Planning Général', icon: '📋', sub: 'Toutes fonctions' }] : []),
    ...(isMgr   ? [{ id: 'planning',         label: 'Planning',          icon: '📅', sub: 'Édition multi-fonctions' }] : []),
    ...(isMgr   ? [{ id: 'equipe',           label: 'Équipe',            icon: '👥', sub: 'Membres & fonctions' }] : []),
    { id: 'conges', label: isMgr ? 'Congés' : 'Mes congés', icon: '🏖️', sub: 'Approbation workflow', badge: isMgr && pending > 0 ? pending : 0 },
    ...(isMgr   ? [{ id: 'releves',          label: 'Relevés',           icon: '⏱️', sub: 'Heures & export' }] : []),
    ...(!isMgr && user?.staff_id ? [{ id: 'releves', label: 'Mes relevés', icon: '⏱️', sub: 'Mes heures & balance' }] : []),
    ...(isRh    ? [{ id: 'stats',            label: 'Statistiques',      icon: '📊', sub: 'Analyse & KPIs' }] : []),
    ...(isAdmin ? [{ id: 'costs',            label: 'Coûts',             icon: '💶', sub: 'Masse salariale' }] : []),
    { id: 'echanges',           label: 'Échanges',            icon: '🔄', sub: 'Créneaux & swaps' },
    { id: 'profil',             label: 'Mon Profil',          icon: '🪪', sub: 'Infos & mot de passe' },
    ...(isAdmin ? [{ id: 'config',           label: 'Configuration',     icon: '⚙️', sub: 'Équipes & fonctions' }] : []),
  ];

  return (
    <div style={{
      width: 220, minHeight: '100vh', background: colors.sidebar,
      display: 'flex', flexDirection: 'column',
      position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
      transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform .25s ease',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo_mineral_plan.png" alt="Minéral Plan." style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Minéral Plan.</div>
            <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {isAdmin ? 'Admin' : isMgr ? 'Manager' : 'Salarié'}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', position: 'relative' }}>

        {/* Filigrane propriété */}
        <div style={{
          position: 'absolute', bottom: 24, left: '50%',
          transform: 'translateX(-50%) rotate(-12deg)',
          pointerEvents: 'none', userSelect: 'none',
          opacity: 0.07, zIndex: 0, width: 150,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <img
            src="/logo_mineral_noir_et_blanc.png"
            alt=""
            style={{ width: 150, filter: 'invert(1)' }}
          />
        </div>

        {nav.map(item => {
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => { setView(item.id); if (isMobile) onClose(); }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: active ? 'rgba(197,117,58,.18)' : 'transparent',
              color: active ? '#E8A06A' : 'rgba(255,255,255,.45)',
              fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: 'inherit',
              marginBottom: 2, textAlign: 'left', position: 'relative',
            }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                {active && <div style={{ fontSize: 9, opacity: .6, marginTop: 1 }}>{item.sub}</div>}
              </div>
              {item.badge > 0 && (
                <span style={{ background: '#EF4444', color: '#fff', borderRadius: 20, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>
                  {item.badge}
                </span>
              )}
              {active && <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: '0 3px 3px 0', background: '#E8A06A' }} />}
            </button>
          );
        })}
      </nav>

      {/* Profil + Notifs + déconnexion */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || user?.email}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
          {!isMobile && <NotifBell />}
        </div>
        <button onClick={logout} style={{
          padding: '5px 0', background: 'none', border: 'none',
          color: 'rgba(255,255,255,.3)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Déconnexion →
        </button>
        <div style={{ fontSize: 8, color: 'rgba(255, 255, 255, 0.94)', textAlign: 'center', marginTop: 6, letterSpacing: '1px' }}>
          © {new Date().getFullYear()} Minéral Spirit
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
