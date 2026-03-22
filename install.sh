#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  install.sh — Installateur Minéral Spirit v2
#  Usage : bash install.sh
#
#  Ce script installe l'application sur un nouveau serveur Debian/Ubuntu :
#    1. Vérifie les prérequis (Node.js 22, npm, git)
#    2. Génère interactivement le fichier .env
#    3. Installe les dépendances backend et compile le frontend
#    4. Crée le service systemd
#    5. (optionnel) installe et configure Caddy pour le HTTPS
# ═══════════════════════════════════════════════════════════════════════════════
set -e

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${BOLD}══════════════════════════════════════${NC}"; echo -e "${BOLD}  $*${NC}"; echo -e "${BOLD}══════════════════════════════════════${NC}"; }

# ── Répertoire racine du projet (là où se trouve ce script) ──────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/spirit-v2"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"

# ═══════════════════════════════════════════════════════════════════════════════
section "Minéral Spirit v2 — Installation"
# ═══════════════════════════════════════════════════════════════════════════════

# ── 1. Vérification des prérequis ────────────────────────────────────────────
section "1 / 5 — Vérification des prérequis"

check_node() {
  if ! command -v node &>/dev/null; then
    warn "Node.js non trouvé. Installation de Node.js 22 via NodeSource..."
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
      sudo dnf install -y nodejs
    else
      error "Impossible d'installer Node.js automatiquement. Installez Node.js 22 manuellement : https://nodejs.org"
    fi
  fi

  NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    error "Node.js >= 18 requis (trouvé : v$NODE_VER). Mettez à jour Node.js."
  fi
  success "Node.js v$NODE_VER"
}

check_npm() {
  command -v npm &>/dev/null || error "npm non trouvé. Réinstallez Node.js."
  success "npm $(npm -v)"
}

check_node
check_npm

# ── 2. Génération du fichier .env ────────────────────────────────────────────
section "2 / 5 — Configuration (.env)"

gen_secret() {
  # Génère un secret aléatoire de 64 caractères hex
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p | tr -d '\n'
  fi
}

if [ -f "$ENV_FILE" ]; then
  warn "Le fichier .env existe déjà : $ENV_FILE"
  read -r -p "  Écraser le .env existant ? [o/N] " OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[oO]$ ]]; then
    info "Conservation du .env existant."
    SKIP_ENV=1
  fi
fi

