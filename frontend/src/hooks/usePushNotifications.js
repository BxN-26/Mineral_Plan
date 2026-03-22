import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/**
 * Hook Push Notifications.
 * Retourne { pushStatus, subscribe } :
 *   - pushStatus : 'unsupported' | 'denied' | 'subscribed' | 'prompt' | 'idle'
 *   - subscribe() : fonction à appeler sur geste utilisateur (requis par Chrome)
 *
 * @param {boolean} featureEnabled  true quand push_notifications_enabled = 'true'
 */
export function usePushNotifications(featureEnabled) {
  // 'idle' = non initialisé, 'prompt' = doit demander à l'utilisateur,
  // 'subscribed' = ok, 'denied' = refusé, 'unsupported' = navigateur non compatible
  const [pushStatus, setPushStatus] = useState('idle');

  // Détecte l'état initial dès que la feature est active
  useEffect(() => {
    if (!featureEnabled) { setPushStatus('idle'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported'); return;
    }
    const perm = Notification.permission;
    if (perm === 'denied') { setPushStatus('denied'); return; }

    // Vérifie si déjà abonné
    navigator.serviceWorker.register('/sw.js').then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setPushStatus(sub ? 'subscribed' : 'prompt');
    }).catch(() => setPushStatus('prompt'));
  }, [featureEnabled]);

  // Fonction appelée sur clic utilisateur — demande permission + abonne
  const subscribe = useCallback(async () => {
    if (!featureEnabled) return;
    try {
      const reg  = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission(); // doit être appelé depuis un clic
      if (perm !== 'granted') { setPushStatus('denied'); return; }

      const existing = await reg.pushManager.getSubscription();
      if (existing) { setPushStatus('subscribed'); return; }

      const { data } = await api.get('/push/vapid-public-key');
      if (!data?.key) return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
      await api.post('/push/subscribe', sub.toJSON());
      setPushStatus('subscribed');
    } catch (err) {
      console.warn('[Push] Impossible de s\'abonner :', err);
    }
  }, [featureEnabled]);

  return { pushStatus, subscribe };
}
