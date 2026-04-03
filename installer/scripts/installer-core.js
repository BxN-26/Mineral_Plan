'use strict';

const { spawn, exec } = require('child_process');
const fs              = require('fs');
const path            = require('path');
const os              = require('os');
const crypto          = require('crypto');

const isWindows = process.platform === 'win32';

// ── Tâches de l'installation (ordre) ─────────────────────────────────────────
const ALL_TASKS = [
  { id: 'node',           label: 'Vérification de Node.js'                },
  { id: 'copy',           label: "Copie des fichiers de l'application"    },
  { id: 'backend-deps',   label: 'Dépendances backend (npm install)'      },
  { id: 'frontend-deps',  label: 'Dépendances frontend (npm install)'     },
  { id: 'frontend-build', label: 'Compilation du frontend (Vite)'         },
  { id: 'env',            label: 'Génération de la configuration (.env)'  },
  { id: 'service',        label: 'Création du service système'            },
  { id: 'caddy',          label: 'Configuration du proxy HTTPS (Caddy)'  },
  { id: 'start',          label: 'Démarrage du service'                   },
];

// ── Helper : exécuter une commande avec sortie en direct ─────────────────────
function spawnAsync(cmd, args, opts, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: true, ...opts });

    const capture = (d) => {
      const line = d.toString().trim();
      if (line && onLog) onLog(line);
    };
    if (proc.stdout) proc.stdout.on('data', capture);
    if (proc.stderr) proc.stderr.on('data', capture);

    proc.on('close', code => (code === 0 ? resolve() : reject(
      new Error(`Échec (code ${code}) : ${cmd} ${args.slice(0, 2).join(' ')}`)
    )));
    proc.on('error', reject);
  });
}

// ── Helper : copie récursive d'un répertoire ──────────────────────────────────
function copyDir(src, dest, excludes = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (excludes.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, excludes);
    else                     fs.copyFileSync(s, d);
  }
}

// ── Helper : génération de secret hex ────────────────────────────────────────
const genSecret = () => crypto.randomBytes(32).toString('hex');

