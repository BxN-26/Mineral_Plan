# Mineral Plan. — Planning et gestion d'équipes

Application de plannings transversaux, orientée gestion de salle d'escalade.

**Stack** : Express 4 · better-sqlite3 · JWT (httpOnly cookies) · React 18 · Vite 5 · Caddy

---

## Installation

### 1. Backend

```bash
cd spirit-v2
cp .env.example .env          # éditer selon votre environnement
npm install
npm run dev                   # démarrage en mode développement (port 3000)
```

### 2. Frontend (développement)

```bash
cd frontend
npm install
npm run dev                   # Vite sur http://localhost:5173 (proxy → :3000)
```

### 3. Build de production

```bash
cd frontend
npm run build                 # génère frontend/dist/
# Puis démarrer uniquement le backend :
cd ../spirit-v2
npm start                     # Express sert dist/ + /api
```

La base de données est créée et toutes les migrations sont appliquées automatiquement au premier démarrage.

---

## Déploiement Caddy (HTTPS)

```bash
cp Caddyfile.example Caddyfile
# Adapter le domaine et le chemin dans Caddyfile
sudo caddy start
```

---

## Structure du projet

```
spirit-v2/          ← Backend Express + SQLite
  app.js            ← Point d'entrée Express
  db/
    schema.sql      ← Schéma de référence
    database.js     ← Singleton SQLite + toutes les migrations (auto au démarrage)
    seed.js         ← Données de démonstration (idempotent)
  middleware/
    auth.js         ← JWT httpOnly cookies, requireAuth, requireRole
  routes/
    auth.js              ← login / logout / me / refresh / password
    staff.js             ← CRUD salariés + upload avatar
    teams.js             ← CRUD équipes + membres (multi-équipes via staff_teams)
    functions.js         ← CRUD fonctions + vue par salarié
    leaves.js            ← Workflow congés N1/N2/N3
    leave-types.js       ← Types de congés + chaîne d'approbation
    schedules.js         ← Planning hebdomadaire
    templates.js         ← Modèles de planning
    swaps.js             ← Échanges de créneaux
    course-slots.js      ← Créneaux de cours permanents + affectations semaine
    task-types.js        ← Types de tâches (permanence, ouverture blocs…)
    unavailabilities.js  ← Indisponibilités salariés
    stats.js             ← Statistiques et KPIs
    costs.js             ← Calcul masse salariale
    notifications.js     ← Notifications in-app
    push.js              ← Abonnements Push Web (VAPID)
    settings.js          ← Paramètres applicatifs

frontend/           ← React 18 + Vite 5
  src/
    App.jsx         ← Contexte global, routing par view-id (sans react-router)
    api/client.js   ← Axios + intercepteur refresh token silencieux
    context/        ← AuthContext, ThemeContext
    components/     ← common, Sidebar, StaffForm, NotifBell, AvatarImg
    hooks/          ← usePushNotifications
    utils/          ← fiscal.js (calcul exercice comptable)
    views/          ← Login, MonPlanning, PlanningView, TeamPlanning,
                       GeneralPlanning, Equipe, Conges, Releves,
                       Stats, Costs, Swap, MonProfil, Config

Doc_techniques/     ← Documentation
  description_technique.md   ← Architecture complète + référence API
  manuel_utilisateur.md      ← Guide utilisateur (toutes les vues)
  contexte_reprise.md        ← Reprise du développement (décisions, conventions)
  generer_pdf.sh             ← Génère les PDFs (pandoc + xelatex)
  pdf/                       ← PDFs générés, accessibles sur /docs/
```

---

## Variables d'environnement (`spirit-v2/.env`)

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port HTTP du serveur Express |
| `DB_PATH` | `./db/spirit.db` | Chemin vers la base SQLite |
| `JWT_SECRET` | *(obligatoire)* | Secret de signature des JWT (min. 32 cars.) |
| `JWT_EXPIRES` | `15m` | Durée de vie du token d'accès |
| `CLIENT_URL` | `http://localhost:5173` | URL du frontend (CORS) |
| `NODE_ENV` | `development` | `production` active les cookies Secure |
| `SUPERADMIN_EMAIL` | `dev@spirit-app.internal` | Email compte développeur |
| `SUPERADMIN_PASSWORD` | — | Mot de passe superadmin |
| `ADMIN_EMAIL` | `admin@mineral-spirit.fr` | Email premier admin club |
| `ADMIN_FIRSTNAME` | — | Prénom de l'admin (pour créer la fiche salarié) |
| `ADMIN_LASTNAME` | — | Nom de l'admin |
| `ADMIN_INITIAL_PASSWORD` | `Admin2025!` | Mot de passe initial admin (à changer) |
| `VAPID_PUBLIC_KEY` | — | Clé push web publique (si notifications activées) |
| `VAPID_PRIVATE_KEY` | — | Clé push web privée |
| `VAPID_SUBJECT` | — | Contact VAPID (ex : `mailto:admin@...`) |

---

## Documentation

Les guides complets sont accessibles depuis l'interface admin (**Configuration → Système → Documentation**) ou directement :

- `/docs/manuel_utilisateur.pdf` — Guide utilisateur
- `/docs/description_technique.pdf` — Architecture technique

Pour regénérer les PDFs :
```bash
cd Doc_techniques && bash generer_pdf.sh
```

