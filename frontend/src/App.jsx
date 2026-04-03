import { createContext, useContext, useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import NotifBell from './components/NotifBell';
import LoginView from './views/LoginView';
import { Spinner, SkeletonBlock } from './components/common';
import api from './api/client';
import { usePushNotifications } from './hooks/usePushNotifications';
import ForceChangePassword from './components/ForceChangePassword';
import { ThemeProvider, useTheme } from './context/ThemeContext';

/* ─── Imports lazy des vues (code-splitting) ─────────────────── */
const PlanningView       = lazy(() => import('./views/PlanningView'));
const MonPlanningView    = lazy(() => import('./views/MonPlanningView'));
const EquipeView         = lazy(() => import('./views/EquipeView'));
const CongesView         = lazy(() => import('./views/CongesView'));
const RelevesView        = lazy(() => import('./views/RelevesView'));
const ConfigView         = lazy(() => import('./views/ConfigView'));
const StatsView          = lazy(() => import('./views/StatsView'));
const CostsView          = lazy(() => import('./views/CostsView'));
const MonProfilView      = lazy(() => import('./views/MonProfilView'));
const SwapView           = lazy(() => import('./views/SwapView'));
const TeamPlanningView   = lazy(() => import('./views/TeamPlanningView'));
const GeneralPlanningView = lazy(() => import('./views/GeneralPlanningView'));
const IndispoView        = lazy(() => import('./views/IndispoView'));
const HourDeclarationView = lazy(() => import('./views/HourDeclarationView'));

/* ─── Contexte global de l'app ──────────────────────────────── */
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/* ─── Vues disponibles ──────────────────────────────────────── */
const VIEW_COMPONENTS = {
  'planning':     PlanningView,
  'mon-planning': MonPlanningView,
  'equipe':       EquipeView,
  'conges':       CongesView,
  'releves':      RelevesView,
  'config':       ConfigView,
  'stats':        StatsView,
  'costs':        CostsView,
  'profil':         MonProfilView,
  'echanges':       SwapView,
  'planning-equipe':  TeamPlanningView,
  'planning-general':  GeneralPlanningView,
  'indispos':          IndispoView,
  'mes-heures':        HourDeclarationView,
};

/* ─── Labels vues ───────────────────────────────────────────── */
const VIEW_LABELS = {
  'planning':          'Planning',
  'mon-planning':      'Mon planning',
  'equipe':            'Équipe',
  'conges':            'Congés & absences',
  'releves':           'Relevés',
  'config':            'Configuration',
  'stats':             'Statistiques',
  'costs':             'Coûts',
  'profil':            'Mon profil',
  'echanges':          'Échanges',
  'planning-equipe':   'Planning équipe',
  'planning-general':  'Planning général',
  'indispos':          'Indisponibilités',
  'mes-heures':        'Heures reliquat',
};

/* ─── Shell interne (après authentification) ─────────────────── */
function AppShell() {
  const { user } = useAuth();

  const { colors } = useTheme();

  const VALID_VIEWS = Object.keys(VIEW_COMPONENTS);
  const [view, setViewRaw] = useState(() => {
    const saved = localStorage.getItem('spirit_view');
    return saved && VALID_VIEWS.includes(saved) ? saved : 'mon-planning';
  });
  const setView = useCallback((v) => {
    setViewRaw(v);
    localStorage.setItem('spirit_view', v);
  }, []);
  const [planningFocus, setPlanningFocus] = useState(null); // { week, staffId } pour deep-link notif
  const [swapTab,    setSwapTab]    = useState('mine');     // deep-link onglet échanges
  const [staff,      setStaff]      = useState([]);
  const [teams,      setTeams]      = useState([]);
  const [functions,  setFunctions]  = useState([]);
  const [leaves,     setLeaves]     = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [taskTypes,  setTaskTypes]  = useState([]);
  const [settings,   setSettings]   = useState({});
  const [schedules,  setSchedules]  = useState({}); // { [week]: { [fnSlug]: grid } }
  const [dataReady,  setDataReady]  = useState(false);
  const [isMobile,    setIsMobile]    = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* Chargement initial de toutes les données */
  const loadAll = useCallback(async () => {
    setDataReady(false);
    try {
      const { data } = await api.get('/bootstrap');
      setStaff(      Array.isArray(data.staff)      ? data.staff      : []);
      setTeams(      Array.isArray(data.teams)      ? data.teams      : []);
      setFunctions(  Array.isArray(data.functions)  ? data.functions  : []);
      setLeaves(     Array.isArray(data.leaves)     ? data.leaves     : []);
      setLeaveTypes( Array.isArray(data.leaveTypes) ? data.leaveTypes : []);
      setSettings(   Array.isArray(data.settings)   ? data.settings   : data.settings ?? {});
      setTaskTypes(  Array.isArray(data.taskTypes)  ? data.taskTypes  : []);
    } catch (e) {
      console.error('[AppShell] Impossible de charger les données bootstrap', e);
    } finally {
      setDataReady(true);
    }
  }, []);

  useEffect(() => { if (user) loadAll(); }, [user, loadAll]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Rechargement partiel */
  const reloadStaff        = useCallback(async () => { const r = await api.get('/staff');      setStaff(Array.isArray(r.data)      ? r.data : []); }, []);
  const reloadTeams        = useCallback(async () => { const r = await api.get('/teams');      setTeams(Array.isArray(r.data)      ? r.data : []); }, []);
  const reloadFunctions    = useCallback(async () => { const r = await api.get('/functions');  setFunctions(Array.isArray(r.data)  ? r.data : []); }, []);
  const reloadLeaves       = useCallback(async () => { const r = await api.get('/leaves');     setLeaves(Array.isArray(r.data)     ? r.data : []); }, []);
  const reloadTaskTypes    = useCallback(async () => { const r = await api.get('/task-types'); setTaskTypes(Array.isArray(r.data)  ? r.data : []); }, []);

  /* Push notifications */
  const pushEnabled = Array.isArray(settings)
    ? settings.some(s => s.key === 'push_notifications_enabled' && s.value === 'true')
    : false;
  const { pushStatus, subscribe } = usePushNotifications(dataReady && !!user && pushEnabled);

  /* Chargement planning d'une semaine */
  const loadWeekSchedules = useCallback(async (weekStart) => {
    if (schedules[weekStart]) return; // déjà en cache
    try {
      const r = await api.get(`/schedules?week=${weekStart}`);
      setSchedules(prev => {
        const next = { ...prev, [weekStart]: r.data };
        // Évincer les entrées les plus anciennes si > 10 semaines (FIFO)
        const keys = Object.keys(next);
        if (keys.length > 10) {
          const evict = keys.slice(0, keys.length - 10);
          evict.forEach(k => delete next[k]);
        }
        return next;
      });
    } catch (e) {
      console.error('[AppShell] Erreur chargement semaine', e);
    }
  }, [schedules]);

  if (!dataReady) return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: '#F5F3EF', overflow: 'hidden' }}>
      {/* Sidebar fantôme */}
      <div style={{ width: 230, flexShrink: 0, background: '#181C2E', display: 'flex', flexDirection: 'column', padding: '18px 14px', gap: 24 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <SkeletonBlock width={32} height={32} borderRadius={16} style={{ background: 'rgba(255,255,255,.15)' }} />
          <SkeletonBlock width={90} height={13} style={{ background: 'rgba(255,255,255,.15)' }} />
        </div>
        {/* Nav items */}
        {[80, 100, 90, 110, 70, 95, 80].map((w, i) => (
          <SkeletonBlock key={i} width={w} height={12} style={{ background: 'rgba(255,255,255,.12)' }} />
        ))}
        {/* Avatar bas */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SkeletonBlock width={30} height={30} borderRadius={15} style={{ background: 'rgba(255,255,255,.15)' }} />
          <SkeletonBlock width={70} height={11} style={{ background: 'rgba(255,255,255,.12)' }} />
        </div>
      </div>
      {/* Contenu principal */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{ height: 50, background: '#181C2E', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, flexShrink: 0 }}>
          <SkeletonBlock width={120} height={14} style={{ background: 'rgba(255,255,255,.15)' }} />
        </div>
        {/* Corps */}
        <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          {/* Header */}
          <SkeletonBlock width={200} height={22} style={{ marginBottom: 4 }} />
          {/* Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ECEAE4', padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <SkeletonBlock width={38} height={38} borderRadius={19} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <SkeletonBlock width="65%" height={13} />
                    <SkeletonBlock width="40%" height={10} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SkeletonBlock width={55} height={17} borderRadius={12} />
                  <SkeletonBlock width={65} height={17} borderRadius={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );

  const ViewComp = VIEW_COMPONENTS[view] || PlanningView;
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;

  const ctx = {
    /* données */
    staff, teams, functions, taskTypes, leaves, leaveTypes, settings, schedules,
    /* mutateurs */
    setStaff, setTeams, setFunctions, setLeaves, setLeaveTypes, setSettings, setSchedules,
    /* rechargements */
    reloadStaff, reloadTeams, reloadFunctions, reloadTaskTypes, reloadLeaves, loadWeekSchedules,
    /* navigation */
    view, setView,
    /* deep-link planning */
    planningFocus, setPlanningFocus,
    /* deep-link échanges */
    swapTab, setSwapTab,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter','Segou UI',system-ui,sans-serif", background: colors.bgPage, overflow: 'hidden' }}>
        {/* Overlay sombre (sidebar en drawer sur toutes tailles) */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 99 }}
          />
        )}
        <Sidebar
          view={view} setView={setView} leaves={leaves}
          isOpen={sidebarOpen} isMobile={isMobile}
          onClose={() => setSidebarOpen(false)}
        />
        <main style={{
          flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
          marginLeft: 0,
        }}>
          {/* Topbar permanente avec hamburger */}
          <div style={{
            padding: '10px 14px', background: '#181C2E',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(v => !v)}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}
              aria-label="Ouvrir le menu"
            >☰</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src="/logo_mineral_plan.png" alt="minéral Spirit" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>minéral Spirit</span>
            </div>
            {VIEW_LABELS[view] && (
              <span style={{ color: '#9B9890', fontSize: 12 }}>· {VIEW_LABELS[view]}</span>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <NotifBell />
            </div>
          </div>
          {/* Bannière push notifications */}
          {pushStatus === 'prompt' && (
            <PushBanner onAccept={subscribe} />
          )}
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 40 }}><Spinner /></div>}>
            <ViewComp />
          </Suspense>
        </main>
      </div>
    </AppCtx.Provider>
  );
}

/* ─── Bannière invitation push ────────────────────────────────── */
function PushBanner({ onAccept }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{
      background: '#1E2235', color: '#fff', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      fontSize: 13,
    }}>
      <span style={{ fontSize: 20 }}>🔔</span>
      <span style={{ flex: 1 }}>Activez les notifications pour être alerté en temps réel (congés validés, planning…)</span>
      <button
        onClick={() => { onAccept(); setDismissed(true); }}
        style={{
          background: '#C5753A', color: '#fff', border: 'none', borderRadius: 6,
          padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >Activer</button>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'none', border: 'none', color: '#9B9890', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
        aria-label="Fermer"
      >×</button>
    </div>
  );
}

/* ─── Racine ──────────────────────────────────────────────────── */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F5F3EF' }}>
      <Spinner />
    </div>
  );

  if (!user) return <LoginView />;

  // Première connexion : changement de mot de passe obligatoire (modal bloquante)
  if (user.must_change_password) return <ForceChangePassword />;

  return <AppShell />;
}
