import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import { useApp } from '../App';

const TYPE_ICON = {
  leave:          '🏖️',
  leave_planning: '⚠️',
  overtime:       '⏱️',
  approval:       '✅',
  info:           'ℹ️',
  swap:           '🔄',
};

const NotifBell = () => {
  const { setView, setPlanningFocus, setSwapTab } = useApp();
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/notifications');
      setNotifs(Array.isArray(r.data?.notifications) ? r.data.notifications : []);
      setUnread(r.data?.unread ?? 0);
    } catch (_) {}
  }, []);

  // Premier chargement + polling 30 s
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Badge icône PWA (App Badging API)
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (unread > 0) navigator.setAppBadge(unread).catch(() => {});
    else            navigator.clearAppBadge().catch(() => {});
  }, [unread]);

  // Fermer en cliquant ailleurs
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifs(ns => ns.map(n => ({ ...n, read: 1 })));
      setUnread(0);
    } catch (_) {}
  };

  const markOne = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: 1 } : n));
      setUnread(u => Math.max(0, u - 1));
    } catch (_) {}
  };

  const deleteOne = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifs(ns => ns.filter(n => n.id !== id));
    } catch (_) {}
  };

  const timeSince = (iso) => {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso + 'Z').getTime()) / 1000;
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  /** Navigue vers la bonne vue/onglet selon le type de notif */
  const handleNotifClick = (n) => {
    if (!n.read) markOne(n.id);
    setOpen(false);
    const rt = n.related_type;
    if (n.type === 'urgent' || (n.type === 'swap' && rt === 'swap')) {
      // urgent → onglet manager ; swap normal → onglet mine
      setSwapTab(n.type === 'urgent' ? 'manager' : 'mine');
      setView('echanges');
    } else if (n.type === 'approval' && rt === 'swap') {
      setSwapTab('mine');
      setView('echanges');
    } else if (n.type === 'leave' || n.type === 'leave_planning' ||
               (n.type === 'approval' && rt === 'leave')) {
      setView('conges');
    } else if (n.type === 'overtime') {
      setView('releves');
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bouton cloche */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 18, padding: '4px 6px', borderRadius: 7, color: '#fff',
          position: 'relative', display: 'flex', alignItems: 'center',
        }}
        title="Notifications"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <>
            <style>{`
              @keyframes notif-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50%       { opacity: .55; transform: scale(.85); }
              }
            `}</style>
            <span style={{
              position: 'absolute', top: 0, right: 0,
              background: '#EF4444', color: '#fff', borderRadius: 10,
              fontSize: 9, fontWeight: 800, minWidth: 15, height: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', lineHeight: 1,
              animation: 'notif-pulse 1.4s ease-in-out infinite',
            }}>
              {unread > 99 ? '99+' : unread}
            </span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'fixed', left: 136, bottom: 16, width: 340, maxWidth: 'calc(100vw - 160px)',
          background: '#fff', borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,.18)', zIndex: 9999,
          border: '1px solid #ECEAE4', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #F0EDE8',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2235' }}>
              Notifications {unread > 0 && <span style={{ color: '#C5753A' }}>({unread})</span>}
            </span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: '#C5753A', fontWeight: 600, padding: 0,
              }}>
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9B9890', fontSize: 13 }}>
                Aucune notification
              </div>
            ) : (
              notifs.map(n => {
                let meta = null;
                try { if (n.meta) meta = JSON.parse(n.meta); } catch (_) {}
                const hasPlanningLink = meta?.type === 'leave_unassigned' && meta?.week;
                return (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    padding: '11px 16px', borderBottom: '1px solid #F7F4F0',
                    background: n.read ? '#fff' : '#FFF8F2',
                    display: 'flex', gap: 10, cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICON[n.type] || 'ℹ️'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: n.read ? 400 : 700, fontSize: 13, color: '#1E2235',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{n.title}</div>
                    {n.body && (
                      <div style={{ fontSize: 11, color: '#6B6860', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.body}
                      </div>
                    )}
                    {hasPlanningLink && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          markOne(n.id);
                          setPlanningFocus({ week: meta.week, staffId: meta.staffId, slots: meta.slots });
                          setView('planning');
                          setOpen(false);
                        }}
                        style={{
                          marginTop: 5, padding: '3px 9px', background: '#C5753A', color: '#fff',
                          border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                          fontWeight: 700, fontFamily: 'inherit',
                        }}
                      >
                        📅 Voir le planning →
                      </button>
                    )}
                    <div style={{ fontSize: 10, color: '#9B9890', marginTop: 3 }}>
                      {timeSince(n.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteOne(n.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9C5BC', fontSize: 14, padding: 0, flexShrink: 0 }}
                    title="Supprimer"
                  >✕</button>
                </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotifBell;
