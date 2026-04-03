'use strict';
const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db_ }   = require('../db/database');
const { issueTokens, revokeRefreshToken, requireAuth } = require('../middleware/auth');
const { isConfigured, sendResetEmail } = require('../utils/mailer');

// ── Rate limiter : 10 tentatives / 15 min par IP ─────────────
const loginLimiter = rateLimit({
  windowMs : 15 * 60 * 1000, // 15 minutes
  max      : 10,
  message  : { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders  : false,
  skipSuccessfulRequests: true, // ne compte que les échecs
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', loginLimiter, (req, res) => {
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
    'SELECT id, email, role, staff_id, last_login, must_change_password FROM users WHERE id = ? AND active = 1',
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

// ── Rate limiter reset : 3 demandes / heure / IP ─────────────
const resetLimiter = rateLimit({
  windowMs : 60 * 60 * 1000, // 1 heure
  max      : 3,
  message  : { error: 'Trop de demandes de réinitialisation. Réessayez dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders  : false,
});

// ── POST /api/auth/reset-request ─────────────────────────────
// Génère un token de reset et envoie l'email.
// Répond toujours avec le même message (pas d'énumération d'emails).
router.post('/reset-request', resetLimiter, async (req, res) => {
  const GENERIC_OK = { message: 'Si cet email est associé à un compte actif, un lien de réinitialisation a été envoyé.' };

  const { email } = req.body;
  if (!email || typeof email !== 'string' || email.length > 254)
    return res.json(GENERIC_OK);

  // Vérifier que le SMTP est configuré avant de continuer
  if (!isConfigured())
    return res.status(503).json({ error: 'La réinitialisation par email n\'est pas configurée sur ce serveur. Contactez votre administrateur.' });

  const user = db_.get(
    'SELECT id, email FROM users WHERE email = ? AND active = 1',
    [email.toLowerCase().trim()]
  );

  // Réponse identique que l'utilisateur existe ou non
  if (!user) return res.json(GENERIC_OK);

  // Invalider les tokens précédents de cet utilisateur
  db_.run(
    "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    [user.id]
  );

  // Générer le token brut (256 bits) — seul le hash est stocké
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  db_.run(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, tokenHash, expiresAt]
  );

  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
  const resetUrl  = `${clientUrl}/?reset_token=${rawToken}`;

  try {
    await sendResetEmail({ to: user.email, resetUrl, appUrl: clientUrl });
  } catch (e) {
    // Logguer l'erreur sans exposer les détails à l'appelant
    console.error('[reset-request] Erreur envoi email:', e.message);
    // On renvoie quand même OK pour ne pas révéler que l'email existe
  }

  return res.json(GENERIC_OK);
});

// ── POST /api/auth/reset-confirm ──────────────────────────────
// Valide le token et met à jour le mot de passe.
router.post('/reset-confirm', async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || typeof token !== 'string' || !new_password)
    return res.status(400).json({ error: 'Token et nouveau mot de passe requis.' });

  if (new_password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });

  if (new_password.length > 128)
    return res.status(400).json({ error: 'Mot de passe trop long (128 caractères max).' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = db_.get(
    `SELECT prt.id, prt.user_id, u.active
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = ?
       AND prt.used_at IS NULL
       AND prt.expires_at > datetime('now')
       AND u.active = 1`,
    [tokenHash]
  );

  if (!record)
    return res.status(400).json({ error: 'Ce lien est invalide ou a expiré. Faites une nouvelle demande.' });

  const passwordHash = bcrypt.hashSync(new_password, 12);

  // Marquer le token comme utilisé (avant le UPDATE password pour éviter les races)
  db_.run(
    "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?",
    [record.id]
  );

  // Mettre à jour le mot de passe
  db_.run(
    'UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?',
    [passwordHash, record.user_id]
  );

  // Révoquer toutes les sessions actives (sécurité)
  db_.run(
    'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?',
    [record.user_id]
  );

  return res.json({ message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.' });
});

module.exports = router;