// ── Helper : générer les clés VAPID ──────────────────────────────────────────
function generateVapidKeys(spiritDir) {
  return new Promise((resolve) => {
    const script = `const wp=require('web-push');const k=wp.generateVAPIDKeys();process.stdout.write(JSON.stringify(k));`;
    exec(`node -e "${script}"`, { cwd: spiritDir }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POINT D'ENTRÉE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
async function runInstall(config, sendProgress) {
  const {
    isPackaged,
    deployType,      // 'public' | 'local' | 'localhost'
    installDir,
    domain,
    port,
    adminFirstname, adminLastname, adminEmail, adminPassword,
    smtp,
  } = config;

  // Outils de communication avec le renderer
  const log       = (msg)           => sendProgress({ type: 'log',  message: msg });
  const step      = (id, status)    => sendProgress({ type: 'step', id, status });

  const spiritDir  = path.join(installDir, 'spirit-v2');
  const frontendDir = path.join(installDir, 'frontend');

  // Envoyer la liste des tâches applicables
  const tasks = ALL_TASKS.filter(t => t.id !== 'caddy' || deployType === 'public');
  sendProgress({ type: 'tasks', tasks });

  // ── 1. Vérification de Node.js ──────────────────────────────────────────────
  step('node', 'running');
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0]);
  if (nodeMajor < 18) {
    step('node', 'error');
    throw new Error(`Node.js >= 18 requis (trouvé ${process.version}). Mettez à jour Node.js sur https://nodejs.org`);
  }
  log(`Node.js ${process.version} ✓`);
  step('node', 'done');

  // ── 2. Copie des fichiers source ────────────────────────────────────────────
  step('copy', 'running');
  try {
    const sourceDir = isPackaged
      ? path.join(process.resourcesPath, 'app-source')
      : path.join(__dirname, '..', '..');

    const srcSpirit  = path.join(sourceDir, 'spirit-v2');
    const srcFrontend = path.join(sourceDir, 'frontend');

    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });

    if (path.normalize(srcSpirit) !== path.normalize(spiritDir)) {
      log(`Copie spirit-v2 → ${spiritDir}`);
      copyDir(srcSpirit, spiritDir, ['node_modules', 'db', '.env', 'uploads']);
    } else {
      log('Fichiers backend déjà en place.');
    }

    if (path.normalize(srcFrontend) !== path.normalize(frontendDir)) {
      log(`Copie frontend → ${frontendDir}`);
      copyDir(srcFrontend, frontendDir, ['node_modules', 'dist']);
    } else {
      log('Fichiers frontend déjà en place.');
    }

    // Répertoires requis à l'exécution
    fs.mkdirSync(path.join(spiritDir, 'db'),              { recursive: true });
    fs.mkdirSync(path.join(spiritDir, 'uploads', 'avatars'), { recursive: true });
    log('Répertoires de données créés.');
    step('copy', 'done');
  } catch (e) { step('copy', 'error'); throw e; }

  // ── 3. Dépendances backend ───────────────────────────────────────────────────
  step('backend-deps', 'running');
  try {
    log('npm install --omit=dev (backend)…');
    await spawnAsync('npm', ['install', '--omit=dev'], { cwd: spiritDir }, log);
    step('backend-deps', 'done');
  } catch (e) { step('backend-deps', 'error'); throw e; }

  // ── 4. Dépendances + build frontend ─────────────────────────────────────────
  step('frontend-deps', 'running');
  try {
    log('npm install (frontend)…');
    await spawnAsync('npm', ['install'], { cwd: frontendDir }, log);
    step('frontend-deps', 'done');
  } catch (e) { step('frontend-deps', 'error'); throw e; }

  step('frontend-build', 'running');
  try {
    log('vite build…');
    await spawnAsync('npm', ['run', 'build'], { cwd: frontendDir }, log);
    step('frontend-build', 'done');
  } catch (e) { step('frontend-build', 'error'); throw e; }

  // ── 5. Génération du .env ────────────────────────────────────────────────────
  step('env', 'running');
  try {
    const clientUrl = deployType === 'localhost'
      ? `http://localhost:${port}`
      : deployType === 'local'
        ? `http://${domain}:${port}`
        : `https://${domain}`;

    const jwtSecret        = genSecret();
    const jwtRefreshSecret = genSecret();
    const saPassword       = genSecret().slice(0, 24);

    const lines = [
      `PORT=${port}`,
      `NODE_ENV=production`,
      `CLIENT_URL=${clientUrl}`,
      `DB_PATH=./db/spirit.db`,
      '',
      '# JWT secrets (générés automatiquement — ne pas modifier)',
      `JWT_SECRET=${jwtSecret}`,
      `JWT_REFRESH_SECRET=${jwtRefreshSecret}`,
      '',
      '# Compte superadmin technique (accès développeur)',
      `SUPERADMIN_EMAIL=superadmin@spirit.internal`,
      `SUPERADMIN_PASSWORD=${saPassword}`,
      '',
      '# Compte administrateur opérateur',
      `ADMIN_FIRSTNAME=${adminFirstname}`,
      `ADMIN_LASTNAME=${adminLastname}`,
      `ADMIN_EMAIL=${adminEmail}`,
      `ADMIN_INITIAL_PASSWORD=${adminPassword}`,
    ];

    // Clés VAPID (notifications push) — générées après npm install
    const vapid = await generateVapidKeys(spiritDir);
    if (vapid) {
      lines.push('', '# Web Push (VAPID)');
      lines.push(`VAPID_PUBLIC_KEY=${vapid.publicKey}`);
      lines.push(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
      lines.push(`VAPID_EMAIL=mailto:${adminEmail}`);
      log('Clés VAPID générées ✓');
    } else {
      log('⚠️ Clés VAPID non générées — les notifications push seront désactivées.');
    }

    // SMTP optionnel
    if (smtp?.enabled && smtp.host) {
      lines.push('', '# Email (réinitialisation de mot de passe)');
      lines.push(`SMTP_HOST=${smtp.host}`);
      lines.push(`SMTP_PORT=${smtp.port}`);
      lines.push(`SMTP_USER=${smtp.user}`);
      lines.push(`SMTP_PASS=${smtp.pass}`);
      lines.push(`SMTP_FROM=${smtp.user}`);
      log('Configuration SMTP ajoutée ✓');
    }

    const envPath = path.join(spiritDir, '.env');
    fs.writeFileSync(envPath, lines.join('\n') + '\n', { mode: 0o600 });
    log('.env créé (droits 600) ✓');
    step('env', 'done');
  } catch (e) { step('env', 'error'); throw e; }

  // ── 6. Service système ───────────────────────────────────────────────────────
  step('service', 'running');
  try {
    if (isWindows) {
      await createWindowsService(spiritDir, log);
    } else {
      await createLinuxService(spiritDir, log);
    }
    step('service', 'done');
  } catch (e) {
    step('service', 'error');
    log('⚠️ Service non créé automatiquement (droits insuffisants ?).');
    log(`   Démarrage manuel : cd "${spiritDir}" && node app.js`);
    // Non fatal — l'application est quand même installée
  }

  // ── 7. Caddy (déploiement public uniquement) ─────────────────────────────────
  if (deployType === 'public') {
    step('caddy', 'running');
    try {
      await configureCaddy(domain, port, path.join(frontendDir, 'dist'), installDir, log);
      step('caddy', 'done');
    } catch (e) {
      step('caddy', 'error');
      log('⚠️ Caddy non configuré : ' + e.message);
      log('   HTTPS devra être configuré manuellement (voir Caddyfile.example).');
    }
  }

  // ── 8. Démarrage du service ──────────────────────────────────────────────────
  step('start', 'running');
  try {
    if (isWindows) {
      await spawnAsync('schtasks', ['/run', '/tn', 'MineralSpirit'], {}, log);
    } else {
      await spawnAsync('sudo', ['systemctl', 'start', 'mineral-spirit'], {}, log);
    }
    log('Service démarré ✓');
    step('start', 'done');
  } catch (e) {
    step('start', 'error');
    log('⚠️ Démarrage automatique impossible.');
    log(`   Démarrez manuellement : cd "${spiritDir}" && node app.js`);
  }

  // ── Terminé ──────────────────────────────────────────────────────────────────
  const appUrl = deployType === 'localhost'
    ? `http://localhost:${port}`
    : deployType === 'local'
      ? `http://${domain}`
      : `https://${domain}`;

  sendProgress({ type: 'done', url: appUrl, email: adminEmail });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Service Linux (systemd)
// ─────────────────────────────────────────────────────────────────────────────
async function createLinuxService(spiritDir, log) {
  const nodeExec   = process.execPath;
  const currentUser = os.userInfo().username;

  const serviceContent = `[Unit]
Description=Minéral Spirit v2 — Gestion RH et Planning
After=network.target

[Service]
Type=simple
User=${currentUser}
WorkingDirectory=${spiritDir}
ExecStart=${nodeExec} app.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
`;
  const tmpFile = path.join(os.tmpdir(), 'mineral-spirit.service');
  fs.writeFileSync(tmpFile, serviceContent);

  // pkexec montre une fenêtre graphique de demande de mot de passe root
  await spawnAsync('pkexec', ['bash', '-c', [
    `cp "${tmpFile}" /etc/systemd/system/mineral-spirit.service`,
    'systemctl daemon-reload',
    'systemctl enable mineral-spirit',
  ].join(' && ')], {}, log);

  log('Service systemd mineral-spirit créé et activé ✓');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Service Windows (Task Scheduler)
// ─────────────────────────────────────────────────────────────────────────────
async function createWindowsService(spiritDir, log) {
  const nodeExec   = process.execPath;
  const scriptPath = path.join(spiritDir, 'app.js');

  // Suppression de la tâche existante si présente (ignoré si elle n'existe pas)
  await spawnAsync('schtasks', ['/delete', '/tn', 'MineralSpirit', '/f'], {}, null)
    .catch(() => {});

  await spawnAsync('schtasks', [
    '/create',
    '/tn',  'MineralSpirit',
    '/tr',  `"${nodeExec}" "${scriptPath}"`,
    '/sc',  'onstart',
    '/ru',  'SYSTEM',
    '/rl',  'HIGHEST',
    '/f',
  ], {}, log);

  log('Tâche planifiée Windows créée (démarrage au boot) ✓');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Caddy (reverse proxy HTTPS)
// ─────────────────────────────────────────────────────────────────────────────
async function configureCaddy(domain, port, distDir, installDir, log) {
  // Vérifier si Caddy est installé
  const caddyPresent = await new Promise(r => exec('caddy version', e => r(!e)));

  if (!caddyPresent) {
    if (isWindows) {
      throw new Error('Sur Windows, installez Caddy manuellement : https://caddyserver.com/docs/install');
    }
    log("Caddy non trouvé — installation via apt…");
    await spawnAsync('bash', ['-c', [
      "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl",
      "curl -1sSLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
      "curl -1sSLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list",
      "apt-get update && apt-get install -y caddy",
    ].join(' && ')], {}, log);
  }

  // Répertoire de logs
  if (!isWindows) {
    await spawnAsync('sudo', ['mkdir', '-p', '/var/log/caddy'], {}, null).catch(() => {});
    await spawnAsync('sudo', ['chown', 'caddy:caddy', '/var/log/caddy'], {}, null).catch(() => {});
  }

  const caddyfile = `# Caddyfile — Minéral Spirit v2 (généré par l'installateur)
${domain} {
    log {
        output file /var/log/caddy/spirit.log
        format json
    }

    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    handle /api/* {
        reverse_proxy localhost:${port}
    }

    handle {
        root * ${distDir}
        try_files {path} /index.html
        file_server
    }
}
`;

  const caddyfilePath = path.join(installDir, 'Caddyfile');
  fs.writeFileSync(caddyfilePath, caddyfile);
  log(`Caddyfile écrit → ${caddyfilePath}`);

  // Activer + recharger Caddy
  await spawnAsync('sudo', ['systemctl', 'enable', 'caddy'], {}, log)
    .catch(() => {});
  await spawnAsync('sudo', ['caddy', 'reload', '--config', caddyfilePath], {}, log)
    .catch(() => spawnAsync('sudo', ['caddy', 'start', '--config', caddyfilePath], {}, log));

  log(`Caddy démarré pour ${domain} ✓`);
}

module.exports = { runInstall };
