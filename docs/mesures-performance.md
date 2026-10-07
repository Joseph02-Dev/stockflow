# Mesures de performance — octobre 2026 (Phase 3, brique 3.1)

But : savoir **où** StockFlow ralentit avant d'optimiser quoi que ce soit.

## Méthode (reproductible)

Outils versionnés dans `backend/scripts/charge/` :

| Fichier | Rôle |
|---|---|
| `jeu-de-donnees.sql` | 500 entreprises « normales » (100 produits, 1 000 mouvements, 30 clients, 300 ventes à crédit chacune) + 1 « grosse » (2 000 produits, 200 000 mouvements, 500 clients, 20 000 ventes). Total : 52 000 produits, 700 000 mouvements, 170 000 ventes, 226 666 règlements. |
| `injecteur.mjs` | N utilisateurs simultanés, un par entreprise, chacun avec son adresse IP. Parcours pondéré en boucle : tableau de bord (6 requêtes), produits, ventes, créances, clients, mouvements, pertes, **enregistrement d'une vente** (10 %), rapport PDF (3 %). Pause de 1 à 3 s entre deux actions, départs étalés. Résultat : p50, p95 et p99 par parcours. |

```bash
# Base locale ou de test uniquement, jamais la production.
psql "$DATABASE_URL" -v entreprises=500 -f scripts/charge/jeu-de-donnees.sql
NODE_ENV=production LOG_LEVEL=warn PORT=3100 node dist/main.js &
node scripts/charge/injecteur.mjs 100 60 2000          # 100 utilisateurs, 60 s, pause 2 s
node scripts/charge/injecteur.mjs 8 60 2000 gros       # 8 utilisateurs sur la grosse entreprise
```

Conditions : machine de 4 vCPU, partagée entre l'API, PostgreSQL 16 et
l'injecteur. Build de production, toutes les protections actives
(limitation de débit, contrôles d'accès). PostgreSQL observé avec
`pg_stat_statements`. Les chiffres absolus dépendent de la machine : la
production Railway sera à re-mesurer. Les **rapports entre scénarios**,
eux, sont fiables.

Un « utilisateur » de l'injecteur agit toutes les 1 à 3 s, bien plus
souvent qu'un vrai gérant ou vendeur, qui agit plutôt toutes les 10 à
30 s. 100 utilisateurs de l'injecteur représentent donc plusieurs centaines
de personnes connectées en même temps.

## Résultats

### Montée en charge, 1 processus API

| Utilisateurs | Débit | Tableau de bord p50 / p95 | Vente p50 / p95 | PDF p50 | Erreurs |
|---|---|---|---|---|---|
| 100 | 106 req/s | 19 / 90 ms | 24 / 163 ms | 80 ms | 0 |
| 300 | 251 req/s | 421 / 1 135 ms | 903 / 2 226 ms | 618 ms | 0 |
| 500 | 243 req/s | 1 977 / 3 083 ms | 3 977 / 4 862 ms | 3 106 ms | 0 |
| 300, **rapports coupés** | 304 req/s | **35** / 195 ms | 69 / 357 ms | — | 0* |

\* 1,2 % de réponses 503 : les rapports volontairement coupés par l'interrupteur `FONCTIONNALITES_DESACTIVEES`.

### Montée en charge, 3 processus API (`WEB_CONCURRENCY=3`)

| Utilisateurs | Débit | Tableau de bord p50 / p95 | Vente p50 / p95 | PDF p50 |
|---|---|---|---|---|
| 300 | 309 req/s | **15** / 122 ms | 30 / 257 ms | 87 ms |
| 500 | 455 req/s | 180 / 1 031 ms | 448 / 1 649 ms | 313 ms |

### Grosse entreprise (8 utilisateurs)

Tout reste sous 100 ms au p50, sauf **Créances** (p50 216 ms, p95 566 ms) et
le **PDF d'état du stock** (2 000 références, environ 0,6 s).

## Constats

1. **Le goulot est le processeur de Node, pas la base.** Pendant la
   saturation, le fil principal de l'API est à 80-100 % d'un cœur, alors
   que PostgreSQL reste presque inactif : aucune requête au-delà de 6 ms
   pour les entreprises normales. Un processus plafonne vers 250 req/s sur
   cette machine.
2. **La génération des PDF bloque tout le monde.** pdfmake travaille sur
   le fil principal : pendant qu'un rapport se construit, aucune autre
   requête n'avance. Couper les rapports divise le temps médian du tableau
   de bord par 12 à 300 utilisateurs (421 → 35 ms).
3. **Le mode multi-processus, déjà présent dans le code, passe à l'échelle.**
   Avec 3 processus, le débit maximal double presque (243 → 455 req/s). Il
   faut des vCPU disponibles et Redis pour partager la limitation de débit.
   C'est la Partie B, réservée à l'offre payante.
4. **Créances : coût qui grandit avec toute la plateforme.** La requête des
   ventes impayées lit **tous les règlements de toutes les entreprises**
   (lecture séquentielle de 226 666 lignes, 93 ms) dès qu'une entreprise a
   beaucoup de ventes. La table `reglement` n'a pas d'`entreprise_id`.
5. **Connexions** : argon2 est volontairement coûteux. On mesure environ
   20 connexions par seconde par processus (300 connexions simultanées en
   14,5 s). C'est suffisant ; ne pas affaiblir argon2 pour gagner du temps.
6. **Pas de cache nécessaire pour l'instant** : les synthèses du tableau
   de bord coûtent moins de 1 ms en base pour une entreprise normale. Un
   cache ajouterait de la complexité et des risques de chiffres périmés,
   sans gain mesurable.

## Après la brique 3.2 : PDF dans un fil dédié (2026-10-07)

pdfmake tourne désormais dans un fil séparé (`worker_threads`,
`rapports/pdf/rendu.worker.mjs`). Le fil principal ne fait plus que
transmettre la définition du document et recevoir le PDF. Les PDF produits
sont **identiques au pixel près** : 8 pages comparées sur trois rapports,
0 pixel de différence.

La machine de mesure a changé entre les deux journées : les chiffres
absolus de ce jour ne sont pas comparables à ceux de la veille. La
comparaison est donc faite **le même jour, sur la même machine**, en
alternant l'ancienne (`main`) et la nouvelle version, sur deux tours.

| Scénario | Mesure | Avant | Après |
|---|---|---|---|
| 100 utilisateurs | Tableau de bord p95 | 270–338 ms | **99–114 ms** |
| 100 utilisateurs | Vente enregistrée p95 | 498–833 ms | **224–247 ms** |
| 100 utilisateurs | Liste des produits p95 | 204–271 ms | **73–79 ms** |
| 300 utilisateurs (saturation) | Débit | 147–149 req/s | **174–177 req/s** |
| 300 utilisateurs (saturation) | Tableau de bord p50 | 1 969–1 994 ms | **1 309–1 363 ms** |

Un rapport ne ralentit plus les autres utilisateurs. À saturation, le
fil de rendu se partage les mêmes cœurs que le reste : le passage à
plusieurs processus (Partie B) reste le levier suivant.

En vérifiant les rapports, un bug existant a été trouvé et corrigé : le
**rapport de pertes d'une entreprise sans aucune perte** sur la période
renvoyait une erreur 500. La légende de la répartition était un tableau
vide, que pdfmake refuse. Un test couvre désormais ce cas.

## Créances : options mesurées, décision de reporter (2026-10-07)

Les trois requêtes de l'écran Créances (ventes impayées, dernier règlement
par client, total encaissé de la semaine) ont été mesurées sur la grosse
entreprise, cas extrême de 20 000 ventes à crédit, toutes impayées. Les
essais ont été faits dans des transactions annulées : la base n'est pas
modifiée.

