# minéral Spirit v2 — Description Technique Complète

> Document mis à jour le 28 mars 2026  
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
16. [Créneaux de cours](#16-créneaux-de-cours)
17. [Indisponibilités](#17-indisponibilités)
18. [Membres multi-équipes](#18-membres-multi-équipes)

---

## 1. Origine et contexte du projet

### Historique

**minéral Spirit** est né d'un besoin terrain au sein du club d'escalade **Minéral Spirit** (Valence, Drôme). L'équipe encadrante utilisait des tableurs Excel pour gérer les plannings hebdomadaires, les congés et les remplacements. Cette approche présentait plusieurs limites :

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
│   ├── generer_pdf.sh
│   └── pdf/                         # PDFs générés (servis sur /docs/)
│       ├── manuel_utilisateur.pdf
│       └── description_technique.pdf
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
│       ├── push.js                 # Abonnements Push Web (VAPID)
│       ├── course-slots.js         # Créneaux de cours + affectations
│       ├── task-types.js           # Types de tâches planning
│       └── unavailabilities.js     # Indisponibilités salarié
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
| `staff` | Salariés : nom, email, type, photo, manager_id, soldes CP/RTT, taux |
| `users` | Comptes applicatifs : email, mot de passe haché, rôle, staff_id |
| `v_staff` | Vue pratique sur `staff` avec colonne calculée `fullname` |
| `teams` | Équipes du club (couleur, icône, fn_slugs pour filtrage multi-équipes) |
| `staff_teams` | Liaison N:N staff ↔ teams (remplace l'ancien `team_members`) |
| `functions` | Fonctions/postes (ex : Moniteur, Encadrant, Accueil) |
| `staff_functions` | Liaison N:N staff ↔ functions avec taux horaire spécifique |
| `schedules` | En-têtes de planning : semaine ISO + fonction, statut (draft/published) |
| `schedule_slots` | Créneaux individuels : staff, jour, heure début/fin (REAL pour quarts d'heure) |
| `schedule_templates` | Modèles de planning réutilisables |
| `template_slots` | Créneaux d'un modèle de planning |
| `leaves` | Demandes de congé : type, dates, statut, approbateurs N1/N2/N3 |
| `leave_types` | Types de congés configurables avec chaîne d'approbation JSON |
| `leave_notifications` | Notifications de congés par utilisateur |
| `shift_swaps` | Échanges de créneaux : mode open/targeted, workflow approbation |
| `course_slots` | Créneaux de cours permanents (groupe, niveau, capacité, saison) |
| `course_slot_assignments` | Affectation d'un moniteur à un cours pour une semaine donnée |
| `task_types` | Types de tâches du planning (permanence, ouverture blocs, etc.) |
| `unavailabilities` | Indisponibilités déclarées par les salariés (récurrence possible) |
| `timesheets` | Relevés d'heures pointées par salarié (calculées ou manuelles) |
| `audit_log` | Journal d'audit : toutes les actions sensibles avec old/new data |
| `notifications` | Notifications in-app (congés, échanges, info) par compte utilisateur |
| `push_subscriptions` | Abonnements Push Web par utilisateur (endpoint + clés VAPID) |
| `settings` | Paramètres clé/valeur typés de l'application |
| `refresh_tokens` | Tokens de renouvellement JWT (SHA-256 hashed, expiry) |
| `_migrations` | Journal des migrations déjà appliquées (idempotence) |

### Schéma simplifié — relations clés

```
users (id, email, password, role, staff_id→staff.id, must_change_password)
  └── refresh_tokens (user_id, token_hash, expires_at)

staff (id, firstname, lastname, type, manager_id→staff.id, cp_balance, rtt_balance)
  │
  ├── staff_teams (staff_id, team_id, is_primary)    → teams
  ├── staff_functions (staff_id, function_id, hourly_rate)
  │     └── functions (slug, color, allowed_types)
  ├── schedules (week_start, function_id)
  │     └── schedule_slots (staff_id, day_of_week, hour_start, hour_end, task_type)
  ├── leaves (type_id, dates, status, n1/n2/n3 approbateurs)
  │     └── leave_types (slug, approval_levels JSON, count_method)
  ├── shift_swaps (requester_id, week_start, fn_slug, mode, target_id)
  ├── course_slot_assignments (course_slot_id, week_start)
  │     └── course_slots (day_of_week, hour_start/end, group_name, capacity)
  ├── unavailabilities (date_start, date_end, recurrence, status)
  └── timesheets (work_date, time_in/out, hours_worked)

teams (fn_slugs JSON)  ← filtrage fonctions par équipe (multi-équipes)
notifications (user_id, type, title, read)  ← compte utilisateur
audit_log (user_id, action, entity, old_data, new_data)
settings (key, value, type, group_name)
_migrations (name)
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
| GET | `/` | Auth | Créneaux d'une semaine (`?week=YYYY-MM-DD`, filtrables par staff, team, function) |
| POST | `/week/:week/function/:slug` | Admin | Créer/mettre à jour un planning semaine pour une fonction |

### Types de tâches (`/api/task-types`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Liste des types de tâches |
| POST | `/` | Admin | Créer un type de tâche |
| PUT | `/:id` | Admin | Modifier un type de tâche |
| DELETE | `/:id` | Admin | Supprimer un type de tâche |

### Créneaux de cours (`/api/course-slots`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Liste des créneaux de cours actifs |
| POST | `/` | Admin | Créer un créneau de cours |
| PUT | `/:id` | Admin | Modifier un créneau de cours |
| DELETE | `/:id` | Admin | Supprimer un créneau de cours |
| GET | `/assignments` | Auth | Affectations seminaire (`?week=YYYY-MM-DD`) |
| POST | `/:id/assign` | Admin | Affecter un moniteur à un créneau pour une semaine |
| DELETE | `/:id/assign` | Admin | Retirer l'affectation d'un moniteur |

### Indisponibilités (`/api/unavailabilities`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Ses indisponibilités (staff) ou toutes (manager+) |
| POST | `/` | Auth | Déclarer une indisponibilité |
| PUT | `/:id/review` | Admin | Approuver / refuser une indisponibilité |
| DELETE | `/:id` | Auth | Supprimer une indisponibilité |

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

### Notifications (`/api/notifications`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/` | Auth | Liste des notifications non lues de l'utilisateur |
| DELETE | `/:id` | Auth | Marquer une notification comme lue / supprimer |

### Push Web (`/api/push`)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/vapid-public-key` | Auth | Récupérer la clé publique VAPID |
| POST | `/subscribe` | Auth | Enregistrer un abonnement push |
| POST | `/unsubscribe` | Auth | Se désabonner du push |
| DELETE | `/all` | Auth | Supprimer tous les abonnements push de l'utilisateur |
| GET | `/status` | Auth | Vérifier si l'utilisateur est abonné |

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
| `initial_schema` | Création de toutes les tables de base via `schema.sql` |
| `staff_charge_rate` | Ajout colonne `charge_rate` sur `staff` |
| `users_must_change_password` | Ajout flag `must_change_password` sur `users` |
| `staff_teams_seed` | Migration `staff.team_id` vers la table N:N `staff_teams` |
| `schedule_slots_real_spans` | Conversion `hour_start/end` INTEGER → REAL (quarts d'heure) |
| `course_slots_table` | Création de la table `course_slots` |
| `course_slot_assignments_table` | Création de la table `course_slot_assignments` |
| `template_slots_table` | Création de la table `template_slots` |
| `schedule_slots_task_type` | Ajout colonnes `task_type` et `course_slot_id` sur `schedule_slots` |
| `push_subscriptions_table` | Création de `push_subscriptions` + seed paramètre push |
| `task_types_table` | Création de `task_types` + seed des 4 types par défaut |
| `task_types_function_id` | Ajout colonne `function_id` sur `task_types` |
| `teams_show_course_slots` | Ajout colonne `show_course_slots` sur `teams` |
| `config_settings_seeds` | Seeds : `leave_*`, `planning_day_start/end`, `rh_*`, `ui_theme` |
| `notifications_meta_col` | Ajout colonne `meta` sur `notifications` |
| `notifications_type_extended` | Ajout du type `leave_planning` dans la contrainte CHECK |
| `staff_contract_base` | Ajout colonne `contract_base` sur `staff` + seeds `contract_base_*` |
| `fiscal_year_seeds` | Seeds : `fiscal_year_type`, `fiscal_year_start_month/day` |
| `planning_constraints` | Seeds : amplitude journalière, repos minimum |
| `planning_display_settings` | Seeds : `planning_course_slots_fns`, `planning_group_by` |
| `swap_approval_level_seed` | Seed paramètre `swap_approval_level` dans settings |
| `swaps_range_columns` | Ajout colonnes `hour_start/end`, `refused_by`, `urgent_alert_sent` sur `shift_swaps` |
| `swap_urgent_alert_seed` | Seed paramètre `swap_urgent_alert_hours` |
| `unavailabilities_table` | Création de la table `unavailabilities` |
| `unavailability_settings_seed` | Seeds : `unavailability_min_notice_days`, `unavailability_approval_required` |
| `first_install_accounts` | Création automatique superadmin + admin depuis `.env` |
| `admin_staff_link` | Liaison compte admin → fiche salarié (installations existantes) |
| `fix_legacy_superadmin` | Reclassification des anciens comptes superadmin en admin |
| `fn_service_civique` | Insertion de la fonction « Service Civique » |

---

## 10. Configuration — paramètres applicatifs

Les paramètres sont stockés dans la table `settings` (clé/valeur typée). Ils sont modifiables depuis l'onglet **Configuration** de l'interface.

| Groupe | Clé | Type | Description |
|---|---|---|---|
| `system` | `ui_theme` | string | Thème visuel : `light` / `dark` |
| `system` | `push_notifications_enabled` | boolean | Activer les notifications Push Web |
| `planning` | `planning_day_start` | number | Heure de début d'affichage de la grille (0-23) |
| `planning` | `planning_day_end` | number | Heure de fin d'affichage de la grille (0-23) |
| `planning` | `planning_group_by` | string | Tri de la vue planning : `function` / `team` / `both` |
| `planning` | `planning_course_slots_fns` | json | Slugs de fonctions pour lesquels afficher les créneaux de cours |
| `planning` | `planning_max_amplitude_enabled` | boolean | Activer la limite d'amplitude journalière |
| `planning` | `planning_max_amplitude_hours` | number | Amplitude max autorisée en heures (défaut : 12) |
| `planning` | `planning_min_rest_enabled` | boolean | Activer le contrôle du repos minimum |
| `planning` | `planning_min_rest_hours` | number | Repos min entre deux prises de poste (défaut : 11h) |
| `planning` | `unavailability_min_notice_days` | number | Délai min (jours) pour déclarer une indisponibilité sans validation |
| `planning` | `unavailability_approval_required` | boolean | Validation manager requise pour indisponibilités hors délai |
| `planning` | `swap_urgent_alert_hours` | number | Heures avant prise de poste pour déclencher alerte urgente échange |
| `conges` | `leave_count_method` | string | Méthode décompte : `working_days` / `calendar_days` |
| `conges` | `leave_min_notice_enabled` | boolean | Activer le délai minimum de préavis |
| `conges` | `leave_min_notice_days` | number | Nombre de jours de préavis requis |
| `conges` | `leave_default_cp_balance` | number | Solde CP initial lors de création d'un salarié (jours) |
| `conges` | `leave_default_rtt_balance` | number | Solde RTT initial lors de création d'un salarié (jours) |
| `conges` | `fiscal_year_type` | string | Type d'exercice : `calendar` / `custom` |
| `conges` | `fiscal_year_start_month` | number | Mois de début (1=jan, 9=sep) si exercice custom |
| `conges` | `fiscal_year_start_day` | number | Jour de début de l'exercice custom |
| `rh` | `rh_default_charge_rate` | number | Taux charges patronales par défaut (%) |
| `rh` | `rh_default_contract_h` | number | Heures hebdo par défaut pour les nouveaux contrats |
| `rh` | `contract_base_hebdo_enabled` | boolean | Activer la base « Horaire hebdomadaire » |
| `rh` | `contract_base_annuel_enabled` | boolean | Activer la base « Annualisé » |
| `rh` | `contract_base_aucune_enabled` | boolean | Activer la base « Sans base horaire » |
| `organigramme` | `swap_approval_level` | string | Niveau requis pour approuver un échange : `manager` / `rh` / `direction` |

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

---

## 16. Créneaux de cours

### Concept

Les créneaux de cours (`course_slots`) représentent les **séances encadrées récurrentes** du club (cours d'escalade, groupes niveau, etc.). Ils sont permanents et indépendants du planning semaine.

### Tables concernées

| Table | Rôle |
|---|---|
| `course_slots` | Définition d'un cours : jour, heure, groupe, niveau, capacité, couleur, saison |
| `course_slot_assignments` | Affectation d'un moniteur à un cours **pour une semaine précise** |

### Workflow

1. L'admin crée les cours depuis **Configuration → Créneaux de cours** (route `POST /api/course-slots`)
2. Dans la vue **Planning Équipe** (moniteurs/encadrants), les cours sont affichés en superposition si la fonction est dans `planning_course_slots_fns`
3. Pour chaque semaine, un admin peut affecter un moniteur à un cours via le bouton d'assignation (route `POST /api/course-slots/:id/assign`)
4. L'affectation est stockée avec `(course_slot_id, staff_id, week_start)` — unique par combinaison

### Paramètre clé

| Clé | Valeur par défaut | Description |
|---|---|---|
| `planning_course_slots_fns` | `[]` | JSON array de slugs de fonctions pour lesquelles les cours sont visibles dans la grille planning |

Exemple : `["moniteur","encadrant"]` affiche les cours dans les colonnes moniteur et encadrant.

### Saison et validité

Un créneau peut avoir :
- `season = "always"` : actif toute l'année
- `season = "hiver"` / `"ete"` : actif selon saison
- `valid_from` / `valid_until` : dates de début/fin de validité (NULL = illimité)

---

## 17. Indisponibilités

### Concept

Les **indisponibilités** (`unavailabilities`) permettent aux salariés de déclarer leurs périodes où ils ne peuvent pas travailler. Distinctes des congés (non déduites du solde, non rémunérées).

### Structure

```
unavailabilities (
  staff_id, date_start, date_end,
  all_day, hour_start, hour_end,     -- horaires si partiel
  recurrence,                        -- 'none' | 'weekly' | 'biweekly'
  recurrence_end,
  status,                            -- 'approved' | 'pending' | 'refused'
  reviewed_by, reviewed_at, review_note
)
```

### Workflow

1. Le salarié déclare via `POST /api/unavailabilities` (accès : Auth)
2. Si la déclaration est **hors délai** (`unavailability_min_notice_days`) et que `unavailability_approval_required=true`, le statut est `pending` — le manager doit valider
3. Si dans les délais, statut `approved` automatiquement
4. Le manager approuve/refuse via `PUT /api/unavailabilities/:id/review`

### Paramètres de configuration

| Clé | Défaut | Description |
|---|---|---|
| `unavailability_min_notice_days` | `3` | Délai minimum sans approbation |
| `unavailability_approval_required` | `true` | Activer la validation manager |

---

## 18. Membres multi-équipes

### Concept

Un salarié peut appartenir à **plusieurs équipes** simultanément. La table `staff_teams` (relation N:N) remplace l'ancienne colonne `staff.team_id` (relation 1:N).

### Structure

```
staff_teams (
  staff_id  → staff.id,
  team_id   → teams.id,
  is_primary  -- 1 = équipe principale, 0 = secondaire
  PRIMARY KEY (staff_id, team_id)
)
```

### Filtrage dans TeamPlanningView

La vue **Planning Équipe** charge les salariés d'une équipe via `staff_teams`. Pour les salariés multi-équipes, l'affichage est filtré par la colonne `teams.fn_slugs` :

- `fn_slugs = NULL` : toutes les fonctions sont affichées
- `fn_slugs = ["moniteur","encadrant"]` : seules ces fonctions apparaissent dans cette équipe

Ce mécanisme évite les doublons visuels pour les salariés partagés entre équipes (ex : un moniteur présent dans "Enseignement" et "Renforts").

### Gestion dans EquipeView

- L'onglet **Équipes** de la configuration permet d'assigner plusieurs équipes à un salarié
- L'équipe principale (`is_primary=1`) détermine l'équipe affichée dans les listes et profils

### Migration automatique

Au démarrage du serveur, la migration `staff_teams_seed` copie automatiquement les `staff.team_id` existants dans `staff_teams` (équipe principale). Les installations existantes sont migrées sans perte de données.
