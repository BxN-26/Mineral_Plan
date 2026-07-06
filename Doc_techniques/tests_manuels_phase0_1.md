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

### 1.2 — Mise en place du backup automatisé
**[À FAIRE PAR TOI]**
```bash
# Test manuel du script (à faire une fois après le déploiement du code)
cd /opt/mineral-plan/spirit-v2
DB_PATH=/opt/mineral-plan/spirit-v2/db/spirit.db BACKUP_DIR=/opt/mineral-plan/backups ./scripts/backup-db.sh
ls -la /opt/mineral-plan/backups/
```
Vérifier qu'un fichier `spirit_YYYY-MM-DD_HH-MM-SS.db.gz` apparaît et fait une taille cohérente
(pas 0 octet). Puis installer le cron quotidien (voir commentaire en tête du script pour la ligne crontab exacte) :
```bash
sudo crontab -e
# ajouter la ligne (voir spirit-v2/scripts/backup-db.sh pour le détail) :
0 3 * * * DB_PATH=/opt/mineral-plan/spirit-v2/db/spirit.db BACKUP_DIR=/opt/mineral-plan/backups /opt/mineral-plan/spirit-v2/scripts/backup-db.sh >> /var/log/mineral-spirit-backup.log 2>&1
```
Ce que j'ai déjà testé : le script fonctionne et produit un backup restaurable (vérifié en local avec
une copie de la base de dev — décompression + `sqlite3 .tables` a listé toutes les tables correctement).

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

## 3. Tests à faire toi-même dans le navigateur

Idéalement sur un environnement de dev/staging (`npm run dev` en local, cf. `contexte_reprise.md` §7)
avant tout déploiement en prod. Utilise un compte admin/superadmin pour les tests qui le nécessitent,
et un second compte staff si possible pour les tests de permissions.

### 3.1 — Création de congé (CRITIQUE — bug du §0 ci-dessus)
- [ ] Aller dans **Congés**, cliquer "Nouvelle demande", remplir et envoyer.
- [ ] Attendu : message de succès "Demande de congé envoyée ✓", la demande apparaît dans la liste.
      (Avant le correctif : erreur "Erreur serveur interne" ou équivalent.)
- [ ] Double-cliquer rapidement sur "Envoyer la demande" lors d'une nouvelle demande → vérifier
      qu'une seule demande est créée (pas de doublon), le bouton doit afficher "Envoi…" et se désactiver.

