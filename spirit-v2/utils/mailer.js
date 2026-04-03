'use strict';
/**
 * utils/mailer.js — Module d'envoi d'emails transactionnels
 *
 * Utilise nodemailer avec le transport SMTP configuré dans .env.
 * Si SMTP non configuré, isConfigured() retourne false (pas de crash).
 *
 * Variables .env requises :
 *   SMTP_HOST     — ex: ssl0.ovh.net
 *   SMTP_PORT     — ex: 587
 *   SMTP_SECURE   — 'true' pour port 465 (SSL), 'false' pour 587 (STARTTLS)
 *   SMTP_USER     — adresse email expéditeur
 *   SMTP_PASS     — mot de passe SMTP
 *   SMTP_FROM     — (optionnel) nom affiché, ex: "Minéral Plan <noreply@monclub.fr>"
 */
const nodemailer = require('nodemailer');

let _transport = null;

/** Retourne le transport nodemailer (singleton), ou null si SMTP non configuré */
function getTransport() {
  if (_transport) return _transport;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  _transport = nodemailer.createTransport({
    host   : SMTP_HOST,
    port   : parseInt(SMTP_PORT || '587', 10),
    secure : SMTP_SECURE === 'true', // true = SSL port 465, false = STARTTLS port 587
    auth   : { user: SMTP_USER, pass: SMTP_PASS },
    tls    : { rejectUnauthorized: true },
    pool   : false,
    connectionTimeout: 10000,
    greetingTimeout  : 10000,
    socketTimeout    : 15000,
  });

  return _transport;
}

/** Retourne true si le SMTP est configuré */
function isConfigured() {
  return getTransport() !== null;
}

/**
 * Envoie l'email de réinitialisation de mot de passe.
 * @param {object} opts
 * @param {string} opts.to       - Adresse destinataire
 * @param {string} opts.resetUrl - Lien complet avec token
 * @param {string} opts.appUrl   - URL racine de l'app (pour le lien retour)
 */
async function sendResetEmail({ to, resetUrl, appUrl }) {
  const transport = getTransport();
  if (!transport) {
    throw new Error('SMTP non configuré — impossible d\'envoyer l\'email de reset.');
  }

  const from   = process.env.SMTP_FROM || process.env.SMTP_USER;
  const appName = 'Minéral Plan';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Réinitialisation de mot de passe</title>
</head>
<body style="margin:0;padding:0;background:#F5F3EF;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EF;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#181C2E;padding:24px 32px;">
            <div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.5px;">${appName}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;">Gestion du personnel &amp; Plannings</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1E2235;">
              Réinitialisation de votre mot de passe
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#5B5855;line-height:1.6;">
              Vous avez demandé la réinitialisation de votre mot de passe sur <strong>${appName}</strong>.
              Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
            </p>

            <!-- Bouton CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td align="center" style="background:#C5753A;border-radius:8px;">
                  <a href="${resetUrl}"
                     style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;
                            color:#fff;text-decoration:none;letter-spacing:.3px;">
                    Réinitialiser mon mot de passe
                  </a>
                </td>
              </tr>
            </table>

            <!-- Lien alternatif -->
            <p style="margin:0 0 8px;font-size:12px;color:#9B9890;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
            </p>
            <p style="margin:0 0 24px;font-size:11px;word-break:break-all;">
              <a href="${resetUrl}" style="color:#C5753A;">${resetUrl}</a>
            </p>

            <!-- Avertissement sécurité -->
            <div style="background:#FEF9C3;border:1px solid #FDE68A;border-radius:7px;padding:12px 16px;margin-bottom:16px;">
              <p style="margin:0;font-size:12px;color:#92400E;line-height:1.5;">
                ⚠️ Ce lien est <strong>valable 30 minutes</strong> et à usage unique.<br />
                Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe n'a pas été modifié.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F5F3EF;padding:16px 32px;border-top:1px solid #E8E4DC;">
            <p style="margin:0;font-size:11px;color:#B0ACA5;text-align:center;">
              ${appName} — Cet email a été envoyé automatiquement, ne pas répondre.<br />
              <a href="${appUrl}" style="color:#B0ACA5;">${appUrl}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Réinitialisation de mot de passe — ${appName}

Vous avez demandé la réinitialisation de votre mot de passe.
Cliquez sur le lien suivant pour choisir un nouveau mot de passe (valable 30 minutes) :

${resetUrl}

Si vous n'avez pas fait cette demande, ignorez cet email.

— ${appName}`;

  await transport.sendMail({
    from,
    to,
    subject : `Réinitialisation de votre mot de passe — ${appName}`,
    html,
    text,
  });
}

module.exports = { isConfigured, sendResetEmail };
