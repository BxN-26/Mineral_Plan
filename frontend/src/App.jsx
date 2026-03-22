import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import NotifBell from './components/NotifBell';
import LoginView from './views/LoginView';
import PlanningView from './views/PlanningView';
import MonPlanningView from './views/MonPlanningView';
import EquipeView from './views/EquipeView';
import CongesView from './views/CongesView';
import RelevesView from './views/RelevesView';
import ConfigView from './views/ConfigView';
import StatsView from './views/StatsView';
import CostsView from './views/CostsView';
import MonProfilView from './views/MonProfilView';
import SwapView from './views/SwapView';
import TeamPlanningView from './views/TeamPlanningView';
import GeneralPlanningView from './views/GeneralPlanningView';
import { Spinner } from './components/common';
import api from './api/client';
import { usePushNotifications } from './hooks/usePushNotifications';
import ForceChangePassword from './components/ForceChangePassword';
import { ThemeProvider, useTheme } from './context/ThemeContext';

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
  'planning-equipe': TeamPlanningView,
  'planning-general': GeneralPlanningView,
};

/* ─── Shell interne (après authentification) ─────────────────── */
function AppShell() {
  const { user } = useAuth();

  const { colors } = useTheme();

  const [view,       setView]       = useState('mon-planning');
  const [planningFocus, setPlanningFocus] = useState(null); // { week, staffId } pour deep-link notif
  const [staff,      setStaff]      = useState([]);
  const [teams,      setTeams]      = useState([]);
  const [functions,  setFunctions]  = useState([]);
  const [leaves,     setLeaves]     = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [settings,   setSettings]   = useState({});
  const [schedules,  setSchedules]  = useState({}); // { [week]: { [fnSlug]: grid } }
  const [dataReady,  setDataReady]  = useState(false);
  const [isMobile,    setIsMobile]    = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  /* Chargement initial de toutes les données */
  const loadAll = useCallback(async () => {
    setDataReady(false);
    try {
      const [rs, rt, rf, rl, rlt, rset] = await Promise.all([
        api.get('/staff'),
        api.get('/teams'),
        api.get('/functions'),
        api.get('/leaves'),
        api.get('/settings/leave-types'),
        api.get('/settings'),
      ]);
      setStaff(Array.isArray(rs.data)   ? rs.data   : []);
      setTeams(Array.isArray(rt.data)   ? rt.data   : []);
      setFunctions(Array.isArray(rf.data)  ? rf.data   : []);
      setLeaves(Array.isArray(rl.data)  ? rl.data   : []);
      setLeaveTypes(Array.isArray(rlt.data) ? rlt.data  : []);
      setSettings(Array.isArray(rset.data) ? rset.data : rset.data ?? {});
    } catch (e) {
      console.error('[AppShell] Impossible de charger les données', e);
    } finally {
      setDataReady(true);
    }
  }, []);

  useEffect(() => { if (user) loadAll(); }, [user, loadAll]);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Rechargement partiel */
  const reloadStaff     = useCallback(async () => { const r = await api.get('/staff');     setStaff(Array.isArray(r.data)     ? r.data : []); }, []);
  const reloadTeams     = useCallback(async () => { const r = await api.get('/teams');     setTeams(Array.isArray(r.data)     ? r.data : []); }, []);
  const reloadFunctions = useCallback(async () => { const r = await api.get('/functions'); setFunctions(Array.isArray(r.data) ? r.data : []); }, []);
  const reloadLeaves    = useCallback(async () => { const r = await api.get('/leaves');    setLeaves(Array.isArray(r.data)    ? r.data : []); }, []);

  /* Push notifications */
  const pushEnabled = Array.isArray(settings)
    ? settings.some(s => s.key === 'push_notifications_enabled' && s.value === 'true')
    : false;
  const { pushStatus, subscribe } = usePushNotifications(dataReady && !!user && pushEnabled);

  /* Chargement planning d'une semaine */
  const loadWeekSchedules = useCallback(async (weekStart) => {
    if (schedules[weekStart]) return; // déjà chargé
    try {
      const r = await api.get(`/schedules?week=${weekStart}`);
      setSchedules(prev => ({ ...prev, [weekStart]: r.data }));
    } catch (e) {
      console.error('[AppShell] Erreur chargement semaine', e);
    }
  }, [schedules]);

  if (!dataReady) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F5F3EF' }}>
      <Spinner />
    </div>
  );

  const ViewComp = VIEW_COMPONENTS[view] || PlanningView;
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;

  const ctx = {
    /* données */
    staff, teams, functions, leaves, leaveTypes, settings, schedules,
    /* mutateurs */
    setStaff, setTeams, setFunctions, setLeaves, setLeaveTypes, setSettings, setSchedules,
    /* rechargements */
    reloadStaff, reloadTeams, reloadFunctions, reloadLeaves, loadWeekSchedules,
    /* navigation */
    view, setView,
    /* deep-link planning */
    planningFocus, setPlanningFocus,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div style={{ display: 'flex', height: '100vh', fontFamily: "'Inter','Segou UI',system-ui,sans-serif", background: colors.bgPage, overflow: 'hidden' }}>
        {/* Overlay sombre mobile */}
        {isMobile && sidebarOpen && (
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
          marginLeft: isMobile ? 0 : 220,
        }}>
          {/* Topbar hamburger visible uniquement sur mobile */}
          {isMobile && (
            <div style={{
              padding: '10px 14px', background: '#181C2E',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <button
                onClick={() => setSidebarOpen(true)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}
                aria-label="Ouvrir le menu"
              >☰</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#C5753A,#E8A06A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⛰️</div>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>minéral Spirit</span>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <NotifBell />
              </div>
            </div>
          )}
          {/* Bannière push notifications */}
          {pushStatus === 'prompt' && (
            <PushBanner onAccept={subscribe} />
          )}
          <ViewComp />
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
