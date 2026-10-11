# Moteur de stock « double entrée » (inspiré d'Odoo)

## Principe

Tout mouvement va d'une **origine** vers une **destination** (`mouvement.origine`, `mouvement.destination`, enum `NatureEmplacement`) :

| Nature | Signification |
|---|---|
| `INTERNE` | Un emplacement réel de l'entreprise (`emplacementId`, et `emplacementDestinationId` pour l'arrivée d'un transfert) |
| `FOURNISSEUR`, `CLIENT` | Emplacements virtuels des partenaires |
| `REBUT` | Casses et produits périmés |
| `INVENTAIRE` | Écarts d'inventaire et stock d'ouverture (import) |
| `TRANSIT` | Réservé aux transferts en deux temps (pas encore utilisé) |

Sens par type (`src/modules/stock/sens-mouvement.ts`, dupliqué en SQL par les fonctions `mouvement_*_par_defaut`) :

| Type | Origine → destination |
|---|---|
| ENTREE | FOURNISSEUR → INTERNE (CLIENT pour une vente annulée, INVENTAIRE pour un import) |
| SORTIE | INTERNE → CLIENT |
| TRANSFERT | INTERNE → INTERNE |
| CASSE, PERIME | INTERNE → REBUT |
| RETOUR_CLIENT | CLIENT → INTERNE |
| RETOUR_FOURNISSEUR | INTERNE → FOURNISSEUR |
| AJUSTEMENT | INVENTAIRE → INTERNE si quantité ≥ 0, sinon INTERNE → INVENTAIRE (REBUT → INTERNE pour une casse annulée) |

Garanties en base :

- `mouvement_touche_stock_interne` : un mouvement touche toujours un emplacement réel ;
- `mouvement_origine_differente_destination` : seul un transfert va d'interne à interne ;
- le déclencheur `mouvement_sens_par_defaut` complète origine et destination quand une version précédente de l'API les omet (retour arrière sans risque).

`Stock` joue le rôle des *quants* d'Odoo (quantité en main par produit et emplacement) et `Lot` leur détail par lot. La quantité d'un `AJUSTEMENT` reste signée, par compatibilité avec les rapports existants.

## Point d'écriture unique

`src/modules/stock/moteur-stock.ts` est le **seul** code qui écrit les tables `stock`, `lot` et `mouvement` :
`crediterStock`, `debiterStock` (décrément conditionnel : jamais de stock négatif), `ajusterStock`, `creerLot`, `obtenirLot`, `crediterLot`, `debiterLot`, `ajusterLot`, `enregistrerMouvement`.
Le test `architecture-stock.spec.ts` échoue si un autre fichier fait `stock.update`, `lot.create`, `mouvement.create`…

## API

| Route | Rôle |
|---|---|
| `GET /stock/emplacements` | Emplacements réels (avec leur chemin) et virtuels |
| `GET /stock/quantites?produit_id=&emplacement_id=` | Quantités en main, détaillées par lot |
| `GET /stock/mouvements?produit_id=&emplacement_id=&limite=&apres=` | Historique paginé, chaque mouvement avec `source` et `destination` |
| `POST /stock/mouvements` | Mouvement générique `{ produitId, source: { nature, emplacementId? }, destination: {…}, quantite }` : réception, sortie ou transfert. Casses, retours et ajustements gardent leurs écrans dédiés, car ils exigent leur document. |

Les routes existantes (`/mouvements/entree`, `/mouvements/sortie`, `/mouvements/transfert`, `/stock`) sont inchangées.

## Modules activables (feature flags)

Registre unique : `src/common/modules/modules-entreprise.ts`. Un module coupé disparaît de l'interface et ses routes répondent `403 MODULE_DESACTIVE`.

| Module | Colonne | Réglé par | Défaut |
|---|---|---|---|
| Inventaires | `module_inventaires` | Console (offre) | activé |
| Transferts | `module_transferts` | Console (offre) | activé |
| Lots et péremptions | `module_lots` | Administrateur (Paramètres › Modules) | activé |
| Arborescence des emplacements | `module_arborescence` | Administrateur | désactivé |
| Variantes de produits | `module_variantes` | Administrateur | désactivé |
| Conditionnements | `module_conditionnements` | Administrateur | désactivé |
| Numéros de série | `module_numeros_serie` | Administrateur | désactivé |
| Stratégies de sortie | `module_strategies_sortie` | Administrateur | désactivé (FEFO) |

Ajouter un module : une colonne booléenne sur `Entreprise`, une entrée dans le registre, puis `@ModuleRequis('cle')` sur ses routes et `useModules()` côté interface.

## Variantes (vague 2)

