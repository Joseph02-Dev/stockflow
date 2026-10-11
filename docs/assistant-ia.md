# Assistant IA (V1, lecture seule)

Module `assistant` (désactivé par défaut), route `POST /assistant/chat`, panneau « Assistant » dans l'en-tête. L'utilisateur pose une question sur son stock ou ses ventes ; le modèle choisit des **outils** du backend, qui calculent les chiffres, puis rédige la réponse.

## Principe de sécurité

Le modèle ne fait que choisir des outils et rédiger. Tout le reste est décidé par le serveur :

| Garde-fou | Où |
|---|---|
| Entreprise tirée du jeton de connexion, jamais des arguments (aucun schéma d'outil ne contient `entrepriseId`, tout argument inconnu est refusé) | `outils-assistant.ts` |
| Outils de **lecture** seulement, requêtes Prisma ou SQL paramétré, filtrées par `entreprise_id` ; aucun SQL généré par le modèle | `outils-assistant.ts` |
| Arguments validés (class-validator) en plus du schéma strict côté modèle ; résultats et périodes bornés | `outils-assistant.ts` |
| Outils proposés selon les modules actifs (péremptions : module Lots) ; un outil non proposé est refusé | `outils-assistant.ts` |
| Historique reçu du navigateur : texte seul, 10 messages de 2 000 caractères au plus ; aucun bloc d'outil accepté | `dto/chat.dto.ts` |
| 4 tours d'outils au plus par question | `assistant.service.ts` |
| Quota : 50 questions par entreprise sur 24 h (`ASSISTANT_QUOTA_JOUR`), plus 20 requêtes par minute et par IP | `quota-assistant.ts`, `limitation.ts` |
| Données transmises au fournisseur : quantités et totaux ; ni client, ni utilisateur, ni prix d'achat, ni marge | `outils-assistant.ts` |
| Journaux : métadonnées seulement (outils, jetons, durée), jamais le texte ; rien n'est enregistré en base | `assistant.service.ts` |
| Panne ou clé absente : 503 contrôlé (`ASSISTANT_INDISPONIBLE`, `ASSISTANT_NON_CONFIGURE`), le reste de l'API n'est pas touché | `assistant.service.ts` |
| Arrêt d'urgence global : `FONCTIONNALITES_DESACTIVEES=assistant` | `fonctionnalites.ts` |

L'isolation entre entreprises repose, comme partout dans l'API, sur le filtrage explicite par `entreprise_id`. Les politiques RLS existent en base mais ne sont pas activées par requête : ce n'est donc pas une seconde barrière ici.

## Outils

| Outil | Arguments |
|---|---|
| `rechercher_produits` | `texte` (2 à 80 caractères), `limite` ≤ 10 |
| `stock_produit` | `produitId`, `emplacementId` facultatif |
| `produits_sous_seuil` | `limite` ≤ 20 |
| `lots_proches_peremption` | `jours` de 1 à 180, `limite` ≤ 20 (module Lots) |
| `resume_ventes` | `periode` : `7j`, `30j` ou `12m` (périodes glissantes, comparées à la précédente) |
| `meilleurs_produits` | `periode`, `critere` (`montant` ou `quantite`), `limite` ≤ 10 |

## Fournisseur

Interface `FournisseurIA` (`fournisseur-ia.ts`). Implémentation : Anthropic, API Messages avec appel d'outils (`fournisseur-anthropic.ts`) :

- modèle `claude-opus-5-5` (`ASSISTANT_MODELE`), effort `low` ;
- outils `strict` ;
- consignes mises en cache ;
- repli automatique côté API si le modèle décline une demande (`fallbacks: "default"`).

Les tests utilisent `FournisseurSimule` : aucune clé ni aucun réseau en CI.

## Mise en service

1. Ajouter `ANTHROPIC_API_KEY` aux variables **secrètes** du service backend (Railway). Ne jamais la mettre dans le frontend ni dans le dépôt.
2. Activer le module pour une entreprise de test : Paramètres › Modules › Assistant IA.
3. Mesurer pendant une à deux semaines : coût (jetons dans les journaux « Question à l'assistant »), outils appelés, réponses incomplètes.
4. Ouvrir aux clients, en mentionnant le fournisseur IA dans la politique de confidentialité.

## Suites prévues

- **Étape 2** : fiches d'aide « comment faire » rédigées, injectées dans les consignes mises en cache. Pas de recherche vectorielle tant qu'il y a moins de 50 fiches environ.
- **Étape 3** : actions (brouillon de commande) avec confirmation explicite de l'utilisateur, hors du modèle.
