# ADR 0001 — Application web « local first » plutôt qu'une réécriture Flutter

- **Statut** : acceptée (25/10/2026)
- **Décideur** : porteur du produit
- **Contexte de la demande** : travailler sur l'appareil avec ou sans
  connexion, synchronisation automatique avec PostgreSQL au retour du
  réseau, présence sur Google Play et l'App Store.

## Décision

On garde l'application web React (une seule base de code pour le web, les
téléphones et les ordinateurs) et on la fait passer en **« local first »** :
une base de données locale sur l'appareil devient la source des écrans, et
une synchronisation incrémentale la tient à jour avec l'API. On ne réécrit
pas l'interface en Flutter.

## Raisons

- Le hors ligne existe déjà en partie : file d'opérations dans IndexedDB
  (ventes, mouvements, clients, pertes, réceptions), identifiants créés sur
  l'appareil, renvoi sans doublon côté serveur (`operation_hors_ligne`,
  `idClient`). Il manque surtout une vraie **lecture locale**.
- Une réécriture Flutter couvrirait environ quarante écrans, avec deux
  applications à maintenir pendant la transition, pour un résultat
  identique pour l'utilisateur.
- Le site public et la console d'administration resteraient de toute façon
  en React (Flutter web convient mal à un site public).

## Alternatives écartées

| Option | Pourquoi pas maintenant |
| --- | --- |
| Flutter + SQLite (Drift) + synchronisation maison | Réécriture complète de l'interface ; la synchronisation serait à écrire de toute façon. |
| Flutter + PowerSync | Réécriture, plus un service externe payant au-delà de l'offre gratuite, et des règles d'isolation à dupliquer. |
| Firebase / Firestore | Quitter PostgreSQL et migrer toutes les données. |
| Realm (MongoDB) | Synchronisation abandonnée par MongoDB. |

Ces options restent possibles plus tard : l'API de synchronisation décrite
ci-dessous servirait aussi à une application native.

## Limites actuelles (ce que la décision corrige)

1. **Lecture hors ligne = cache HTTP par adresse exacte** (service worker).
   Une recherche, un filtre, une page ou une période jamais ouverts en ligne
   restent vides hors ligne.
2. **Préchargement complet** d'une trentaine d'adresses toutes les
   5 minutes : lourd en données mobiles, sans notion de « ce qui a changé ».
3. Les opérations en attente ne sont reflétées que sur certains écrans
   (stock de la nouvelle vente, liste des clients).

## Conception

### Côté appareil

- **Base locale IndexedDB** via Dexie (requêtes indexées, transactions,
  versions de schéma). Tables par entreprise : `produits`, `stock`
  (produit × emplacement), `emplacements`, `categories`, `marques`,
  `clients`, `fournisseurs`, `alertes`, `lots`, `ventes` et `mouvements`
  récents (90 jours, configurable).
- **Écrans en lecture locale** : un hook unique (`useDonneesLocales`) lit la
  base locale ; recherche, filtres et tri se font sur l'appareil. Les
  écrans d'analyse lourde (rapports PDF, statistiques longues, valorisation)
  restent en ligne.
- **Écritures** : la file d'opérations actuelle est conservée. Ses
  opérations ne sont pas écrites dans la base locale : elles sont
  **superposées à la lecture** (`lib/superpositionFile.ts`, SYNC-05). Le
  stock affiché tient compte des entrées, sorties, transferts, pertes et
  ventes en attente, et les clients et ventes saisis hors ligne
  apparaissent aussitôt. Une opération quitte la file quand le serveur
  l'accepte, et la synchronisation suivante apporte sa valeur réelle ; un
  refus la retire sans rien à défaire, et une opération n'est jamais
  comptée deux fois. Les réceptions de commande, dont les quantités sont
  connues du seul serveur, arrivent à la synchronisation.
- **Déconnexion** : la base locale de l'entreprise est effacée (même règle
  qu'aujourd'hui pour le cache : un second compte ne voit jamais les
  données du premier).

### Côté serveur

- **Migration** : colonne `updated_at` (`@updatedAt`) et index
  `(entreprise_id, updated_at)` sur les tables synchronisées ; `Stock` en a
  besoin aussi.
- **`GET /sync?depuis=<curseur>`** : renvoie, par table, les lignes
  modifiées depuis le curseur et un nouveau curseur (horodatage serveur).
  Premier appel sans curseur : instantané complet. Pagination par lots.
- **Suppressions** : la plupart des données sont archivées (`archive`), pas
  supprimées, et passent donc par `updated_at`. Pour les suppressions
  réelles (associations fournisseur-produit, catégories, marques), la
  réponse inclut la liste des identifiants encore existants des petites
  tables.
