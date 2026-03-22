# Mineral Plan. — Planning e gestion d'équipes

Application de plannings transversaux, orientée gestion de salle d'escalade.

**Stack** : Express 4 · better-sqlite3 · JWT (httpOnly cookies) · React 18 · Vite 5 · Caddy

---

## Installation

### 1. Backend

```bash
cd spirit-v2
cp .env.example .env          # éditer selon votre environnement
npm install
node db/seed.js               # données initiales + comptes démo
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

---

## Déploiement Caddy (HTTPS)

```bash
cp Caddyfile.example Caddyfile
# Adapter le domaine et le chemin dans Caddyfile
sudo caddy start
```

---

## Comptes de démonstration

| Email                         | Mot de passe  | Rôle          |
|-------------------------------|---------------|---------------|
| admin@mineral-spirit.fr       | Spirit2025!   | superadmin    |
| marion@mineral-spirit.fr      | Marion2025    | manager       |
| josephine@mineral-spirit.fr   | Jose2025      | employee      |
| eva@mineral-spirit.fr         | Eva2025       | employee      |
| brigitte@mineral-spirit.fr    | Brig2025      | employee      |
| marine@mineral-spirit.fr      | Marine2025    | employee      |
| mateo@email.fr                | Mateo2025     | employee      |

---

## Structure du projet

```
spirit-v2/          ← Backend Express + SQLite
  app.js            ← Assembly Express
  db/
    schema.sql      ← Schéma de la base
    database.js     ← Singleton better-sqlite3
    seed.js         ← Données initiales (idempotent)
  middleware/
    auth.js         ← JWT httpOnly cookies, requireAuth, requireRole
  routes/
    auth.js         ← login / logout / me / refresh
    staff.js        ← CRUD salariés
    teams.js        ← CRUD équipes
    functions.js    ← CRUD fonctions + staff-view
    leaves.js       ← Workflow congés N1/N2/N3
    schedules.js    ← Planning hebdomadaire
    settings.js     ← Paramètres + types de congés

frontend/           ← React 18 + Vite 5
  src/
    App.jsx         ← Racine, contexte global, routing
    api/client.js   ← Axios + intercepteur refresh token
    context/        ← AuthContext
    components/     ← common, Sidebar, StaffForm
    views/          ← Login, Planning, MonPlanning, Equipe,
                       Conges, Releves, Config
```

---

## Variables d'environnement (`spirit-v2/.env`)

| Variable       | Défaut                  | Description                        |
|----------------|-------------------------|------------------------------------|
| `PORT`         | `3000`                  | Port HTTP du serveur Express       |
| `DB_PATH`      | `./db/spirit.db`        | Chemin vers la base SQLite         |
| `JWT_SECRET`   | *(obligatoire)*         | Secret de signature des JWT        |
| `JWT_EXPIRES`  | `15m`                   | Durée de vie du token d'accès      |
| `CLIENT_URL`   | `http://localhost:5173` | URL du frontend (CORS)             |
| `NODE_ENV`     | `development`           | `production` active les cookies secure |
