'use strict';
/* ══════════════════════════════════════════════════════════════════════════════
   Minéral Spirit — Installateur  |  renderer/app.js
   Gestion du wizard multi-étapes (6 étapes config + install + terminé)
   ══════════════════════════════════════════════════════════════════════════════ */

// ─── Préréglages SMTP ─────────────────────────────────────────────────────────
const SMTP_PRESETS = {
  ovh:        { host: 'ssl0.ovh.net',               port: 587 },
  gandi:      { host: 'mail.gandi.net',              port: 587 },
  infomaniak: { host: 'mail.infomaniak.com',         port: 587 },
  ionos:      { host: 'smtp.ionos.fr',               port: 587 },
  gmail:      { host: 'smtp.gmail.com',              port: 587 },
  o2switch:   { host: 'smtp.votre-domaine.fr',       port: 587 },
  custom:     { host: '',                            port: 587 },
};

// ─── État global ──────────────────────────────────────────────────────────────
const state = {
  currentStep:     1,
  sys:             null,

  // Étape 2
  deployType:      'public',

  // Étape 3
  installDir:      '',
  domain:          '',
  port:            3000,

  // Étape 4
  adminFirstname:  '',
  adminLastname:   '',
  adminEmail:      '',
  adminPassword:   '',

  // Étape 5
  smtpEnabled:     false,
  smtpProvider:    'ovh',
  smtpHost:        SMTP_PRESETS.ovh.host,
  smtpPort:        587,
  smtpUser:        '',
  smtpPass:        '',

  // Install
  tasks:           [],
  progressPercent: 0,
  installUrl:      '',
  adminPasswordFinal: '',
};

// ─── Éléments DOM fréquemment utilisés ───────────────────────────────────────
const $ = (id) => document.getElementById(id);
const steps = () => document.querySelectorAll('.step');

// ══════════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

function showStep(n) {
  // Masquer toutes les étapes, afficher la cible
  steps().forEach(el => {
    el.classList.remove('active');
    if (parseInt(el.dataset.step) === n) el.classList.add('active');
  });

  // Mise à jour de la progress bar (visible pour étapes 1-6)
  updateStepNav(n);

  // Gestion des boutons de navigation
  const footer = $('app-footer');
  const btnBack = $('btn-back');
  const btnNext = $('btn-next');

  if (n === 7 || n === 8) {
    footer.style.display = 'none';
  } else {
    footer.style.display = 'flex';
    btnBack.disabled = (n === 1);
    btnNext.textContent = (n === 6) ? 'Lancer l\'installation →' : 'Suivant →';
  }

  state.currentStep = n;

  // Actions spécifiques à l'entrée dans une étape
  if (n === 3) onEnterStep3();
  if (n === 6) renderRecap();
  if (n === 7) startInstall();
}

function updateStepNav(n) {
  const nav = $('step-nav');
  if (n >= 7) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';

  for (let i = 1; i <= 6; i++) {
    const dot = nav.querySelector(`[data-dot="${i}"]`);
    const line = nav.querySelector(`[data-line="${i}"]`);
    dot.classList.remove('active', 'done');
    if (i < n)  dot.classList.add('done');
    if (i === n) dot.classList.add('active');
    if (line) {
      line.classList.remove('done');
      if (i < n) line.classList.add('done');
    }
  }
}

// ── Boutons Retour / Suivant ──────────────────────────────────────────────────
$('btn-next').addEventListener('click', () => {
  const errs = validateStep(state.currentStep);
  if (Object.keys(errs).length) {
    displayErrors(errs);
    return;
  }
  clearErrors();
  saveStep(state.currentStep);
  showStep(state.currentStep + 1);
});

$('btn-back').addEventListener('click', () => {
  clearErrors();
  if (state.currentStep > 1) showStep(state.currentStep - 1);
});

// ══════════════════════════════════════════════════════════════════════════════
//  VALIDATION PAR ÉTAPE
// ══════════════════════════════════════════════════════════════════════════════