- **Pas de conflit sur le stock** : l'appareil envoie des opérations
  (« vente de 3 sacs »), jamais une quantité finale ; le serveur recalcule
  et marque « à régulariser » un manque constaté (déjà en place).
- Isolation : la synchronisation ne renvoie que l'entreprise du jeton
  (filtre explicite et RLS).

### Stores

- **Google Play** : Trusted Web Activity (Bubblewrap). L'application
  installée est la même PWA, ouverte par Chrome sur stockflowgn.com : le
  service worker, les notifications push, le cookie de session et le hors
  ligne fonctionnent sans changement. Il faut seulement publier
  `/.well-known/assetlinks.json`.
- **App Store** : Capacitor (WebView iOS), dans un second temps. Trois
  adaptations sont nécessaires :
  1. **Session** : le cookie httpOnly en `SameSite=Strict` n'est pas envoyé
     depuis l'origine de l'application vers l'API. Il faudra un jeton de
     renouvellement rangé dans le trousseau iOS (plugin de stockage
     sécurisé) pour cette seule plateforme.
  2. **Notifications** : Web Push n'existe pas dans la WebView. Il faudra
     les notifications natives (APNs, plugin `@capacitor/push-notifications`)
     et un second canal d'envoi dans `PushService`.
  3. **Hors ligne** : l'application est embarquée dans le paquet, et les
     données sont dans IndexedDB. La base locale de cette décision est donc
     un prérequis pour iOS.

### Contrat de `GET /sync` (livré par SYNC-02)

- `GET /sync` (session requise) : instantané complet de l'entreprise.
  `GET /sync?depuis=<curseur>` : seulement ce qui a changé depuis.
- Réponse :
  - `tables` : lignes complètes par table (`produits`, `stock`,
    `emplacements`, `categories`, `marques`, `clients`, `fournisseurs`,
    `alertes`, `lots`, `ventes` avec leurs `lignes`, `mouvements`), à
    enregistrer par clé (`id`, ou `produitId` + `emplacementId` pour le
    stock) ;
  - `curseur` : opaque, à renvoyer tel quel à l'appel suivant ;
  - `encore` : une table a rempli sa page (500 lignes) ; rappeler aussitôt ;
  - `existants` : identifiants des catégories et marques encore présentes
    (les seules vraiment supprimées) ; retirer localement les autres.
- Ventes et mouvements : 90 derniers jours.
- Une fois à jour, le curseur reprend 2 minutes en arrière : une même
  ligne peut revenir, l'enregistrement local doit donc écraser sans
  dupliquer.
- Curseur illisible : `400`, l'appareil recommence un instantané complet.

## Conséquences

- La synchronisation devient un composant central : tests d'intégration
  dédiés (premier chargement, incrément, suppression, reprise après
  coupure, changement de compte).
- Volume local à surveiller : estimation de la taille par entreprise avant
  d'élargir l'historique au-delà de 90 jours.
- Le préchargement actuel (`prechargementHorsLigne.ts`) et le cache des
  réponses API du service worker sont retirés à la fin de la migration ;
  le service worker garde la mise en cache de l'application elle-même.

## Découpage en tickets (ordre de livraison)

| # | Ticket | Contenu | Dépend de |
| --- | --- | --- | --- |
| 1 | SYNC-01 Migration | `updated_at` + index sur les tables synchronisées | — |
| 2 | SYNC-02 API | `GET /sync?depuis=` : instantané, incrément, pagination, identifiants existants ; tests d'intégration et d'isolation | 1 |
| 3 | SYNC-03 Base locale | Dexie : schéma, ouverture par entreprise, effacement à la déconnexion | — |
| 4 | SYNC-04 Moteur | Synchronisation au lancement, au retour du réseau et toutes les N minutes ; curseur ; indicateur « synchronisé il y a … » | 2, 3 |
| 5 | SYNC-05 Écritures locales | File d'opérations superposée à la lecture de la base locale (vue locale) | 4 |
| 6 | SYNC-06 Écrans terrain | Nouvelle vente, Stock, Produits, Clients en lecture locale | 4, 5 |
| 7 | SYNC-07 Écrans suivants | Fournisseurs, Commandes, Alertes, Ventes (historique 90 j) | 6 |
| 8 | SYNC-08 Nettoyage | Retrait du préchargement et du cache API du service worker | 7 |
| 9 | STORE-01 Google Play | TWA (Bubblewrap), `assetlinks.json`, fiche Play | indépendant (possible tout de suite) |
| 10 | STORE-02 App Store | Capacitor iOS : session (trousseau), notifications APNs | 6 |

Chaque ticket est livré par une PR avec ses tests ; les tickets 1 à 4 ne
changent rien de visible pour l'utilisateur.
