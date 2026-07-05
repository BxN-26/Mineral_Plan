# Minéral Spirit v2 — Audit pré-saison estivale 2026

> Créé le 5 juillet 2026, suite au bug de réinitialisation de mot de passe (colonne `updated_at` inexistante sur `users`, corrigé le 05/07/2026, commit `4a67bdb`).
> Objectif : identifier avant la phase de test estivale (usage réel intensif — moniteurs, cours d'été, congés, échanges de créneaux) tout ce qui pourrait casser le service ou corrompre des données, en priorité les bugs de la **même famille** que celui déjà rencontré.
> Méthode : 5 revues de code ciblées (sécurité/auth, intégrité données & migrations, logique métier planning/congés/échanges, frontend React, déploiement/ops), en lecture seule, avec élimination des faux positifs.
>
> **Mise à jour du 5 juillet 2026 (soir)** : Phase 0 et Phase 1 du plan d'action (§7) implémentées sur
> la branche `fix/audit-pre-ete-2026`, testées (voir `Doc_techniques/tests_manuels_phase0_1.md`).
> Bug critique supplémentaire trouvé et corrigé en cours de route, absent de l'audit initial :
> **`POST /api/leaves` était complètement cassé** (`db_.transaction` n'existe pas sur l'objet `db_`,
> seule `db_.tx` existe — même famille de bug que celui déjà rencontré). Toute création de congé
> échouait avec une 500, en prod comme partout. Corrigé dans `routes/leaves.js`.
> Statut détaillé des points §0/§1 : voir les cases à cocher dans chaque section ci-dessous.

---

## 0. À faire EN PREMIER (avant tout le reste)

Ces 3 points sont soit déjà exploitables/cassés, soit désamorcent silencieusement des protections existantes. À traiter avant toute autre chose, dans cet ordre :

1. **Vérifier la valeur de `NODE_ENV` dans le `.env` de prod** (§1.1) — si ce n'est pas `production`, plusieurs protections de sécurité sont actuellement désactivées sans que rien ne le signale. **[À FAIRE PAR TOI sur le serveur — pas de code à changer]**
2. **Ajouter `app.set('trust proxy', 1)` dans `app.js`** (§1.2) — sans ça, un seul moniteur qui se trompe de mot de passe peut bloquer la connexion de **toute l'équipe** pendant 15 minutes. ✅ **CORRIGÉ** (branche `fix/audit-pre-ete-2026`)
3. **Mettre en place un backup automatisé de `spirit.db`** (§5.1) — à ce jour, aucune sauvegarde n'existe nulle part. Une corruption ou une fausse manip pendant l'été = perte définitive. ✅ **Script prêt** (`spirit-v2/scripts/backup-db.sh`, testé) — **cron à installer par toi sur le serveur**, voir `tests_manuels_phase0_1.md` §1.2

---

## 1. Sécurité & authentification

### 1.1 — CRITIQUE — `NODE_ENV` potentiellement pas à `production` sur le serveur réel — ⏳ **[À FAIRE PAR TOI, pas de code]**
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

### 1.7 — MAJEUR — CSP effectivement absente malgré le commentaire "géré par Caddy en prod"
**Fichiers :** `app.js:47-49`, `Caddyfile.example:12-19`

Helmet désactive sa CSP en renvoyant la responsabilité à Caddy, mais le Caddyfile (même le vrai, à vérifier) ne définit aucun header `Content-Security-Policy`. Aujourd'hui il n'y a **aucune CSP** en prod.

**Correctif :** soit réactiver une CSP raisonnable dans Helmet, soit l'ajouter explicitement dans le Caddyfile réel de prod.

### 1.8 — Mineur (à traiter si le temps le permet)
- **Enumération par timing sur le login** (`auth.js:27-34`) : `bcrypt.compare` n'est appelé que si l'email existe → écart de latence mesurable. Peu exploitable vu le rate limiting.
- **`JWT_REFRESH_SECRET`** dans `.env.example` : variable jamais utilisée (les refresh tokens sont des chaînes aléatoires hashées SHA-256, pas des JWT) — résidu trompeur pour un futur repreneur du projet.
- **Pas d'alerte en cas de rejeu d'un refresh token révoqué** — échoue proprement (401) mais aucune notification/révocation en cascade. Risque réduit (cookies `httpOnly`).
- **`trackActivity` (`app.js:73-92`) lit un cookie `token` qui n'existe pas** (les vrais cookies sont `spirit_access`/`spirit_refresh`) → les stats `connectionsToday`/`activeSessions` affichées quelque part dans l'admin sont donc **toujours fausses**. À corriger si ces stats sont utilisées pour suivre l'usage réel cet été.

### Points vérifiés — pas de problème
Upload avatar (magic-bytes réels vérifiés, 8 Mo max, recompression sharp, pas de path traversal) · reset mot de passe par email (token 256 bits usage unique, expiration 30 min, révocation sessions) · CORS (origine unique, pas de wildcard) · scoping `user_id` correct sur notifications/push · verrous optimistes sur l'approbation congés/heures · RBAC correct sur toutes les routes de configuration (teams, functions, holidays, settings, etc.).

---

## 2. Intégrité des données & migrations

> Rappel du bug déjà corrigé : `routes/staff.js` référençait une colonne `updated_at` inexistante sur `users`. La revue ci-dessous cherchait spécifiquement d'autres occurrences du même problème (colonne référencée dans une requête mais absente du schéma réel).

### 2.1 — CRITIQUE — Même bug exact dans `routes/functions.js:216-218`
**Endpoint :** `POST /api/functions/schedule/:week/:functionId/slots/bulk`

```sql
INSERT OR IGNORE INTO schedule_slots
 (schedule_id,staff_id,day_of_week,hour_start,hour_end,sub_role,note) VALUES (?,?,?,?,?,?,?)
```
Les colonnes `sub_role` et `note` existaient dans `schema.sql` mais ont été supprimées par la migration `schedule_slots_real_spans` (`db/database.js:196-253`, qui recrée la table). Résultat : `SQLITE_ERROR` à chaque appel de cet endpoint.

**Bonne nouvelle :** aucun appel à `slots/bulk` n'existe dans le frontend actuel (vérifié) — l'endpoint utilisé réellement est `routes/schedules.js:88`, qui lui utilise les bonnes colonnes. Ce endpoint est donc probablement du code mort/legacy, mais reste un piège pour un futur client (script, appli mobile).

**Correctif :** soit mettre à jour la requête pour ne plus référencer `sub_role`/`note` (et ajouter `task_type`/`course_slot_id` si l'intention est de la garder à jour avec `schedules.js`), soit supprimer l'endpoint s'il est confirmé inutilisé.

### 2.2 — ÉLEVÉ — `swaps.js` approve/assign : mise à jour du planning non conditionnée à son propre succès
**Fichier :** `routes/swaps.js:360-372` (approve), `:400-405` (assign)

`removeSlot()`/`addSlot()` sont dans un `try/catch` qui avale l'erreur silencieusement (`console.error` seul), puis le code exécute **quand même** `UPDATE shift_swaps SET status='approved'`. Scénario : `removeSlot` réussit mais `addSlot` échoue → le créneau disparaît du planning alors que les deux parties reçoivent une notification "✅ Échange approuvé". Aggravé par l'absence de contrainte empêchant deux demandes d'échange concurrentes sur le même créneau (voir §3.3).

**Correctif :** conditionner le `UPDATE ... status='approved'` au succès réel de `removeSlot`/`addSlot` (retour booléen à vérifier), et idéalement englober toute la séquence dans `db_.tx()`.

### 2.3 — MOYEN — `leaves.js` approve (workflow N1/N2/N3) non transactionnel
**Fichier :** `routes/leaves.js:390-506`

Chaque branche exécute 2 à 4 `UPDATE` séparés, non wrappés dans `db_.tx()` (contrairement au `POST /` initial, ligne 330, qui lui utilise correctement une transaction). Un crash process entre deux `UPDATE` laisserait un congé dans un état incohérent (`n1_status='approved'` mais `status` encore `'pending'`), sans chemin de code pour le réparer.

**Correctif :** wrapper toute la fonction d'approbation dans `db_.tx()`.

### 2.4 — MOYEN — `releaseStaffSlots()` appelé après le commit, sans try/catch
**Fichier :** `routes/leaves.js:527-535`

Appelé après que le statut `approved` et la déduction de solde sont déjà committés. Si cet appel lève une exception, le manager reçoit un 500 alors que l'approbation a réellement réussi (solde déjà déduit) — réponse trompeuse, et une nouvelle tentative échouera avec "vous n'êtes pas le valideur" (verrou déjà consommé).

**Correctif :** entourer l'appel d'un `try/catch` qui logge l'erreur mais renvoie quand même un succès au manager (avec éventuellement un avertissement "planning non libéré automatiquement, à vérifier").

### 2.5 — MOYEN — `course-slots.js` : `capacity` jamais vérifiée à l'affectation
**Fichier :** `routes/course-slots.js:102-134`

La colonne `capacity` est bien gérée en CRUD (création/édition du cours) mais jamais consultée dans `POST /:id/assign`. Seule la contrainte `UNIQUE(course_slot_id, staff_id, week_start)` empêche un doublon du même salarié — rien n'empêche de dépasser la capacité configurée.

**Correctif :** ajouter un contrôle `COUNT(*) < capacity` avant d'insérer une nouvelle affectation.

### 2.6 — FAIBLE / durcissement préventif
- **`swaps.js:218-334` respond** : pas de verrou optimiste (`WHERE status='pending'`) sur l'`UPDATE`, contrairement à `leaves.js`. Non exploitable aujourd'hui (process Node unique, tout synchrone), mais à corriger en prévention si l'app passe un jour en cluster/pm2.
- **Tables `timesheets` et `availabilities`** dans `schema.sql` : ne sont référencées par aucune route — schéma mort, à nettoyer ou documenter comme "réservé futur".
- **Pattern de migration à risque** (`db/database.js`, boucle `for (const [name, sql] of migrations)`) : toute erreur d'ALTER TABLE est avalée (`catch (_) {}`) et la migration est quand même marquée comme faite. C'est ce mécanisme qui a permis au bug §2.1 (et à l'origine, au bug `updated_at`) de passer inaperçu. Recommandation : au minimum logger l'erreur (`console.error`) même si on choisit de continuer, pour voir l'anomalie dans les logs au prochain déploiement.

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

### 3.3 — CRITIQUE — Double affectation possible sur un créneau lors d'échanges concurrents — ⏳ **PAS ENCORE CORRIGÉ** (seul §1.5 — qui peut accepter — a été traité ; ce point-ci touche `approve`/§2.2, reporté à une phase ultérieure)
**Fichier :** `routes/swaps.js:360-369`

Rien n'empêche deux demandes d'échange `open` d'exister pour le même créneau (pas de contrainte d'unicité requester+week+day+hour). Si un manager approuve les deux (matchées par deux collègues différents), la 1ère approbation supprime le créneau original et ajoute le 1er remplaçant ; la 2e ne trouve plus rien à retirer (échec silencieux, voir §2.2) mais ajoute quand même le 2e remplaçant → **deux personnes sur le même créneau**. Risque réel en période de forte activité de swaps + congés simultanés cet été.

**Correctif :** ajouter une contrainte d'unicité ou une vérification explicite avant `approve` que le créneau source est toujours occupé par le demandeur initial.

### 3.4 — MAJEUR — Type de congé `recup` (récupération d'heures) complètement cassé
**Fichier :** `routes/leaves.js` (INSERT lignes 337-351), confirmé côté frontend `CongesView.jsx`

`hours_count` n'est jamais renseigné (reste à 0 par défaut), et `calcDays()` traite ce type comme un décompte en jours calendaires au lieu d'heures. Une demande de 3h de récup est comptée comme 1 jour calendaire ; le solde de récupération affiché (`balance/:staffId`) est donc toujours faux.

**Question pour toi :** ce type de congé (`recup`) est-il réellement utilisé par l'équipe aujourd'hui ? Si oui, c'est à traiter en priorité haute avant l'été ; si c'est un type configuré mais jamais choisi en pratique, ça peut attendre.

### 3.5 — MAJEUR — Créneaux planning non restaurés après annulation d'un congé/indispo déjà approuvé(e)
**Fichiers :** `routes/leaves.js:589-615`, `routes/unavailabilities.js:207-216`

Annuler un congé approuvé (dont les créneaux ont déjà été libérés automatiquement) restaure le solde de congés mais **pas** les créneaux de planning supprimés. Même souci pour la suppression d'une indisponibilité approuvée. Après une annulation "heureuse" (le salarié est finalement disponible), le planning reste troué silencieusement, à reconstruire manuellement.

**Correctif :** conserver une trace des créneaux libérés (ex. table de log ou snapshot JSON) pour permettre une restauration automatique ou au moins un signalement clair au manager ("3 créneaux à réaffecter manuellement").

### 3.6 — MAJEUR — Filtrage vacances scolaires incohérent entre `templates.js` et `course-slots.js`
**Fichiers :** `routes/course-slots.js:28-38,102-134` vs `routes/templates.js:170-190` (fix du commit `025beee`)

Le fix récent a rendu le filtrage *journalier* dans `templates.js` (pour gérer les semaines à cheval sur début/fin de vacances), mais `course-slots.js` utilise toujours `filterCourseSlotsByWeek` → `isVacationWeek` (semaine entière, seuil ≥3/5 jours ouvrés). Pour une semaine de rentrée (vacances d'été se terminant un mardi par exemple), un cours "hors-vacances" du lundi sera affiché comme actif à tort, et inversement. **Les vacances d'été démarrent bientôt et la rentrée de septembre est exactement le cas concerné.**

**Correctif :** propager la même logique de filtrage journalier de `templates.js` vers `course-slots.js`.

### 3.7 — MAJEUR — Aucune vérification de conflit d'horaire à l'affectation
**Fichiers :** `routes/schedules.js` (POST week/function), `routes/course-slots.js` (assign), `routes/swaps.js` (approve/assign)

Un manager peut affecter un salarié en congé approuvé, ou assigner deux cours qui se chevauchent au même salarié, sans aucun avertissement. Impact fort en pleine saison de cours d'été à effectifs variables.

**Correctif :** avant chaque affectation, vérifier l'absence de congé/indispo approuvé(e) et de chevauchement horaire sur d'autres affectations de la même semaine.

### 3.8 — MOYEN — Alerte urgente de swap non couvert ne rattrape jamais une échéance ratée
**Fichier :** `app.js:177-217` (`checkUrgentSwapAlerts`)

La condition `shiftMs > now && shiftMs <= limitMs` exclut tout créneau déjà commencé. Si le job n'est pas passé au bon moment (redémarrage serveur, coupure) ou si le swap est `matched` mais jamais approuvé à temps, aucune alerte n'est jamais envoyée, même rétroactivement.

**Correctif :** ajouter une alerte de "rattrapage" pour les créneaux dont l'échéance est dépassée sans validation finale.

### 3.9 — MINEUR
- **Décalage de fuseau horaire sur le calcul du préavis** (`leaves.js:287-299`) : compare `new Date()` (heure locale) à `new Date(start_date)` (minuit UTC) → décalage possible de ±1 jour selon l'heure de soumission, contrairement à `unavailabilities.js` qui normalise bien à minuit local.
- **Pas de garde-fou serveur si `half_start=1` ET `half_end=1`** sur une demande d'un seul jour → 0 jour décompté. Protégé côté frontend (radios exclusifs) mais pas côté API.
- **Statistiques import/mise à jour de la sync vacances scolaires** (`school-holidays.js:156-166`) légèrement peu fiables (comparaison à la seconde près) — n'affecte que le rapport de sync, pas les données elles-mêmes.
- **`isVacationWeek` ignore le samedi/dimanche** dans le calcul — cohérent pour éviter le faux-positif du pont de l'Ascension, mais un cours du samedi n'est jamais vérifié individuellement (lié à §3.6).

### Point positif à signaler
`routes/hour-declarations.js` est **entièrement fonctionnel** (CRUD, workflow d'approbation, auto-approbation si pas de N+1, notifications) — contrairement à ce que laissait penser `contexte_reprise.md` qui le mentionnait comme "à implémenter". La doc technique est donc à mettre à jour sur ce point. `utils/http-proxy.js` gère bien les pannes/lenteurs des API gouvernementales externes (timeout 12s, réponse 502 propre).

---

## 4. Frontend

### 4.1 — CRITIQUE — Sauvegarde du planning silencieuse en cas d'échec (fonctionnalité principale)
**Fichier :** `frontend/src/views/PlanningView.jsx:1179-1184` (`debounceSave`)

Utilisé par tout le drag & drop / resize de créneaux — c'est la fonctionnalité centrale de l'éditeur de planning. Le `catch` ne fait que `console.error`, sans toast ni aucune indication utilisateur (le fichier de 1984 lignes n'importe même pas le composant de toast). Scénario : un manager déplace un créneau un vendredi soir avec une connexion instable ou une session expirée — l'UI affiche le changement localement (état optimiste) mais rien n'est persisté côté serveur, sans que personne ne le sache.

**Correctif :** ajouter un `toast.error` explicite + idéalement un état visuel "non sauvegardé" avec bouton de nouvelle tentative.

### 4.2 — CRITIQUE — Plusieurs actions du planning sans aucun `catch`
**Fichier :** `frontend/src/views/PlanningView.jsx` — `TemplatePanel.handleSaveAs` (l.411-425), `handleDelete` (l.457-461), `CourseSlotModal.handleSave` (l.581-590), `handleDelete` (l.592-596)

Aucun `catch` du tout : en cas d'échec API (nom dupliqué, contrainte SQL), la promesse est rejetée sans être interceptée — aucun message, l'utilisateur ne sait pas si l'action a fonctionné.

**Correctif :** ajouter un `try/catch` avec `toast.error` sur ces 4 fonctions.

### 4.3 — CRITIQUE — Double-clic possible sur la création de salarié
**Fichier :** `frontend/src/components/StaffForm.jsx:271-273`

Le bouton "Créer le membre" n'a ni état `saving` ni `disabled` pendant l'appel async. Deux clics rapides = deux `POST /staff` = fiche dupliquée à nettoyer manuellement — risque accru en pleine saison d'embauches saisonnières.

**Correctif :** ajouter un état de chargement qui désactive le bouton pendant la requête (pattern déjà bien implémenté dans `EquipeView.jsx` pour le reset de mot de passe — à répliquer ici).

### 4.4 — ÉLEVÉ — `SwapView.jsx` : pas de feedback d'erreur et double-soumission possible
**Fichier :** `frontend/src/views/SwapView.jsx`

- `createSwap()` (l.208-234) : `console.error` seul, pas de toast.
- Bouton "Envoyer la demande" (l.395-399) jamais désactivé pendant l'appel réseau → double-clic → deux demandes d'échange dupliquées.
- `SwapCard.action()` (l.80-94) : accepter/refuser/approuver échouent silencieusement — actions pourtant critiques pour la couverture des créneaux estivaux.

**Correctif :** appliquer le même pattern `saving`/`disabled` + `toast.error` que sur `EquipeView`.

### 4.5 — ÉLEVÉ — Aucun timeout Axios, aucune détection hors-ligne
**Fichier :** `frontend/src/api/client.js:3-7`

Pas de `timeout` configuré, pas de gestion de `navigator.onLine` ni de codes d'erreur réseau (`ECONNABORTED`, absence de `err.response`). En usage estival mobile (wifi faible, terrain), une requête peut rester bloquée indéfiniment (spinner infini) sans message "pas de connexion".

**Correctif :** ajouter `timeout: 15000` sur l'instance Axios, et un cas spécifique dans la gestion d'erreur pour `!err.response` → "Connexion impossible, réessayez".

### 4.6 — MOYEN — Mécanismes d'erreur/confirmation incohérents entre vues
3 mécanismes différents coexistent dans la même app :
- `toast.error/success` (majorité des vues, bonne pratique)
- `alert()` natif : `HourDeclarationView.jsx:126,249`, `PlanningView.jsx:434,436,711,721`, `ConfigView.jsx:1002,1070,1079`
- `window.confirm()` natif au lieu du `ConfirmModal` du design system : `HourDeclarationView.jsx:245`, `IndispoView.jsx:282`, `PlanningView.jsx:458,593`, `ConfigView.jsx:1065,1181`

Cette hétérogénéité va compliquer le support pendant l'été (retours utilisateurs difficiles à trianguler par écran).

**Correctif :** remplacer progressivement `alert()`/`window.confirm()` par `toast`/`ConfirmModal`, en commençant par les vues à plus fort usage estival (planning, congés, échanges).

### 4.7 — MOYEN — Pas d'état de chargement sur "Envoyer la demande" de congé
**Fichier :** `frontend/src/views/CongesView.jsx:553-564`

Contrairement à `handleApprove/handleRefuse/handleDelete` (qui gèrent bien `loadingIds`), le formulaire de nouvelle demande n'a pas de protection double-clic → deux demandes de congé identiques possibles.

### 4.8 — MOYEN — Règles de complexité du mot de passe incohérentes selon l'écran
- `ResetPasswordView.jsx:19-26` exige 8 caractères + majuscule + chiffre.
- `ForceChangePassword.jsx:18` et `MonProfilView.jsx:37` n'exigent que 8 caractères.
- Le backend (`auth.js:94,114,197`) n'impose réellement que 8 caractères partout.

Un utilisateur qui définit son mot de passe via "mot de passe oublié" croira à tort qu'une règle plus stricte s'applique partout. Pas une faille de sécurité, mais source de confusion support.

**Correctif :** aligner les 3 écrans sur la même règle (au choix : soit renforcer partout à 8+majuscule+chiffre côté backend et frontend, soit assouplir `ResetPasswordView` à 8 caractères pour cohérence).

### 4.9 — MOYEN — `CostsView.jsx:85-93` — mise à jour du taux horaire sans feedback d'erreur
`console.error` seul ; en cas d'échec, le champ ne se met pas à jour visuellement sans explication.

### 4.10 — FAIBLE
- `ConfirmModal` (`components/common.jsx:190`) ferme la modale avant que `onConfirm()` (async) soit résolu — masque les échecs silencieux si l'appelant ne gère pas lui-même un toast.
- `RelevesView.jsx:74-95`, `usePushNotifications.js:61-63` : erreurs loguées en console seulement (impact faible, fonctionnalités secondaires/lecture seule).

### Points vérifiés — pas de problème
Aucun secret/URL localhost/token en dur dans le code (identifiants de démo dans `LoginView.jsx` bien gardés par `import.meta.env.DEV`) · CSRF non nécessaire vu `sameSite:'strict'` · intercepteur de refresh token correctement implémenté (un seul essai, file d'attente, pas de boucle infinie) · `EquipeView.jsx` protège bien contre le double-clic sur le reset de mot de passe · logique de dates dans `fiscal.js`/`holidayUtils.js` cohérente pour les cas d'été.

---

## 5. Déploiement & exploitation

### 5.1 — CRITIQUE — Aucune sauvegarde automatisée de la base SQLite — ✅ **Script prêt et testé** (`spirit-v2/scripts/backup-db.sh`) — ⏳ **cron à installer par toi sur le serveur**
**Constat :** aucun script, cron ou timer systemd ne sauvegarde `spirit-v2/db/spirit.db` (+ `.db-wal`/`.db-shm`, mode WAL). La seule mention est une commande `cp` manuelle documentée dans `description_technique.md:812-818`, jamais exécutée automatiquement.

**Correctif recommandé :**
```bash
# Script de backup (safe en mode WAL car utilise l'API .backup de SQLite, pas un cp à chaud)
sqlite3 /opt/mineral-plan/spirit-v2/db/spirit.db ".backup '/backup/spirit_$(date +\%F).db'"
```
À planifier via cron quotidien, avec rotation (garder N derniers jours) et **copie hors du serveur** (rsync/rclone vers un stockage distant) — un backup resté sur le même disque ne protège pas d'une panne du VPS.

### 5.2 — ÉLEVÉ — Erreurs de migration silencieusement avalées (cf. §2.6)
Voir §2.6 — recommandation de logger l'erreur même si la migration continue, pour repérer l'anomalie dans `journalctl` au prochain déploiement.

### 5.3 — ÉLEVÉ — Modules natifs (better-sqlite3, sharp) non reconstruits après changement de version Node
Si la version Node du VPS change (mise à jour système) sans `npm install` derrière, l'ABI ne correspond plus → crash au démarrage (`Error: The module was compiled against a different Node.js version`). La procédure documentée (`git pull` + restart) ne précise pas clairement quand refaire `npm install`.

**Correctif :** documenter la règle "si `package-lock.json` a changé dans le pull, refaire `npm install`", et/ou vérifier `node -v` avant chaque déploiement.

### 5.4 — ÉLEVÉ — Pas de limite de redémarrage / alerte en cas de crash-loop
**Fichiers :** `install.sh:257-273`, `installer/scripts/installer-core.js:286-303`

`Restart=on-failure` + `RestartSec=5` sans `StartLimitBurst`/`StartLimitIntervalSec` explicite → après 5 tentatives en 10s (limite par défaut systemd), le service passe en `failed` et **arrête de réessayer**, silencieusement si aucun accès SSH facile n'est disponible.

**Correctif :** ajouter un monitoring externe (ex. UptimeRobot ou équivalent, healthcheck HTTP périodique) puisque l'accès SSH n'est pas toujours pratique — c'est exactement le scénario vécu avec le bug de reset de mot de passe.

### 5.5 — MOYEN
- **`journald` sans quota explicite** — risque de saturation disque lente en cas de forte charge estivale + logs verbeux. Vérifier `/etc/systemd/journald.conf`, fixer `SystemMaxUse=500M` par exemple.
- **`express.json()` sans limite explicite** (`app.js:65`) — repose sur la valeur par défaut Express (100kb), probablement suffisant mais pas documenté ; ajouter `express.json({ limit: '1mb' })` par précaution.
- **`install.sh` vs installeur Electron : logique dupliquée** — les deux scripts génèrent `.env`/service systemd/Caddy avec de légères divergences. L'installeur Electron génère un mot de passe superadmin aléatoire (`genSecret().slice(0,24)`) **jamais affiché à l'utilisateur** (`installer-core.js:172,185-186`) — risque si besoin de se connecter en superadmin sans l'avoir noté.
- **`.env.example` ne documente pas les variables VAPID** utilisées par `routes/push.js` — dégradation propre (503) mais lacune de documentation pour un futur repreneur.

### Checklist à vérifier manuellement sur le serveur (non confirmable depuis le code)
- [ ] Un cron/timer de backup existe-t-il déjà côté OS, hors dépôt Git ? (`crontab -l`, `systemctl list-timers`, `ls /etc/cron.d/`)
- [ ] Espace disque disponible (`df -h`) avant la montée en charge estivale.
- [ ] Version Node réellement installée (`node -v`) vs version utilisée par les `node_modules` en place.
- [ ] Config `journald` effective (`journalctl --disk-usage`).
- [ ] `systemctl is-enabled mineral-spirit` + historique de redémarrages récents.
- [ ] Logrotate pour les logs Caddy (`/etc/logrotate.d/caddy`).
- [ ] Contenu réel du `.env` de prod — confirmer qu'aucune variable n'est restée à une valeur par défaut du `.env.example`.
- [ ] Valeur réelle de `NODE_ENV` (cf. §1.1 — le point le plus urgent de tout ce document).

---

## 6. Questions ouvertes pour toi

1. ~~Le rôle `viewer` est-il utilisé par quelqu'un aujourd'hui ?~~ **Répondu** : le rôle ne doit avoir accès qu'à ses propres données, comme `staff` — corrigé en §1.4.
2. **Le type de congé `recup` (récupération d'heures) est-il utilisé en pratique ?** (impacte l'urgence de §3.4 — actuellement le solde calculé est faux)
3. **`routes/functions.js` : la route `slots/bulk` est-elle appelée par autre chose que le frontend actuel** (script, ancienne version mobile) ? L'agent n'a rien trouvé côté frontend actuel, mais bon à confirmer avant de la corriger ou supprimer.
4. **Y a-t-il déjà un cron de backup en place côté OS**, en dehors de ce qui est versionné dans le dépôt ? Si oui, sur quelle fréquence et vers quelle destination ?
5. **As-tu déjà un moyen de savoir si le service est down** sans avoir à te connecter en SSH (ex : un uptime monitor externe) ? Sinon c'est le point le plus urgent après le backup, vu la difficulté d'accès SSH rencontrée cette semaine.
6. **Combien de temps peux-tu consacrer aux correctifs avant le début de la phase de test estivale ?** Ça détermine si on vise le §0 uniquement (3 points) ou qu'on descend jusqu'aux points "moyens".

---

## 7. Plan d'action recommandé (ordre suggéré)

**Étape 1 — Aujourd'hui, avant tout usage réel intensif (§0) :**
1. Vérifier/corriger `NODE_ENV` en prod (§1.1) — ⏳ à faire par toi sur le serveur
2. Ajouter `trust proxy` (§1.2) — ✅ fait
3. Mettre en place un cron de backup `spirit.db` (§5.1) — ✅ script prêt, ⏳ cron à installer par toi

**Étape 2 — Cette semaine, robustesse de base :** ✅ **toutes faites** sur la branche `fix/audit-pre-ete-2026`
(+ un bug critique supplémentaire trouvé et corrigé au passage : `POST /api/leaves` était cassé, cf. §0 en tête de document)
4. `try/catch` sur les uploads (§1.3) — ✅ fait
5. Corriger le calcul des jours fériés pour `calendar_days` (§3.1) — ✅ fait
6. Corriger le chevauchement demi-journées (§3.2) — ✅ fait
7. Sécuriser l'acceptation d'échange ciblé (§1.5) — ✅ fait (§3.3/§2.2 — double affectation via `approve` — reste ouvert, voir étape 3)
8. Protéger `/uploads/documents` par authentification (§1.6) — ✅ fait
9. Ajouter feedback d'erreur + protection double-clic sur PlanningView, StaffForm, SwapView, CongesView (§4.1-4.4, §4.7) — ✅ fait

Tests à effectuer avant merge : voir `Doc_techniques/tests_manuels_phase0_1.md`.

**Étape 3 — Avant la rentrée de septembre :**
10. Propager le filtrage journalier des vacances scolaires à `course-slots.js` (§3.6)
11. ~~Corriger le rôle `viewer` (§1.4)~~ — ✅ fait (voir §1.4)
12. Corriger le type `recup` (§3.4) — selon réponse à la question 2
13. Restauration des créneaux après annulation congé/indispo (§3.5)
14. Transactions sur l'approbation de congés (§2.3)
15. Double affectation possible sur échange concurrent (§3.3/§2.2) — non traité en phase 1, à ne pas oublier

**Étape 4 — Quand il y aura du temps :**
Le reste des points "moyen"/"faible" listés ci-dessus, en particulier l'harmonisation `alert()`/`toast` (§4.6) et le nettoyage du code mort (`functions.js` §2.1, `trackActivity` §1.8, tables `timesheets`/`availabilities` §2.6).

---

*Document de travail — à mettre à jour au fur et à mesure des correctifs appliqués (cocher/rayer les points traités).*