function validateStep(n) {
  const errs = {};

  if (n === 3) {
    const dir = $('input-install-dir').value.trim();
    if (!dir) errs['install-dir'] = 'Veuillez indiquer un répertoire d\'installation.';

    if (state.deployType !== 'localhost') {
      const domain = $('input-domain').value.trim();
      if (!domain) {
        errs['domain'] = state.deployType === 'public'
          ? 'Veuillez saisir un nom de domaine.'
          : 'Veuillez saisir une adresse IP ou un nom d\'hôte.';
      }
    }

    const port = parseInt($('input-port').value);
    if (!port || port < 1024 || port > 65535) errs['port'] = 'Port invalide (1024–65535).';
  }

  if (n === 4) {
    if (!$('input-firstname').value.trim()) errs['firstname'] = 'Le prénom est requis.';
    if (!$('input-lastname').value.trim())  errs['lastname']  = 'Le nom est requis.';

    const email = $('input-email').value.trim();
    if (!email || !isValidEmail(email)) errs['email'] = 'Adresse email invalide.';

    const pwd = $('input-password').value;
    if (pwd.length < 8) errs['password'] = 'Le mot de passe doit contenir au moins 8 caractères.';

    const confirm = $('input-password-confirm').value;
    if (pwd !== confirm) errs['password-confirm'] = 'Les mots de passe ne correspondent pas.';
  }

  if (n === 5 && state.smtpEnabled) {
    if (!$('smtp-host').value.trim()) errs['smtp-host'] = 'Le serveur SMTP est requis.';
    const user = $('smtp-user').value.trim();
    if (!user || !isValidEmail(user)) errs['smtp-user'] = 'Email SMTP invalide.';
    if (!$('smtp-pass').value) errs['smtp-pass'] = 'Le mot de passe SMTP est requis.';
  }

  if (n === 6) {
    if (!$('confirm-check').checked) errs['confirm'] = 'Veuillez cocher la case pour confirmer.';
  }

  return errs;
}

function displayErrors(errs) {
  for (const [key, msg] of Object.entries(errs)) {
    const el = $(`err-${key}`);
    if (el) el.textContent = msg;

    // Mettre en rouge le champ correspondant
    const input = $(`input-${key}`) || $(`smtp-${key}`);
    if (input) input.classList.add('error');
  }
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  document.querySelectorAll('.field-input.error').forEach(el => el.classList.remove('error'));
}

// ══════════════════════════════════════════════════════════════════════════════
//  SAUVEGARDE DES CHAMPS DANS STATE
// ══════════════════════════════════════════════════════════════════════════════

function saveStep(n) {
  if (n === 3) {
    state.installDir = $('input-install-dir').value.trim();
    state.domain     = $('input-domain').value.trim();
    state.port       = parseInt($('input-port').value) || 3000;
  }
  if (n === 4) {
    state.adminFirstname = $('input-firstname').value.trim();
    state.adminLastname  = $('input-lastname').value.trim();
    state.adminEmail     = $('input-email').value.trim();
    state.adminPassword  = $('input-password').value;
  }
  if (n === 5) {
    state.smtpEnabled   = $('smtp-enabled').checked;
    state.smtpProvider  = $('smtp-provider').value;
    state.smtpHost      = $('smtp-host').value.trim();
    state.smtpPort      = parseInt($('smtp-port').value) || 587;
    state.smtpUser      = $('smtp-user').value.trim();
    state.smtpPass      = $('smtp-pass').value;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 2 — CARTES DE DÉPLOIEMENT
// ══════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.deploy-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.deploy-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.deployType = card.dataset.deploy;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 3 — CONFIGURATION RÉSEAU
// ══════════════════════════════════════════════════════════════════════════════

function onEnterStep3() {
  // Remplir le répertoire d'installation par défaut si pas encore saisi
  const dirInput = $('input-install-dir');
  if (!dirInput.value && state.sys) {
    dirInput.value = state.sys.defaultInstallDir;
  }

  // Adapter le label et l'aide selon le type de déploiement
  const labelDomain = $('label-domain');
  const hintDomain  = $('hint-domain');
  const inputDomain = $('input-domain');
  const fieldWrap   = $('field-domain-wrap');

  if (state.deployType === 'localhost') {
    fieldWrap.style.display = 'none';
  } else {
    fieldWrap.style.display = '';
    if (state.deployType === 'public') {
      labelDomain.textContent = 'Nom de domaine';
      inputDomain.placeholder = 'planning.monclub.fr';
      hintDomain.textContent  = 'Le domaine doit déjà pointer vers ce serveur en DNS.';
    } else {
      labelDomain.textContent = 'Adresse IP ou nom d\'hôte';
      inputDomain.placeholder = '192.168.1.100  ou  serveur.local';
      hintDomain.textContent  = 'L\'adresse du serveur sur votre réseau local.';
    }
  }
}

// Bouton "Parcourir"
$('btn-browse-dir').addEventListener('click', async () => {
  const dir = await window.api.selectDir();
  if (dir) $('input-install-dir').value = dir;
});

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 4 — MOT DE PASSE (force + toggle)
// ══════════════════════════════════════════════════════════════════════════════

$('input-password').addEventListener('input', () => {
  updatePasswordStrength($('input-password').value);
});

function updatePasswordStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8)           score++;
  if (pwd.length >= 12)          score++;
  if (/[A-Z]/.test(pwd))         score++;
  if (/[0-9]/.test(pwd))         score++;
  if (/[^A-Za-z0-9]/.test(pwd))  score++;

  const pct    = (score / 5) * 100;
  const colors = ['#DC2626', '#D97706', '#D97706', '#15803D', '#15803D', '#15803D'];
  const labels = ['', 'Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'];

  const bar   = $('pwd-strength-bar');
  const label = $('pwd-strength-label');
  bar.style.width      = pct + '%';
  bar.style.background = colors[score] || '#DC2626';
  label.textContent    = pwd.length ? labels[score] : '';
  label.style.color    = colors[score] || '';
}

