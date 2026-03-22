# minéral Spirit v2 — Manuel d'utilisation

> Destiné aux personnels du club en charge de la gestion RH et du planning  
> Version de référence : **spirit-v2** · Mars 2026

---

## Table des matières

1. [Connexion à l'application](#1-connexion-à-lapplication)
2. [Navigation et rôles](#2-navigation-et-rôles)
3. [Mon Planning — Vue personnelle](#3-mon-planning--vue-personnelle)
4. [Planning Équipe — Vue équipe](#4-planning-équipe--vue-équipe)
5. [Planning Général — Vue globale](#5-planning-général--vue-globale)
6. [Planning (éditeur) — Gestion des créneaux](#6-planning-éditeur--gestion-des-créneaux)
7. [Équipe — Gestion des membres](#7-équipe--gestion-des-membres)
8. [Congés — Dépôt et approbation](#8-congés--dépôt-et-approbation)
9. [Relevés — Suivi des heures](#9-relevés--suivi-des-heures)
10. [Statistiques — Analyse RH](#10-statistiques--analyse-rh)
11. [Coûts — Masse salariale](#11-coûts--masse-salariale)
12. [Échanges — Permutations de créneaux](#12-échanges--permutations-de-créneaux)
13. [Mon Profil](#13-mon-profil)
14. [Configuration (admin)](#14-configuration-admin)
15. [Notifications](#15-notifications)
16. [Questions fréquentes (FAQ)](#16-questions-fréquentes-faq)

---

## 1. Connexion à l'application

### Accéder à l'application

Ouvrez votre navigateur et rendez-vous sur l'adresse communiquée par votre administrateur (exemple : `https://planning.mineral-spirit.fr`).

> L'application fonctionne sur tous les navigateurs modernes (Chrome, Firefox, Safari, Edge). Elle est également utilisable sur smartphone.

### Se connecter

1. Saisissez votre **adresse e-mail professionnelle** dans le champ « E-mail »
2. Saisissez votre **mot de passe** dans le champ « Mot de passe »
3. Cliquez sur **Se connecter**

Si vos identifiants sont incorrects, un message d'erreur s'affiche sous le formulaire. Contactez l'administrateur si vous avez oublié votre mot de passe.

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

Un badge numérique rouge peut apparaître sur certains onglets (ex : **Congés**) pour signaler des demandes en attente d'action de votre part.

---

## 3. Mon Planning — Vue personnelle

Cette vue affiche **votre planning personnel** pour la semaine sélectionnée.

### Lire la vue

- Chaque colonne correspond à un **jour de la semaine**
- Chaque créneau indique la **fonction exercée**, les **heures de début et de fin**
- Les jours de congé approuvés apparaissent en surbrillance distincte

### Naviguer dans le temps

- Utilisez les flèches **← →** pour passer d'une semaine à l'autre
- Cliquez sur la date affichée pour revenir à la **semaine courante**

> En tant que staff, vous ne pouvez pas modifier votre planning depuis cette vue. Adressez-vous à votre responsable pour toute demande de modification.

---

## 4. Planning Équipe — Vue équipe

Cette vue affiche le planning de **votre équipe** (ou de vos équipes si vous en managez plusieurs) sur la semaine sélectionnée.

### Lire la vue

- Les lignes représentent **les membres de l'équipe**
- Les colonnes représentent **les jours de la semaine**
- Chaque cellule affiche les créneaux du salarié sur ce jour

### Changer d'équipe

Si vous appartenez à plusieurs équipes, un sélecteur en haut de page vous permet de basculer entre elles.

---

## 5. Planning Général — Vue globale

Cette vue en lecture seule donne une vision **transversale** du planning de toutes les équipes et de tous les salariés sur une semaine donnée.

Elle est utile pour vérifier la couverture globale du club sans entrer dans l'édition.

---

## 6. Planning (éditeur) — Gestion des créneaux

> Accessible aux rôles **Manager, RH, Admin**

Cet éditeur permet de créer, modifier et supprimer des créneaux de travail pour les membres de votre équipe.

### Ajouter un créneau

1. Sélectionnez la **semaine** et le **membre du personnel**
2. Cliquez sur le **+** dans la cellule du jour souhaité
3. Renseignez :
   - **Heure de début** et **heure de fin**
   - **Fonction exercée** (liste configurable dans Configuration)
4. Cliquez sur **Enregistrer**

### Modifier un créneau

Cliquez sur un créneau existant pour l'ouvrir en mode édition. Modifiez les champs souhaités et enregistrez.

### Supprimer un créneau

Ouvrez le créneau en édition, puis cliquez sur **Supprimer** (icône poubelle).

### Utiliser un modèle de planning

Si des modèles ont été créés dans la Configuration, vous pouvez les **appliquer en un clic** pour pré-remplir la semaine d'un salarié. Un bouton « Appliquer un modèle » est disponible en haut de l'éditeur.

---

## 7. Équipe — Gestion des membres

> Accessible aux rôles **Manager, RH, Admin**

Cette section permet de gérer la composition de votre équipe.

### Voir les membres

La liste des membres actuels est affichée avec leur rôle, leur fonction principale et leur statut (actif/inactif).

### Ajouter un membre à l'équipe

1. Cliquez sur **Ajouter un membre**
2. Recherchez le salarié dans la liste déroulante
3. Confirmez

> Les salariés doivent exister dans le système. Leur création se fait depuis l'onglet **Configuration → Salariés** (admin uniquement).

### Retirer un membre

Cliquez sur l'icône de retrait à côté du nom du membre. Cela ne supprime pas le compte du salarié, il est simplement retiré de l'équipe.

### Gérer les fonctions d'un salarié

Dans la fiche d'un salarié (accessible depuis la liste), vous pouvez assigner/retirer des **fonctions** (postes dans le club : Animateur, Moniteur, Accueil, etc.).

---

## 8. Congés — Dépôt et approbation

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

La liste de vos demandes affiche le statut de chacune :

| Statut | Signification |
|---|---|
| ⏳ En attente | En cours de traitement par votre responsable |
| ✅ Approuvé | Congé validé — apparaît dans votre planning |
| ❌ Refusé | Congé refusé — un motif peut être précisé |
| 🔄 Partiellement approuvé | Premier niveau validé, en attente du suivant |

### Annuler une demande

Vous pouvez **annuler une demande en attente** en cliquant sur l'icône d'annulation à côté de la demande. Les demandes déjà approuvées ne peuvent plus être annulées via l'interface (contactez votre responsable).

---

### Pour les managers — Approuver ou refuser

Lorsqu'un membre de votre équipe soumet une demande de congé, un **badge** apparaît sur l'onglet **Congés** dans la navigation.

1. Cliquez sur **Congés**
2. L'onglet **À traiter** liste les demandes en attente de votre action
3. Pour chaque demande :
   - Consultez les informations (type, dates, salarié)
   - Cliquez sur **Approuver** ou **Refuser**
   - Vous pouvez saisir un **commentaire** visible par le salarié

### Chaîne d'approbation multi-niveaux

Certains types de congé (configurables par un admin) nécessitent plusieurs niveaux d'approbation :

- **Niveau 1 (N+1)** : votre manager direct
- **Niveau 2 (N+2)** : le responsable RH ou N+2
- **Niveau 3 (N+3)** : la Direction

La demande n'est **définitivement approuvée** qu'après passage par tous les niveaux configurés pour ce type de congé.

---

## 9. Relevés — Suivi des heures

> Accessible aux rôles **Manager, RH, Admin**

Cette section affiche le total des heures travaillées par salarié sur une période donnée, calculé à partir du planning saisi.

### Consulter les relevés

1. Sélectionnez la **période** (semaine, mois ou plage personnalisée)
2. Filtrez éventuellement par **équipe**
3. Le tableau affiche pour chaque salarié : total heures, répartition par fonction

### Exporter

Un bouton **Exporter (CSV)** permet de télécharger les données pour les intégrer dans un outil extérieur (paie, comptabilité).

---

## 10. Statistiques — Analyse RH

> Accessible aux rôles **RH, Admin**

Le tableau de bord statistiques présente des indicateurs clés :

- **Taux de présence** par semaine / par équipe
- **Répartition des fonctions** (quelle part du temps en Animateur, Moniteur, etc.)
- **Évolution des congés** (posés vs. approuvés vs. refusés)
- **Heures par salarié** sur une période glissante

Utilisez les filtres en haut de page (période, équipe, salarié) pour affiner les résultats.

---

## 11. Coûts — Masse salariale

> Accessible au rôle **Admin** uniquement

Cette vue simule la **masse salariale** en croisant les heures de planning avec les taux horaires configurés pour chaque fonction.

### Utilisation

1. Sélectionnez la période
2. Filtrez par équipe si besoin
3. Le tableau affiche le coût estimé par salarié et par fonction
4. Le total en bas donne la **masse salariale simulée** pour la période

> Il s'agit d'une simulation basée sur le planning saisi. Les congés absents du planning ou les heures supplémentaires non saisies ne sont pas pris en compte automatiquement.

---

## 12. Échanges — Permutations de créneaux

Cette section permet à deux salariés de **proposer et accepter un échange de créneaux** de travail.

### Proposer un échange

1. Cliquez sur **Échanges** dans la navigation
2. Cliquez sur **Nouvelle demande d'échange**
3. Sélectionnez :
   - **Votre créneau** que vous souhaitez céder
   - **Le salarié** avec qui vous voulez échanger
   - **Son créneau** que vous êtes prêt à reprendre
4. Ajoutez un **message** si besoin et soumettez

### Répondre à une proposition

Lorsqu'un collègue vous propose un échange, une notification apparaît. Dans la liste des échanges reçus, vous pouvez **Accepter** ou **Refuser**.

### Validation par un responsable

Selon la configuration du club, les échanges peut nécessiter une validation supplémentaire par un manager ou la RH avant d'être effectifs dans le planning.

---

## 13. Mon Profil

Accessible depuis votre nom en bas de la barre de navigation, puis **Mon Profil**.

### Informations disponibles

- Votre nom, prénom, email
- Votre rôle et vos fonctions
- Votre manager direct (N+1)

### Changer votre mot de passe

1. Dans **Mon Profil**, cliquez sur **Changer le mot de passe**
2. Saisissez votre **mot de passe actuel**
3. Saisissez et confirmez le **nouveau mot de passe**
4. Cliquez sur **Enregistrer**

> Votre mot de passe doit comporter au moins 8 caractères. Choisissez un mot de passe robuste (mélange de lettres, chiffres et caractères spéciaux).

### Changer votre photo de profil

Cliquez sur votre avatar actuel (ou l'espace prévu) pour uploader une nouvelle image.

---

## 14. Configuration (admin)

> Accessible au rôle **Admin** uniquement

La page Configuration regroupe tous les paramètres de l'application en plusieurs onglets.

---

### Onglet Organigramme

Cet onglet gère la **hiérarchie du club** et les **chaînes d'approbation des congés**.

#### Arbre hiérarchique

Visualisez l'organigramme du club. Chaque salarié est affiché avec son rôle et ses subordonnés directs.

#### Assigner les managers (N+1)

Le tableau liste tous les salariés. Pour chacun, un menu déroulant permet de choisir son **manager direct (N+1)**. Les niveaux N+2 et N+3 sont calculés automatiquement.

Pour retirer un manager, sélectionnez **« Aucun »** dans le menu déroulant.

#### Configurer la chaîne d'approbation par type de congé

Pour chaque **type de congé**, vous pouvez activer ou désactiver les niveaux d'approbation requis :
- **Manager** (N+1) : approbation par le manager direct
- **RH** (N+2) : approbation supplémentaire par les RH
- **Direction** (N+3) : validation finale par la direction

Cliquez sur les boutons pour activer/désactiver chaque niveau. Les changements sont enregistrés immédiatement.

#### Approbation des échanges

Un sélecteur définit **qui doit approuver les échanges de créneaux** entre salariés :
- **Manager** : seul le manager direct valide
- **RH** : validation via le pôle RH
- **Direction** : validation par la direction

---

### Onglet Équipes

Gérez les équipes du club :

- **Créer** une nouvelle équipe (nom, description)
- **Modifier** le nom et la description d'une équipe existante
- **Supprimer** une équipe (attention : cela dissocie les membres, ne les supprime pas)

---

### Onglet Fonctions

Gérez les postes et fonctions exercées dans le club :

- **Créer** une fonction (ex : Animateur, Moniteur, Accueil, Entretien)
- Associer un **taux horaire** à chaque fonction (utilisé pour le calcul des coûts)
- **Modifier** / **Supprimer** une fonction

---

### Onglet Types de congés

Gérez les catégories de congés proposées aux salariés :

- **Activer / désactiver** un type de congé
- **Créer** un nouveau type (nom, description)
- **Modifier** le nombre de jours annuels alloués

> La chaîne d'approbation de chaque type se configure dans l'onglet **Organigramme**.

---

### Onglet Salariés

Gérez l'ensemble des comptes du personnel :

- **Voir** la liste de tous les salariés actifs et inactifs
- **Créer** un nouveau compte salarié :
  1. Cliquez sur **Nouveau salarié**
  2. Renseignez : nom, prénom, e-mail, rôle, mot de passe initial
  3. Enregistrez — le salarié reçoit ses identifiants par vos soins
- **Modifier** un compte existant (nom, rôle, équipe, fonctions, taux horaire)
- **Désactiver** un compte (le salarié ne peut plus se connecter mais les données historiques sont conservées)

> Un salarié désactivé n'apparaît plus dans les listes de planning et de congés. Il n'est pas supprimé.

---

### Onglet Paramètres

Paramètres généraux de l'application :

| Paramètre | Description |
|---|---|
| Nom du club | Affiché dans l'entête et les exports |
| Thème | Clair ou sombre |
| Début de semaine | Lundi ou dimanche |
| Méthode de décompte des congés | Jours calendaires ou jours ouvrés |
| Notifications Push | Activer/désactiver les notifications navigateur |

---

### Onglet Modèles

Créez et gérez des **modèles de planning réutilisables** :

- Définissez une semaine type par équipe ou par salarié
- Appliquez le modèle en un clic depuis l'éditeur de planning

---

## 15. Notifications

### Activer les notifications

Lors de votre première visite, le navigateur peut vous demander l'autorisation d'envoyer des **notifications push**. Acceptez pour recevoir des alertes en temps réel, même lorsque l'onglet de l'application est fermé.

Vous pouvez activer/désactiver les notifications à tout moment depuis **Mon Profil → Notifications**.

### Types d'événements notifiés

| Événement | Destinataire |
|---|---|
| Nouvelle demande de congé déposée | Manager concerné |
| Congé approuvé | Salarié demandeur |
| Congé refusé | Salarié demandeur |
| Nouvelle proposition d'échange | Salarié ciblé |
| Échange accepté / refusé | Salarié proposant |

---

## 16. Questions fréquentes (FAQ)

**Je ne vois pas un salarié dans la liste de sélection du planning.**  
→ Vérifiez que ce salarié est bien **actif** et membre de votre équipe (onglet Équipe dans Config ou dans la section Équipe).

**J'ai oublié mon mot de passe.**  
→ Contactez votre administrateur. Il peut réinitialiser votre mot de passe depuis Configuration → Salariés.

**Une demande de congé semble bloquée en « En attente » depuis longtemps.**  
→ Vérifiez quelle étape de la chaîne d'approbation est en attente (visible sur la demande). Relancez le responsable concerné.

**Je ne reçois pas de notifications.**  
→ Vérifiez que les notifications sont autorisées dans les paramètres de votre navigateur pour ce site. Vérifiez également que les notifications Push sont activées dans Configuration → Paramètres.

**Le planning d'un salarié est vide alors qu'il travaille.**  
→ Les créneaux doivent être saisis manuellement par un manager ou admin dans l'onglet **Planning (éditeur)**. Vérifiez que la bonne semaine est sélectionnée.

**Comment exporter les données pour la paie ?**  
→ Allez dans **Relevés**, sélectionnez la période du mois et cliquez sur **Exporter (CSV)**.

**Un type de congé n'apparaît pas dans le formulaire de dépôt.**  
→ Ce type a peut-être été désactivé. Un administrateur peut le réactiver depuis Configuration → Types de congés.

**Comment changer le thème de l'application (sombre/clair) ?**  
→ Administration → Configuration → Paramètres → Thème. Le changement est global pour tous les utilisateurs.

---

*Pour toute demande d'assistance technique, contacter l'administrateur système du club.*
