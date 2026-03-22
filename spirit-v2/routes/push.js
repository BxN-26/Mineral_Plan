'use strict';
const router  = require('express').Router();
const webpush = require('web-push');
const { db_ } = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');

// ── Configuration VAPID ───────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@mineral-spirit.fr',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ── GET /api/push/vapid-public-key ────────────────────────────
router.get('/vapid-public-key', requireAuth, (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY)
    return res.status(503).json({ error: 'Push non configuré sur le serveur' });
  const enabled = db_.get("SELECT value FROM settings WHERE key='push_notifications_enabled'");
  if (!enabled || enabled.value !== 'true')
    return res.status(503).json({ error: 'Notifications push désactivées' });
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// ── POST /api/push/subscribe ──────────────────────────────────
router.post('/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth)
    return res.status(400).json({ error: 'Subscription invalide' });
  db_.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
    [req.user.id, endpoint, keys.p256dh, keys.auth]
  );
  res.json({ ok: true });
});

// ── POST /api/push/unsubscribe ────────────────────────────────
router.post('/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) db_.run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', [endpoint, req.user.id]);
  res.json({ ok: true });
});

// ── DELETE /api/push/all (désabonnement de tous les appareils) ─
router.delete('/all', requireAuth, (req, res) => {
  db_.run('DELETE FROM push_subscriptions WHERE user_id=?', [req.user.id]);
  res.json({ ok: true });
});

// ── GET /api/push/status (infos pour l'UI) ─────────────────────
router.get('/status', requireAuth, (req, res) => {
  const count = db_.get(
    'SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id=?', [req.user.id]
  );
  const setting = db_.get("SELECT value FROM settings WHERE key='push_notifications_enabled'");
  res.json({
    feature_enabled: setting?.value === 'true',
    vapid_configured: !!process.env.VAPID_PUBLIC_KEY,
    subscriptions: count?.c ?? 0,
  });
});

module.exports = { router };

/**
 * Envoie une notification push à tous les appareils d'un utilisateur.
 * @param {number} userId  - ID utilisateur (table users)
 * @param {object} payload - { title, body, url, icon, badge }
 */
function sendPush(userId, payload) {
  // Vérifier que la fonctionnalité est activée
  const setting = db_.get("SELECT value FROM settings WHERE key='push_notifications_enabled'");
  if (!setting || setting.value !== 'true') return;

  const subs = db_.all('SELECT * FROM push_subscriptions WHERE user_id=?', [userId]);
  if (!subs.length) return;

  const data = JSON.stringify({
    title: payload.title || 'minéral Spirit',
    body:  payload.body  || '',
    url:   payload.url   || '/',
    icon:  payload.icon  || '/icon-192.png',
    badge: payload.badge || '/badge-72.png',
  });

  for (const sub of subs) {
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      data
    ).catch(err => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expirée ou invalide → nettoyage
        db_.run('DELETE FROM push_subscriptions WHERE endpoint=?', [sub.endpoint]);
      } else {
        console.error('[Push] Erreur envoi notification user', userId, err.message);
      }
    });
  }
}

module.exports = { router, sendPush };
