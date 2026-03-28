# minéral Spirit v2 — Contexte de reprise du développement

> Fichier créé le 28 mars 2026  
> À lire en priorité avant de reprendre le développement sur un nouvel ordinateur.

---

## 1. Qu'est-ce que ce projet ?

Application web de gestion de planning et des ressources humaines pour le club d'escalade **Minéral Spirit** (Aubenas, Ardèche). En production sur `planning.mineral-spirit.fr`.

- **Backend** : Node.js 22 + Express 4 + SQLite (better-sqlite3, mode WAL)
- **Frontend** : React 18 + Vite 5 (SPA, servie statiquement par Express en production)
- **Reverse proxy** : Caddy 2 (HTTPS automatique Let's Encrypt)
- **Serveur** : VPS Debian, `/home/serveur/Mineral_Plan/`

---

## 2. Structure du projet

```
/home/serveur/Mineral_Plan/
├── README.md
├── Caddyfile                    # Config reverse proxy
├── install.sh
├── Doc_techniques/
│   ├── description_technique.md  # Architecture + API (ce qu'il faut lire en 2e)
│   ├── manuel_utilisateur.md    # Manuel destiné aux utilisateurs
│   ├── contexte_reprise.md      # Ce fichier
│   ├── generer_pdf.sh           # Génère les PDFs (pandoc + xelatex)
│   └── pdf/                     # PDFs générés, servis sur /docs/
│       ├── manuel_utilisateur.pdf
│       └── description_technique.pdf
├── spirit-v2/                   # Backend Node.js
│   ├── app.js                   # Point d'entrée Express, montage des routes
│   ├── .env                     # Secrets (NE PAS VERSIONNER)
│   ├── .env.example             # Modèle .env documenté
│   ├── db/
│   │   ├── database.js          # Singleton SQLite + TOUTES les migrations auto
│   │   ├── schema.sql           # Schéma de référence (documentation)
│   │   └── seed.js              # Données de démonstration (idempotent)
│   ├── middleware/
│   │   └── auth.js              # JWT cookies, requireAuth, requireRole
│   └── routes/
│       ├── auth.js
│       ├── staff.js, teams.js, functions.js
│       ├── leaves.js, leave-types.js
│       ├── schedules.js, templates.js
│       ├── swaps.js
│       ├── course-slots.js      # Créneaux de cours + affectations
│       ├── task-types.js        # Types de tâches (permanence, ouverture…)
│       ├── unavailabilities.js  # Indisponibilités salariés
│       ├── stats.js, costs.js
│       ├── notifications.js, push.js
│       └── settings.js
└── frontend/
    ├── src/
    │   ├── App.jsx              # Routing par view-id (pas de react-router)
    │   ├── api/client.js        # Axios + intercepteur refresh token
    │   ├── context/AuthContext.jsx
    │   ├── context/ThemeContext.jsx
    │   ├── components/
    │   │   ├── Sidebar.jsx, common.jsx, StaffForm.jsx
    │   │   ├── NotifBell.jsx, AvatarImg.jsx
    │   │   └── ForceChangePassword.jsx
    │   ├── hooks/usePushNotifications.js
    │   ├── utils/fiscal.js      # Calcul exercice comptable
    │   └── views/
    │       ├── LoginView.jsx
    │       ├── MonPlanningView.jsx      # Vue perso du salarié
    │       ├── TeamPlanningView.jsx     # Planning équipe (avec cours)
    │       ├── GeneralPlanningView.jsx  # Vue globale toutes équipes
    │       ├── PlanningView.jsx         # Edition planning (admin/manager)
    │       ├── EquipeView.jsx
    │       ├── CongesView.jsx
    │       ├── RelevesView.jsx
    │       ├── StatsView.jsx
    │       ├── CostsView.jsx
    │       ├── SwapView.jsx
    │       ├── MonProfilView.jsx
    │       └── ConfigView.jsx   # Configuration globale (admin)
    └── dist/                    # Build production (servi par Express statique)
```

---

## 3. Décisions techniques importantes

### Authentification
- Double token JWT : `spirit_access` (15 min) + `spirit_refresh` (7 jours)
- Cookies `httpOnly`, `SameSite=Lax`, `Secure` en production
- Refresh token hashé en SHA-256 en base (sécurité si fuite DB)
- Intercepteur Axios dans `client.js` : en cas de 401, tente un refresh silencieux, puis relance la requête originale
- `must_change_password` : force le changement au premier login

### Routing frontend
- **Pas de react-router**. La navigation utilise un état `view` dans `App.jsx`
- Transitions : `setView('nom-vue')`
- Les vues reçoivent leurs props via `App.jsx`

### Base de données
- Migrations **idempotentes** via `_migrations` (table de verrous)
- Bootstrap : si table `users` absente → `schema.sql` exécuté complet, puis migrations ALTER TABLE
- Toutes les migrations sont dans `database.js::getDb()`, exécutées au démarrage
- **Ne jamais modifier une migration existante** — créer une nouvelle migration

### Multi-équipes (`staff_teams`)
- Table N:N remplaçant `staff.team_id`
- `is_primary=1` = équipe principale (affichée dans les listes)
- `teams.fn_slugs` (JSON array) = liste des slugs de fonctions visibles dans cette équipe depuis TeamPlanningView — évite les doublons pour les salariés partagés

### Créneaux de cours (`course_slots`)
- Cours permanents (pas liés à une semaine)
- Affectations par semaine dans `course_slot_assignments (course_slot_id, staff_id, week_start)`
- Affichés dans TeamPlanningView si la fonction du salarié est dans `planning_course_slots_fns` (setting JSON)

### PDFs documentation
- Générés avec `pandoc` + `xelatex` (script `Doc_techniques/generer_pdf.sh`)
- Stockés dans `Doc_techniques/pdf/`
- Servis par Express sur `/docs/` (ligne dans `app.js` : `app.use('/docs', express.static(docsPath))`)
- Accessibles depuis l'interface admin : **Configuration → Système → Documentation**

---

## 4. Conventions de code

### Backend
- `'use strict'` en tête de chaque fichier
- Middleware auth : `const { requireAuth: AUTH, requireRole } = require('../middleware/auth')`  
  `const ADMIN = [AUTH, requireRole(['admin','superadmin'])]`
- Réponses JSON : `res.json({ data })` pour succès, `res.status(4xx).json({ error: '...' })` pour erreurs
- SQLite synchrone : pas de `async/await` dans les routes

### Frontend
- CSS **inline uniquement** (zéro bibliothèque UI)
- Composants partagés dans `components/common.jsx` : `Modal`, `Badge`, `SectionTitle`, `Row`, `FormGrid`, etc.
- Appels API via `client.js` (Axios instance avec baseURL `/api`)
- Gestion du thème via `ThemeContext.jsx` (light/dark)

### Thème
- Variables CSS dans `index.html` : `--bg`, `--surface`, `--text`, `--border`, `--accent`
- Le thème light/dark est stocké dans `settings.ui_theme` (BDD) + `localStorage`

---

## 5. Fonctionnalités implémentées (état au 28 mars 2026)

| Fonctionnalité | État | Notes |
|---|---|---|
| Authentification JWT double-token | ✅ Production | |
| Gestion salariés (CRUD + avatars) | ✅ Production | |
| Équipes multi-membres (staff_teams) | ✅ Production | Remplace team_id |
| Fonctions / postes | ✅ Production | |
| Planning hebdomadaire | ✅ Production | mode quart d'heure (REAL) |
| Modèles de planning | ✅ Production | |
| Congés (workflow N1/N2/N3) | ✅ Production | Libération auto créneaux |
| Types de congés configurables | ✅ Production | |
| Créneaux de cours + affectations | ✅ Production | |
| Types de tâches planning | ✅ Production | |
| Indisponibilités | ✅ Production | Avec approbation optionnelle |
| Échanges de créneaux | ✅ Production | Alerte urgente configurable |
| Relevés d'heures | ✅ Production | |
| Statistiques RH | ✅ Production | |
| Coûts / masse salariale | ✅ Production | |
| Notifications in-app | ✅ Production | |
| Push Web (PWA/VAPID) | ✅ Production | |
| Thème light/dark | ✅ Production | |
| PDF documentation accessibles | ✅ Production | Via /docs/ |
| Vue Planning Équipe (cours+filtres) | ✅ Production | fn_slugs par équipe |
| Vue Planning Général | ✅ Production | Mode jour/semaine |

---

## 6. Variables d'environnement requises (`spirit-v2/.env`)

```bash
# Obligatoire
JWT_SECRET=<chaîne aléatoire 64 caractères>

# Comptes système (créés automatiquement au 1er démarrage)
SUPERADMIN_EMAIL=dev@spirit-app.internal
SUPERADMIN_PASSWORD=<mot de passe dev>
ADMIN_EMAIL=admin@mineral-spirit.fr
ADMIN_FIRSTNAME=Prénom
ADMIN_LASTNAME=Nom
ADMIN_INITIAL_PASSWORD=<temporaire>

# Push Web (optionnel, activer dans settings)
VAPID_PUBLIC_KEY=<généré via web-push>
VAPID_PRIVATE_KEY=<généré via web-push>
VAPID_SUBJECT=mailto:admin@mineral-spirit.fr

# Optionnel
PORT=3000
DB_PATH=./db/spirit.db
NODE_ENV=production
CLIENT_URL=https://planning.mineral-spirit.fr
```

---

## 7. Commandes courantes

### Démarrage développement
```bash
# Terminal 1 — Backend
cd /home/serveur/Mineral_Plan/spirit-v2
npm run dev   # nodemon, port 3000

# Terminal 2 — Frontend
cd /home/serveur/Mineral_Plan/frontend
npm run dev   # Vite, port 5173, proxy /api → :3000
```

### Build production
```bash
cd /home/serveur/Mineral_Plan/frontend
npm run build
# puis sudo systemctl restart mineral-spirit
```

### Regénérer les PDFs
```bash
cd /home/serveur/Mineral_Plan/Doc_techniques
bash generer_pdf.sh
```

### Inspecter la base
```bash
sqlite3 /home/serveur/Mineral_Plan/spirit-v2/db/spirit.db
.tables
SELECT name FROM _migrations ORDER BY rowid;
```

### Générer des clés VAPID
```bash
cd spirit-v2
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k);"
```

### Réinitialiser un mot de passe
```bash
sqlite3 /home/serveur/Mineral_Plan/spirit-v2/db/spirit.db \
  "DELETE FROM _migrations WHERE name='first_install_accounts';"
# Puis modifier ADMIN_INITIAL_PASSWORD dans .env et redémarrer
```

---

## 8. Points d'attention connus

1. **Pas d'ORM** : toutes les requêtes SQLite sont écrites à la main, synchrones. Attention aux injections SQL : utiliser des prepared statements (`db.prepare('...').run(param)`).

2. **Migration idempotente** : si une migration plante à mi-chemin, la ligne n'est pas insérée dans `_migrations` → elle sera ré-exécutée au redémarrage. Utiliser des `CREATE TABLE IF NOT EXISTS` et `try/catch` pour les ALTER TABLE.

3. **SPA fallback** : `app.get('*', ...)` renvoie `index.html`. Les routes API doivent toujours commencer par `/api/` pour ne pas être absorbées.

4. **Build requis** : en production, il faut rebuilder le frontend après chaque modif React (`npm run build`). Le backend sert `dist/` statique.

5. **Thème CSS** : les variables CSS sont injectées dans `<head>` par `ThemeContext`. Ne pas hardcoder de couleurs dans les composants — utiliser `var(--bg)`, `var(--text)`, etc.

6. **`fn_slugs` sur teams** : champ JSON nullable. Si NULL, toutes les fonctions sont affichées. Si tableau vide `[]`, aucune fonction n'est filtrée (comportement identique à NULL). Seule une valeur comme `["moniteur"]` active le filtre.

7. **`course_slot_assignments`** : la contrainte `UNIQUE(course_slot_id, staff_id, week_start)` signifie qu'un même moniteur ne peut être affecté qu'une fois par créneau par semaine. Pour changer le moniteur : supprimer l'affectation existante puis en créer une nouvelle.

8. **Relances Axios 401** : l'intercepteur dans `client.js` ne tente qu'un seul refresh. Si le refresh échoue aussi (token expiré/révoqué), l'utilisateur est redirigé vers le login.

---

## 9. Prochaines évolutions possibles

> Non engagées, mais discutées informellement :

- Export planning PDF / impression hebdomadaire
- Pointeuse (intégration timesheets avec QR code ou NFC)
- Module de planning saisonnier (périodes vacances vs hors-vacances)
- Gestion des certifications salariés (BE, BPJEPS…) avec dates d'expiration
- API publique lecture seule pour afficher le planning sur le site vitrine
