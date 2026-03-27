'use strict';
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
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
const unavailabilitiesRouter = require('./routes/unavailabilities');

// ── Initialisation DB ─────────────────────────────────────────
initSchema();

// ── App ───────────────────────────────────────────────────────
const app = express();

app.use(helmet({
  contentSecurityPolicy: false, // géré par Caddy en prod
}));

app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());


// ── Tracking activité temps réel ─────────────────────────────
const activeSessions = new Map(); // token -> {user, last_seen}
let connectionsToday = { date: '', count: 0 };

function trackActivity(req, res, next) {
  const auth = req.headers.authorization || req.cookies?.token;
  if (auth) {
    const key = auth.slice(-16);
    const today = new Date().toISOString().slice(0,10);
    if (!activeSessions.has(key) || activeSessions.get(key).date !== today) {
      if (connectionsToday.date !== today) { connectionsToday = { date: today, count: 0 }; }
      connectionsToday.count++;
    }
    activeSessions.set(key, { last_seen: Date.now(), date: today });
    // Nettoyer les sessions inactives depuis plus de 15min
    const limit = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of activeSessions) { if (v.last_seen < limit) activeSessions.delete(k); }
  }
  next();
}
app.use(trackActivity);
global._hubStats = { activeSessions, connectionsToday };

// Service des fichiers statiques du build Vite (production)
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// Servir les uploads (avatars, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes API ────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/staff',     staffRouter);
app.use('/api/teams',     teamsRouter);
app.use('/api/functions', functionsRouter);
app.use('/api/leaves',    leavesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/settings',       settingsRouter);
app.use('/api/notifications',  notificationsRouter);
app.use('/api/stats',          statsRouter);
app.use('/api/costs',          costsRouter);
app.use('/api/swaps',          swapsRouter);
app.use('/api/templates',      templatesRouter);
app.use('/api/course-slots',   courseSlotsRouter);
app.use('/api/push',           pushRouter);
app.use('/api/leave-types',    leaveTypesRouter);
app.use('/api/task-types',          taskTypesRouter);
app.use('/api/unavailabilities',   unavailabilitiesRouter);

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
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Erreur serveur' });
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