### 3.2 — Congé maladie / jours fériés
- [ ] Créer un congé de type "Maladie" (ou "Accident"/"Sans solde") sur une plage incluant un jour férié
      connu (ex. un futur 14 juillet si disponible dans le calendrier des jours fériés configuré, sinon
      utiliser n'importe quel jour férié déjà présent dans **Configuration → Jours fériés**).
- [ ] Vérifier que `days_count` compte bien le jour férié (ne doit PAS être sauté), contrairement à un
      congé CP/RTT sur la même période qui doit lui exclure le jour férié.

### 3.3 — Demi-journées complémentaires
- [ ] Poser une demi-journée (matin) un jour donné pour un salarié.
- [ ] Poser une seconde demande, demi-journée (après-midi), **même salarié, même jour**.
- [ ] Attendu : la seconde demande doit être acceptée (pas de "Conflit avec un congé existant").
- [ ] Contre-test : poser deux fois la même demi-journée (ex. matin + matin) le même jour → doit être
      rejetée avec le message de conflit.

### 3.4 — Échange de créneau ciblé
- [ ] Créer une demande d'échange en mode "ciblé" vers un collègue précis.
- [ ] Se connecter avec un troisième compte (ni le demandeur, ni la cible) et vérifier qu'il est
      impossible d'accepter cet échange (message "réservé à un autre collègue").
- [ ] Se connecter avec le compte cible et vérifier que l'acceptation fonctionne normalement.

### 3.5 — Justificatif de congé
- [ ] Créer un congé avec justificatif (upload d'un fichier).
- [ ] Cliquer sur le lien "📎 Justificatif" dans la liste des congés → le fichier doit s'ouvrir/télécharger
      normalement pour le salarié concerné et pour un admin/manager.
- [ ] Copier ce lien et essayer de l'ouvrir dans une fenêtre de navigation privée (sans être connecté) →
      doit être refusé (401), plus question d'accès public direct.

### 3.6 — Planning : sauvegarde et messages d'erreur
- [ ] Faire un déplacement de créneau (drag & drop) dans le planning, vérifier que ça se sauvegarde
      normalement (pas de régression).
- [ ] Si possible, couper la connexion réseau juste après un déplacement (ou simuler une session expirée)
      pour vérifier qu'un message d'erreur (toast rouge) apparaît bien au lieu de rien du tout.
- [ ] Créer un modèle de planning ("Enregistrer cette semaine comme modèle"), le supprimer → vérifier
      qu'un message de confirmation/erreur apparaît dans les deux cas.
- [ ] Créer/modifier/supprimer un créneau de cours depuis le panneau latéral → vérifier le même type
      de feedback.

### 3.7 — Création de salarié (anti double-clic)
- [ ] Dans **Équipe**, créer un nouveau salarié. Double-cliquer rapidement sur "Créer le membre".
- [ ] Attendu : un seul salarié créé (pas de doublon dans la liste), le bouton doit afficher
      "Enregistrement…" pendant l'opération.

### 3.8 — Échange de créneau : anti double-clic + feedback
- [ ] Créer une demande d'échange, double-cliquer rapidement sur "Envoyer la demande" → une seule
      demande doit apparaître dans la liste.
- [ ] Sur une demande existante, tester accepter/refuser/approuver avec une erreur provoquée si possible
      (ex. tenter d'agir deux fois de suite très vite) → un message d'erreur clair doit apparaître au lieu
      d'un échec silencieux.

### 3.9 — Rôle `viewer` restreint à ses propres données (si tu as/crées un compte viewer)
- [ ] Se connecter avec un compte `viewer`, aller dans **Congés** → ne doit voir que ses propres demandes.
- [ ] Essayer de consulter la fiche d'un autre salarié (via l'URL ou l'interface équipe si accessible) →
      doit être refusé.
- [ ] Vérifier qu'un compte `viewer` peut toujours consulter sa propre fiche et son propre planning
      normalement (pas de régression sur son propre usage).

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

### [À FAIRE PAR TOI] — Tests navigateur recommandés pour ce second lot
- [ ] **Récup** : poser une demande de congé "récupération d'heures", vérifier que le champ
      "Nombre d'heures" apparaît et fonctionne dans l'UI.
- [ ] **Restauration de créneau** : approuver un congé qui libère un créneau, puis l'annuler →
      vérifier dans le planning que le créneau revient, et que le toast affiche le nombre de
      créneaux restaurés.
- [ ] **Alertes de conflit** : affecter un salarié en congé approuvé sur un créneau planning ou un
      cours → vérifier qu'un toast d'avertissement (pas bloquant) apparaît.
- [ ] **Installeur Electron** (si tu dois réinstaller ou tester l'installeur) : vérifier que l'écran
      final affiche bien deux blocs d'identifiants (admin + superadmin technique), chacun avec son
      bouton "Afficher/Masquer".
- [ ] Un tour rapide de **toutes les suppressions** (équipe, fonction, type de tâche, modèle de
      planning, cours, déclaration d'heures, indisponibilité) pour confirmer que la nouvelle modale
      de confirmation (`ConfirmModal`) s'affiche bien à la place de l'ancienne popup native du
      navigateur.

---

## 4. Avant de merger vers `main`

- [ ] Tous les tests ci-dessus passés (au minimum 3.1, 3.2, 3.3, 3.4, 3.5 qui touchent à des
      corrections de sécurité/logique métier).
- [x] `NODE_ENV=production` confirmé sur le serveur prod (§1.1) — fait le 6 juillet 2026.
- [ ] Backup testé et cron installé (§1.2).
- [ ] `git log` de la branche relu une dernière fois (`git log main..fix/audit-pre-ete-2026`).

Une fois validé, me dire et je préparerai la fusion vers `main` (ou une pull request si tu préfères
relire le diff complet sur GitHub avant).
