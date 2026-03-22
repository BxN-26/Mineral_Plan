'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { db_ } = require('../db/database');
const { issueTokens, revokeRefreshToken, requireAuth } = require('../middleware/auth');

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db_.get(
    'SELECT * FROM users WHERE email = ? AND active = 1',
    [email.toLowerCase().trim()]
  );
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  // Mise à jour last_login
  db_.run("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);

  issueTokens(user, res);

  const { password: _, ...safeUser } = user;
  return res.json({ user: safeUser }); // must_change_password est inclus si présent
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', (req, res) => {
  revokeRefreshToken(req.cookies?.spirit_refresh);
  res.clearCookie('spirit_access',  { path: '/' });
  res.clearCookie('spirit_refresh', { path: '/api/auth/refresh' });
  res.json({ message: 'Déconnecté' });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db_.get(
    'SELECT id, email, role, staff_id, last_login FROM users WHERE id = ? AND active = 1',
    [req.user.id]
  );
  if (!user) return res.status(401).json({ error: 'Compte introuvable' });
  res.json({ user });
});

// ── POST /api/auth/refresh ────────────────────────────────────
// Ce endpoint n'est accessible qu'avec le cookie spirit_refresh (path=/api/auth/refresh)
router.post('/refresh', (req, res) => {
  const rawToken = req.cookies?.spirit_refresh;
  if (!rawToken) return res.status(401).json({ error: 'Refresh token manquant' });

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const stored = db_.get(
    `SELECT rt.*, u.id as uid, u.email, u.role, u.staff_id, u.active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = ? AND rt.revoked = 0 AND rt.expires_at > datetime('now')`,
    [hash]
  );

  if (!stored || !stored.active)
    return res.status(401).json({ error: 'Refresh token invalide ou expiré' });

  // Détection de réutilisation (token déjà révoqué = compromis potentiel)
  revokeRefreshToken(rawToken);

  const user = { id: stored.uid, email: stored.email, role: stored.role, staff_id: stored.staff_id };
  issueTokens(user, res);
  res.json({ message: 'Tokens renouvelés' });
});

// ── POST /api/auth/change-password ───────────────────────────
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });

  const user = db_.get('SELECT * FROM users WHERE id=? AND active=1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });

  if (!bcrypt.compareSync(current_password, user.password))
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

  const hash = bcrypt.hashSync(new_password, 12);
  db_.run('UPDATE users SET password=?, must_change_password=0 WHERE id=?', [hash, req.user.id]);
  res.json({ message: 'Mot de passe modifié' });
});

// ── POST /api/auth/force-change-password ──────────────────────
// Appelé sans vérifier l'ancien mot de passe, mais seulement si must_change_password=1
router.post('/force-change-password', requireAuth, (req, res) => {
  const { new_password } = req.body;
  if (!new_password)
    return res.status(400).json({ error: 'Nouveau mot de passe requis' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });

  const user = db_.get('SELECT * FROM users WHERE id=? AND active=1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  if (!user.must_change_password)
    return res.status(403).json({ error: 'Changement de mot de passe non requis' });

  const hash = bcrypt.hashSync(new_password, 12);
  db_.run('UPDATE users SET password=?, must_change_password=0 WHERE id=?', [hash, req.user.id]);
  res.json({ message: 'Mot de passe défini avec succès' });
});

module.exports = router;
