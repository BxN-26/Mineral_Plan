'use strict';
/**
 * seed.js — DÉSACTIVÉ en branche production (release/v1.0-beta)
 *
 * Les données de démonstration ne sont pas chargées en production.
 *
 * ── Premier démarrage ─────────────────────────────────────────────────────
 * Au premier `npm start`, la fonction initSchema() (app.js) et les migrations
 * dans database.js créent automatiquement :
 *   • Toutes les tables (schema.sql)
 *   • Les équipes, fonctions et types de congés par défaut (seeds en migration)
 *   • Les comptes superadmin et admin depuis les variables .env
 *     (migration "first_install_accounts")
 *
 * ── Ce fichier ne sert qu'au développement ───────────────────────────────
 * Pour injecter des données de démo en dev, utilisez la branche `main`
 * et exécutez : npm run seed
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

console.log('[seed] Mode production — aucune donnée de démonstration insérée.');
console.log('[seed] Configurez votre fichier .env, puis démarrez le serveur avec : npm start');
console.log('[seed] Les migrations créeront automatiquement les comptes et les paramètres par défaut.');
