# Minéral Spirit — Gestion du personnel v2

Application web de gestion du personnel pour salle d'escalade : plannings, congés, équipes, fonctions, relevés d'heures, notifications, coûts RH.

**Stack** : Node.js 22 · Express 4 · SQLite (better-sqlite3) · JWT httpOnly cookies · React 18 · Vite 5 · Caddy

> **Branche** : `release/v1.0-beta` — version production (base vierge, pas de données de démonstration)  
> Pour le développement avec données de démo, utilisez la branche `main`.

---

## Installation rapide (un seul script)

```bash
git clone https://github.com/BxN-26/Mineral_Plan.git
cd Mineral_Plan
git checkout release/v1.0-beta
bash install.sh
```

Le script `install.sh` :
- Vérifie / installe Node.js 22
- Génère interactivement le fichier `.env` (secrets JWT, comptes, domaine)
- Installe les dépendances et compile le frontend
- Crée et active un service systemd
- Installe et configure Caddy (HTTPS automatique, optionnel)

Au **premier démarrage**, les migrations créent automatiquement :
- Toutes les tables de la base de données
- Les équipes, fonctions et types de congés par défaut
- Les comptes **superadmin** et **admin** depuis vos variables `.env`

---

## Installation manuelle

### Prérequis

- Node.js 22+
- npm 10+
- (optionnel) Caddy pour le HTTPS

### 1. Configuration

```bash
cd spirit-v2
cp .env.example .env
# Éditer .env — notamment JWT_SECRET, CLIENT_URL, SUPERADMIN_* et ADMIN_*
```

### 2. Backend

```bash
cd spirit-v2
npm install --omit=dev
npm start          # démarre sur le port défini dans .env (défaut : 3000)
```

### 3. Frontend

```bash
cd frontend
npm install
npm run build      # génère frontend/dist/
```

Le backend sert automatiquement `frontend/dist/` en production.

### 4. Déploiement Caddy (HTTPS)

```bash
cp Caddyfile.example Caddyfile
# Adapter le domaine dans Caddyfile
sudo caddy start
```

---

## Variables d'environnement (`spirit-v2/.env`)

| Variable                 | Défaut                   | Description                                          |
|--------------------------|--------------------------|------------------------------------------------------|
| `PORT`                   | `3000`                   | Port HTTP Express                                    |
| `NODE_ENV`               | `production`             | Active les cookies `Secure` en production            |
| `CLIENT_URL`             | *(obligatoire)*          | URL publique de l'app (CORS + headers)               |
| `DB_PATH`                | `./db/spirit.db`         | Chemin vers la base SQLite                           |
| `JWT_SECRET`             | *(obligatoire)*          | Secret de signature des tokens d'accès               |
| `JWT_REFRESH_SECRET`     | *(obligatoire)*          | Secret distinct pour les tokens de rafraîchissement  |
| `SUPERADMIN_EMAIL`       | `dev@spirit-app.internal`| Email du compte développeur (invisible pour l'admin) |
| `SUPERADMIN_PASSWORD`    | *(obligatoire)*          | Mot de passe du superadmin                           |
| `ADMIN_EMAIL`            | *(obligatoire)*          | Email du compte opérateur du club                    |
| `ADMIN_INITIAL_PASSWORD` | *(obligatoire)*          | Mot de passe initial admin (changement forcé à la 1re connexion) |
| `VAPID_PUBLIC_KEY`       | —                        | Clé VAPID publique pour les notifications push       |
| `VAPID_PRIVATE_KEY`      | —                        | Clé VAPID privée                                     |
| `VAPID_EMAIL`            | —                        | Email VAPID contact                                  |

---

## Structure du projet

```
spirit-v2/                  ← Backend Express + SQLite
  app.js                    ← Point d'entrée Express
  db/
    schema.sql              ← Schéma complet (tables + données par défaut)
    database.js             ← Singleton better-sqlite3 + système de migrations
    seed.js                 ← Désactivé en prod (réservé au dev sur branche main)
  middleware/
    auth.js                 ← JWT httpOnly cookies, requireAuth, requireRole
  routes/
    auth.js                 ← Login / logout / refresh / profil
    staff.js                ← CRUD salariés
    teams.js                ← CRUD équipes
    functions.js            ← CRUD fonctions
    leaves.js               ← Workflow congés N1/N2/N3
    schedules.js            ← Planning hebdomadaire
    settings.js             ← Paramètres application
    leave-types.js          ← Types de congés / absences
    notifications.js        ← Notifications et Web Push
    stats.js                ← Statistiques RH
    costs.js                ← Analyse des coûts salariaux
    swaps.js                ← Échanges de créneaux
    templates.js            ← Modèles de planning

frontend/                   ← React 18 + Vite 5
  src/
    App.jsx                 ← Racine, contexte global, routing
    api/client.js           ← Axios + intercepteur refresh token
    context/AuthContext.jsx ← Contexte authentification
    components/             ← Sidebar, common, StaffForm, etc.
    views/                  ← Login, Planning, Congés, Équipe, Config…

Doc_techniques/             ← Documentation technique et utilisateur
  description_technique.md
  manuel_utilisateur.md
  pdf/

install.sh                  ← Installateur une commande
Caddyfile.example           ← Exemple configuration Caddy (HTTPS)
```

---

## Rôles utilisateurs

| Rôle         | Accès                                                         |
|--------------|---------------------------------------------------------------|
| `superadmin` | Compte développeur — accès total, invisible pour les admins   |
| `admin`      | Opérateur du club — gestion complète (staff, config, RH)      |
| `rh`         | Gestion des congés et relevés d'heures                        |
| `manager`    | Validation congés pour ses équipes, consultation plannings    |
| `staff`      | Consultation planning personnel, demande de congés            |
| `viewer`     | Lecture seule                                                 |

---

## Licence

Voir [LICENSE](LICENSE).
