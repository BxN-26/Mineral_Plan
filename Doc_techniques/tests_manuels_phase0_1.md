# Tests manuels avant merge — Phase 0 + Phase 1 (branche `fix/audit-pre-ete-2026`)

> À faire avant de fusionner cette branche vers `main` puis de la déployer en prod.
> Périmètre : correctifs listés dans `audit_pre_ete_2026.md` §0 et §1, plus un bug critique
> supplémentaire trouvé en cours de route (voir §0 ci-dessous).
> Ce que j'ai déjà testé moi-même (automatisé, décrit dans chaque section) n'a pas besoin
> d'être refait — seuls les tests marqués **[À FAIRE PAR TOI]** nécessitent ton action.

---

## 0. Bug critique trouvé en plus de l'audit initial

En corrigeant §1.5 (protection des documents), je suis tombé sur un bug **indépendant de l'audit** :
`POST /api/leaves` (créer une nouvelle demande de congé) était **complètement cassé** — `db_.transaction`
n'existe pas sur l'objet `db_` (seule `db_.tx` existe). Chaque tentative de créer un congé plantait
avec une 500, en prod comme partout. Corrigé dans le même commit que §1.3/§1.5 (fichier `routes/leaves.js`).

**[À FAIRE PAR TOI]** — Vérifier en priorité que la création de congé fonctionne bien après déploiement
(section 3 ci-dessous, test 3.1).

---

## 1. Vérifications côté serveur (avant ou après déploiement du code)

### 1.1 — NODE_ENV en production — ✅ **Vérifié le 6 juillet 2026 : `NODE_ENV=production`, déjà correct.**

### 1.2 — Mise en place du backup automatisé — ✅ **Fait le 6 juillet 2026**
Script installé sur le serveur (`/opt/mineral-plan/spirit-v2/scripts/backup-db.sh`, récupéré depuis
`origin/fix/audit-pre-ete-2026` sans attendre la fusion) et cron quotidien 3h configuré, vérifié
avec `sudo crontab -l`.

**⏳ Reste à faire [À FAIRE PAR TOI]** — synchroniser `/opt/mineral-plan/backups` vers un stockage
distant (rsync/rclone). Un backup qui reste sur le même disque que le serveur ne protège pas d'une
panne totale du VPS.

### 1.3 — trust proxy / rate limiting
Difficile à tester manuellement de façon fiable sans un vrai second poste derrière le même reverse proxy.
**[À FAIRE PAR TOI, optionnel]** — Si tu veux vérifier concrètement : après déploiement, demande à un
collègue de se tromper volontairement de mot de passe 10 fois de suite sur son propre compte, puis vérifie
immédiatement après que **toi** (depuis un autre appareil/IP) peux toujours te connecter sans être bloqué.
Avant le correctif, tu aurais été bloqué aussi (rate limit partagé) ; après le correctif, seul le compte
fautif (ou plutôt son IP) doit être temporairement bloqué.

---

## 2. Ce que j'ai déjà testé automatiquement (backend)

Pour information — pas besoin de refaire, détaillé ici pour transparence :

- **Upload avatar avec image corrompue** : confirmé qu'avant le correctif, une exception non catchée
  dans un handler `async` fait planter tout le process Node (reproduit avec un test isolé, exit code 1,
  serveur mort). Après correctif : upload d'une fausse image JPEG corrompue → réponse 500 propre,
  serveur toujours vivant juste après (vérifié par une requête de suivi qui répond 200).
- **Calcul jours fériés `calendar_days`** : vérifié en isolant la fonction `calcDays` — un congé maladie
  du 10 au 20 juillet (qui inclut le 14 juillet, férié) compte maintenant 11 jours au lieu de 10.
- **Chevauchement demi-journées** : vérifié la fonction `leavesConflict` sur 4 scénarios (AM+PM même jour
  = pas de conflit, AM+AM même jour = conflit, journée complète + demi-journée = conflit, chevauchement
  réel multi-jours = conflit). Les 4 cas donnent le résultat attendu.
- **Acceptation d'échange ciblé** : testé en conditions réelles (serveur de dev + 3 comptes : demandeur,
  cible désignée, collègue tiers). Le collègue tiers reçoit bien un 403 en tentant d'accepter ; la cible
  désignée peut accepter normalement (`matched`).
- **Protection des documents justificatifs** : testé en conditions réelles — l'ancienne URL statique
  ne sert plus le fichier (fallback SPA, donc plus jamais le PDF) ; sans cookie → 401 ; salarié tiers
  non privilégié → 403 ; propriétaire du congé → 200 ; rôle admin/manager → 200 (accès normal).
- **Création de congé (bug `db_.tx`)** : confirmé cassé avant correctif (500 systématique), fonctionnel
  après (`201`, `days_count` correct).
- **Rôle `viewer` restreint à ses propres données (§1.4)** : testé en conditions réelles avec un compte
  `viewer` dédié. Liste des congés → ne voit plus les congés d'un collègue (0 vu au lieu de les voir tous) ;
  fiche salarié d'un collègue → 403 (sa propre fiche → 200 normal) ; création de congé ou d'indisponibilité
  au nom d'un autre salarié → 403 ; stats → limitées à ses propres heures.

Ce que je **n'ai pas** pu tester : le rendu visuel réel dans un navigateur (pas d'outil de navigateur
automatisé disponible dans cette session). Tout ce qui suit à la section 3 nécessite un test humain
dans l'interface.

---

## 3. Tests à faire toi-même dans le navigateur — ✅ **TOUS PASSÉS le 6 juillet 2026** (test en local, branche `fix/audit-pre-ete-2026`, serveur Express servant `frontend/dist`)

