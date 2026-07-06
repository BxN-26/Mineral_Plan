# Minéral Spirit v2 — Plan d'implémentation : rafraîchissement temps réel

> Créé le 6 juillet 2026, suite au constat fait pendant les tests de l'audit pré-été : une vue
> planning déjà ouverte ne se met pas à jour quand un autre utilisateur approuve un congé, un
> échange, ou modifie le planning ailleurs. Jugé indispensable par le porteur du projet.
> Ce document est un plan d'exécution pas à pas — à suivre dans l'ordre, sans sauter d'étape,
> pour éviter les oublis et les régressions.
>
> **Ce document vit sur une branche dédiée** (`feat/realtime-updates`), créée à partir du commit
> qui l'introduit sur `fix/audit-pre-ete-2026` — indépendante de cette dernière, qui peut être
> mergée vers `main` à tout moment sans attendre ce chantier.

---

## 0. Objectif et périmètre

Pousser en temps réel, vers les navigateurs concernés, les changements sur les données
"impactantes" pour la vue courante d'un utilisateur :

- **Planning** (créneaux ajoutés/retirés/déplacés, quelle qu'en soit la cause : édition directe,
  échange approuvé, congé approuvé/annulé, indisponibilité approuvée)
- **Congés** (nouvelle demande, changement de statut à n'importe quelle étape N1/N2/N3, annulation)
- **Indisponibilités** (nouvelle déclaration, review, suppression)
- **Échanges de créneaux** (nouvelle demande, réponse, approbation/refus, assignation directe)
- **Déclarations d'heures** (nouvelle déclaration, review)
- **Créneaux de cours** (affectation/désaffectation d'un moniteur)

**Hors périmètre explicite** (pas de temps réel nécessaire, faible valeur ajoutée) : Configuration,
Statistiques/Coûts (vues de reporting agrégé, la fraîcheur à la minute près n'a pas d'enjeu),
Équipe (CRUD salariés, peu de concurrence attendue).

**Contrainte non négociable** : la diffusion des événements doit être **asynchrone et non
bloquante** — elle ne doit jamais ralentir la réponse HTTP de la requête qui a déclenché le
changement (ex. approuver un congé doit rester aussi rapide qu'aujourd'hui, l'émission de
l'événement se fait "en plus", jamais "avant" de répondre au client).

---

## 1. Choix d'architecture

### Décision : Server-Sent Events (SSE), pas WebSocket

| Critère | SSE | WebSocket |
|---|---|---|
| Sens de communication nécessaire | Serveur → client uniquement (suffisant ici, aucune action utilisateur ne passe par ce canal) | Bidirectionnel (inutile ici) |
| Authentification | Cookies envoyés nativement (requête HTTP classique) — réutilise `requireAuth` tel quel | Nécessite une gestion d'auth spécifique à la poignée de main |
| Reconnexion automatique | Native au navigateur (`EventSource`), avec un simple `Last-Event-ID` si besoin de rattrapage | À coder soi-même |
| Complexité serveur | Une route Express de plus, garde la connexion ouverte | Nécessite une lib dédiée (`ws`, `socket.io`) et un cycle de vie différent d'Express |
| Passage à travers Caddy | Fonctionne nativement en HTTP/1.1 keep-alive, aucune config particulière | Nécessite d'activer explicitement le proxy WebSocket dans Caddy |

**Conclusion :** SSE couvre 100 % du besoin avec beaucoup moins de complexité. Pas besoin de
Redis/pub-sub externe non plus — la taille de l'équipe (une salle d'escalade, quelques dizaines
de connexions simultanées maximum) permet un bus d'événements **en mémoire, dans le process
Node** (`EventEmitter` natif). Si un jour l'app tourne sur plusieurs process/serveurs (cluster,
load-balancing), il faudra remplacer ce bus par du pub/sub externe (Redis) — non nécessaire
aujourd'hui, ne pas sur-anticiper.

---

## 2. Vue d'ensemble des étapes

1. **Infrastructure serveur** — bus d'événements + endpoint SSE authentifié
2. **Émission des événements** — instrumenter chaque route qui mute une donnée impactante
3. **Hook frontend générique** — connexion SSE + dispatch
4. **Câblage des vues** — chaque vue concernée écoute et réagit
5. **Tests** — multi-onglets, multi-comptes, coupures réseau, charge

**Ordre d'implémentation recommandé (phasage) :**
- **Phase A (livrable utile rapidement)** : étapes 1, 2 (limité aux événements planning/congés/
  indisponibilités/échanges qui touchent `schedule_slots`), 3, et câblage de `PlanningView` +
  `TeamPlanningView` + `GeneralPlanningView` uniquement — c'est le point de douleur observé.
- **Phase B (extension)** : câblage des vues restantes (Congés, Échanges, Indispo, Relevés,
  MonPlanningView) — une fois le pattern validé en Phase A, chaque vue supplémentaire est rapide
  à câbler (le gros du travail — infra + bus d'événements — est déjà fait).

Ne pas viser la Phase A+B en une seule fois si le temps manque : livrer la Phase A, la faire
tourner une semaine en usage réel, puis enchaîner sur la Phase B avec le recul de l'usage réel.

---

## 3. Étape 1 — Infrastructure serveur

### 3.1 — Bus d'événements interne

Nouveau fichier `spirit-v2/utils/eventBus.js` :

```js
'use strict';
const { EventEmitter } = require('events');

// Bus interne au process — suffisant tant que l'app tourne en un seul
// process Node (pas de cluster/pm2 multi-instance). À remplacer par un
// pub/sub externe (Redis) si l'architecture évolue vers plusieurs process.
const bus = new EventEmitter();
bus.setMaxListeners(0); // pas de limite arbitraire sur le nb d'abonnés (connexions SSE)

module.exports = bus;
```

### 3.2 — Format d'événement (convention à respecter partout)

```js
{
  type: 'schedule:changed',      // namespace:action — voir liste §4.2
  scope: { week: '2026-07-06', fnSlug: 'moniteur' }, // clé de filtrage pertinente selon le type
  at: '2026-07-06T14:32:00.000Z',
}
```

Le payload ne doit **jamais contenir les données elles-mêmes** (pas de `spans`, pas de détail du
congé) — uniquement de quoi permettre au frontend de savoir **si ça le concerne** et de
**redemander** les données à jour via l'API REST existante. Ça évite deux problèmes : des
payloads temps réel qui divergent du modèle d'autorisation REST (un événement pourrait fuiter une
donnée à quelqu'un qui n'a pas le droit de la voir), et une double logique de fusion de données
(REST + SSE) à maintenir en parallèle.

### 3.3 — Endpoint SSE authentifié

Nouveau fichier `spirit-v2/routes/events.js` :

```js
'use strict';
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const bus = require('../utils/eventBus');

router.get('/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // évite le buffering si jamais un proxy intermédiaire l'active
  });
  res.flushHeaders();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Écoute de tous les types d'événements — le filtrage par pertinence se
  // fait côté client (le hook frontend décide s'il doit agir ou ignorer).
  const listener = (event) => send(event);
  bus.on('*', listener); // voir §3.4 pour l'émission avec un pseudo-wildcard

  // Heartbeat toutes les 25s pour garder la connexion vivante à travers
  // Caddy/proxys intermédiaires qui pourraient couper une connexion idle.
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('*', listener);
  });
});

module.exports = router;
```

Monter la route dans `app.js` : `app.use('/api/events', eventsRouter);`

### 3.4 — Émission générique (helper)

`EventEmitter` natif n'a pas de vrai "wildcard" — plus simple d'émettre systématiquement sur un
seul canal `'*'` avec le `type` dans le payload, plutôt que d'émettre sur `bus.emit(type, ...)` et
demander à chaque connexion SSE de s'abonner à tous les types un par un. Dans `eventBus.js`,
ajouter un helper :

```js
function publish(type, scope = {}) {
  bus.emit('*', { type, scope, at: new Date().toISOString() });
}
module.exports = { bus, publish };
```

(adapter l'endpoint SSE ci-dessus pour utiliser `bus.on('*', listener)` tel quel — déjà correct.)

### 3.5 — Point d'attention : expiration du token pendant une connexion SSE ouverte

Le cookie `spirit_access` (JWT) expire au bout de 15 minutes. Une connexion SSE peut rester
ouverte plus longtemps que ça. `requireAuth` ne revérifie le token qu'à l'établissement de la
connexion HTTP (SSE = une seule requête HTTP longue durée), donc **la connexion SSE reste
valide même après expiration du token**, tant qu'elle n'est pas interrompue puis reconnectée.
Le vrai risque : si la connexion est coupée (réseau, redémarrage serveur) et que le navigateur la
rouvre automatiquement (comportement natif d'`EventSource`) avec un cookie `spirit_access`
expiré et pas de refresh préalable → `requireAuth` renverra 401 sur la reconnexion, et
`EventSource` ne sait pas gérer un 401 pour déclencher un refresh comme le fait l'intercepteur
Axios de `client.js`.
**Traitement recommandé :** dans le hook frontend (§5), écouter l'événement `error` d'
`EventSource` ; si le prochain essai échoue avec un statut 401 identifiable (voir limitation
ci-dessous : `EventSource` natif ne donne pas le status code de l'erreur), fermer proprement la
connexion, appeler `api.post('/auth/refresh')` (déjà existant), puis rouvrir une nouvelle
connexion SSE. Ne pas laisser `EventSource` réessayer indéfiniment tout seul sans passer par ce
refresh.

---

## 4. Étape 2 — Émission des événements par domaine

Ajouter `const { publish } = require('../utils/eventBus');` dans chaque fichier listé, et appeler
`publish(...)` **juste après** un commit réussi (jamais avant, jamais dans un bloc qui pourrait
encore échouer après l'appel).

| Fichier | Route(s) | Événement à publier | Scope |
|---|---|---|---|
| `routes/schedules.js` | `POST /week/:week/function/:slug` | `schedule:changed` | `{ week, fnSlug: slug }` |
| `routes/swaps.js` | `PUT /:id/approve`, `PUT /:id/assign` | `schedule:changed` (x2 si bilatéral, un par semaine touchée) + `swap:changed` | `{ week, fnSlug }` / `{ swapId }` |
| `routes/swaps.js` | `POST /`, `PUT /:id/respond`, `PUT /:id/refuse` | `swap:changed` | `{ swapId }` |
| `routes/leaves.js` | `PUT /:id/approve` (si `nextStatus==='approved'`, slots libérés) | `schedule:changed` + `leave:changed` | `{ staffId, dateStart, dateEnd }` / `{ leaveId }` |
| `routes/leaves.js` | `POST /`, `PUT /:id/refuse`, `DELETE /:id` | `leave:changed` (+ `schedule:changed` si `slots_restored > 0` sur le DELETE) | `{ leaveId }` |
| `routes/unavailabilities.js` | `POST /` (si approuvée), `PUT /:id/review` (approve), `DELETE /:id` (si restaurés) | `schedule:changed` + `unavailability:changed` | idem congés |
| `routes/course-slots.js` | `POST /:id/assign`, `DELETE /:id/assign` | `course-assignment:changed` | `{ courseSlotId, weekStart }` |
| `routes/hour-declarations.js` | création, review | `hour-declaration:changed` | `{ staffId }` |

**Règle générale de scope** : toujours inclure de quoi permettre au frontend de savoir "est-ce
que je regarde actuellement cette semaine / ce salarié / cette demande" pour décider s'il doit
réagir — sans quoi toutes les vues devraient tout re-fetch à chaque événement, ce qui gâche
l'intérêt du ciblage.

---

## 5. Étape 3 — Hook frontend générique

Nouveau fichier `frontend/src/hooks/useRealtimeEvents.js` :

```js
import { useEffect, useRef, useCallback } from 'react';
import api from '../api/client';

const listeners = new Set(); // { type, handler }

/**
 * Ouvre UNE SEULE connexion SSE pour toute l'app (appelé une fois, ex. dans
 * App.jsx), et permet à n'importe quel composant de s'abonner à un type
 * d'événement précis via useRealtimeSubscription (voir plus bas).
 */
export function useRealtimeConnection(enabled) {
  const esRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    function connect() {
      const es = new EventSource('/api/events/stream', { withCredentials: true });
      esRef.current = es;

      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          for (const { type, handler } of listeners) {
            if (type === event.type) handler(event.scope);
          }
        } catch { /* ignore un message malformé */ }
      };

      es.onerror = async () => {
        es.close();
        if (cancelled) return;
        // Tente un refresh de session avant de rouvrir — cf. §3.5 du plan.
        try { await api.post('/auth/refresh'); } catch { /* session vraiment morte, on retente quand même */ }
        setTimeout(() => { if (!cancelled) connect(); }, 2000);
      };
    }

    connect();
    return () => { cancelled = true; esRef.current?.close(); };
  }, [enabled]);
}

/** À utiliser dans n'importe quel composant pour réagir à un type d'événement. */
export function useRealtimeSubscription(type, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const entry = { type, handler: (scope) => handlerRef.current(scope) };
    listeners.add(entry);
    return () => listeners.delete(entry);
  }, [type]);
}
```

Brancher `useRealtimeConnection(!!user)` une seule fois dans `App.jsx` (connexion ouverte tant
qu'un utilisateur est connecté).

---

## 6. Étape 4 — Câblage des vues

Pour chaque vue, utiliser `useRealtimeSubscription(type, scope => { ... refetch ciblé ... })`.

| Vue | Événement(s) écouté(s) | Action |
|---|---|---|
| `PlanningView.jsx` | `schedule:changed` | Si `scope.week === currentWeek` (et `scope.fnSlug === activeFn` si pertinent) → recharger le planning de la semaine affichée |
| `TeamPlanningView.jsx` | `schedule:changed`, `course-assignment:changed` | Idem, filtré sur la semaine affichée |
| `GeneralPlanningView.jsx` | `schedule:changed` | Idem |
| `MonPlanningView.jsx` | `schedule:changed` (filtré sur son propre `staffId`) | Recharger son planning perso |
| `CongesView.jsx` | `leave:changed` | Recharger la liste des congés (mes demandes + à approuver) |
| `SwapView.jsx` | `swap:changed`, `schedule:changed` | Recharger la liste des échanges |
| `IndispoView.jsx` | `unavailability:changed` | Recharger la liste |
| `RelevesView.jsx` | `hour-declaration:changed`, `schedule:changed` | Recharger les stats affichées (moins urgent, à faire en dernier) |

**Phase A** (rappel §2) : ne câbler que les 4 premières lignes du tableau (planning). Le reste en
Phase B.

---

## 7. Étape 5 — Tests

- [ ] Ouvrir le planning dans 2 onglets/2 comptes différents. Modifier depuis l'un, vérifier que
      l'autre se met à jour sans rechargement manuel, en quelques secondes.
- [ ] Approuver un congé qui libère un créneau depuis un compte manager pendant qu'un autre onglet
      affiche le planning de la semaine concernée → le créneau doit disparaître en temps réel.
- [ ] Couper le réseau (mode avion / désactiver le wifi) pendant quelques secondes puis le
      réactiver → la connexion SSE doit se rétablir automatiquement (vérifier dans l'onglet réseau
      des devtools qu'une nouvelle requête `/api/events/stream` apparaît).
- [ ] Laisser un onglet ouvert plus de 15 minutes (expiration du token d'accès) sans interaction,
      puis déclencher un changement depuis un autre compte → vérifier que l'onglet resté ouvert
      reçoit quand même l'événement (pas de déconnexion silencieuse).
- [ ] Charge basique : ouvrir 10-15 onglets simultanés (ou simuler via plusieurs connexions curl
      `-N` sur `/api/events/stream`) et vérifier que le serveur reste réactif sur les autres
      routes REST pendant ce temps (confirme que les connexions SSE ne bloquent pas l'event loop).
- [ ] Vérifier qu'un utilisateur qui n'a pas le droit de voir une donnée (ex. `viewer` sur les
      congés d'un collègue) ne reçoit bien que des événements "vides" (scope minimal) et que le
      refetch déclenché passe bien par les mêmes contrôles d'autorisation REST qu'aujourd'hui —
      **le canal SSE ne doit jamais devenir un moyen de contourner les permissions**.

---

## 8. Points d'attention / pièges à éviter

- **Ne jamais mettre l'émission d'événement dans le chemin critique de la réponse HTTP** — elle
  doit être un appel synchrone rapide (`publish()` ne fait qu'un `emit()` en mémoire, donc
  intrinsèquement non-bloquant) placé juste avant `res.json(...)`, jamais dans un `await`
  supplémentaire qui retarderait la réponse.
- **Ne jamais transporter de données métier dans le payload SSE** (cf. §3.2) — uniquement de quoi
  filtrer, le vrai contenu repasse par un fetch REST classique qui applique les permissions.
- **Un client qui se déconnecte doit être proprement nettoyé** (`req.on('close', ...)`) pour
  éviter une fuite de listeners sur le bus d'événements (`EventEmitter` qui grossit indéfiniment
  si les listeners ne sont jamais retirés).
- **Le nombre de connexions SSE simultanées consomme un descripteur de fichier / une connexion
  TCP chacune** — vérifier `ulimit -n` sur le serveur si l'équipe grossit significativement un
  jour (non préoccupant à l'échelle actuelle).
- **Caddy** : vérifier que le reverse proxy ne bufferise pas la réponse SSE (le header
  `X-Accel-Buffering: no` est pensé pour nginx, pas nécessairement lu par Caddy — à vérifier en
  conditions réelles ; si besoin, `flush_interval` dans la directive `reverse_proxy` de Caddy).

---

## 9. Definition of done

- [ ] Phase A déployée et testée en conditions réelles (planning uniquement)
- [ ] Aucune régression sur les routes REST existantes (temps de réponse inchangé)
- [ ] Tests de la §7 tous passés
- [ ] Phase B (extension aux autres vues) planifiée séparément, une fois le retour d'usage de la
      Phase A obtenu
