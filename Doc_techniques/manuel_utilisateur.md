# minéral Spirit v2 — Manuel d'utilisation

> Destiné aux personnels du club en charge de la gestion RH et du planning  
> Version de référence : **spirit-v2 · v2.1.0** · Mise à jour **4 avril 2026**

---

## Table des matières

1. [Connexion à l'application](#1-connexion-à-lapplication)
2. [Navigation et rôles](#2-navigation-et-rôles)
3. [Mon Planning — Vue personnelle](#3-mon-planning--vue-personnelle)
4. [Planning Équipe — Vue équipe](#4-planning-équipe--vue-équipe)
5. [Planning Général — Vue globale](#5-planning-général--vue-globale)
6. [Planning (éditeur) — Gestion des créneaux](#6-planning-éditeur--gestion-des-créneaux)
7. [Créneaux de cours](#7-créneaux-de-cours)
8. [Indisponibilités](#8-indisponibilités)
9. [Équipe — Gestion des membres](#9-équipe--gestion-des-membres)
10. [Congés — Dépôt et approbation](#10-congés--dépôt-et-approbation)
11. [Relevés — Suivi des heures](#11-relevés--suivi-des-heures)
12. [Statistiques — Analyse RH](#12-statistiques--analyse-rh)
13. [Coûts — Masse salariale](#13-coûts--masse-salariale)
14. [Échanges — Permutations de créneaux](#14-échanges--permutations-de-créneaux)
15. [Mon Profil](#15-mon-profil)
16. [Configuration (admin)](#16-configuration-admin)
17. [Notifications](#17-notifications)
18. [Questions fréquentes (FAQ)](#18-questions-fréquentes-faq)

---

## 1. Connexion à l'application

### Accéder à l'application

Ouvrez votre navigateur et rendez-vous sur l'adresse communiquée par votre administrateur (exemple : `https://planning.mineral-spirit.fr`).

> L'application fonctionne sur tous les navigateurs modernes (Chrome, Firefox, Safari, Edge). Elle est également utilisable sur smartphone et peut être installée comme application (PWA).

### Se connecter

1. Saisissez votre **adresse e-mail professionnelle** dans le champ « E-mail »
2. Saisissez votre **mot de passe** dans le champ « Mot de passe »
3. Cliquez sur **Se connecter**

Si vos identifiants sont incorrects, un message d'erreur s'affiche sous le formulaire.

### Mot de passe oublié ?

Cliquez sur le lien **« Mot de passe oublié ? »** sous le formulaire de connexion :

1. Saisissez votre **adresse e-mail**
2. Cliquez sur **Envoyer le lien**
3. Consultez votre boîte email — un lien valable **15 minutes** vous sera envoyé
4. Cliquez sur le lien, saisissez votre nouveau mot de passe et confirmez

> Si vous ne recevez pas d'email, vérifiez vos spams ou contactez un administrateur. Il peut réinitialiser votre mot de passe directement depuis Configuration → Salariés.

### Premier login — Changement de mot de passe obligatoire

Si votre compte a été créé par un administrateur, un écran de **changement de mot de passe** s'affichera automatiquement à votre première connexion. Vous devez définir un mot de passe personnel avant d'accéder à l'application.

### Se déconnecter

Cliquez sur votre **nom en bas de la barre de navigation gauche**, puis sur **Déconnexion**. Votre session est immédiatement invalidée.

---

## 2. Navigation et rôles

### Barre de navigation

La barre latérale gauche liste les sections accessibles. Les onglets affichés dépendent de votre **rôle** :

| Section | 👤 Staff | 👔 Manager | 🧮 RH | ⚙️ Admin |
|---|:---:|:---:|:---:|:---:|
| Mon Planning | ✓ | ✓ | ✓ | ✓ |
| Planning Équipe | ✓ | ✓ | ✓ | ✓ |
| Planning Général | ✓ | ✓ | ✓ | ✓ |
| Planning (éditeur) | | ✓ | ✓ | ✓ |
| Équipe | | ✓ | ✓ | ✓ |
| Mes congés / Congés | ✓ | ✓ | ✓ | ✓ |
| Relevés | | ✓ | ✓ | ✓ |
| Statistiques | | | ✓ | ✓ |
| Coûts | | | | ✓ |
| Échanges | ✓ | ✓ | ✓ | ✓ |
| Mon Profil | ✓ | ✓ | ✓ | ✓ |
| Configuration | | | | ✓ |

### Badge de notification

Un badge numérique rouge peut apparaître sur certains onglets (ex : **Congés**) pour signaler des demandes en attente d'action de votre part. Une cloche 🔔 en haut à droite ouvre le panneau des notifications.

---

## 3. Mon Planning — Vue personnelle

Cette vue affiche **votre planning personnel** pour la semaine sélectionnée.

### Lire la vue

- Chaque colonne correspond à un **jour de la semaine**
- Chaque créneau indique la **fonction exercée**, les **heures de début et de fin**, et le type de tâche associé si renseigné
- Les **congés approuvés** apparaissent en surbrillance distincte (hachurage coloré avec l'intitulé du type de congé)
- Les **créneaux de cours** (encadrements escalade) se distinguent par un fond pointillé et le tampon **COURS**
- Les **indisponibilités** apparaissent en surbrillance grisée avec la mention du motif
- Les **jours fériés** ont l'en-tête de colonne surlignté en **rouge** avec le nom du jour férié
- Les **vacances scolaires** ont l'en-tête surligné en **indigo/violet** avec le nom de la période

### Naviguer dans le temps

- Utilisez les flèches **← →** pour passer d'une semaine à l'autre
- Cliquez sur la date affichée pour revenir à la **semaine courante**

### Mode Semaine / Jour

Un toggle **Semaine / Jour** en haut à gauche permet de basculer entre :
- Vue **Semaine** : 7 colonnes côte à côte
- Vue **Jour** : un seul jour en pleine largeur, avec navigation jour par jour

> En tant que staff, vous ne pouvez pas modifier votre planning depuis cette vue. Adressez-vous à votre responsable pour toute demande de modification.

---

## 4. Planning Équipe — Vue équipe

Cette vue affiche le planning de **votre équipe** (ou de vos équipes) sur la semaine sélectionnée.

### Lire la vue

- Chaque **ligne** représente un membre de l'équipe
- Chaque **colonne** représente un jour de la semaine
- Chaque cellule affiche les créneaux du salarié sur ce jour, avec la fonction et l'horaire
- Les **cours** s'affichent avec le tampon COURS + fond pointillé
- Les **congés** sont représentés avec un hachurage coloré + libellé
- Les **jours fériés** ont l'en-tête de colonne surligné en **rouge** avec le nom du jour (ex : « Lundi de Pâques »)
- Les **vacances scolaires** ont l'en-tête surligné en **indigo/violet** avec le nom de la période (ex : « Vacances de printemps »)

### Filtres disponibles

**Chips équipes** (en haut, deuxième ligne) : quand vous avez accès à plusieurs équipes, des badges colorés permettent de filtrer par équipe. Cliquer sur un badge active/désactive cette équipe. Un seul clic sur « Tout afficher » remet tout à zéro.

> Pour les membres appartenant à **plusieurs équipes** : seules les fonctions configurées pour l'équipe sélectionnée sont affichées (configurable dans Configuration → Équipes → ✏️ → Fonctions affichées).

**Chips membres** (troisième ligne) : des badges nominatifs permettent de masquer/afficher individuellement chaque membre. Le badge **Tout masquer** / **Tout afficher** agit sur tous d'un coup. Un compteur `X/Y membres` indique la sélection active.

### Mode Semaine / Jour

Même fonctionnement que dans Mon Planning (toggle en haut à gauche).

---

## 5. Planning Général — Vue globale

Cette vue en lecture seule donne une vision **transversale** du planning de toutes les équipes et de toutes les fonctions sur une semaine donnée.

### Lire la vue

- L'axe horizontal représente les **jours + créneaux horaires**
- L'axe vertical liste les **membres par fonction**
- Les congés, cours et indisponibilités sont représentés avec leur hachurage/couleur spécifique
- Un mode **Tout** affiche la totalité des fonctions ; les onglets par fonction permettent de zoomer
- Les **jours fériés** sont signalés par des en-têtes de colonnes **rouges**, les **vacances scolaires** en **indigo**

Elle est utile pour vérifier la couverture globale sans entrer dans l'édition.

---

## 6. Planning (éditeur) — Gestion des créneaux

> Accessible aux rôles **Manager, RH, Admin**

Cet éditeur permet de créer, modifier et supprimer des créneaux de travail pour tous les membres.

### Interface

- L'éditeur est organisé par **fonction** (onglets ou liste déroulante) et par **semaine**
- Chaque colonne représente un jour, chaque ligne un membre de la fonction
- Les **cercles de couleur** dans les cellules représentent les créneaux existants
- Les **conflits** (chevauchements, amplitude excessive, temps de repos insuffisant) sont signalés visuellement

### Ajouter un créneau

1. Sélectionnez la **semaine** et la **fonction**
2. Cliquez dans la cellule du membre/jour souhaité
3. Dans le panneau latéral ou la modale, renseignez :
   - **Heure de début** et **heure de fin**
   - **Type de tâche** (liste configurable dans Configuration → Tâches)
4. Cliquez sur **Enregistrer**

### Modifier / Supprimer un créneau

Cliquez sur un créneau existant pour l'ouvrir. Modifiez les champs puis **Enregistrer**, ou cliquez sur l'icône 🗑 pour supprimer.

### Utiliser un modèle de planning

Si des modèles ont été créés dans la Configuration, un bouton **Appliquer un modèle** est disponible en haut de l'éditeur. Il permet de pré-remplir la semaine en un clic.

### Alertes automatiques

L'éditeur vérifie en temps réel :
- **Chevauchements** de créneaux sur le même salarié/jour
- **Amplitude maximale** dépassée (configurable, par défaut 12 h)
- **Temps de repos minimum** non respecté entre deux jours (configurable, par défaut 11 h)

Ces alertes sont informatives — elles n'empêchent pas l'enregistrement.

---

## 7. Créneaux de cours

> Accessible à la configuration par **Admin**. Visible dans toutes les vues planning.

Les **créneaux de cours** représentent les sessions d'escalade encadrée (cours collectifs, niveaux débutants à avancés, bébés-grimpeurs…). Ils sont distincts des créneaux de travail ordinaires.

### Visuel

Dans toutes les vues planning, un créneau de cours se reconnaît à :
- Un **fond à motif de points** (radial-gradient)
- Le tampon **COURS** en lettres inclinées dans le bloc
- La couleur de la fonction d'encadrement (moniteur, encadrant, etc.)

### Configurer les créneaux de cours (admin)

1. Dans l'éditeur de planning (**Planning**), cliquez sur **🎓 Cours** (bouton en haut à droite, visible si votre équipe a le droit cours activé)
2. La modale liste tous les créneaux de cours de la fonction active
3. Vous pouvez **créer** un créneau de cours : nom du groupe, jour, horaire, niveau, capacité, couleur
4. En cliquant sur un cours dans la modale, vous pouvez **assigner des moniteurs** à ce créneau pour la semaine en cours

### Assigner un moniteur (admin)

1. Cliquez sur un créneau de cours existant dans la modale
2. Cochez les **moniteurs disponibles** dans la liste
3. Enregistrez — le cours apparaît dans le planning du moniteur avec le tampon COURS

### Fonctions activées pour les cours

Seules les fonctions listées dans **Configuration → Paramètres planning → Fonctions cours** affichent les bandes de cours. Par défaut : `moniteur`, `encadrant`.

---

## 8. Indisponibilités

Cette section permet aux salariés de déclarer des **indisponibilités récurrentes ou ponctuelles** (rendez-vous médical, contrainte personnelle), visibles dans le planning sans créer un congé formel.

### Déclarer une indisponibilité

1. Accédez à **Mon Profil** ou au module dédié (si activé)
2. Renseignez le créneau (jour, horaire ou journée) et le motif
3. Soumettez

Selon la configuration du club (`unavailability_approval_required`), les indisponibilités peuvent nécessiter une validation par le manager.

### Visuel dans le planning

Les plages d'indisponibilité apparaissent avec un **fond hachuré grisé** et la mention du motif, de façon à ce que le planificateur en tienne compte lors de la saisie des créneaux.

---

## 9. Équipe — Gestion des membres

> Accessible aux rôles **Manager, RH, Admin**

### Voir les membres

La liste des membres affiche leur nom, photo, rôle, fonction principale, équipes d'appartenance et statut.

### Ajouter / retirer un membre d'une équipe

Les membres sont rattachés aux équipes depuis la fiche salarié dans **Configuration → Salariés**. Un salarié peut appartenir à **plusieurs équipes** simultanément.

### Salariés multi-équipes

Un salarié peut être membre de plusieurs équipes (ex : Jean-Loup en Direction ET Enseignement). Dans ce cas :
- Il apparaît dans les vues de **toutes ses équipes**
- Quand un filtre équipe est actif, seules les fonctions configurées pour cette équipe sont affichées pour lui (évite d'afficher ses créneaux d'une autre équipe)

---

## 10. Congés — Dépôt et approbation

### Pour tous — Déposer une demande

1. Cliquez sur **Mes congés** dans la navigation
2. Cliquez sur **Nouvelle demande**
3. Renseignez :
   - **Type de congé** (Congés payés, RTT, Formation, Maladie, etc.)
   - **Date de début** et **date de fin**
   - **Commentaire** (facultatif)
4. Cliquez sur **Soumettre**

Votre demande apparaît avec le statut **En attente**.

### Suivre l'état de vos demandes

| Statut | Signification |
|---|---|
| ⏳ En attente | En cours de traitement par votre responsable |
| ✅ Approuvé | Congé validé — apparaît dans votre planning |
| ❌ Refusé | Congé refusé — un motif peut être précisé |
| 🔄 Partiellement approuvé | Premier niveau validé, en attente du suivant |

Un congé approuvé est immédiatement visible dans toutes les vues planning avec un hachurage coloré correspondant au type de congé.

### Annuler une demande

Vous pouvez **annuler une demande en attente** en cliquant sur l'icône d'annulation à côté de la demande. Les demandes déjà approuvées nécessitent une action du manager.

---

### Pour les managers — Approuver ou refuser

Lorsqu'un membre de votre équipe soumet une demande, un **badge numérique** apparaît sur l'onglet **Congés**.

1. Cliquez sur **Congés** → onglet **À traiter**
2. Pour chaque demande : consultez le type, les dates, le salarié concerné
3. Cliquez sur **Approuver** ou **Refuser**
4. Vous pouvez ajouter un **commentaire** visible par le salarié

> **Admin et Superadmin** peuvent approuver à n'importe quelle étape de la chaîne, même sans être le valideur désigné.

### Chaîne d'approbation multi-niveaux

Certains types de congé (configurables par un admin) nécessitent plusieurs niveaux d'approbation :

- **Niveau 1 (N+1)** : le manager direct
- **Niveau 2 (N+2)** : le RH ou N+2
- **Niveau 3 (N+3)** : la Direction

La demande n'est **définitivement approuvée** qu'après validation de tous les niveaux configurés pour ce type.

Lorsqu'un créneau planifié est couvert par un congé approuvé, ce créneau est **automatiquement libéré** (supprimé du planning) pour éviter les doublons.

---

## 11. Relevés — Suivi des heures

> Accessible aux rôles **Manager, RH, Admin**

### Consulter les relevés

1. Sélectionnez la **période** (semaine, mois ou plage personnalisée)
2. Filtrez éventuellement par **équipe**
3. Le tableau affiche pour chaque salarié : total heures, répartition par fonction

### Exporter

Un bouton **Exporter (CSV)** permet de télécharger les données pour les intégrer dans un outil extérieur (paie, comptabilité).

---

## 12. Statistiques — Analyse RH

> Accessible aux rôles **RH, Admin**

Le tableau de bord statistiques présente des indicateurs clés :

- **Taux de présence** par semaine / par équipe
- **Répartition des fonctions** (quelle part du temps sur chaque poste)
- **Évolution des congés** (posés vs. approuvés vs. refusés)
- **Heures par salarié** sur une période glissante

Utilisez les filtres en haut de page (période, équipe, salarié) pour affiner les résultats.

---

## 13. Coûts — Masse salariale

> Accessible au rôle **Admin** uniquement

Cette vue simule la **masse salariale** en croisant les heures de planning avec les taux horaires configurés pour chaque fonction.

### Utilisation

1. Sélectionnez la période
2. Filtrez par équipe si besoin
3. Le tableau affiche le coût estimé par salarié et par fonction, avec et sans charges patronales
4. Le coefficient de charges (`rh_default_charge_rate`, par défaut 45 %) est configurable dans Configuration → Fiscal

> Il s'agit d'une **simulation** basée sur le planning saisi. Les absences non planifiées ne sont pas prises en compte automatiquement.

---

## 14. Échanges — Permutations de créneaux

Cette section permet à deux salariés de **proposer et accepter un échange de créneaux**.

### Proposer un échange

1. Cliquez sur **Échanges** → **Nouvelle demande**
2. Sélectionnez :
   - **Votre créneau** à céder (fonction, plage horaire, date)
   - **Le salarié** avec qui vous souhaitez échanger
   - **Son créneau** que vous acceptez de reprendre
3. Ajoutez un **message** si besoin et soumettez

### Répondre à une proposition

Une notification apparaît quand un collègue vous propose un échange. Dans la liste des échanges entrants, cliquez **Accepter** ou **Refuser**.

### Alerte urgence

Si un échange porte sur un créneau dans les **24 heures** (délai configurable), une alerte visuelle signale l'urgence au responsable concerné.

### Validation par un responsable

Selon la configuration (`swap_approval_level`), un échange peut nécessiter une validation par le Manager, la RH ou la Direction avant d'être effectif dans le planning.

---

## 15. Mon Profil

Accessible depuis votre nom en bas de la barre de navigation.

### Informations disponibles

- Nom, prénom, email, photo
- Rôle, fonctions actives et équipes d'appartenance
- Manager direct (N+1) et hiérarchie

### Changer votre mot de passe

1. Dans **Mon Profil**, cliquez sur **Changer le mot de passe**
2. Saisissez votre **mot de passe actuel**
3. Saisissez et confirmez le **nouveau mot de passe** (8 caractères minimum)
4. Cliquez sur **Enregistrer**

> Un administrateur peut également réinitialiser votre mot de passe depuis **Configuration → Salariés**. Dans ce cas, vous serez invité à le changer dès votre prochaine connexion.

### Changer votre photo de profil

Cliquez sur votre avatar pour uploader une nouvelle image. Les formats JPG, PNG et WebP sont acceptés. L'image est automatiquement recadrée en carré.

### Activer / désactiver les notifications push

Dans la section **Notifications** de votre profil, un bouton permet d'activer ou désactiver les notifications push du navigateur pour votre compte.

---

## 16. Configuration (admin)

> Accessible au rôle **Admin** uniquement

La page Configuration regroupe tous les paramètres de l'application répartis en onglets.

---

### Onglet Organigramme

Cet onglet gère la **hiérarchie** et les **chaînes d'approbation**.

#### Arbre hiérarchique

Visualisez l'organigramme du club. Chaque salarié est affiché avec son rôle, ses équipes et ses subordonnés.

#### Assigner les managers (N+1)

Un tableau liste tous les salariés avec un menu déroulant pour choisir le **manager direct**. Les niveaux N+2 et N+3 sont calculés automatiquement. Sélectionnez **« Aucun »** pour retirer un manager.

#### Configurer la chaîne d'approbation par type de congé

Pour chaque type de congé, activez ou désactivez les niveaux :
- **Manager (N+1)** — approbation par le manager direct
- **RH (N+2)** — approbation supplémentaire
- **Direction (N+3)** — validation finale

#### Approbation des échanges

Un sélecteur définit qui valide les échanges de créneaux : **Manager**, **RH** ou **Direction**.

---

### Onglet Équipes

Gérez les équipes du club :

- **Créer** une équipe (nom, slug)
- **Modifier** le nom, activer/désactiver le bouton **🎓 Cours** (permet à l'équipe de gérer des créneaux de cours)
- **Fonctions affichées** : sélectionnez les fonctions rattachées à cette équipe. Ces fonctions servent à filtrer les créneaux des membres multi-équipes dans la vue Planning Équipe. Laissez vide pour n'appliquer aucune restriction.
- **Supprimer** une équipe

---

### Onglet Fonctions

Gérez les postes exercés dans le club :

- **Créer** une fonction (nom, slug, icône, couleurs, types de personnel autorisés)
- Associer un **taux horaire** et un **nombre de personnes minimum/maximum** par créneau
- **Modifier** / **Supprimer**

---

### Onglet Tâches

Gérez les **types de tâches** associables aux créneaux dans l'éditeur de planning :

- Exemples : Permanence, Formation, Réunion, Entretien…
- Chaque type de tâche peut être associé à **une ou plusieurs fonctions**
- Il s'affiche comme étiquette colorée sur le créneau concerné

---

### Onglet Congés

Gérez les types de congés :

- **Activer / désactiver** un type
- **Créer** un nouveau type (nom, couleur, solde annuel par défaut)
- **Modifier** le solde par défaut

La chaîne d'approbation se configure dans l'onglet **Organigramme**.

---

### Onglet Salariés

Gérez l'ensemble des comptes du personnel :

- **Voir** la liste des salariés actifs et inactifs
- **Créer** un compte salarié :
  1. Cliquez sur **Nouveau salarié**
  2. Renseignez : nom, prénom, e-mail, rôle, équipe(s), fonctions, mot de passe initial
  3. Enregistrez
- **Modifier** : nom, rôle, équipes, fonctions, taux horaire, contrat
- **Désactiver** : le salarié ne peut plus se connecter mais l'historique est conservé

> Un salarié peut appartenir à **plusieurs équipes** (cocher plusieurs équipes dans sa fiche). Sa liste de fonctions peut aussi couvrir plusieurs équipes.

---

### Onglet Paramètres planning

Paramètres propres à l'affichage du planning :

| Paramètre | Description |
|---|---|
| Heure d'ouverture / fermeture | Plage horaire visible dans les vues planning |
| Amplitude maximale | Alerte si un salarié dépasse X heures dans la journée |
| Repos minimum entre deux jours | Alerte si le temps entre la fin d'un jour et le début du suivant est insuffisant |
| Fonctions cours | Slugs des fonctions pour lesquelles les créneaux de cours sont affichés |
| Groupement planning général | Grouper par fonction, par équipe, ou les deux |

---

### Onglet Fiscal

Paramètres utilisés pour le calcul des coûts :

| Paramètre | Description |
|---|---|
| Coefficient de charges patronales | Ex : 1.42 = 42 % de charges en sus du brut |
| Année fiscale | Type (calendaire / personnalisée), mois et jour de début |
| Devise | EUR par défaut |

---

### Onglet RH

Paramètres des congés et contrats :

| Paramètre | Description |
|---|---|
| Méthode de décompte | Jours calendaires ou jours ouvrés |
| Solde CP par défaut | 25 jours |
| Solde RTT par défaut | 5 jours |
| Préavis minimum congés | Délai minimum entre la demande et la date de début |
| Types de contrats actifs | Horaire hebdo / Annualisé / Sans base horaire |

---

### Onglet Système

Paramètres généraux :

| Paramètre | Description |
|---|---|
| Nom du club | Affiché dans l'interface |
| Thème | Clair (light) ou sombre (dark) |
| Début de semaine | Lundi (par défaut) ou dimanche |
| Fuseau horaire | Europe/Paris par défaut |
| Notifications push | Activer/désactiver globalement |

---

### Onglet Modèles

Créez et gérez des **modèles de planning réutilisables** :

- Définissez une semaine type par fonction
- Appliquez le modèle en un clic depuis l'éditeur de planning

---

## 17. Notifications

### Activer les notifications

Lors de votre première visite, le navigateur peut vous demander l'autorisation d'envoyer des notifications push. Acceptez pour recevoir des alertes en temps réel même lorsque l'onglet est fermé.

Vous pouvez activer/désactiver les notifications depuis **Mon Profil → Notifications** ou en cliquant sur la 🔔 en haut à droite.

### Panneau de notifications

La 🔔 en haut à droite de l'interface ouvre un panneau qui liste les dernières notifications non lues. Un badge orange indique le nombre de notifications non lues. Cliquer sur une notification vous amène directement à la section ou à la semaine concernée.

### Types d'événements notifiés

| Événement | Destinataire |
|---|---|
| Nouvelle demande de congé déposée | Manager concerné |
| Congé approuvé | Salarié demandeur |
| Congé refusé | Salarié demandeur |
| Nouvelle proposition d'échange | Salarié ciblé |
| Échange accepté / refusé | Salarié proposant |
| Créneau libéré automatiquement (congé approuvé) | Manager concerné |
| Échange urgent (< 24 h) | Responsable d'approbation |

---

## 18. Questions fréquentes (FAQ)

**Je ne vois pas un salarié dans les listes.**  
→ Vérifiez que son compte est **actif** et qu'il est bien rattaché à une équipe (Configuration → Salariés → ✏️).

**J'ai oublié mon mot de passe.**  
→ Contactez votre administrateur. Il peut réinitialiser votre mot de passe depuis Configuration → Salariés.

**Une demande de congé est bloquée en « En attente » depuis longtemps.**  
→ Vérifiez quelle étape attend une action (visible sur la demande). Relancez le responsable concerné. Les admins peuvent approuver à n'importe quelle étape.

**Je ne reçois pas de notifications.**  
→ Vérifiez que les notifications sont **autorisées dans les paramètres de votre navigateur**. Vérifiez aussi que les notifications Push sont activées dans Configuration → Système.

**Le planning d'un salarié est vide.**  
→ Les créneaux sont saisis manuellement dans **Planning (éditeur)**. Vérifiez la semaine et la fonction sélectionnées.

**Jean-Loup (multi-équipes) affiche des créneaux d'une autre équipe quand je filtre.**  
→ Dans Configuration → Équipes → ✏️, configurez les **Fonctions affichées** de chaque équipe. Seules les fonctions cochées seront visibles pour les membres multi-équipes de cette équipe.

**Les cours n'apparaissent pas.**  
→ Vérifiez que la fonction du cours est listée dans **Configuration → Paramètres planning → Fonctions cours** (par défaut `moniteur`, `encadrant`). Vérifiez aussi que des moniteurs sont bien assignés au cours pour cette semaine.

**Comment exporter les données pour la paie ?**  
→ Allez dans **Relevés**, sélectionnez la période et cliquez sur **Exporter (CSV)**.

**Un type de congé n'apparaît pas dans le formulaire.**  
→ Ce type a peut-être été désactivé. Un administrateur peut le réactiver depuis Configuration → Congés.

**Comment changer le thème sombre/clair ?**  
→ Configuration → Système → Thème. Le changement est global pour tous les utilisateurs.

**Les jours fériés ne s'affichent pas dans le planning.**  
→ Allez dans Configuration → Jours fériés → **Synchroniser depuis l’API**. Si votre club est en DOM-TOM, sélectionnez d'abord la bonne zone.

**Les vacances scolaires ne s'affichent pas.**  
→ Allez dans Configuration → Vacances scolaires, vérifiez que la bonne zone (A, B ou C) est sélectionnée, puis cliquez **Synchroniser**.

**Comment installer l'application sur mon téléphone ?**  
→ Dans Chrome/Safari sur mobile, utilisez le menu du navigateur → « Ajouter à l'écran d'accueil ». L'application fonctionne ensuite comme une app native (PWA).

---

*Pour toute demande d'assistance technique, contacter l'administrateur système du club.*