if [ -z "$SKIP_ENV" ]; then
  echo ""
  info "Répondez aux questions suivantes pour créer votre configuration."
  echo ""

  # PORT
  read -r -p "  Port du serveur backend [3000] : " PORT
  PORT="${PORT:-3000}"

  # NODE_ENV
  NODE_ENV="production"

  # CLIENT_URL (domaine public)
  read -r -p "  Domaine public de l'application (ex: https://planning.monclub.fr) : " CLIENT_URL
  if [ -z "$CLIENT_URL" ]; then
    error "Le domaine public est obligatoire."
  fi

  # DB_PATH
  read -r -p "  Chemin du fichier SQLite [./db/spirit.db] : " DB_PATH
  DB_PATH="${DB_PATH:-./db/spirit.db}"

  # JWT secrets (auto-générés)
  JWT_SECRET=$(gen_secret)
  JWT_REFRESH_SECRET=$(gen_secret)
  info "Secrets JWT générés automatiquement (64 octets hex)."

  echo ""
  info "── Compte superadmin (technique — ne pas communiquer au client) ──────"
  read -r -p "  Email superadmin [dev@spirit-app.internal] : " SA_EMAIL
  SA_EMAIL="${SA_EMAIL:-dev@spirit-app.internal}"
  read -r -s -p "  Mot de passe superadmin (sensible, ne sera jamais affiché) : " SA_PASS
  echo ""
  if [ -z "$SA_PASS" ]; then
    error "Le mot de passe superadmin est obligatoire."
  fi

  echo ""
  info "── Compte admin (opérateur du club — devra changer son mot de passe à la 1re connexion) ──"
  read -r -p "  Email admin : " AD_EMAIL
  if [ -z "$AD_EMAIL" ]; then
    error "L'email admin est obligatoire."
  fi
  read -r -s -p "  Mot de passe initial admin : " AD_PASS
  echo ""
  if [ -z "$AD_PASS" ]; then
    error "Le mot de passe admin initial est obligatoire."
  fi

  # VAPID keys pour Web Push — générées automatiquement
  echo ""
  info "── Notifications Web Push ───────────────────────────────────────────"
  read -r -p "  Email de contact VAPID [${AD_EMAIL}] : " VAPID_EMAIL
  VAPID_EMAIL="${VAPID_EMAIL:-${AD_EMAIL}}"
  # Génération des clés VAPID via web-push (déjà installé)
  VAPID_KEYS=$(cd "$BACKEND_DIR" && node -e "
    const wp = require('web-push');
    const k = wp.generateVAPIDKeys();
    process.stdout.write(k.publicKey + '\n' + k.privateKey);
  " 2>/dev/null)
  VAPID_PUBLIC=$(echo "$VAPID_KEYS" | head -1)
  VAPID_PRIVATE=$(echo "$VAPID_KEYS" | tail -1)
  if [ -n "$VAPID_PUBLIC" ]; then
    success "Clés VAPID générées automatiquement."
  else
    warn "Impossible de générer les clés VAPID (web-push non disponible). Les notifications push seront désactivées."
  fi

  # Écriture du .env
  {
    echo "PORT=$PORT"
    echo "NODE_ENV=$NODE_ENV"
    echo "CLIENT_URL=$CLIENT_URL"
    echo "DB_PATH=$DB_PATH"
    echo ""
    echo "# ── JWT secrets ──────────────────────────────────────────────────"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
    echo ""
    echo "# ── Comptes créés au premier démarrage ───────────────────────────"
    echo "SUPERADMIN_EMAIL=$SA_EMAIL"
    echo "SUPERADMIN_PASSWORD=$SA_PASS"
    echo "ADMIN_EMAIL=$AD_EMAIL"
    echo "ADMIN_INITIAL_PASSWORD=$AD_PASS"
    if [ -n "$VAPID_PUBLIC" ]; then
      echo ""
      echo "# ── Web Push (VAPID) ─────────────────────────────────────────────"
      echo "VAPID_PUBLIC_KEY=$VAPID_PUBLIC"
      echo "VAPID_PRIVATE_KEY=$VAPID_PRIVATE"
      echo "VAPID_EMAIL=mailto:${VAPID_EMAIL}"
    fi
  } > "$ENV_FILE"

  chmod 600 "$ENV_FILE"
  success "Fichier .env créé (droits 600) : $ENV_FILE"
fi

# ── 3. Installation des dépendances + build ───────────────────────────────────
section "3 / 5 — Dépendances & Build"

info "Installation des dépendances backend..."
(cd "$BACKEND_DIR" && npm install --omit=dev)
success "Dépendances backend installées."

info "Installation des dépendances frontend..."
(cd "$FRONTEND_DIR" && npm install)
success "Dépendances frontend installées."

info "Compilation du frontend (Vite build)..."
(cd "$FRONTEND_DIR" && npm run build)
success "Frontend compilé dans frontend/dist/"

# ── Création des répertoires requis ─────────────────────────────────────────
info "Création des répertoires de données..."
mkdir -p "$BACKEND_DIR/db" "$BACKEND_DIR/uploads"
success "Répertoires db/ et uploads/ prêts."

# ── Initialisation de la base de données ─────────────────────────────────────
info "Initialisation de la base de données SQLite..."
(cd "$BACKEND_DIR" && node -e "
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  require('dotenv').config();
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(__dirname, 'db/spirit.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8'));
  console.log('Schéma initialisé.');
  db.close();
")
success "Base de données initialisée."

# ── 4. Service systemd ────────────────────────────────────────────────────────
section "4 / 5 — Service systemd"

SERVICE_NAME="mineral-spirit"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CURRENT_USER=$(whoami)

read -r -p "  Créer le service systemd '${SERVICE_NAME}' ? [O/n] " CREATE_SERVICE
if [[ ! "$CREATE_SERVICE" =~ ^[nN]$ ]]; then

  if [ "$EUID" -ne 0 ] && ! sudo -n true 2>/dev/null; then
    warn "droits sudo requis pour créer le service systemd. Tentative..."
  fi

  sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Minéral Spirit v2 — Gestion du personnel
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${BACKEND_DIR}
ExecStart=$(command -v node) app.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Sécurité
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  success "Service systemd créé et activé : $SERVICE_NAME"
  info "  Pour démarrer maintenant    : sudo systemctl start $SERVICE_NAME"
  info "  Pour voir les logs          : sudo journalctl -u $SERVICE_NAME -f"
else
  info "Service systemd ignoré. Démarrage manuel : cd $BACKEND_DIR && node app.js"
fi

# ── 5. Caddy (HTTPS) ──────────────────────────────────────────────────────────
section "5 / 5 — Caddy (HTTPS)"

read -r -p "  Installer et configurer Caddy pour le HTTPS ? [O/n] " INSTALL_CADDY

if [[ ! "$INSTALL_CADDY" =~ ^[nN]$ ]]; then

  # Installer Caddy si absent
  if ! command -v caddy &>/dev/null; then
    info "Installation de Caddy via le dépôt officiel..."
    if command -v apt-get &>/dev/null; then
      sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
      curl -1sSLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sSLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | sudo tee /etc/apt/sources.list.d/caddy-stable.list
      sudo apt-get update
      sudo apt-get install -y caddy
    else
      warn "Installez Caddy manuellement : https://caddyserver.com/docs/install"
      INSTALL_CADDY="n"
    fi
  fi

  if [[ ! "$INSTALL_CADDY" =~ ^[nN]$ ]] && command -v caddy &>/dev/null; then
    # Lire le domaine depuis le .env
    APP_DOMAIN=$(grep '^CLIENT_URL=' "$ENV_FILE" | sed 's/CLIENT_URL=//;s|https://||;s|http://||;s|/.*||')
    APP_PORT=$(grep '^PORT=' "$ENV_FILE" | sed 's/PORT=//')
    APP_PORT="${APP_PORT:-3000}"

    CADDYFILE="$SCRIPT_DIR/Caddyfile"
    if [ -f "$CADDYFILE" ]; then
      warn "Caddyfile déjà présent : $CADDYFILE — non modifié."
    else
      cat > "$CADDYFILE" << CADDYEOF
# Caddyfile — Minéral Spirit v2 (généré par install.sh)
${APP_DOMAIN} {
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
        reverse_proxy localhost:${APP_PORT}
    }

    handle {
        root * ${FRONTEND_DIR}/dist
        try_files {path} /index.html
        file_server
    }
}
CADDYEOF
      success "Caddyfile généré pour le domaine : $APP_DOMAIN"
    fi

    sudo systemctl enable caddy
    sudo caddy reload --config "$CADDYFILE" 2>/dev/null || sudo caddy start --config "$CADDYFILE"
    success "Caddy démarré avec le domaine $APP_DOMAIN"
  fi
else
  info "Caddy ignoré. Adaptez $SCRIPT_DIR/Caddyfile.example selon votre configuration."
fi

# ── Démarrage final ───────────────────────────────────────────────────────────
section "Installation terminée"

echo ""
echo -e "${GREEN}${BOLD}✅  Minéral Spirit v2 est prêt !${NC}"
echo ""
echo "  Prochain démarrage du serveur :"
if [[ ! "$CREATE_SERVICE" =~ ^[nN]$ ]]; then
  echo -e "    ${CYAN}sudo systemctl start $SERVICE_NAME${NC}"
else
  echo -e "    ${CYAN}cd $BACKEND_DIR && node app.js${NC}"
fi
echo ""
echo "  Au premier démarrage, les migrations vont :"
echo "    • Créer toutes les tables de la base de données"
echo "    • Insérer les équipes, fonctions et types de congés par défaut"
echo "    • Créer les comptes superadmin et admin définis dans votre .env"
echo ""
echo -e "  ${YELLOW}⚠  L'admin devra changer son mot de passe à la première connexion.${NC}"
echo ""