| Requête « ventes impayées », grosse entreprise | 227 000 règlements (aujourd'hui) | 1 million de règlements (plateforme ×4,5) |
|---|---|---|
| Requête actuelle | 146 ms | 207 ms : se dégrade avec la plateforme |
| A. Réécriture partant des ventes (LATERAL, index existant) | 130 à 155 ms ; total de la semaine 2× plus lent | environ 130 ms, stable |
| A + index couvrant | aucun gain mesurable | — |
| B. `entreprise_id` sur `reglement` + index | 130 ms | **67 à 78 ms**, stable |

Pour une entreprise normale (300 ventes), toutes les variantes restent
entre 1 et 2 ms.

PostgreSQL ne change pas de stratégie de lui-même quand la table grossit :
le coût augmente bien avec la taille de la plateforme, mais il reste
acceptable au volume actuel.

**Décision : ne rien changer maintenant.** L'option A n'apporte rien et
ralentit une requête ; l'option B est efficace mais demande une migration
en plusieurs étapes, sans gain visible aujourd'hui.

**Déclencheur pour réaliser l'option B**, dès que l'un des seuils est atteint :
- la table `reglement` dépasse **500 000 lignes**
  (`SELECT count(*) FROM reglement`) ;
- `GET /creances` dépasse **300 ms au p95** dans les journaux
  (`responseTime`) ou dans Sentry.

Contenu de B :
1. migration additive : colonne `entreprise_id` facultative, remplissage
   depuis `vente`, puis index `(entreprise_id, vente_id)` ;
2. renseigner la colonne aux quatre endroits qui créent un règlement :
   vente, encaissement, avoir, retour ;
3. filtrer les trois requêtes sur `r.entreprise_id` ;
4. rendre la colonne obligatoire dans une livraison suivante, comme le
   prévoit le runbook de retour arrière.

## Pool de connexions (2026-10-07)

100 utilisateurs, même machine, taille du pool `DB_POOL_MAX` variée :

| Connexions | Débit | Tableau de bord p50 / p95 | Vente p95 |
|---|---|---|---|
| 2 | 103 req/s | 35 / 109 ms | 155 ms |
| 5 | 104 req/s | 29 / 112 ms | 197 ms |
| 10 | 102 req/s | 32 / 158 ms | 200 ms |
| 20 | 104 req/s | 31 / 100 ms | 200 ms |

Aucune différence au-delà du bruit de mesure : les requêtes SQL durent 1 à
2 ms, quelques connexions suffisent. **10 est conservé**, avec de la marge
pour les opérations longues (import, rapports). Le gain de la brique 3.5
est dans les garde-fous ajoutés, pas dans la taille du pool.

## Suites recommandées (par gain mesuré)

| Priorité | Action | Gain attendu | Coût |
|---|---|---|---|
| 1 | ~~Générer les PDF hors du fil principal~~ **Fait** (brique 3.2) | p95 divisé par environ 3 à 100 utilisateurs | — |
| 2 | Créances : option B (`entreprise_id` sur `reglement`) **reportée**, à réaliser au déclencheur ci-dessus | Environ 3× plus rapide à 1 million de règlements | Migration en plusieurs étapes |
| 3 | `WEB_CONCURRENCY` avec Redis, à l'ouverture | Débit environ ×2 avec 3 processus (constat 3) | Offre payante |
| — | Cache des synthèses (brique 3.3) | Aucun gain mesuré | **Reportée** : à rouvrir seulement si une mesure le justifie |
