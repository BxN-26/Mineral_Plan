# Minéral Spirit v2 — Audit pré-saison estivale 2026

> Créé le 5 juillet 2026, suite au bug de réinitialisation de mot de passe (colonne `updated_at` inexistante sur `users`, corrigé le 05/07/2026, commit `4a67bdb`).
> Objectif : identifier avant la phase de test estivale (usage réel intensif — moniteurs, cours d'été, congés, échanges de créneaux) tout ce qui pourrait casser le service ou corrompre des données, en priorité les bugs de la **même famille** que celui déjà rencontré.
> Méthode : 5 revues de code ciblées (sécurité/auth, intégrité données & migrations, logique métier planning/congés/échanges, frontend React, déploiement/ops), en lecture seule, avec élimination des faux positifs.
>
> **Mise à jour du 6 juillet 2026 — audit clos** : tous les points corrigeables en code ont été
> implémentés et testés en conditions réelles sur la branche `fix/audit-pre-ete-2026` (voir §7 pour
> le bilan final et la liste des quelques actions restant à faire côté serveur/infra, qui ne
> peuvent pas être faites depuis le code). Deux bugs critiques supplémentaires trouvés en cours de
> route, absents de l'audit initial : `POST /api/leaves` était complètement cassé (`db_.transaction`
> n'existe pas sur `db_`, seule `db_.tx` existe) et `routes/functions.js` avait le même défaut que le
> bug `updated_at` déjà corrigé (colonnes supprimées par migration mais toujours référencées).

---

## 0. À faire EN PREMIER (avant tout le reste)

Ces 3 points sont soit déjà exploitables/cassés, soit désamorcent silencieusement des protections existantes. À traiter avant toute autre chose, dans cet ordre :

1. **Vérifier la valeur de `NODE_ENV` dans le `.env` de prod** (§1.1) — si ce n'est pas `production`, plusieurs protections de sécurité sont actuellement désactivées sans que rien ne le signale. ✅ **Vérifié sur le serveur le 6 juillet 2026 : `NODE_ENV=production`, déjà correct**
2. **Ajouter `app.set('trust proxy', 1)` dans `app.js`** (§1.2) — sans ça, un seul moniteur qui se trompe de mot de passe peut bloquer la connexion de **toute l'équipe** pendant 15 minutes. ✅ **CORRIGÉ** (branche `fix/audit-pre-ete-2026`)
3. **Mettre en place un backup automatisé de `spirit.db`** (§5.1) — à ce jour, aucune sauvegarde n'existe nulle part. Une corruption ou une fausse manip pendant l'été = perte définitive. ✅ **Fait — script installé et cron configuré sur le serveur le 6 juillet 2026** (quotidien à 3h). ⏳ reste la synchronisation vers un stockage distant (voir §5.1 détaillé).

---

## 1. Sécurité & authentification

### 1.1 — CRITIQUE — `NODE_ENV` potentiellement pas à `production` sur le serveur réel — ✅ **Vérifié le 6 juillet 2026 : déjà correct (`NODE_ENV=production`)**
**Fichiers concernés :** `spirit-v2/.env` (valeur réelle constatée en prod), `spirit-v2/app.js:47-49,155-158`, `spirit-v2/middleware/auth.js:19`, `spirit-v2/db/database.js:504-508`

Si `NODE_ENV` n'est pas exactement `production` :
- Les cookies `spirit_access`/`spirit_refresh` ne sont plus envoyés avec le flag `Secure` (interceptables en clair si jamais une requête passe en HTTP).
- Le gestionnaire d'erreurs global renvoie `err.message` brut à **tous les clients** au lieu du message générique — fuite de requêtes SQL, chemins de fichiers, etc. à la moindre exception.
- Les gardes-fous qui forcent `SUPERADMIN_PASSWORD`/`ADMIN_INITIAL_PASSWORD` à être définis ne s'activent plus — risque latent si un jour la base est réinitialisée.

**À faire :** `ssh` sur le serveur (ou via le terminal déjà ouvert), `grep NODE_ENV /opt/mineral-plan/spirit-v2/.env`. Si absent ou différent de `production`, corriger puis `sudo systemctl restart mineral-spirit`.

### 1.2 — CRITIQUE — Pas de `trust proxy` derrière Caddy → rate limiting mutualisé pour tout le monde — ✅ **CORRIGÉ**
**Fichiers concernés :** `spirit-v2/app.js` (aucune config trust proxy), `spirit-v2/routes/auth.js:12-19` (loginLimiter), `:128-134` (resetLimiter), `Caddyfile.example:22-24`

Express voit l'IP de Caddy (localhost) pour toutes les requêtes tant que `trust proxy` n'est pas configuré. Le rate-limiter (10 tentatives/15min) regroupe alors **tous les utilisateurs derrière une seule clé**. Un moniteur qui se trompe 10 fois de mot de passe bloque la connexion de toute l'équipe. Effet de bord : `req.ip` dans `audit_log` sera identique pour tout le monde (traçabilité faussée).

**Correctif :** ajouter dans `app.js`, avant la définition des rate limiters :
```js
app.set('trust proxy', 1);
```
Vérifier ensuite que Caddy transmet bien `X-Forwarded-For` (comportement par défaut de `reverse_proxy`).

### 1.3 — CRITIQUE — Uploads sans `try/catch` → crash total du process Node — ✅ **CORRIGÉ** (+ filet `unhandledRejection` global, testé : crash reproduit avant, serveur survit après)
**Fichiers concernés :** `spirit-v2/routes/staff.js:366-409` (upload avatar, `sharp(...).toFile()`), `spirit-v2/routes/leaves.js:619-661` (upload justificatif, `fs.*Sync`)

Ces handlers sont `async` mais Express 4 ne rattrape pas les rejets de promesse non gérés. Sous Node 22, une exception non catchée dans un handler async (fichier corrompu que `sharp` refuse de décoder, disque plein) **termine tout le process** — coupe l'accès à l'application pour tout le monde, pas juste la requête fautive. Avec des uploads répétés de photos/justificatifs cet été, le risque n'est pas négligeable.

**Correctif :** entourer le corps de ces deux handlers d'un `try/catch` renvoyant une 400/500 propre. Envisager aussi un filet de sécurité global dans `app.js` :
```js
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
```

### 1.4 — MAJEUR — Rôle `viewer` : contournement systémique des restrictions "self-only" — ✅ **CORRIGÉ**
**Fichiers concernés :** `routes/leaves.js`, `routes/bootstrap.js`, `routes/staff.js`, `routes/functions.js`, `routes/unavailabilities.js`, `routes/stats.js`

Le code vérifiait systématiquement `role === 'staff'` pour restreindre l'accès aux données personnelles, mais **jamais `role === 'viewer'`**, alors que `PERM_TO_ROLE`/`stripSensitive` traitent bien `viewer` comme un rôle standard non privilégié. Un compte `viewer` pouvait donc voir les congés de tout le monde, les soldes de tout le monde, le planning complet d'un autre salarié, et même créer/annuler des congés ou indisponibilités au nom d'un autre `staff_id`.

**Confirmé par le porteur du projet** : le rôle `viewer` ne doit servir à rien de plus qu'un `staff` (accès à ses seules propres données) — l'accès large constaté était bien un bug, pas un comportement voulu.

**Correctif appliqué :** nouvelle fonction partagée `isSelfOnly(role)` dans `middleware/auth.js` (rôles `['staff','viewer']`), utilisée à la place de chaque test `role === 'staff'` dans les 6 fichiers listés ci-dessus.

Testé en conditions réelles (serveur de dev, compte `viewer` dédié) : liste des congés limitée à ses propres données (0 congé vu au lieu de voir ceux d'un collègue), fiche salarié d'autrui → 403 (sa propre fiche → 200), création de congé/indisponibilité au nom d'un autre salarié → 403, stats limitées à ses propres heures.

### 1.5 — MAJEUR — `PUT /api/swaps/:id/respond` : acceptation d'un échange ciblé sans vérifier le destinataire — ✅ **CORRIGÉ** (testé en conditions réelles : tiers → 403, cible → 200)
**Fichier :** `routes/swaps.js:218-350`

Le refus vérifie bien que le répondant est `swap.target_id` en mode `targeted` (ligne 244), mais **l'acceptation ne fait pas cette vérification**. N'importe quel salarié authentifié peut accepter un échange destiné à un collègue précis et s'approprier son créneau.

**Correctif :** avant d'accepter, vérifier `swap.mode === 'targeted' ? responderId === swap.target_id : getFunctionColleagues(...).includes(responderId)`.

### 1.6 — MAJEUR — Justificatifs de congés servis publiquement, sans authentification — ✅ **CORRIGÉ** (testé : ancienne URL → SPA fallback, nouvelle route → 401/403/200 selon les cas)
**Fichiers :** `app.js:113` (`express.static('/uploads')`), `routes/leaves.js:650-657`

Les certificats médicaux/justificatifs uploadés (`/uploads/documents/leave_{id}_{timestamp}.jpg|pdf`) sont accessibles à quiconque connaît ou devine l'URL, **sans aucune session**. Le nom de fichier est prévisible (id séquentiel + timestamp).

**Correctif :** sortir `/uploads/documents` (et par cohérence `/uploads/avatars`) de `express.static`, servir via une route authentifiée qui vérifie que l'appelant est le salarié concerné ou a un rôle privilégié.

### 1.7 — MAJEUR — CSP effectivement absente malgré le commentaire "géré par Caddy en prod" — ✅ **CORRIGÉ**
**Fichiers :** `app.js:47-49`, `Caddyfile.example:12-19`

CSP définie explicitement dans Helmet (`app.js`) plutôt que déléguée au Caddyfile réel de prod (qui peut diverger de l'exemple versionné). `script-src 'self'` strict, `style-src 'unsafe-inline'` nécessaire pour l'architecture CSS inline de l'app. Testée : headers corrects au démarrage, aucune erreur.

### 1.8 — Mineur — ✅ **TOUS CORRIGÉS**
- **Enumération par timing sur le login** (`auth.js`) — ✅ corrigé : comparaison bcrypt contre un hash factice même si l'email n'existe pas.
- **`JWT_REFRESH_SECRET`** — ✅ retiré de `.env.example`, de l'installeur Electron et de `install.sh` (jamais utilisé nulle part dans le code).
- **Pas d'alerte en cas de rejeu d'un refresh token révoqué** — ✅ corrigé : un rejeu détecté révoque désormais toutes les sessions du compte, testé en conditions réelles (cascade confirmée).
- **`trackActivity` (`app.js`)** — ✅ supprimé (code mort confirmé : `global._hubStats` n'avait aucun lecteur nulle part dans le code).

### Points vérifiés — pas de problème
Upload avatar (magic-bytes réels vérifiés, 8 Mo max, recompression sharp, pas de path traversal) · reset mot de passe par email (token 256 bits usage unique, expiration 30 min, révocation sessions) · CORS (origine unique, pas de wildcard) · scoping `user_id` correct sur notifications/push · verrous optimistes sur l'approbation congés/heures · RBAC correct sur toutes les routes de configuration (teams, functions, holidays, settings, etc.).

---

## 2. Intégrité des données & migrations

> Rappel du bug déjà corrigé : `routes/staff.js` référençait une colonne `updated_at` inexistante sur `users`. La revue ci-dessous cherchait spécifiquement d'autres occurrences du même problème (colonne référencée dans une requête mais absente du schéma réel).

### 2.1 — CRITIQUE — Même bug exact dans `routes/functions.js:216-218` — ✅ **CORRIGÉ** (testé : 200 au lieu de 500)
**Endpoint :** `POST /api/functions/schedule/:week/:functionId/slots/bulk`

```sql
INSERT OR IGNORE INTO schedule_slots
 (schedule_id,staff_id,day_of_week,hour_start,hour_end,sub_role,note) VALUES (?,?,?,?,?,?,?)
```
Les colonnes `sub_role` et `note` existaient dans `schema.sql` mais ont été supprimées par la migration `schedule_slots_real_spans` (`db/database.js:196-253`, qui recrée la table). Résultat : `SQLITE_ERROR` à chaque appel de cet endpoint.

**Bonne nouvelle :** aucun appel à `slots/bulk` n'existe dans le frontend actuel (vérifié) — l'endpoint utilisé réellement est `routes/schedules.js:88`, qui lui utilise les bonnes colonnes. Ce endpoint est donc probablement du code mort/legacy, mais reste un piège pour un futur client (script, appli mobile).

**Correctif :** soit mettre à jour la requête pour ne plus référencer `sub_role`/`note` (et ajouter `task_type`/`course_slot_id` si l'intention est de la garder à jour avec `schedules.js`), soit supprimer l'endpoint s'il est confirmé inutilisé.

### 2.2 — ÉLEVÉ — `swaps.js` approve/assign : mise à jour du planning non conditionnée à son propre succès — ✅ **CORRIGÉ**
**Fichier :** `routes/swaps.js:360-372` (approve), `:400-405` (assign)

`removeSlot()`/`addSlot()` sont dans un `try/catch` qui avale l'erreur silencieusement (`console.error` seul), puis le code exécute **quand même** `UPDATE shift_swaps SET status='approved'`. Scénario : `removeSlot` réussit mais `addSlot` échoue → le créneau disparaît du planning alors que les deux parties reçoivent une notification "✅ Échange approuvé". Aggravé par l'absence de contrainte empêchant deux demandes d'échange concurrentes sur le même créneau (voir §3.3).

**Correctif appliqué :** toute la séquence (retrait/ajout de créneaux + passage à `'approved'`) est désormais dans un `db_.tx()`, avec abandon propre (409) si `removeSlot` échoue. Un verrou anti-doublon a aussi été ajouté à la création (§3.3). Testé en conditions réelles (approve sans slot → 409, avec slot → succès et transfert correct).

### 2.3 — MOYEN — `leaves.js` approve (workflow N1/N2/N3) non transactionnel — ✅ **CORRIGÉ**
**Fichier :** `routes/leaves.js:390-506`

Chaque branche exécute 2 à 4 `UPDATE` séparés, non wrappés dans `db_.tx()` (contrairement au `POST /` initial, ligne 330, qui lui utilise correctement une transaction). Un crash process entre deux `UPDATE` laisserait un congé dans un état incohérent (`n1_status='approved'` mais `status` encore `'pending'`), sans chemin de code pour le réparer.

**Correctif :** wrapper toute la fonction d'approbation dans `db_.tx()`.

### 2.4 — MOYEN — `releaseStaffSlots()` appelé après le commit, sans try/catch — ✅ **CORRIGÉ**
**Fichier :** `routes/leaves.js:527-535`

Appelé après que le statut `approved` et la déduction de solde sont déjà committés. Si cet appel lève une exception, le manager reçoit un 500 alors que l'approbation a réellement réussi (solde déjà déduit) — réponse trompeuse, et une nouvelle tentative échouera avec "vous n'êtes pas le valideur" (verrou déjà consommé).

**Correctif :** entourer l'appel d'un `try/catch` qui logge l'erreur mais renvoie quand même un succès au manager (avec éventuellement un avertissement "planning non libéré automatiquement, à vérifier").

### 2.5 — MOYEN — `course-slots.js` : `capacity` jamais vérifiée à l'affectation — ✅ **CORRIGÉ** (testé : 1/1 puis refus du 2e)
**Fichier :** `routes/course-slots.js:102-134`

La colonne `capacity` est bien gérée en CRUD (création/édition du cours) mais jamais consultée dans `POST /:id/assign`. Seule la contrainte `UNIQUE(course_slot_id, staff_id, week_start)` empêche un doublon du même salarié — rien n'empêche de dépasser la capacité configurée.

**Correctif :** ajouter un contrôle `COUNT(*) < capacity` avant d'insérer une nouvelle affectation.

### 2.6 — FAIBLE / durcissement préventif
- **`swaps.js:218-334` respond** — ✅ **CORRIGÉ** : verrou optimiste (`WHERE status='pending'`) ajouté en défense en profondeur.
- **Tables `timesheets` et `availabilities`** dans `schema.sql` — ⏳ **non traité, décision volontaire** : suppression de tables = action destructive non demandée explicitement, laissé tel quel (schéma mort mais inoffensif). À nettoyer plus tard si confirmé définitivement inutile.
- **Pattern de migration à risque** — ✅ **CORRIGÉ** (voir §5.2, log ajouté).

### Points vérifiés — pas de problème
Colonnes `n1/n2/n3_*`, `half_start/half_end`, `document_url` sur `leaves` · toutes les colonnes de `shift_swaps` · contraintes CHECK (status/type/role) · pas de FK cassée (aucune suppression physique des tables référencées, tout est soft-delete via `active=0`) · `seed.js` et `migrate_charge_rate.js` cohérents.

---

## 3. Logique métier — planning, congés, échanges (spécial été)

### 3.1 — CRITIQUE — Jours fériés toujours exclus, même pour les congés "calendar_days" — ✅ **CORRIGÉ** (vérifié : 11j au lieu de 10j sur un cas test avec 1 férié)
**Fichier :** `routes/leaves.js:90-104` (`calcDays`)

Les types `maladie`, `accident`, `maternite`, `sans_solde` utilisent `count_method='calendar_days'` (censé compter *tous* les jours), mais `getHolidaysSet()` est appliqué sans condition sur la méthode. Un arrêt maladie du 10 au 20 juillet qui passe par le 14 juillet (férié) perd 1 jour dans le décompte. **Impact concret pour l'été : 14 juillet et 15 août tombent tous les deux dans la période de test.**

**Correctif :** dans `calcDays`, n'exclure les jours fériés que si `method !== 'calendar_days'`.

### 3.2 — CRITIQUE — Chevauchement de congés mal détecté pour les demi-journées — ✅ **CORRIGÉ** (4 scénarios vérifiés : AM+PM ok, AM+AM conflit, jour complet+demi conflit, multi-jours conflit)
**Fichier :** `routes/leaves.js:330-336`

La requête de chevauchement compare uniquement les dates (`NOT (end_date < ? OR start_date > ?)`), sans tenir compte de `half_start`/`half_end`. Une demi-journée AM le 14/07 empêche à tort de poser une demi-journée PM le même jour pour un autre motif — un cas d'usage courant en congés d'été.

**Correctif :** affiner la condition de chevauchement pour permettre AM+PM complémentaires sur une même date.

### 3.3 — CRITIQUE — Double affectation possible sur un créneau lors d'échanges concurrents — ✅ **CORRIGÉ** (avec §2.2 : transaction sur approve/assign + verrou anti-doublon à la création d'une demande)
**Fichier :** `routes/swaps.js:360-369`

Rien n'empêche deux demandes d'échange `open` d'exister pour le même créneau (pas de contrainte d'unicité requester+week+day+hour). Si un manager approuve les deux (matchées par deux collègues différents), la 1ère approbation supprime le créneau original et ajoute le 1er remplaçant ; la 2e ne trouve plus rien à retirer (échec silencieux, voir §2.2) mais ajoute quand même le 2e remplaçant → **deux personnes sur le même créneau**. Risque réel en période de forte activité de swaps + congés simultanés cet été.

**Correctif :** ajouter une contrainte d'unicité ou une vérification explicite avant `approve` que le créneau source est toujours occupé par le demandeur initial.

### 3.4 — MAJEUR — Type de congé `recup` (récupération d'heures) complètement cassé — ✅ **CORRIGÉ**
**Fichier :** `routes/leaves.js`, `frontend/src/views/CongesView.jsx`

`hours_count` n'était jamais renseigné. Correctif : champ "Nombre d'heures" ajouté au formulaire frontend, backend exige et stocke ce champ pour les types `count_method='hours'`, `days_count` mis à 0 (n'a pas de sens pour ce type). Testé : `hours_count=3.5` correctement stocké, rejet propre (400) si heures absentes.

### 3.5 — MAJEUR — Créneaux planning non restaurés après annulation d'un congé/indispo déjà approuvé(e) — ✅ **CORRIGÉ**
**Fichiers :** `routes/leaves.js`, `routes/unavailabilities.js`, `utils/releaseSlots.js`

`releaseStaffSlots()` renvoie désormais un snapshot complet des créneaux supprimés (pas juste un résumé), stocké en JSON sur la ligne congé/indispo (`released_slots`). Une nouvelle fonction `restoreReleasedSlots()` les recrée automatiquement à l'annulation. Testé en conditions réelles : cycle complet libération → annulation → restauration confirmé, avec message au manager indiquant le nombre de créneaux restaurés.

### 3.6 — MAJEUR — Filtrage vacances scolaires incohérent entre `templates.js` et `course-slots.js` — ✅ **CORRIGÉ**
**Fichiers :** `utils/holidayHelper.js` (nouvelles fonctions), `routes/course-slots.js`

Nouvelles `isCourseSlotActiveForDay`/`filterCourseSlotsByDay`, filtrage au niveau du jour (comme `templates.js`) au lieu de la semaine entière. Vérifié par test unitaire : un cours du lundi "hors-vacances" reste actif même si le jeudi de la même semaine est en vacances (avant : toute la semaine était exclue à tort).

### 3.7 — MAJEUR — Aucune vérification de conflit d'horaire à l'affectation — ✅ **CORRIGÉ**
**Fichiers :** `utils/conflictCheck.js` (nouveau), `routes/schedules.js`, `routes/course-slots.js`, `routes/swaps.js`

Nouvelle vérification non bloquante (`checkStaffConflict`) : avertit (toast) si un salarié nouvellement affecté a un congé/indispo approuvé(e) ce jour-là. Non bloquant par design (un manager peut avoir une bonne raison de passer outre). Testé en conditions réelles sur les 3 points d'entrée (planning, cours, échanges).

### 3.8 — MOYEN — Alerte urgente de swap non couvert ne rattrape jamais une échéance ratée — ✅ **CORRIGÉ**
**Fichier :** `app.js` (`checkUrgentSwapAlerts`)

La condition ne dépend plus de `shiftMs > now` : rattrape désormais une échéance déjà dépassée, et couvre aussi les échanges `matched` en attente d'approbation manager oubliée. Testé : notification bien envoyée pour un créneau déjà passé.

### 3.9 — MINEUR — ✅ **CORRIGÉS** (les 2 points actionnables)
- **Décalage de fuseau horaire sur le calcul du préavis** — ✅ corrigé, normalisation à minuit local comme `unavailabilities.js`.
- **Pas de garde-fou serveur si `half_start=1` ET `half_end=1`** — ✅ corrigé, rejet 400 si combinaison sur un seul jour. Testé.
- Statistiques sync vacances scolaires (peu fiables) et `isVacationWeek` ignorant le samedi : non traités, impact jugé négligeable (rapport de sync uniquement / cas de bord déjà mitigé par §3.6).

### Point positif à signaler
`routes/hour-declarations.js` est **entièrement fonctionnel** (CRUD, workflow d'approbation, auto-approbation si pas de N+1, notifications) — contrairement à ce que laissait penser `contexte_reprise.md` qui le mentionnait comme "à implémenter". La doc technique est donc à mettre à jour sur ce point. `utils/http-proxy.js` gère bien les pannes/lenteurs des API gouvernementales externes (timeout 12s, réponse 502 propre).

---

## 4. Frontend

### 4.1 — CRITIQUE — Sauvegarde du planning silencieuse en cas d'échec (fonctionnalité principale) — ✅ **CORRIGÉ**
**Fichier :** `frontend/src/views/PlanningView.jsx:1179-1184` (`debounceSave`)

Utilisé par tout le drag & drop / resize de créneaux — c'est la fonctionnalité centrale de l'éditeur de planning. Le `catch` ne fait que `console.error`, sans toast ni aucune indication utilisateur (le fichier de 1984 lignes n'importe même pas le composant de toast). Scénario : un manager déplace un créneau un vendredi soir avec une connexion instable ou une session expirée — l'UI affiche le changement localement (état optimiste) mais rien n'est persisté côté serveur, sans que personne ne le sache.

**Correctif :** ajouter un `toast.error` explicite + idéalement un état visuel "non sauvegardé" avec bouton de nouvelle tentative.

### 4.2 — CRITIQUE — Plusieurs actions du planning sans aucun `catch` — ✅ **CORRIGÉ**
**Fichier :** `frontend/src/views/PlanningView.jsx` — `TemplatePanel.handleSaveAs` (l.411-425), `handleDelete` (l.457-461), `CourseSlotModal.handleSave` (l.581-590), `handleDelete` (l.592-596)

Aucun `catch` du tout : en cas d'échec API (nom dupliqué, contrainte SQL), la promesse est rejetée sans être interceptée — aucun message, l'utilisateur ne sait pas si l'action a fonctionné.

**Correctif :** ajouter un `try/catch` avec `toast.error` sur ces 4 fonctions.

### 4.3 — CRITIQUE — Double-clic possible sur la création de salarié — ✅ **CORRIGÉ**
**Fichier :** `frontend/src/components/StaffForm.jsx:271-273`

Le bouton "Créer le membre" n'a ni état `saving` ni `disabled` pendant l'appel async. Deux clics rapides = deux `POST /staff` = fiche dupliquée à nettoyer manuellement — risque accru en pleine saison d'embauches saisonnières.

**Correctif :** ajouter un état de chargement qui désactive le bouton pendant la requête (pattern déjà bien implémenté dans `EquipeView.jsx` pour le reset de mot de passe — à répliquer ici).

### 4.4 — ÉLEVÉ — `SwapView.jsx` : pas de feedback d'erreur et double-soumission possible — ✅ **CORRIGÉ**
**Fichier :** `frontend/src/views/SwapView.jsx`

- `createSwap()` (l.208-234) : `console.error` seul, pas de toast.
- Bouton "Envoyer la demande" (l.395-399) jamais désactivé pendant l'appel réseau → double-clic → deux demandes d'échange dupliquées.
- `SwapCard.action()` (l.80-94) : accepter/refuser/approuver échouent silencieusement — actions pourtant critiques pour la couverture des créneaux estivaux.

**Correctif :** appliquer le même pattern `saving`/`disabled` + `toast.error` que sur `EquipeView`.

### 4.5 — ÉLEVÉ — Aucun timeout Axios, aucune détection hors-ligne — ✅ **CORRIGÉ**
**Fichier :** `frontend/src/api/client.js`

`timeout: 15000` ajouté + interception des erreurs réseau (synthétise un message clair repris automatiquement par tous les `e.response?.data?.error || '...'` déjà en place, sans modifier chaque vue).

### 4.6 — MOYEN — Mécanismes d'erreur/confirmation incohérents entre vues — ✅ **CORRIGÉ**

Tous les `alert()`/`window.alert()`/`window.confirm()` remplacés par `toast`/`ConfirmModal` dans `HourDeclarationView`, `IndispoView`, `PlanningView`, `ConfigView`. Plus aucune occurrence dans le frontend (vérifié par recherche exhaustive).

### 4.7 — MOYEN — Pas d'état de chargement sur "Envoyer la demande" de congé — ✅ **CORRIGÉ**

### 4.8 — MOYEN — Règles de complexité du mot de passe incohérentes selon l'écran — ✅ **CORRIGÉ**

`ResetPasswordView` aligné sur la règle réellement appliquée (8 caractères, comme `ForceChangePassword`/`MonProfilView`/backend) — l'exigence majuscule+chiffre était trompeuse (jamais vérifiée côté serveur).

### 4.9 — MOYEN — `CostsView.jsx` — mise à jour du taux horaire sans feedback d'erreur — ✅ **CORRIGÉ**

### 4.10 — FAIBLE — ✅ **CORRIGÉS**
- `ConfirmModal` attend désormais la résolution de `onConfirm()` (état "busy") avant de fermer.
- `RelevesView.jsx`, `usePushNotifications.js` : `toast.error` ajouté en plus du `console.error`.

### Points vérifiés — pas de problème
Aucun secret/URL localhost/token en dur dans le code (identifiants de démo dans `LoginView.jsx` bien gardés par `import.meta.env.DEV`) · CSRF non nécessaire vu `sameSite:'strict'` · intercepteur de refresh token correctement implémenté (un seul essai, file d'attente, pas de boucle infinie) · `EquipeView.jsx` protège bien contre le double-clic sur le reset de mot de passe · logique de dates dans `fiscal.js`/`holidayUtils.js` cohérente pour les cas d'été.

---

## 5. Déploiement & exploitation

### 5.1 — CRITIQUE — Aucune sauvegarde automatisée de la base SQLite — ✅ **Backup quotidien en place sur le serveur depuis le 6 juillet 2026**
**Constat initial :** aucun script, cron ou timer systemd ne sauvegardait `spirit-v2/db/spirit.db`.

**Fait :** `spirit-v2/scripts/backup-db.sh` récupéré depuis la branche `fix/audit-pre-ete-2026` et installé sur le serveur, cron quotidien à 3h du matin configuré et vérifié (`sudo crontab -l`).

**⏳ Reste à faire — copie hors du serveur :** un backup qui reste sur le même disque que le serveur ne protège pas d'une panne totale du VPS. Il faut synchroniser `/opt/mineral-plan/backups` vers un stockage distant (rsync/rclone vers un autre serveur, un NAS, ou un espace cloud type Backblaze B2). Pas encore mis en place — à décider selon la solution de stockage distant disponible.

### 5.2 — ÉLEVÉ — Erreurs de migration silencieusement avalées (cf. §2.6) — ✅ **CORRIGÉ**
Chaque erreur de migration est maintenant journalisée (`console.error`) même si la migration continue — visible dans `journalctl` au prochain déploiement. Testé : démarrage propre, migrations existantes toujours OK.

### 5.3 — ÉLEVÉ — Modules natifs (better-sqlite3, sharp) non reconstruits après changement de version Node — ⏳ **NON CODIFIABLE, à retenir**
Ce point ne se corrige pas dans le code — c'est une discipline de déploiement. **Règle à retenir :** si `package-lock.json` a changé dans un `git pull`, refaire `npm install` avant de redémarrer le service. Déjà documenté dans `tests_manuels_phase0_1.md`.

### 5.4 — ÉLEVÉ — Pas de limite de redémarrage / alerte en cas de crash-loop — ⏳ **NÉCESSITE UNE ACTION DE TA PART**
`Restart=on-failure` + `RestartSec=5` sans limite explicite → après un crash-loop, le service passe en `failed` et arrête de réessayer, silencieusement si aucun accès SSH facile n'est disponible (exactement le scénario vécu avec le bug de reset mot de passe). **Non corrigeable en code** : nécessite un monitoring externe (UptimeRobot ou équivalent, healthcheck HTTP périodique) que je ne peux pas mettre en place à ta place.

### 5.5 — MOYEN — ✅ **TOUS CORRIGÉS**
- **`journald` sans quota explicite** — ⏳ configuration serveur (`/etc/systemd/journald.conf`), pas du code — à faire par toi si tu veux limiter le risque de saturation disque (`SystemMaxUse=500M` par exemple).
- **`express.json()` sans limite explicite** — ✅ corrigé, `limit: '1mb'` ajouté.
- **`install.sh` vs installeur Electron : mot de passe superadmin jamais affiché** — ✅ corrigé : l'installeur Electron affiche maintenant le mot de passe superadmin généré (reveal/hide), comme pour le compte admin. Bonus trouvé au passage : les deux installeurs écrivaient `VAPID_EMAIL` dans le `.env`, une variable jamais lue par le code (qui lit `VAPID_SUBJECT`) — corrigé aussi, la config VAPID saisie à l'installation ne sera plus ignorée.
- **`.env.example` ne documente pas les variables VAPID** — ✅ corrigé, ajoutées avec instructions de génération.

### Checklist à vérifier manuellement sur le serveur (non confirmable depuis le code)
- [ ] Un cron/timer de backup existe-t-il déjà côté OS, hors dépôt Git ? (`crontab -l`, `systemctl list-timers`, `ls /etc/cron.d/`)
- [ ] Espace disque disponible (`df -h`) avant la montée en charge estivale.
- [ ] Version Node réellement installée (`node -v`) vs version utilisée par les `node_modules` en place.
- [ ] Config `journald` effective (`journalctl --disk-usage`).
- [ ] `systemctl is-enabled mineral-spirit` + historique de redémarrages récents.
- [ ] Logrotate pour les logs Caddy (`/etc/logrotate.d/caddy`).
- [ ] Contenu réel du `.env` de prod — confirmer qu'aucune variable n'est restée à une valeur par défaut du `.env.example`.
- [x] Valeur réelle de `NODE_ENV` — vérifiée le 6 juillet 2026 : `production`, correct.

---

## 6. Questions ouvertes pour toi

1. ~~Le rôle `viewer` est-il utilisé par quelqu'un aujourd'hui ?~~ **Répondu** : le rôle ne doit avoir accès qu'à ses propres données, comme `staff` — corrigé en §1.4.
2. **Le type de congé `recup` (récupération d'heures) est-il utilisé en pratique ?** (impacte l'urgence de §3.4 — actuellement le solde calculé est faux)
3. **`routes/functions.js` : la route `slots/bulk` est-elle appelée par autre chose que le frontend actuel** (script, ancienne version mobile) ? L'agent n'a rien trouvé côté frontend actuel, mais bon à confirmer avant de la corriger ou supprimer.
4. ~~Y a-t-il déjà un cron de backup en place côté OS ?~~ **Fait le 6 juillet 2026** — script installé, cron quotidien configuré (§5.1). Reste la synchronisation distante.
5. ~~As-tu un moyen de savoir si le service est down sans SSH ?~~ **Toujours sans réponse** — nécessite un monitoring externe (§5.4), je ne peux pas le mettre en place à ta place.
6. ~~Combien de temps peux-tu consacrer aux correctifs ?~~ **Sans objet** — tous les points corrigeables en code ont été traités (voir §7).

---

## 7. Bilan final — tout a été traité

**Mise à jour du 6 juillet 2026** : tous les points de ce document corrigeables en code ont été implémentés, testés en conditions réelles (serveur de dev + comptes multiples) et commités sur la branche `fix/audit-pre-ete-2026`. Détail commit par commit dans `git log main..fix/audit-pre-ete-2026`.

### Ce qui reste à faire par toi (aucun ne peut être fait depuis le code)

1. ~~Vérifier `NODE_ENV=production`~~ — ✅ **fait, vérifié le 6 juillet 2026 : déjà correct.**
2. ~~Installer le cron de backup~~ — ✅ **fait le 6 juillet 2026** — script installé, cron quotidien 3h configuré et vérifié. ⏳ Reste la synchronisation vers un stockage distant (rsync/rclone) pour vraiment protéger contre une panne de VPS.
3. **Mettre en place un monitoring externe** (UptimeRobot ou équivalent) pour être alerté si le service tombe, puisque l'accès SSH n'est pas toujours pratique (§5.4).
4. **Retenir la règle** : si `package-lock.json` change dans un `git pull`, refaire `npm install` avant de redémarrer (§5.3, non codifiable).
5. **Optionnel** : limiter la taille des logs journald (`SystemMaxUse=`) si tu veux te prémunir d'une saturation disque à long terme (§5.5).
6. **Tests navigateur restants** — voir `Doc_techniques/tests_manuels_phase0_1.md` §3, à compléter pour couvrir aussi les nouveaux correctifs (récup, restauration de créneaux, vacances scolaires jour par jour, alertes de conflit).

### Décisions prises en ton absence (à valider si tu veux ajuster)

- **§2.6** — tables `timesheets`/`availabilities` : laissées en l'état (schéma mort mais inoffensif), suppression de table jugée trop risquée sans confirmation explicite.
- **§4.8** — règle de mot de passe alignée vers le bas (8 caractères partout) plutôt que vers le haut, pour cohérence avec ce qui était déjà appliqué ailleurs sans casser les mots de passe existants.
- **§3.7** — les conflits d'affectation (congé/indispo vs planning) sont des avertissements non bloquants, pas des blocages durs, pour laisser la main au manager en cas de besoin réel de passer outre.

---

*Document de travail — tenu à jour au fil des correctifs. Prochaine mise à jour si de nouveaux points sont identifiés.*
