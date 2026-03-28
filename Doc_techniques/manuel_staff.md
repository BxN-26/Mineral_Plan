# minéral Spirit v2 — Guide du personnel

> Destiné au **personnel du club** (rôle Staff)  
> Version de référence : **spirit-v2 · v2.0.0** · Mars 2026

---

## Table des matières

1. [Connexion à l'application](#1-connexion-à-lapplication)
2. [Navigation et fonctionnalités disponibles](#2-navigation-et-fonctionnalités-disponibles)
3. [Mon Planning — Ma semaine de travail](#3-mon-planning--ma-semaine-de-travail)
4. [Planning Équipe — Ma vue équipe](#4-planning-équipe--ma-vue-équipe)
5. [Planning Général — Vue globale](#5-planning-général--vue-globale)
6. [Indisponibilités — Déclarer une contrainte](#6-indisponibilités--déclarer-une-contrainte)
7. [Congés — Déposer et suivre mes demandes](#7-congés--déposer-et-suivre-mes-demandes)
8. [Échanges — Permuter un créneau](#8-échanges--permuter-un-créneau)
9. [Mon Profil](#9-mon-profil)
10. [Notifications](#10-notifications)
11. [Installer l'application sur mon téléphone (PWA)](#11-installer-lapplication-sur-mon-téléphone-pwa)
12. [Questions fréquentes (FAQ)](#12-questions-fréquentes-faq)

---

## 1. Connexion à l'application

### Accéder à l'application

Ouvrez votre navigateur et rendez-vous sur l'adresse communiquée par votre responsable (exemple : `https://planning.mineral-spirit.fr`).

> L'application fonctionne sur tous les navigateurs modernes (Chrome, Firefox, Safari, Edge). Elle est utilisable sur smartphone et peut être installée comme une vraie application (voir §11).

### Se connecter

1. Saisissez votre **adresse e-mail professionnelle**
2. Saisissez votre **mot de passe**
3. Cliquez sur **Se connecter**

En cas d'erreur, vérifiez bien l'adresse e-mail et le mot de passe. Contactez votre responsable si vous avez oublié votre mot de passe — il peut vous le réinitialiser.

### Premier login — changement obligatoire

Si votre compte vient d'être créé, un écran de **changement de mot de passe** s'affiche automatiquement dès votre première connexion. Vous devez définir un mot de passe personnel avant d'accéder à l'application.

> Votre mot de passe doit comporter **au moins 8 caractères**.

### Se déconnecter

Cliquez sur votre **nom en bas de la barre de navigation gauche**, puis sur **Déconnexion**. Votre session est immédiatement invalidée côté serveur.

---

## 2. Navigation et fonctionnalités disponibles

### La barre de navigation

La barre latérale gauche liste les sections auxquelles vous avez accès :

| Section | Disponible ? | Description |
|---|:---:|---|
| Mon Planning | ✓ | Votre planning personnel |
| Planning Équipe | ✓ | Le planning de votre équipe (lecture) |
| Planning Général | ✓ | Vue globale des équipes (lecture) |
| Mes congés | ✓ | Dépôt et suivi de vos demandes de congé |
| Échanges | ✓ | Proposer ou répondre à un échange de créneau |
| Mon Profil | ✓ | Vos informations, mot de passe, notifications |

> Les sections Planning (éditeur), Équipe, Relevés, Statistiques, Coûts et Configuration sont réservées aux rôles Manager, RH ou Admin. Vous ne les verrez pas dans votre navigation.

### Badge de notification

Une cloche 🔔 en haut à droite de l'interface affiche le nombre de notifications non lues. Un badge numérique orange peut aussi apparaître sur l'onglet **Mes congés** pour signaler une mise à jour sur une de vos demandes.

---

## 3. Mon Planning — Ma semaine de travail

### Qu'est-ce que cette vue ?

**Mon Planning** affiche uniquement **vos créneaux personnels** pour la semaine choisie. C'est votre référence pour savoir quand vous travaillez, sur quelle fonction et dans quel horaire.

### Lire la grille

- Chaque **colonne** correspond à un jour de la semaine (lundi → dimanche)
- Chaque **bloc** représente un créneau : il indique la **fonction exercée** (Accueil, Moniteur, Ouverture…), les **heures de début et de fin**, et le **type de tâche** si renseigné
- Un créneau **COURS** (fond pointillé + tampon « COURS ») indique une séance de cours encadrée qui vous est affectée
- Un créneau grisé hachuré indique une **indisponibilité** saisie
- Un bloc coloré hachuré avec un libellé correspond à un **congé approuvé** (ex : CP, RTT, Maladie…)

### Naviguer les semaines

- Les flèches **← →** en haut de la grille permettent d'avancer ou de reculer d'une semaine
- Cliquez sur la **date affichée** pour revenir à la semaine courante

### Mode Semaine / Mode Jour

Un toggle **Semaine / Jour** en haut à gauche permet de basculer :
- **Semaine** : tous les jours de la semaine côte à côte
- **Jour** : un seul jour en pleine largeur, avec les flèches ← → pour naviguer jour par jour

Le mode Jour est utile sur téléphone ou pour consulter un jour chargé.

> Vous ne pouvez **pas modifier** votre planning depuis cette vue. Seul votre responsable peut saisir ou modifier vos créneaux. Adressez-lui toute demande de modification ou d'erreur.

---

## 4. Planning Équipe — Ma vue équipe

### Qu'est-ce que cette vue ?

**Planning Équipe** affiche le planning de **toute votre équipe** sur la semaine sélectionnée. Utile pour voir qui est présent, à quelles heures, et dans quelle fonction.

### Lire la grille

- Chaque **ligne** représente un membre de l'équipe
- Chaque **colonne** est un jour de la semaine
- Les créneaux, congés, cours et indisponibilités s'affichent avec les mêmes codes couleur que dans Mon Planning

### Filtrer l'affichage

Si votre équipe compte beaucoup de membres ou si vous appartenez à **plusieurs équipes** :

- **Chips équipes** (deuxième rangée) : cliquez sur un badge d'équipe pour n'afficher que cette équipe. Cliquez à nouveau pour la désactiver. Le bouton **Tout afficher** remet l'affichage complet.
- **Chips membres** (troisième rangée) : cliquez sur un nom pour masquer/afficher ce membre individuellement. Le bouton **Tout masquer / Tout afficher** agit sur tous en une fois. Un compteur `X/Y membres` indique votre sélection.

### Mode Semaine / Jour

Même fonctionnement que dans Mon Planning (toggle en haut à gauche).

> Cette vue est en **lecture seule** pour vous. Toute modification est du ressort de votre responsable.

---

## 5. Planning Général — Vue globale

### Qu'est-ce que cette vue ?

**Planning Général** donne une vision d'ensemble du planning de **toutes les équipes** sur une semaine. C'est une vue panoramique, en lecture seule.

### Lire la grille

- L'axe horizontal représente les **jours + créneaux horaires** de la semaine
- L'axe vertical liste les **membres par fonction**
- Les congés, cours et indisponibilités s'affichent avec leur hachurage/couleur spécifique
- Un onglet **Tout** affiche toutes les fonctions ; les autres onglets permettent de filtrer par fonction ou par équipe

> Aucune action d'édition n'est possible depuis cette vue.

---

## 6. Indisponibilités — Déclarer une contrainte

### Qu'est-ce qu'une indisponibilité ?

Une **indisponibilité** vous permet de signaler à votre responsable une période où vous ne pouvez pas assumer de créneaux : contrainte personnelle, rendez-vous médical, engagement extérieur…

Elle est **différente d'un congé** : elle n'est pas déduite de votre solde, elle n'est pas rémunérée et elle n'a pas de workflow d'approbation complet. C'est un signal d'information que le planning peut intégrer.

### Déclarer une indisponibilité

1. Accédez à **Mon Profil** — un panneau **Indisponibilités** est disponible en bas de page
2. Cliquez sur **+ Déclarer une indisponibilité**
3. Renseignez :
   - **Date de début** et **date de fin**
   - **Journée entière** ou **plage horaire précise** (en décochant « Journée entière »)
   - **Récurrence** : ponctuelle, hebdomadaire ou bihebdomadaire
   - **Date de fin de récurrence** si applicable
   - **Motif** (facultatif, mais recommandé)
4. Cliquez sur **Enregistrer**

### Statuts possibles

| Statut | Signification |
|---|---|
| ✅ Validée | Déclarée dans les délais, prise en compte automatiquement |
| ⏳ En attente | Hors délais ou approbation manager requise — attendez la validation |
| ❌ Refusée | Le responsable ne peut pas l'enregistrer (ex : service minimum non couvert) |

> Le délai minimum et la nécessité d'approbation sont configurés par votre administrateur. Si vous déclarez une indisponibilité à très court terme, elle peut passer en statut « En attente ».

### Visuel dans le planning

Vos indisponibilités apparaissent dans Mon Planning et Planning Équipe avec un **fond hachuré grisé** et votre motif, afin que le planificateur en tienne compte.

---

## 7. Congés — Déposer et suivre mes demandes

### Vue d'ensemble

L'onglet **Mes congés** regroupe :
- Vos **soldes actuels** (jours CP et RTT restants)
- L'**historique** de vos demandes
- Le bouton pour faire une **nouvelle demande**

### Voir mes soldes

En haut de la page Congés (et aussi dans Mon Profil), vos soldes s'affichent :
- **Congés payés (CP)** : vos jours acquis restants
- **RTT** : vos jours RTT restants

Pour tout doute sur votre solde, contactez votre responsable ou la RH.

### Déposer une demande

1. Cliquez sur **Nouvelle demande** (bouton en haut à droite)
2. Renseignez :
   - **Type de congé** (CP, RTT, Formation, Maladie, Événement familial…)
   - **Date de début** et **date de fin**
   - **Commentaire** (facultatif — visible par vos approbateurs)
3. Cliquez sur **Soumettre**

Votre demande apparaît dans la liste avec le statut **En attente**.

> Si un délai minimum de préavis est configuré (ex : 2 jours), vous ne pourrez pas soumettre une demande débutant trop tôt. Un message d'erreur vous en informera.

### Suivre l'état de mes demandes

| Statut | Signification |
|---|---|
| ⏳ En attente | En cours de traitement par votre responsable |
| ✅ Approuvé N1 | Premier niveau validé, en attente du suivant si nécessaire |
| ✅ Approuvé | Congé totalement validé — visible dans votre planning |
| ❌ Refusé | Congé refusé — un motif peut être précisé |
| 🗑 Annulé | Demande annulée (par vous ou par un responsable) |

Lorsqu'un congé est approuvé, il apparaît **immédiatement dans votre planning** avec un hachurage coloré correspondant au type. Vos créneaux de travail couverts par ce congé sont automatiquement libérés.

### Annuler une demande

Vous pouvez annuler une demande **encore en attente** en cliquant sur l'icône ✕ à côté de la demande dans la liste. Une demande déjà approuvée ne peut être annulée qu'avec l'accord d'un manager.

### Recevoir une notification

Dès que votre responsable approuve ou refuse votre demande, vous recevez une **notification in-app** (et push si activé). Cliquer sur la notification vous amène directement à la vue Congés de la semaine concernée.

---

## 8. Échanges — Permuter un créneau

### Qu'est-ce qu'un échange ?

L'onglet **Échanges** permet de proposer à un collègue de **permuter vos créneaux** : vous lui cédez un de vos créneaux, et en échange vous reprenez un des siens (ou simplement lui donnez le vôtre si l'échange est unilatéral).

### Proposer un échange

1. Cliquez sur **Échanges** → **Nouvelle demande**
2. Sélectionnez :
   - **Votre créneau** à céder (fonction, jour, horaire)
   - Le **salarié cible** (ou laissez en « ouvert » pour que n'importe quel collègue réponde)
   - Le **créneau offert en retour** par ce collègue (si vous souhaitez un échange bilatéral)
3. Ajoutez un **message** si besoin
4. Soumettez

La demande est envoyée. Le collègue ciblé reçoit une notification.

### Répondre à une proposition

Quand un collègue vous contacte pour un échange, une notification apparaît sur votre cloche 🔔 et dans l'onglet **Échanges** → section **Reçus**.

1. Consultez le détail de l'échange proposé
2. Cliquez **Accepter** ou **Refuser**
3. Si vous acceptez, l'échange est envoyé pour validation à votre responsable (selon la configuration du club)

### Suivre mes échanges

L'onglet Échanges liste :
- **Mes demandes** : celles que vous avez initiées
- **Reçus** : celles qui vous sont adressées

Les statuts possibles :

| Statut | Signification |
|---|---|
| ⏳ En attente | Votre demande n'a pas encore reçu de réponse |
| 🤝 Jumelé | Un collègue a accepté, en attente de validation manager |
| ✅ Approuvé | Échange validé et effectif dans le planning |
| ❌ Refusé | Échange refusé (par le collègue ou le responsable) |
| 🚫 Annulé | Demande annulée |

### Alerte urgence

Si l'échange porte sur un créneau **dans les prochaines heures** (délai configuré par le club), une alerte visuelle signale l'urgence. Le responsable est notifié automatiquement.

---

## 9. Mon Profil

Accessible en cliquant sur votre nom en bas de la barre de navigation.

### Informations disponibles

- **Photo, nom, prénom** — vous pouvez changer votre photo en cliquant dessus
- **Email, téléphone, contrat** (lecture seule — contactez votre responsable pour toute modification)
- **Rôle** et **fonctions actives**
- **Soldes de congés** (CP et RTT)
- **Historique** de vos 20 dernières demandes de congé

### Changer votre mot de passe

1. Faites défiler jusqu'à la section **Changer le mot de passe**
2. Renseignez votre **mot de passe actuel**
3. Saisissez et confirmez un **nouveau mot de passe** (8 caractères minimum)
4. Cliquez sur **Changer le mot de passe**

### Changer votre photo

Cliquez sur votre avatar pour uploader une image. Formats acceptés : JPG, PNG, WebP. L'image est automatiquement recadrée en carré.

### Activer / désactiver les notifications push

Un bouton dans la section **Notifications** vous permet d'activer les notifications push du navigateur. Elles vous alerteront même quand l'onglet est fermé (approbation de congé, proposition d'échange, etc.).

Pour désactiver, cliquez à nouveau sur ce même bouton.

### Accéder au manuel (ce guide)

En bas de votre profil, une section **Documentation** propose un lien vers ce guide au format PDF, consultable et imprimable.

---

## 10. Notifications

### Panneau de notifications

La 🔔 en haut à droite de l'interface ouvre un panneau listant vos dernières notifications non lues. Un badge orange affiche le nombre de messages en attente.

Cliquer sur une notification vous amène directement à la section ou à la semaine concernée.

### Types de notifications que vous pouvez recevoir

| Événement | Vous êtes notifié(e) car… |
|---|---|
| Congé approuvé | Votre demande vient d'être validée |
| Congé refusé | Votre demande a été refusée (motif visible) |
| Proposition d'échange reçue | Un collègue vous propose un échange |
| Échange accepté | Votre proposition a été acceptée par le collègue |
| Échange validé | L'échange a été approuvé par le responsable |
| Échange refusé | L'échange n'a pas été validé |

### Notifications push (hors onglet)

Si vous avez activé les notifications push (voir §9), ces mêmes alertes arrivent comme des notifications système sur votre téléphone ou dans votre navigateur, même si vous n'êtes pas sur l'application.

---

## 11. Installer l'application sur mon téléphone (PWA)

L'application est une **PWA** (Progressive Web App) : elle peut être installée sur votre téléphone pour fonctionner comme une vraie application, sans passer par un App Store.

### Sur Android (Chrome)

1. Ouvrez l'application dans Chrome sur votre téléphone
2. Attendez quelques secondes — une bannière « Ajouter à l'écran d'accueil » peut apparaître automatiquement
3. Sinon, ouvrez le **menu Chrome** (⋮) → **Ajouter à l'écran d'accueil**
4. Confirmez — une icône apparaît sur votre écran d'accueil

### Sur iPhone (Safari)

1. Ouvrez l'application dans Safari
2. Appuyez sur le bouton **Partager** (carré avec flèche)
3. Faites défiler et appuyez sur **Sur l'écran d'accueil**
4. Confirmez le nom et appuyez sur **Ajouter**

> Une fois installée, l'application s'ouvre en plein écran sans les barres du navigateur. Vos notifications push fonctionnent également depuis l'application installée.

---

## 12. Questions fréquentes (FAQ)

**Je ne vois pas mon planning alors que je suis censé(e) travailler cette semaine.**  
→ Votre responsable n'a peut-être pas encore saisi les créneaux. Contactez-le directement. Les créneaux doivent être saisis manuellement dans l'éditeur de planning.

**Mon congé est approuvé mais je ne le vois pas dans mon planning.**  
→ Vérifiez que le congé est bien au statut **Approuvé** (et non « Approuvé N1 » si un niveau supplémentaire est requis). Si le statut est bien « Approuvé », essayez de **rafraîchir la page**.

**J'ai oublié mon mot de passe.**  
→ Contactez votre responsable ou l'administrateur. La réinitialisation se fait depuis la Configuration (côté admin uniquement — il n'existe pas de lien « Mot de passe oublié » automatique).

**Je souhaite annuler un congé déjà approuvé.**  
→ Vous ne pouvez pas l'annuler vous-même une fois approuvé. Contactez votre responsable, qui peut l'annuler depuis son interface.

**Ma demande de congé est bloquée depuis longtemps en « En attente ».**  
→ Relancez votre responsable (N+1). Si plusieurs niveaux d'approbation sont requis pour ce type de congé, la demande peut attendre le N+2. Un admin peut approuver à n'importe quelle étape.

**Je ne reçois pas de notifications.**  
→ Vérifiez les **autorisations dans votre navigateur** : dans les paramètres du site (🔒 à gauche de l'URL), assurez-vous que les notifications sont **autorisées**. Vérifiez aussi que les notifications push sont bien activées dans **Mon Profil → Notifications**. Sur iPhone, les notifications push ne sont disponibles qu'en iOS 16.4+ avec l'application installée en PWA.

**Je vois les créneaux de collègues d'une autre équipe dans la vue Planning Équipe.**  
→ C'est normal si ces collègues appartiennent à plusieurs équipes. Utilisez les **chips équipes** pour filtrer et n'afficher que votre équipe.

**Un créneau COURS est affiché dans mon planning — que dois-je faire ?**  
→ Vous avez été assigné(e) comme moniteur/encadrant pour une séance de cours. Ce créneau fait partie de votre travail pour cette semaine. Contactez votre responsable si vous avez un doute.

**Comment signaler que je ne suis pas disponible un jour donné sans poser un congé ?**  
→ Déclarez une **indisponibilité** depuis Mon Profil (voir §6). Cela ne consomme pas de solde de congé et sert d'information pour le planificateur.

**Comment proposer à un collègue de me remplacer ?**  
→ Utilisez la section **Échanges** (voir §8). Vous y créez une demande d'échange en ciblant un collègue spécifique.

---

*Pour toute question technique, contactez votre responsable ou l'administrateur du club.*
