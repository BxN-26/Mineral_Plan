'use strict';
/**
 * Middleware d'authentification JWT + cookie httpOnly.
 * Access token  : JWT 15 min  → cookie spirit_access
 * Refresh token : random 80 hex chars, hash SHA-256 en DB, 7 jours → cookie spirit_refresh
 */
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { db_ } = require('../db/database');

// ── Helpers internes ─────────────────────────────────────────
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function cookieOptions(maxAgeMs, pathOverride) {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     pathOverride || '/',
    maxAge:   maxAgeMs,
  };
}

// ── API publique ─────────────────────────────────────────────

/** Émet les deux cookies (access + refresh) pour un user */
function issueTokens(user, res) {
  // Access token JWT
  const access = jwt.sign(
    { id: user.id, email: user.email, role: user.role, staff_id: user.staff_id || null },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Refresh token aléatoire 40 bytes = 80 hex chars
  const refreshRaw  = crypto.randomBytes(40).toString('hex');
  const refreshHash = hashToken(refreshRaw);
  const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Nettoyage : uniquement les tokens expirés. Les tokens révoqués sont
  // volontairement conservés jusqu'à leur expiration naturelle — ils servent
  // à détecter un rejeu (vol potentiel) dans /api/auth/refresh, cf. §1.8.
  db_.run(
    `DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < datetime('now')`,
    [user.id]
  );

  db_.run(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, refreshHash, expiresAt]
  );

  res.cookie('spirit_access',  access,     cookieOptions(15 * 60 * 1000));
  res.cookie('spirit_refresh', refreshRaw, cookieOptions(7 * 24 * 60 * 60 * 1000, '/api/auth/refresh'));
}

/** Révoque le refresh token courant */
function revokeRefreshToken(raw) {
  if (!raw) return;
  db_.run(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`, [hashToken(raw)]);
}

/** Middleware — vérifie le cookie spirit_access */
function requireAuth(req, res, next) {
  const token = req.cookies?.spirit_access;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return res.status(401).json({ error: 'Token invalide', code });
  }
}

/** Fabrique de middleware de contrôle de rôle */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Accès refusé — rôle insuffisant' });
    next();
  };
}

/**
 * Rôles à accès restreint à leurs propres données (pas de vue globale sur
 * les congés/indispos/planning d'autrui). Le rôle 'viewer' avait été omis
 * de la plupart de ces contrôles (seul 'staff' était vérifié), ce qui lui
 * donnait de facto un accès aussi large qu'un manager — cf. audit_pre_ete_2026.md §1.4.
 */
const SELF_ONLY_ROLES = ['staff', 'viewer'];
function isSelfOnly(role) { return SELF_ONLY_ROLES.includes(role); }

/** Fonction utilitaire — journalise dans audit_log */
function auditLog(req, action, entity, entityId, oldData, newData) {
  try {
    db_.run(
      `INSERT INTO audit_log
         (user_id, action, entity, entity_id, old_data, new_data, ip_addr, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id  || null,
        action,
        entity        || null,
        entityId      || null,
        oldData  ? JSON.stringify(oldData)  : null,
        newData  ? JSON.stringify(newData)  : null,
        req.ip,
        req.get('user-agent') || null,
      ]
    );
  } catch (_) { /* ne jamais bloquer la réponse */ }
}

module.exports = { issueTokens, revokeRefreshToken, requireAuth, requireRole, auditLog, isSelfOnly, SELF_ONLY_ROLES };
