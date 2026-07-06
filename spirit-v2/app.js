'use strict';
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const path         = require('path');

const { initSchema } = require('./db/database');

// Routes
const authRouter      = require('./routes/auth');
const staffRouter     = require('./routes/staff');
const teamsRouter     = require('./routes/teams');
const functionsRouter = require('./routes/functions');
const leavesRouter    = require('./routes/leaves');
const schedulesRouter = require('./routes/schedules');
const settingsRouter  = require('./routes/settings');
const { router: notificationsRouter } = require('./routes/notifications');
const statsRouter     = require('./routes/stats');
const costsRouter     = require('./routes/costs');
const swapsRouter     = require('./routes/swaps');
const templatesRouter   = require('./routes/templates');
const courseSlotsRouter = require('./routes/course-slots');
const { router: pushRouter } = require('./routes/push');
const leaveTypesRouter       = require('./routes/leave-types');
const taskTypesRouter        = require('./routes/task-types');
const unavailabilitiesRouter  = require('./routes/unavailabilities');
const hourDeclRouter          = require('./routes/hour-declarations');
const holidaysRouter          = require('./routes/holidays');
const schoolHolidaysRouter    = require('./routes/school-holidays');
const bootstrapRouter         = require('./routes/bootstrap');

// ── Vérifications sécurité au démarrage ─────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL)
  throw new Error('[SÉCURITÉ] CLIENT_URL doit être défini dans le .env en production.');// N2 — JWT_SECRET obligatoire (toute l'auth repose dessus)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error('[SÉCURITÉ] JWT_SECRET doit être défini dans le .env et faire au moins 32 caractères.');
// ── Initialisation DB ─────────────────────────────────────────
initSchema();

// ── App ───────────────────────────────────────────────────────
const app = express();

// Derrière Caddy (reverse proxy) : sans ça, Express voit l'IP du proxy
// pour toutes les requêtes et le rate limiting (login, reset password)
// mutualise tous les utilisateurs sous une seule clé.
app.set('trust proxy', 1);

// CSP définie ici (et non "déléguée à Caddy") : le Caddyfile réel de prod
// peut diverger de Caddyfile.example, alors que ce middleware s'applique
// systématiquement quel que soit le reverse proxy — cf. audit_pre_ete_2026.md §1.7.
// L'app est stylée en style inline React (pas de librairie UI, cf. contexte_reprise.md)
// d'où le style-src 'unsafe-inline' nécessaire ; script-src reste strict (bundle Vite only).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      fontSrc:     ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      workerSrc:   ["'self'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// ── Compression gzip/brotli ────────────────────────────────────
app.use(compression({
  threshold: 1024, // ne compresse que les réponses > 1 Ko
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Service des fichiers statiques du build Vite (production)
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      // index.html : jamais mis en cache (rechargement pour nouvelles versions)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|svg|ico)$/.test(filePath)) {
      // Assets Vite avec hash dans le nom : immuables 1 an
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Autres fichiers statiques : 1h
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  },
}));

// Servir les avatars publiquement (peu sensible, affichés partout dans l'UI)
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));
// Les documents justificatifs (certificats médicaux, etc.) NE sont PAS servis
// statiquement — voir la route authentifiée GET /api/leaves/:id/document
// (audit_pre_ete_2026.md §1.6 : ils étaient auparavant accessibles sans
// aucune session à quiconque devinait/connaissait l'URL).

// Servir les PDFs de documentation (accès public, lecture seule)
const docsPath = path.join(__dirname, '../Doc_techniques/pdf');
app.use('/docs', express.static(docsPath, { index: false }));

