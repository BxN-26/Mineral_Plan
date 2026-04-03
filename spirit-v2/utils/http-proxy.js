'use strict';
/**
 * Proxy HTTP sécurisé — appels vers API externes gouvernementales uniquement.
 *
 * Protections :
 *  - HTTPS seulement (pas de HTTP)
 *  - Whitelist d'hôtes (pas de SSRF vers l'interne)
 *  - Timeout configurables
 *  - Taille de réponse limitée (évite OOM)
 *  - Pas de redirections non contrôlées
 */
const https = require('https');

/** Liste blanche des hôtes autorisés — immuable au runtime */
const ALLOWED_HOSTS = new Set([
  'calendrier.api.gouv.fr',
  'data.education.gouv.fr',
]);

const DEFAULT_TIMEOUT_MS = 12_000;      // 12 secondes
const DEFAULT_MAX_BYTES  = 5 * 1024 * 1024; // 5 Mo

/**
 * Effectue un GET HTTPS vers une URL de la whitelist et retourne le JSON parsé.
 *
 * @param {string} rawUrl
 * @param {{ timeoutMs?: number, maxBytes?: number }} [opts]
 * @returns {Promise<any>}
 * @throws {Error} URL invalide, hôte non autorisé, timeout, réponse non-JSON…
 */
function fetchJson(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return reject(new Error('URL invalide'));
    }

    if (parsed.protocol !== 'https:')
      return reject(new Error('HTTPS uniquement autorisé'));

    if (!ALLOWED_HOSTS.has(parsed.hostname))
      return reject(new Error(`Hôte non autorisé : ${parsed.hostname}`));

    // Protection contre les injections type host@evil.com (déjà gérée par URL.hostname)
    // mais on vérifie aussi l'absence de credentials dans l'URL
    if (parsed.username || parsed.password)
      return reject(new Error('Credentials dans l\'URL interdits'));

    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'Accept':     'application/json',
        'User-Agent': 'SpiritApp/2.0 (+calendar-sync)',
      },
      timeout: timeoutMs,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drainer pour libérer la connexion
        return reject(new Error(`Réponse HTTP ${res.statusCode} de ${parsed.hostname}`));
      }

      let data = '';
      let size = 0;

      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy();
          return reject(new Error('Réponse trop volumineuse (limite 5 Mo)'));
        }
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Réponse JSON invalide reçue de l\'API externe'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout : l\'API externe ne répond pas'));
    });

    req.on('error', (err) => {
      reject(new Error(`Erreur réseau : ${err.message}`));
    });

    req.end();
  });
}

module.exports = { fetchJson, ALLOWED_HOSTS };
