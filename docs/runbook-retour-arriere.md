# Runbook — retour arrière d'une mise en production

But : revenir en quelques minutes à la dernière version saine quand un
déploiement casse la production, sans perdre de données.

Sources : [Railway — Roll back a bad deploy](https://docs.railway.com/guides/roll-back-bad-deploy),
[Railway — Deployment actions](https://docs.railway.com/deployments/deployment-actions),
[Railway — Back up and restore Postgres](https://docs.railway.com/guides/postgres-backups-restores),
[Vercel — Instant Rollback](https://vercel.com/docs/instant-rollback),
[Vercel — Promoting deployments](https://vercel.com/docs/deployments/promoting-a-deployment),
[Prisma — Rollbacks and recovery](https://www.prisma.io/docs/orm/migrations/rollbacks-and-recovery).

## 1. Quand revenir en arrière

Revenir en arrière **d'abord**, chercher la cause **ensuite**, dès que l'un
de ces signes suit un déploiement :

- le healthcheck `/health` échoue ou l'application ne démarre plus ;
- les logs Railway montrent une hausse d'erreurs (`@level:error`) ;
- une fonction essentielle est cassée : connexion, vente, mouvement de stock ;
- des données affichées sont fausses ou appartiennent à une autre entreprise
  (incident de sécurité : revenir en arrière **et** prévenir immédiatement).

Un défaut mineur, sans perte de données ni blocage, se corrige par une PR
normale, sans retour arrière.

## 2. Quel côté revenir

| Symptôme | Côté à revenir |
|---|---|
| Erreurs 5xx, `/health` en échec, logs d'erreur côté API | Backend (Railway) |
| Écran blanc, page cassée, API saine (`/health` = 200) | Frontend (Vercel) |
| Les deux ont été déployés ensemble et l'API a changé | Les deux : **frontend d'abord**, puis backend |

Pourquoi le frontend d'abord : un ancien frontend appelle l'API de la
version précédente, que le nouveau backend sert encore ; l'inverse (ancien
backend, nouveau frontend) peut appeler des routes qui n'existent plus.

## 3. Backend — Railway

1. Railway → projet → service **stockflow** → onglet **Deployments**.
2. Sur le dernier déploiement **sain** (avant celui qui casse) : menu **⋮** →
   **Rollback** → confirmer.
3. Railway redémarre l'image de ce déploiement **sans reconstruire** : effectif
   en quelques secondes. Le nouveau conteneur n'est activé qu'après un
   `/health` réussi.

À savoir :

- **Durée de conservation des images** : 24 h (Free/Trial), 72 h (Hobby),
  120 h (Pro), 360 h (Enterprise). Au-delà, l'option Rollback disparaît :
  utiliser **Redeploy** sur ce déploiement (reconstruction depuis son code
  source, avec ses variables d'origine, donc plus lente).
- **Les variables reviennent aussi** à celles du déploiement choisi. Si un
  secret a été changé depuis (par exemple une clé compromise remplacée),
  vérifier dans l'onglet **Variables** que la valeur à jour est bien en place.
- **La base n'est pas modifiée** par le retour arrière : voir section 5.

## 4. Frontend — Vercel

1. Vercel → projet **stockflow** → page d'accueil du projet → tuile
   **Production Deployment** → **Instant Rollback**.
2. Choisir le déploiement précédent et confirmer. Le changement se fait au
   niveau du routage : effectif en quelques secondes, sans reconstruction.

À savoir :

- **Offre Hobby** : retour possible **uniquement vers le déploiement
  immédiatement précédent**. Les offres Pro et Enterprise permettent de
  revenir à n'importe quel déploiement de production antérieur.
- **Après un retour arrière, Vercel suspend l'affectation automatique** du
  domaine de production : les nouveaux commits sur `main` ne remplacent plus
  la version en ligne. Une fois le correctif fusionné, **promouvoir** le
  nouveau déploiement (tableau de bord, ou `vercel promote <url-ou-id>`) :
  cela réactive la mise en ligne automatique.
- `VITE_API_URL` et la CSP sont figées dans le build : le déploiement choisi
  garde l'URL d'API qu'il avait à sa construction.

## 5. Base de données

Le code peut revenir en arrière ; **le schéma, lui, ne revient pas**. Au
démarrage, Railway exécute `prisma migrate deploy` : avec une image plus
ancienne, la commande ne trouve aucune migration à appliquer et l'application
démarre sur le schéma le plus récent (vérifié le 2026-10-06 : « No pending
migrations to apply »).

**Règle de développement qui rend le retour arrière sûr** : chaque
migration doit laisser fonctionner le code de la version précédente.

- Autorisé : ajouter une table, une colonne facultative, une colonne
  obligatoire **avec** valeur par défaut, un index.
- À faire en deux livraisons : supprimer ou renommer une colonne, changer un
  type, rendre une colonne obligatoire. D'abord une version du code qui
  n'utilise plus l'ancienne forme ; la suppression ne vient qu'à la livraison
  suivante.
- Le test `backend/src/config/migrations-retour-arriere.spec.ts` (CI) refuse
  ces opérations. Pour une exception assumée, ajouter dans la migration une
  ligne `-- retour-arriere: <raison>` **et** faire une sauvegarde manuelle de
  la base juste avant le déploiement.

**Restauration de la base (dernier recours)**, seulement si des données ont
été corrompues :

1. Railway → service PostgreSQL → onglet **Backups** → sauvegarde datée
   d'avant l'incident → **Restore**.
2. Railway prépare un nouveau volume. Relire le changement, puis **Deploy**.

Attention : toutes les écritures faites après la sauvegarde sont perdues
(ventes, mouvements), et la restauration **supprime les sauvegardes plus
récentes**. Avant de restaurer, faire une sauvegarde manuelle de l'état
actuel, puis prévenir les entreprises concernées.

## 6. Vérifier après le retour arrière

- `GET /health` répond `200` (`{"statut":"ok","baseDeDonnees":"ok"}`).
- Connexion, tableau de bord, création d'un mouvement : fonctionnent.
- Logs Railway : plus de nouvelles lignes `@level:error` liées à l'incident.

## 7. Corriger durablement

Le code fautif est toujours sur `main` : le prochain déploiement le
remettrait en ligne.

1. Créer une branche et annuler la fusion fautive :
   `git revert -m 1 <commit de fusion>`.
2. Ouvrir une PR. La CI doit passer, puis fusionner : Railway et Vercel
   redéploient une version saine depuis `main`.
3. Sur Vercel, vérifier que l'affectation automatique du domaine est
   réactivée (section 4).
4. Écrire un court compte rendu : cause, durée, impact, mesure pour éviter
   la récidive (un test qui aurait détecté le problème, par exemple).

## 8. À préparer avant le premier incident

- [ ] Railway, service PostgreSQL : **sauvegardes automatiques activées**
      (planning quotidien conseillé) ; un essai de restauration fait une fois
      dans un environnement de test.
- [ ] Noter l'offre Railway et l'offre Vercel en cours : elles fixent la
      fenêtre de retour arrière (sections 3 et 4).
- [ ] Protection de la branche `main` : checks « Backend » et « Frontend »
      obligatoires avant fusion.
