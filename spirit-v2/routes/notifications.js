'use strict';
const router = require('express').Router();
const { db_ } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// ── Helpers (exportés pour les autres routes qui créent des notifs) ──
function notify(userId, type, title, body = '', relatedType = null, relatedId = null) {
  if (!userId) return;
  try {
    db_.run(
      `INSERT INTO notifications (user_id, type, title, body, related_type, related_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, type, title, body, relatedType, relatedId]
    );
  } catch (_) {}
}

/** Notifie tous les managers/admins */
function notifyManagers(type, title, body, relatedType, relatedId) {
  const managers = db_.all(
    "SELECT id FROM users WHERE role IN ('admin','manager','superadmin') AND active=1"
  );
  for (const m of managers) notify(m.id, type, title, body, relatedType, relatedId);
}

/** Notifie l'utilisateur lié à un staff_id */
function notifyStaff(staffId, type, title, body, relatedType, relatedId) {
  const u = db_.get('SELECT id FROM users WHERE staff_id = ? AND active = 1', [staffId]);
  if (u) notify(u.id, type, title, body, relatedType, relatedId);
}

module.exports.notify         = notify;
module.exports.notifyManagers = notifyManagers;
module.exports.notifyStaff    = notifyStaff;

// ── GET /api/notifications ────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { unread_only } = req.query;
  let sql = 'SELECT * FROM notifications WHERE user_id = ?';
  const p = [req.user.id];
  if (unread_only === '1') { sql += ' AND read = 0'; }
  sql += ' ORDER BY created_at DESC LIMIT 50';
  const rows = db_.all(sql, p);
  const unreadCount = db_.get(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0',
    [req.user.id]
  ).c;
  res.json({ notifications: rows, unread: unreadCount });
});

// ── PATCH /api/notifications/:id/read ────────────────────────
router.patch('/:id/read', requireAuth, (req, res) => {
  db_.run(
    'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  res.json({ message: 'Lu' });
});

// ── PATCH /api/notifications/read-all ────────────────────────
router.patch('/read-all', requireAuth, (req, res) => {
  db_.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'Tout lu' });
});

// ── DELETE /api/notifications/:id ────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  db_.run('DELETE FROM notifications WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]);
  res.json({ message: 'Supprimée' });
});

module.exports.router = router;