// ── Routes API ────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/staff',     staffRouter);
app.use('/api/teams',     teamsRouter);
app.use('/api/functions', functionsRouter);
app.use('/api/leaves',    leavesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/settings',       settingsRouter);
app.use('/api/notifications',  notificationsRouter);
app.use('/api/holidays',        holidaysRouter);
app.use('/api/school-holidays', schoolHolidaysRouter);
app.use('/api/stats',          statsRouter);
app.use('/api/costs',          costsRouter);
app.use('/api/swaps',          swapsRouter);
app.use('/api/templates',      templatesRouter);
app.use('/api/course-slots',   courseSlotsRouter);
app.use('/api/push',           pushRouter);
app.use('/api/leave-types',    leaveTypesRouter);
app.use('/api/task-types',          taskTypesRouter);
app.use('/api/unavailabilities',   unavailabilitiesRouter);
app.use('/api/hour-declarations',  hourDeclRouter);
app.use('/api/bootstrap',          bootstrapRouter);

// ── SPA fallback (renvoie index.html pour les routes React) ──
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) res.status(404).json({ error: 'Not found' });
  });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  // E4 — ne pas exposer les détails internes (SQLite, stack) en production
  const message = process.env.NODE_ENV === 'production'
    ? 'Erreur serveur interne'
    : (err.message || 'Erreur serveur');
  res.status(status).json({ error: message });
});

// Filet de sécurité : une exception async non catchée dans un handler ne
// doit jamais tuer tout le process (cf. audit_pre_ete_2026.md §1.3). Les
// routes elles-mêmes doivent rester la première ligne de défense (try/catch),
// ceci n'est qu'un filet de dernier recours.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[spirit-api] Serveur démarré sur http://localhost:${PORT}`);
  console.log(`[spirit-api] ENV: ${process.env.NODE_ENV || 'development'}`);
});

// ── Job : alerte urgente swap N heures avant prise de poste ───
const { db_: _jobDb } = require('./db/database');
const { notifyStaff: _notifyStaff } = require('./routes/notifications');

function _fmtH(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${hh}h${mm === 0 ? '00' : String(mm).padStart(2, '0')}`;
}

function checkUrgentSwapAlerts() {
  try {
    const alertHours = Number(
      _jobDb.get("SELECT value FROM settings WHERE key='swap_urgent_alert_hours'")?.value || 24
    );
    const now = Date.now();
    const limitMs = now + alertHours * 3600 * 1000;

    const pending = _jobDb.all(
      `SELECT * FROM shift_swaps WHERE status='pending' AND urgent_alert_sent=0`
    );

    for (const swap of pending) {
      if (swap.hour_start == null) continue;
      // Calculer la date/heure du créneau (week_start = YYYY-MM-DD lundi)
      const [y, m, d] = swap.week_start.split('-').map(Number);
      const shiftDate = new Date(y, m - 1, d + swap.day_index);
      shiftDate.setHours(Math.floor(swap.hour_start), Math.round((swap.hour_start % 1) * 60), 0, 0);
      const shiftMs = shiftDate.getTime();

      if (shiftMs > now && shiftMs <= limitMs) {
        const requester = _jobDb.get('SELECT * FROM staff WHERE id=?', [swap.requester_id]);
        if (!requester) continue;
        const managerStaffId = requester.manager_id;
        if (managerStaffId) {
          const dayNames = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const creneauLabel = `${dayNames[swap.day_index]} ${_fmtH(swap.hour_start)}–${_fmtH(swap.hour_end)} sem. ${swap.week_start.slice(5)}`;
          const hoursLeft = Math.round((shiftMs - now) / 3600000);
          _notifyStaff(managerStaffId, 'urgent',
            `⚠️ Créneau non couvert dans ${hoursLeft}h`,
            `Le créneau de ${requester.firstname} ${requester.lastname} (${creneauLabel}) n'a pas de remplaçant. Veuillez attribuer ce créneau manuellement.`,
            'swap', swap.id
          );
        }
        _jobDb.run(`UPDATE shift_swaps SET urgent_alert_sent=1 WHERE id=?`, [swap.id]);
      }
    }
  } catch (err) {
    console.error('[swap-alert-job]', err.message);
  }
}

// Vérification toutes les 30 minutes + au démarrage
setInterval(checkUrgentSwapAlerts, 30 * 60 * 1000);
setTimeout(checkUrgentSwapAlerts, 5000); // 5s après démarrage

module.exports = app;
