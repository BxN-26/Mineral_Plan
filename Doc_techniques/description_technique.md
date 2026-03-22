# minéral Spirit v2 — Description Technique Complète

> Document généré le 22 mars 2026  
> Version de référence : **spirit-v2** (production sur `planning.mineral-spirit.fr`)

---

## Table des matières

1. [Origine et contexte du projet](#1-origine-et-contexte-du-projet)
2. [Architecture générale](#2-architecture-générale)
3. [Stack technique](#3-stack-technique)
4. [Structure des fichiers](#4-structure-des-fichiers)
5. [Base de données](#5-base-de-données)
6. [Système d'authentification et sécurité](#6-système-dauthentification-et-sécurité)
7. [Modèle de rôles (RBAC)](#7-modèle-de-rôles-rbac)
8. [Référence API](#8-référence-api)
9. [Migrations de base de données](#9-migrations-de-base-de-données)
10. [Configuration — paramètres applicatifs](#10-configuration--paramètres-applicatifs)
11. [Workflow congés](#11-workflow-congés)
12. [Organigramme et hiérarchie](#12-organigramme-et-hiérarchie)
13. [Déploiement en production](#13-déploiement-en-production)
14. [Variables d'environnement](#14-variables-denvironnement)
15. [Maintenance et opérations](#15-maintenance-et-opérations)

---

## 1. Origine et contexte du projet

### Historique

**minéral Spirit** est né d'un besoin terrain au sein du club d'escalade **Minéral Spirit** (Aubenas, Ardèche). L'équipe encadrante utilisait des tableurs Excel pour gérer les plannings hebdomadaires, les congés et les remplacements. Cette approche présentait plusieurs limites :

- Aucune visibilité temps-réel pour le personnel sur son propre planning
- Gestion des congés entièrement manuelle (e-mail/papier)
- Calcul des heures laborieux et source d'erreurs
- Aucune piste d'audit ni historique structuré

La version 1 (`spirit-staff-v3.html`) était un prototype HTML+JS monofichier sans backend, utile pour valider les besoins mais non déployable en multi-utilisateur.

**spirit-v2** est la refonte complète en stack client/serveur, conçue pour :
- Être hébergée sur le serveur du club (VPS Debian)
- Supporter plusieurs rôles avec des vues adaptées
- Rendre indépendants les différents responsables pour saisir/approuver congés et plannings
- Évoluer facilement grâce à une architecture découplée frontend/backend

### Périmètre fonctionnel

| Domaine | Fonctionnalité |
|---|---|
| Planning | Saisie et visualisation hebdomadaire par fonction/équipe |
| Congés | Dépôt, workflow d'approbation multi-niveaux, compteurs |
| Équipes | CRUD équipes + membres, gestion hiérarchique (N+1/N+2/N+3) |
| Relevés | Total heures travaillées par salarié sur une période |
| Statistiques | KPIs, taux de présence, répartition par fonction (RH/admin) |
| Coûts | Simulation masse salariale (admin) |
| Échanges | Demandes de permutation de créneaux entre salariés |
| Profil | Modification du mot de passe, préférences |
| Configuration | Paramètres globaux, types de congés, organigramme, thème |
| Notifications | Push web (PWA) pour les événements congés/échanges |

---

## 2. Architecture générale

```
┌─────────────────────────────────────────────────────────┐
│                   Internet / HTTPS                      │
└──────────────────────────┬──────────────────────────────┘
                           │ :443
                    ┌──────▼──────┐
                    │    Caddy    │  Reverse proxy + Let's Encrypt
                    │  (systemd)  │
                    └──────┬──────┘
                           │ :3000
              ┌────────────▼─────────────┐
              │    Express 4 (Node 22)   │
              │    spirit-v2/app.js      │
              │                          │
              │  ┌────────────────────┐  │
              │  │  Routes /api/*     │  │
              │  └────────┬───────────┘  │
              │           │              │
              │  ┌────────▼───────────┐  │
              │  │  SQLite (WAL mode) │  │
              │  │  db/spirit.db      │  │
              │  └────────────────────┘  │
              │                          │
              │  ┌────────────────────┐  │
              │  │  Static /dist      │  │  ← Build React (Vite)
              │  └────────────────────┘  │
              └──────────────────────────┘
```

Le frontend (React/Vite) est **buildé** (`npm run build`) et servi directement par Express en tant que fichiers statiques depuis `frontend/dist/`. Il n'y a **pas de processus frontend séparé en production**.

---

## 3. Stack technique

### Backend

| Composant | Version | Rôle |
|---|---|---|
| Node.js | 22 LTS | Runtime JavaScript serveur |
| Express | 4.x | Framework HTTP |
| better-sqlite3 | 9.x | Pilote SQLite synchrone, mode WAL |
| jsonwebtoken | 9.x | Signature/vérification JWT |
| bcryptjs | 2.x | Hachage des mots de passe (salt 12) |
| cookie-parser | 1.x | Lecture des cookies httpOnly |
| cors | 2.x | CORS configurable par `CLIENT_URL` |
| multer | 1.x | Upload fichiers (avatars) |
| web-push | 3.x | Notifications Push (VAPID) |
| dotenv | 16.x | Chargement `.env` |

### Frontend

| Composant | Version | Rôle |
|---|---|---|
| React | 18.x | UI déclarative, hooks |
| Vite | 5.x | Build tool ultra-rapide, proxy dev |
| Axios | 1.x | Client HTTP, intercepteur refresh |
| CSS inline | — | Zéro dépendance UI externe |

### Infrastructure

| Composant | Rôle |
|---|---|
| SQLite (WAL) | Base de données fichier, robuste, backupable avec `cp` |
| Caddy 2 | Reverse proxy HTTPS automatique (Let's Encrypt) |
| systemd | Supervision du process Node (redémarrage auto) |
| Debian/Ubuntu | OS serveur |

---

## 4. Structure des fichiers

```
/home/serveur/Mineral_Plan/
│
├── README.md                       # Documentation rapide
├── Caddyfile                       # Configuration Caddy (production)
├── Caddyfile.example               # Modèle Caddy
├── spirit-staff-v3.html            # Prototype v1 (archivé, référence)
│
├── Doc_techniques/                 # ← Ce répertoire
│   ├── description_technique.md
│   ├── manuel_utilisateur.md
│   └── generer_pdf.sh
│
├── spirit-v2/                      # Backend Node.js
│   ├── app.js                      # Point d'entrée Express
│   ├── package.json
│   ├── .env                        # Secrets (ne pas versionner)
│   ├── .env.example                # Modèle .env documenté
│   │
│   ├── db/
│   │   ├── database.js             # Singleton SQLite + TOUTES les migrations
│   │   ├── schema.sql              # Schéma de référence (documentation)
│   │   └── seed.js                 # Données de démonstration (idempotent)
│   │
│   ├── middleware/
│   │   └── auth.js                 # JWT cookies, requireAuth, requireRole
│   │
│   └── routes/
│       ├── auth.js                 # POST /login, POST /logout, GET /me, POST /refresh
│       ├── staff.js                # CRUD salariés + upload avatar
│       ├── teams.js                # CRUD équipes + membres
│       ├── functions.js            # CRUD fonctions + vue par salarié
│       ├── leaves.js               # Workflow congés (dépôt + approbation)
│       ├── leave-types.js          # Types de congés + chaîne d'approbation
│       ├── schedules.js            # Planning hebdomadaire
│       ├── templates.js            # Modèles de planning
│       ├── swaps.js                # Échanges de créneaux
│       ├── stats.js                # Statistiques et KPIs
│       ├── costs.js                # Calcul masse salariale
│       ├── releves.js              # Relevés d'heures
│       ├── settings.js             # Paramètres applicatifs
│       ├── notifications.js        # Notifications in-app
│       └── push.js                 # Abonnements Push Web (VAPID)
│
└── frontend/                       # Frontend React + Vite
    ├── index.html
    ├── vite.config.js              # Proxy /api → :3000 en dev
    ├── package.json
    ├── dist/                       # Build production (servi par Express)
    │
    └── src/
        ├── App.jsx                 # Contexte global, routing par view-id
        ├── api/
        │   └── client.js           # Axios instance + intercepteur token refresh
        ├── context/
        │   └── AuthContext.jsx     # Contexte utilisateur connecté
        ├── components/
        │   ├── Sidebar.jsx         # Navigation latérale (rôle-aware)
        │   ├── StaffForm.jsx       # Formulaire salarié réutilisable
        │   └── common/             # Composants partagés (Badge, Modal, etc.)
        └── views/
            ├── LoginView.jsx
            ├── MonPlanningView.jsx
            ├── TeamPlanningView.jsx
            ├── GeneralPlanningView.jsx
            ├── PlanningView.jsx
            ├── EquipeView.jsx
            ├── CongesView.jsx
            ├── RelevesView.jsx
            ├── StatsView.jsx
            ├── CostsView.jsx
            ├── SwapView.jsx
            ├── MonProfilView.jsx
            └── ConfigView.jsx
```

---

## 5. Base de données

### Moteur et configuration

- **SQLite 3** avec le pilote synchrone `better-sqlite3`
- Mode **WAL** (Write-Ahead Log) activé au démarrage (`PRAGMA journal_mode = WAL`)
- Fichier : `spirit-v2/db/spirit.db`
- Backup : une simple copie du fichier suffit (SQLite est un fichier unique)

### Tables principales

| Table | Description |
|---|---|
| `staff` | Salariés : nom, email, rôle, mot de passe haché, photo, manager_id |
| `teams` | Équipes du club |
| `team_members` | Liaison N:N staff ↔ teams |
| `functions` | Fonctions/postes (ex : Animateur, Moniteur, Accueil) |
| `staff_functions` | Liaison N:N staff ↔ functions |
| `schedules` | Créneaux planning : staff, semaine ISO, jour, heure début/fin, function |
| `schedule_templates` | Modèles de planning réutilisables |
| `leaves` | Demandes de congé : type, dates, statut, approbateurs |
| `leave_types` | Types de congés configurables (CP, RTT, Formation…) avec chaîne d'approbation JSON |
| `swaps` | Échanges de créneaux entre salariés |
| `course_slots` | Créneaux de cours (escalade encadrée) |
| `settings` | Paramètres clé/valeur de l'application |
| `refresh_tokens` | Tokens de renouvellement JWT (SHA-256 hashed, expiry) |
| `push_subscriptions` | Abonnements Push Web par salarié |
| `_migrations` | Journal des migrations déjà appliquées (idempotence) |

### Schéma simplifié — relations clés

```
staff (id, email, role, manager_id→staff.id, password_hash)
  │
  ├── team_members (staff_id, team_id)           → teams
  ├── staff_functions (staff_id, function_id)    → functions
  ├── schedules (staff_id, week, day, start, end, function_id)
  ├── leaves (staff_id, leave_type_id, dates, status, approvers JSON)
  └── refresh_tokens (staff_id, token_hash, expires_at)

leave_types (id, name, approval_levels JSON)
settings (key, value, type, group)
_migrations (name, applied_at)
```

---

## 6. Système d'authentification et sécurité

### Flux JWT double-token

```
[Client]                          [Serveur]
   │                                  │
   │  POST /api/auth/login            │
   │  { email, password }  ──────────▶│
   │                                  │  bcrypt.compare()
   │                                  │  génère access_token (15 min)
   │                                  │  génère refresh_token (7 jours)
   │                                  │  stocke SHA-256(refresh) en DB
   │◀──────────────────────────────── │
   │  Set-Cookie: spirit_access       │  httpOnly, SameSite=Lax, Secure*
   │  Set-Cookie: spirit_refresh      │  httpOnly, path=/api/auth/refresh
   │
   │  [Requête API normale]            │
   │  Cookie: spirit_access  ────────▶│
   │                                  │  jwt.verify() → payload
   │◀──────────────────────────────── │  200 + données
   │
   │  [Access token expiré]            │
   │  → intercepteur Axios détecte 401│
   │  POST /api/auth/refresh ────────▶│
   │  Cookie: spirit_refresh          │  SHA-256(token) → lookup DB
   │                                  │  génère nouveau access_token
   │◀──────────────────────────────── │  Set-Cookie: spirit_access (nouveau)
   │  [relance la requête initiale]   │
```

\* Cookie `Secure` activé uniquement si `NODE_ENV=production`

### Sécurité des mots de passe

- Haché avec **bcrypt** (salt rounds = 12)
- Jamais stocké en clair, jamais retourné dans les réponses API
- Changement de mot de passe : l'ancien est vérifié avant remplacement
- Flag `must_change_password` : force le changement au premier login (admin initial)

### Protections

- Cookies `httpOnly` : JavaScript frontend ne peut pas lire les tokens
- Cookies `SameSite=Lax` : protection CSRF de base
- Tokens de refresh hashés en SHA-256 en base (vol de DB ≠ vol de sessions)
- CORS configuré sur `CLIENT_URL` uniquement
- Validation des rôles par middleware `requireRole()` sur chaque route sensible

---

## 7. Modèle de rôles (RBAC)

| Rôle | Accès |
|---|---|
| `superadmin` | Compte développeur technique. Accès total. Ne correspond à aucun salarié du club. |
| `admin` | Responsable du club. Accès à toutes les vues y compris Config, Coûts. Peut créer/modifier tous les comptes. |
| `rh` | Accès aux Statistiques et relevés. Pas d'accès Config ni Coûts. |
| `manager` | Gestion de son équipe : planning édition, équipe, congés (approbation), relevés. |
| `staff` | Vue lecture seule : Mon Planning, Planning Général, Mes congés, Échanges, Profil. |
| `viewer` | Accès restreint en lecture seule (usage interne/audit). |

### Règle d'héritage

`superadmin` ⊃ `admin` ⊃ `rh` ⊃ `manager` ⊃ `staff` ⊃ `viewer`

Chaque rôle hérite des droits de tous les rôles en dessous dans la hiérarchie. Implémenté dans `Sidebar.jsx` par des flags `isAdmin`, `isMgr`, `isRh`, `isStaff`.

---

## 8. Référence API

Toutes les routes sont préfixées `/api/`. L'authentification est requise sauf mention contraire.

### Authentification (`/api/auth`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/login` | Public | Login email/password → cookies JWT |
| POST | `/logout` | Auth | Supprime cookies + invalide refresh token |
| GET | `/me` | Auth | Profil utilisateur courant + `must_change_password` |
| POST | `/refresh` | Cookie refresh | Renouvelle l'access token |
| PUT | `/password` | Auth | Changer son mot de passe |

### Salariés (`/api/staff`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Manager+ | Liste de tous les salariés |
| GET | `/:id` | Auth | Détail d'un salarié |
| POST | `/` | Admin | Créer un salarié |
| PUT | `/:id` | Admin/Self | Modifier (rôle, manager, etc.) |
| DELETE | `/:id` | Admin | Supprimer un salarié |
| POST | `/:id/avatar` | Admin/Self | Upload photo |

### Équipes (`/api/teams`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Liste des équipes + membres |
| POST | `/` | Admin | Créer une équipe |
| PUT | `/:id` | Manager+ | Modifier une équipe |
| DELETE | `/:id` | Admin | Supprimer une équipe |
| POST | `/:id/members` | Manager+ | Ajouter un membre |
| DELETE | `/:id/members/:staffId` | Manager+ | Retirer un membre |

### Fonctions (`/api/functions`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Liste des fonctions |
| GET | `/staff-view` | Auth | Vue fonctions par salarié |
| POST | `/` | Admin | Créer une fonction |
| PUT | `/:id` | Admin | Modifier une fonction |
| DELETE | `/:id` | Admin | Supprimer une fonction |

### Planning (`/api/schedules`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Créneaux (filtrables par week, staff, team) |
| POST | `/` | Manager+ | Créer un créneau |
| PUT | `/:id` | Manager+ | Modifier un créneau |
| DELETE | `/:id` | Manager+ | Supprimer un créneau |

### Congés (`/api/leaves`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Ses propres congés (staff) ou tous (manager+) |
| POST | `/` | Auth | Déposer une demande de congé |
| PUT | `/:id/status` | Manager+ | Approuver / refuser |
| DELETE | `/:id` | Auth | Annuler une demande (si pending) |

### Types de congés (`/api/leave-types`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Liste des types actifs avec chaîne d'approbation |
| PUT | `/:id/approval` | Admin | Modifier la chaîne d'approbation d'un type |

### Statistiques, Coûts, Relevés

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/stats` | RH+ | KPIs et analyses |
| GET | `/api/costs` | Admin | Simulation masse salariale |
| GET | `/api/releves` | Manager+ | Relevés d'heures par période |

### Paramètres (`/api/settings`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Tous les paramètres (filtrables par group) |
| PUT | `/:key` | Admin | Modifier un paramètre |

### Échanges (`/api/swaps`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Ses échanges |
| POST | `/` | Auth | Proposer un échange |
| PUT | `/:id/status` | Auth | Accepter / refuser un échange |

---

## 9. Migrations de base de données

### Principe

Le système de migrations est **idempotent** : chaque migration est enregistrée dans la table `_migrations` par son nom unique. Au démarrage du serveur (`database.js`), toutes les fonctions de migration sont exécutées en séquence, mais seules celles absentes de `_migrations` sont réellement appliquées.

```javascript
// Exemple de migration
function migration_create_leave_types(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ...
    )
  `);
}
```

### Ajouter une migration

1. Créer une fonction `function migration_nom_unique(db)` dans `db/database.js`
2. L'ajouter au tableau `MIGRATIONS` en fin de fichier
3. Redémarrer le serveur — la migration s'exécute automatiquement

### Migrations notables

| Nom | Rôle |
|---|---|
| `initial_schema` | Création de toutes les tables de base |
| `seed_leave_types` | Insertion des types de congés par défaut |
| `add_approval_levels` | Ajout colonne `approval_levels` JSON aux types de congés |
| `first_install_accounts` | Création automatique superadmin + admin depuis `.env` |
| `fix_legacy_superadmin` | Reclassification des anciens comptes superadmin en admin |
| `swap_approval_level_seed` | Paramètre `swap_approval_level` dans settings |

---

## 10. Configuration — paramètres applicatifs

Les paramètres sont stockés dans la table `settings` (clé/valeur typée). Ils sont modifiables depuis l'onglet **Configuration** de l'interface.

| Groupe | Clé | Type | Description |
|---|---|---|---|
| `general` | `club_name` | string | Nom du club affiché |
| `general` | `ui_theme` | string | Thème de l'interface (`light` / `dark`) |
| `general` | `leave_count_method` | string | Méthode de décompte des jours (`calendar` / `working`) |
| `planning` | `default_week_start` | number | Jour de début de semaine (0=dim, 1=lun) |
| `planning` | `show_cost_in_planning` | boolean | Afficher les coûts dans la vue planning |
| `notifications` | `push_enabled` | boolean | Activer les notifications Push |
| `swaps` | `swap_approval_level` | string | Qui doit approuver un échange (`manager` / `rh` / `direction`) |

---

## 11. Workflow congés

### Cycle de vie d'une demande

```
[Staff]  POST /leaves  →  status: "pending"
                              │
                    ┌─────────▼─────────┐
                    │  Niveau 1 : N+1   │  (manager direct)
                    │  approve/reject   │
                    └─────────┬─────────┘
                              │ approved_n1
                    ┌─────────▼─────────┐
                    │  Niveau 2 : N+2   │  (RH ou manager N2)
                    │  (si configuré)   │
                    └─────────┬─────────┘
                              │ approved_n2
                    ┌─────────▼─────────┐
                    │  Niveau 3 : N+3   │  (Direction)
                    │  (si configuré)   │
                    └─────────┬─────────┘
                              │
                         status: "approved" / "rejected"
```

### Configuration de la chaîne

Chaque **type de congé** (`leave_types`) possède un champ JSON `approval_levels` qui liste les niveaux requis. Exemple :

```json
["manager", "rh"]
```

La chaîne est configurable depuis l'onglet **Organigramme** de ConfigView.

---

## 12. Organigramme et hiérarchie

### Structure hiérarchique

Chaque salarié peut avoir un `manager_id` pointant vers un autre salarié. Cette relation permet de construire :

- L'arbre hiérarchique visuel dans ConfigView → onglet Organigramme
- La résolution automatique N+2 et N+3 (le manager du manager, etc.)
- La sélection des approbateurs dans le workflow congés

### Gestion dans ConfigView

L'onglet **Organigramme** de la page Configuration offre :

1. **Arbre visuel** : représentation graphique de la hiérarchie avec connecteurs CSS
2. **Éditeur N+1** : tableau avec un menu déroulant pour assigner le manager direct de chaque salarié
3. **N+2 / N+3** : calculés automatiquement depuis la relation `manager_id` (lecture seule)
4. **Chaîne d'approbation par type** : boutons pour activer/désactiver chaque niveau (manager/rh/direction) par type de congé
5. **Niveau d'approbation des échanges** : sélecteur global (manager / rh / direction)

---

## 13. Déploiement en production

### Prérequis

- Node.js 22 LTS
- Caddy 2 (disponible via `apt install caddy` sur Debian)
- Accès au serveur via SSH

### Installation initiale

```bash
# 1. Cloner / copier les sources
cd /home/serveur/Mineral_Plan

# 2. Backend
cd spirit-v2
cp .env.example .env
# → Éditer .env : JWT_SECRET, SUPERADMIN_*, ADMIN_*, VAPID_*, etc.
npm install
# La base est créée et migrée au premier démarrage

# 3. Frontend
cd ../frontend
npm install
npm run build
# → Génère frontend/dist/ (servi par Express)

# 4. Démarrer le serveur
cd ../spirit-v2
npm start  # ou via systemd (recommandé)
```

### Service systemd (recommandé)

```ini
# /etc/systemd/system/mineral-spirit.service
[Unit]
Description=minéral Spirit v2
After=network.target

[Service]
WorkingDirectory=/home/serveur/Mineral_Plan/spirit-v2
ExecStart=/usr/bin/node app.js
Restart=always
User=serveur
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable mineral-spirit
sudo systemctl start mineral-spirit
```

### Caddy (HTTPS automatique)

```
# Caddyfile
planning.mineral-spirit.fr {
    reverse_proxy localhost:3000
}
```

```bash
sudo caddy start
```

Caddy gère automatiquement le certificat Let's Encrypt.

### Mise à jour

```bash
# 1. Arrêter le service
sudo systemctl stop mineral-spirit

# 2. Mettre à jour les sources (git pull ou rsync)

# 3. Mettre à jour les dépendances backend si besoin
cd spirit-v2 && npm install

# 4. Rebuilder le frontend
cd ../frontend && npm run build

# 5. Redémarrer
sudo systemctl start mineral-spirit
```

Les migrations de base de données s'appliquent **automatiquement** au démarrage.

### Backup

```bash
# Copie simple du fichier SQLite (à faire serveur arrêté ou en WAL mode)
cp /home/serveur/Mineral_Plan/spirit-v2/db/spirit.db \
   /backup/spirit_$(date +%Y%m%d).db
```

---

## 14. Variables d'environnement

Fichier : `spirit-v2/.env` (ne jamais versionner)

| Variable | Obligatoire | Défaut | Description |
|---|---|---|---|
| `PORT` | Non | `3000` | Port HTTP Express |
| `DB_PATH` | Non | `./db/spirit.db` | Chemin base SQLite |
| `JWT_SECRET` | **Oui** | — | Secret HMAC-SHA256 pour les JWT (min. 32 cars.) |
| `JWT_EXPIRES` | Non | `15m` | Durée access token |
| `CLIENT_URL` | Non | `http://localhost:5173` | URL frontend pour CORS |
| `NODE_ENV` | Non | `development` | `production` active Secure sur les cookies |
| `SUPERADMIN_EMAIL` | Non | `dev@spirit-app.internal` | Email du compte développeur |
| `SUPERADMIN_PASSWORD` | Non | — | Mot de passe superadmin (migration first_install) |
| `ADMIN_EMAIL` | Non | `admin@mineral-spirit.fr` | Email du premier admin club |
| `ADMIN_INITIAL_PASSWORD` | Non | `Spirit2025!` | Mot de passe initial admin (à changer) |
| `VAPID_PUBLIC_KEY` | Conditionnel | — | Clé publique push web (si notifications activées) |
| `VAPID_PRIVATE_KEY` | Conditionnel | — | Clé privée push web |
| `VAPID_SUBJECT` | Conditionnel | — | Contact VAPID (ex: `mailto:admin@...`) |

---

## 15. Maintenance et opérations

### Réinitialiser le mot de passe d'un compte

```bash
# Générer un hash bcrypt
node -e "const b=require('bcryptjs'); console.log(b.hashSync('NouveauMotDePasse', 12));"

# L'insérer en base
sqlite3 /home/serveur/Mineral_Plan/spirit-v2/db/spirit.db \
  "UPDATE staff SET password_hash='<hash>' WHERE email='user@example.com';"
```

Ou modifier `SUPERADMIN_PASSWORD` dans `.env` + forcer la migration via :

```bash
sqlite3 spirit-v2/db/spirit.db \
  "DELETE FROM _migrations WHERE name='first_install_accounts';"
```

Puis redémarrer le serveur.

### Régénérer les clés VAPID (notifications Push)

```bash
cd spirit-v2
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k);"
# Copier VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans .env
```

### Inspecter la base de données

```bash
sqlite3 /home/serveur/Mineral_Plan/spirit-v2/db/spirit.db
.tables
.schema staff
SELECT name, applied_at FROM _migrations ORDER BY applied_at;
```

### Logs serveur

```bash
sudo journalctl -u mineral-spirit -f    # logs temps réel
sudo journalctl -u mineral-spirit -n 100  # 100 dernières lignes
```