Un **modèle** (`ModeleProduit`, le *product.template* d'Odoo) porte des attributs (`AttributModele` : « Taille » → S, M, L ; trois au maximum). Chaque combinaison devient un **`Produit` ordinaire** (le *product.product*), avec `modeleId`, `valeursVariante` et une `cleVariante` unique par modèle.
Le stock, les ventes, les lots et les inventaires fonctionnent donc sur les variantes sans aucun changement.

- La grille est générée à la création (200 variantes au maximum, avec contrôle de la limite de références). Nom et référence sont automatiques : « T-shirt — Rouge / M », `TSHIRT-ROUGE-M`.
- Les prix, la catégorie et l'unité du modèle sont **copiés** dans chaque nouvelle variante, qui reste ensuite modifiable sur sa fiche.
- Une fois les variantes créées, on peut ajouter des valeurs : seules les variantes manquantes sont générées. Retirer une valeur ou changer d'axe est refusé, car les variantes existantes perdraient leur sens.
- Routes : `GET/POST /modeles`, `GET/PATCH /modeles/:id`, `PATCH /modeles/:id/archive` (archive aussi les variantes), `GET /produits?modele_id=`.

## Conditionnements (vague 2)

Le stock reste tenu en **unité de base** (entier). Un `Conditionnement` déclare une contenance : 1 Carton = 12, 1 Palette = 480.
Une entrée, une sortie ou un transfert peut être saisi dans un conditionnement (`conditionnementId`). La quantité est alors multipliée par le facteur avant d'atteindre le moteur.
Le mouvement garde `conditionnementId` et le `facteurConditionnement` **figé**, ce qui permet d'afficher « 2 × Palette ». Le facteur d'un conditionnement ne se modifie jamais : on l'archive et on en crée un autre.

Routes : `GET/POST /produits/:produitId/conditionnements`, `PATCH /conditionnements/:id`, `PATCH /conditionnements/:id/archive`.

Hors périmètre pour l'instant : la saisie en conditionnement dans les ventes et les commandes fournisseur (toujours en unités), et les unités fractionnaires (kg → g), qui demanderaient des quantités décimales.

## Numéros de série (vague 3)

Un produit suivi par numéro de série (`suiviParSerie`, qui implique `suiviParLot` : contrainte en base) est un produit suivi par lot dont **chaque lot vaut une unité**. Sorties, transferts, ventes, retours et inventaires réutilisent donc la mécanique des lots sans réécriture.

- **Réception** : `numerosSerie` (un par unité, sans doublon) sur `/mouvements/entree`, `POST /stock/mouvements` et la réception de commande. Le système crée un lot et un mouvement par numéro. La date de péremption est facultative.
- **Unicité** : un numéro déjà en stock (casse comprise) est refusé, quel que soit l'emplacement. Un verrou consultatif par produit sérialise les entrées simultanées.
- **Inventaire** : un numéro se compte 0 ou 1.
- **Activation** : seulement sur un produit **sans stock**, car le stock existant n'a pas de numéros et on ne les invente pas.

## Stratégies de sortie (vague 3)

`StrategieSortie` = FEFO (péremption la plus proche), FIFO (réception la plus ancienne) ou LIFO (réception la plus récente).
L'entreprise a une stratégie par défaut, et chaque emplacement peut en avoir une propre (`strategieSortie` nul = celle de l'entreprise). Sans le module : toujours FEFO, comme avant.
La stratégie s'applique à toute sortie automatique de lots (vente, sortie, casse, retour fournisseur, transfert) et à l'ordre affiché dans « Lots en stock ».
Pour un produit sans lot, il n'y a rien à choisir : son coût par couche viendra avec la valorisation (vague 5).

## Traçabilité

`GET /produits/:id/tracabilite?numero=` renvoie tous les mouvements d'un lot ou d'un numéro de série, à travers les emplacements. Dans l'interface, un clic sur un lot de la fiche produit ouvre son historique.

## Feuille de route

| Vague | Contenu | État |
|---|---|---|
| 1 | Double entrée, moteur unique, arborescence des emplacements, modules | **Livrée** |
| 2 | Variantes (attributs, grille, référence automatique) et conditionnements avec conversion | **Livrée** (`moduleVariantes`, `moduleConditionnements`) |
| 3 | Numéros de série, stratégies de sortie FEFO/FIFO/LIFO, traçabilité par lot | **Livrée** (`moduleNumerosSerie`, `moduleStrategiesSortie`) |
| 4 | Règles de réapprovisionnement min/max (tâche planifiée), rangement automatique, stratégie de retrait par entrepôt | À faire |
| 5 | Couches de valorisation (FIFO, coût moyen pondéré), rapports de rotation et de stock dormant, OpenAPI et webhooks | À faire. La valorisation se fait aujourd'hui au prix d'achat actuel. |