function makePasswordToggle(btnId, inputId) {
  $(btnId).addEventListener('click', () => {
    const input = $(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}
makePasswordToggle('btn-toggle-pwd',  'input-password');
makePasswordToggle('btn-toggle-pwd2', 'input-password-confirm');

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 5 — SMTP TOGGLE + PRESETS
// ══════════════════════════════════════════════════════════════════════════════

$('smtp-enabled').addEventListener('change', () => {
  state.smtpEnabled = $('smtp-enabled').checked;
  $('smtp-fields').classList.toggle('hidden', !state.smtpEnabled);
});

$('smtp-provider').addEventListener('change', () => {
  const preset = SMTP_PRESETS[$('smtp-provider').value];
  if (preset) {
    $('smtp-host').value = preset.host;
    $('smtp-port').value = preset.port;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 6 — RÉCAPITULATIF
// ══════════════════════════════════════════════════════════════════════════════

function renderRecap() {
  const deployLabels = {
    public:    '🌐 Serveur public (HTTPS automatique)',
    local:     '🏢 Réseau local / Intranet (HTTP)',
    localhost: '💻 Localhost (test local)',
  };

  const appUrl = state.deployType === 'localhost'
    ? `http://localhost:${state.port}`
    : state.deployType === 'local'
      ? `http://${state.domain}`
      : `https://${state.domain}`;

  const rows1 = [
    ['Type de déploiement',       deployLabels[state.deployType]],
    ['URL de l\'application',     appUrl],
    ['Répertoire d\'installation', state.installDir],
    ['Port backend',              state.port],
  ];
  if (state.deployType !== 'localhost') {
    rows1.splice(2, 0, [
      state.deployType === 'public' ? 'Nom de domaine' : 'Adresse IP / hôte',
      state.domain,
    ]);
  }

  const rows2 = [
    ['Prénom & Nom', `${state.adminFirstname} ${state.adminLastname}`],
    ['Email',        state.adminEmail],
    ['Mot de passe', '••••••••'],
  ];

  const rows3 = state.smtpEnabled
    ? [
        ['Fournisseur', state.smtpProvider.toUpperCase()],
        ['Serveur',     `${state.smtpHost}:${state.smtpPort}`],
        ['Compte',      state.smtpUser],
      ]
    : [['', 'Non configuré']];

  const actions = [
    '→ Copie des fichiers de l\'application',
    '→ Installation des dépendances Node.js (npm install)',
    '→ Compilation du frontend (Vite build)',
    '→ Génération de la configuration (.env)',
    `→ Création du service ${state.sys?.isWindows ? 'Windows (Task Scheduler)' : 'Linux (systemd)'}`,
    state.deployType === 'public'
      ? '→ Configuration du reverse proxy HTTPS (Caddy)'
      : null,
    '→ Démarrage du service',
  ].filter(Boolean);

  $('recap-content').innerHTML = `
    ${recapSection('Déploiement', rows1)}
    ${recapSection('Compte administrateur', rows2)}
    ${recapSection('Email SMTP', rows3)}
    <div class="recap-section">
      <div class="recap-section-title">Actions qui seront effectuées</div>
      ${actions.map(a => `<div class="recap-row"><span class="recap-val" style="text-align:left">${a}</span></div>`).join('')}
    </div>
  `;
}

function recapSection(title, rows) {
  return `
    <div class="recap-section">
      <div class="recap-section-title">${title}</div>
      ${rows.map(([k, v]) => `
        <div class="recap-row">
          <span class="recap-key">${k}</span>
          <span class="recap-val">${v}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 7 — INSTALLATION
// ══════════════════════════════════════════════════════════════════════════════

function startInstall() {
  // Réinitialiser l'affichage
  $('task-list').innerHTML = '';
  $('log-area').textContent = '';
  $('install-progress-bar').style.width = '0%';
  $('install-progress-pct').textContent = '0 %';

  // Envoyer la config au process principal
  const config = {
    deployType:      state.deployType,
    installDir:      state.installDir,
    domain:          state.domain,
    port:            state.port,
    adminFirstname:  state.adminFirstname,
    adminLastname:   state.adminLastname,
    adminEmail:      state.adminEmail,
    adminPassword:   state.adminPassword,
    smtp: {
      enabled:  state.smtpEnabled,
      host:     state.smtpHost,
      port:     state.smtpPort,
      user:     state.smtpUser,
      pass:     state.smtpPass,
    },
  };

  // Écouter les événements de progression
  window.api.onProgress(handleProgress);
  window.api.startInstall(config);
}

function handleProgress(data) {
  if (data.type === 'tasks') {
    // Initialiser la liste de tâches
    state.tasks = data.tasks.map(t => ({ ...t, status: 'pending' }));
    renderTaskList();
    return;
  }

  if (data.type === 'step') {
    const task = state.tasks.find(t => t.id === data.id);
    if (task) task.status = data.status;
    renderTaskList();
    updateProgress();
    return;
  }

  if (data.type === 'log') {
    appendLog(data.message);
    return;
  }

  if (data.type === 'done') {
    state.installUrl = data.url;
    state.adminPasswordFinal = state.adminPassword;
    updateProgress();
    // Court délai pour que l'animation de progression se termine
    setTimeout(() => showDoneScreen(data), 800);
    return;
  }

  if (data.type === 'fatal') {
    appendLog('⛔ ERREUR FATALE : ' + data.message);
    // Afficher un bandeau d'erreur
    const bar = $('install-progress-bar');
    bar.style.background = '#DC2626';
    bar.style.width = '100%';
    $('install-progress-pct').textContent = 'Erreur';
    return;
  }
}

function renderTaskList() {
  $('task-list').innerHTML = state.tasks.map(t => {
    const iconMap = {
      pending: '·',
      running: '◌',
      done:    '✓',
      error:   '✕',
    };
    return `
      <div class="task-item ${t.status}">
        <div class="task-status-icon ${t.status}">${iconMap[t.status] || '·'}</div>
        <span class="task-label">${t.label}</span>
      </div>
    `;
  }).join('');
}

function updateProgress() {
  const total = state.tasks.length;
  if (!total) return;
  const done = state.tasks.filter(t => t.status === 'done' || t.status === 'error').length;
  const pct  = Math.round((done / total) * 100);
  $('install-progress-bar').style.width = pct + '%';
  $('install-progress-pct').textContent = pct + ' %';
}

function appendLog(message) {
  const area = $('log-area');
  area.textContent += message + '\n';
  area.scrollTop = area.scrollHeight;
  // Ouvrir automatiquement les logs si le détail est fermé et qu'il y a plus de 5 lignes
  const lines = area.textContent.split('\n').length;
  if (lines > 5) $('log-details').open = true;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 8 — TERMINÉ
// ══════════════════════════════════════════════════════════════════════════════

function showDoneScreen(data) {
  $('done-url-link').textContent = data.url;
  $('done-url-link').href = '#';
  $('done-url-link').onclick = (e) => {
    e.preventDefault();
    window.api.openUrl(data.url);
  };

  $('done-email').textContent = data.email || state.adminEmail;

  // Révélation du mot de passe admin
  let revealed = false;
  const hiddenEl = $('done-password-hidden');
  const revealBtn = $('done-reveal-btn');
  hiddenEl.textContent = '••••••••';
  revealBtn.addEventListener('click', () => {
    revealed = !revealed;
    hiddenEl.textContent = revealed ? state.adminPasswordFinal : '••••••••';
    revealBtn.textContent = revealed ? 'Masquer' : 'Afficher';
  });

  // Ouvrir l'app
  $('btn-open-app').onclick = () => window.api.openUrl(data.url);
  $('btn-close-app').onclick = () => window.close();

  showStep(8);
}

// ══════════════════════════════════════════════════════════════════════════════
//  INITIALISATIONS AU DÉMARRAGE
// ══════════════════════════════════════════════════════════════════════════════

async function init() {
  // Récupérer les infos système
  state.sys = await window.api.getSystemInfo();

  // Préremplir le répertoire d'installation par défaut
  if (state.sys.defaultInstallDir) {
    $('input-install-dir').value = state.sys.defaultInstallDir;
  }

  // Préremplir les champs SMTP avec le preset par défaut
  updateSmtpPreset('ovh');

  // Afficher l'étape 1
  showStep(1);
}

function updateSmtpPreset(provider) {
  const preset = SMTP_PRESETS[provider] || SMTP_PRESETS.custom;
  $('smtp-host').value = preset.host;
  $('smtp-port').value = preset.port;
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Démarrer
init();