> **2 bugs préexistants (non liés à l'audit) trouvés et corrigés pendant ces tests :**
> - `ReferenceError: settings is not defined` puis `publicHolidays is not defined` dans
>   `NewLeaveModal` (CongesView.jsx) — jamais reçus ni importés, présents depuis bien avant
>   l'audit, jamais remarqués car ce chemin de code (ouverture de "Nouvelle demande") semble
>   n'avoir jamais été exercé en pratique.
> - `ReferenceError: ConfirmModal is not defined` dans `PlanningView.jsx` — régression introduite
>   pendant le travail d'harmonisation §4.6 (import oublié).
> Les deux corrigés et vérifiés par balayage ESLint (`no-undef`) sur tout le frontend.

### 3.1 — Création de congé (CRITIQUE — bug du §0 ci-dessus) — ✅ validé
- [x] Nouvelle demande créée sans erreur, toast de succès affiché.
- [x] Double-clic sans conséquence (une seule demande créée).

### 3.2 — Congé maladie / jours fériés — ✅ validé
- [x] Congé "Arrêt maladie" du 08/07 au 16/07/2026 (incluant le 14 juillet, Fête Nationale) →
      9 jours calculés, correct (jour férié bien compté).

### 3.3 — Demi-journées complémentaires — ✅ validé

### 3.4 — Échange de créneau ciblé — ✅ validé (chaîne complète testée, planning inclus)
- [x] Tiers non concerné : n'a même pas vu l'échange dans sa liste (protection encore plus stricte
      que prévu — un échange ciblé n'apparaît que pour le demandeur et la cible).
- [x] Cible désignée a bien pu accepter puis le manager approuver, avec transfert réel du créneau
      planning de l'un vers l'autre (vérifié en base).

### 3.5 — Justificatif de congé — ✅ validé (accès propriétaire OK, accès anonyme refusé)

### 3.6 — Planning : sauvegarde et messages d'erreur — ✅ validé (les 3 sous-points : drag & drop,
      modèle de planning, créneau de cours)

### 3.7 — Création de salarié (anti double-clic) — ✅ validé

### 3.8 — Échange de créneau : anti double-clic + feedback — ✅ validé

### 3.9 — Rôle `viewer` restreint à ses propres données — ✅ validé (compte de test dédié créé en local)

---

## 3bis. Second lot de correctifs (autopilot — tout le reste de l'audit)

> Tous les points restants de `audit_pre_ete_2026.md` (§1.7-1.8, §2.1-2.6, §3.3-3.9, §4.5-4.10,
> §5.2/5.5) ont été traités. Chaque correctif a été testé par mes soins en conditions réelles
> (serveur de dev + comptes multiples via curl/sqlite3), détaillé dans les messages de commit.
> Résumé de ce qui a été vérifié automatiquement :
> - CSP appliquée sans erreur au démarrage
> - Timing constant sur login (email inconnu vs mauvais mot de passe)
> - Rejeu de refresh token → révocation en cascade de toutes les sessions
> - `functions.js` bulk endpoint : 200 au lieu de 500
> - Swap : transaction sur approve (409 si créneau introuvable, succès si présent), doublon de
>   demande sur le même créneau refusé (409), verrou optimiste sur respond
> - Congé récup : rejet sans heures (400), `hours_count` bien stocké
> - Cycle complet libération → annulation → restauration d'un créneau planning
> - Filtrage vacances scolaires jour par jour (cours actif un jour, inactif un autre jour de la
>   même semaine selon le calendrier)
> - Alerte de conflit (planning/cours/swap) quand le salarié a un congé approuvé ce jour-là
> - Alerte urgente de swap rattrapée pour une échéance déjà passée
> - Garde-fou demi-journée double sur un seul jour (400)
> - Capacité de cours (1/1 puis refus du 2e)
> - Migration : erreurs maintenant journalisées (testé : démarrage propre)

### Tests navigateur pour ce second lot — ✅ **TOUS PASSÉS le 6 juillet 2026**
- [x] **Récup** : champ "Nombre d'heures" apparaît et fonctionne.
- [x] **Restauration de créneau** : cycle libération → annulation → réapparition du créneau confirmé
      (données vérifiées en base ; la confusion initiale de l'utilisateur venait d'un onglet planning
      resté ouvert sans rechargement — voir note temps réel ci-dessous, pas un bug de données).
- [x] **Alertes de conflit** : toast d'avertissement confirmé sur affectation d'un salarié en congé.
- [x] Tour des suppressions (équipe, fonction, type de tâche) : `ConfirmModal` partout, OK.
- [ ] **Installeur Electron** — non testé (pas de réinstallation prévue pour l'instant).

**Point important soulevé pendant les tests (hors périmètre de l'audit)** : la vue planning ne se
rafraîchit pas automatiquement quand un autre utilisateur modifie les données (pas de temps réel).
Jugé indispensable par le porteur du projet — noté dans `contexte_reprise.md` §9 pour être priorisé
après cette série de tests.

---

## 4. Avant de merger vers `main`

- [x] Tous les tests passés le 6 juillet 2026 (3.1 à 3.9 + second lot), en local sur la branche.
- [x] `NODE_ENV=production` confirmé sur le serveur prod (§1.1) — fait le 6 juillet 2026.
- [x] Backup testé et cron installé (§1.2) — fait le 6 juillet 2026.
- [ ] `git log` de la branche relu une dernière fois (`git log main..fix/audit-pre-ete-2026`).

Une fois validé, me dire et je préparerai la fusion vers `main` (ou une pull request si tu préfères
relire le diff complet sur GitHub avant).
