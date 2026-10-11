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

Ajouter un module : une colonne booléenne sur `Entreprise`, une entrée dans le registre, puis `@ModuleRequis('cle')` sur ses routes et `useModules()` côté interface.

## Feuille de route

| Vague | Contenu | État |
|---|---|---|
| 1 | Double entrée, moteur unique, arborescence des emplacements, modules | **Livrée** |
| 2 | Variantes (attributs, grille, SKU auto) et unités de mesure avec conversions | À faire (`moduleVariantes`, `moduleMultiUnites`) |
| 3 | Numéros de série ; FIFO/LIFO en plus du FEFO existant | Lots + FEFO déjà en place ; séries à faire |
| 4 | Règles de réapprovisionnement min/max (tâche planifiée), rangement automatique, stratégie de retrait par entrepôt | À faire |
| 5 | Couches de valorisation (FIFO, coût moyen pondéré), rapports de rotation et de stock dormant, OpenAPI et webhooks | À faire. La valorisation se fait aujourd'hui au prix d'achat actuel. |
