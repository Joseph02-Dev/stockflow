# Migration Railway : Config as Code → Infrastructure as Code

**Échéance : 1er décembre 2026.** Passé cette date, `backend/railway.json`
ne sera plus lu : le service perdrait sa commande de démarrage (migrations
puis API) et son healthcheck `/health`.

Sources : [Railway — Config as Code (dépréciation)](https://docs.railway.com/config-as-code),
[Railway — Infrastructure as Code](https://docs.railway.com/infrastructure-as-code),
SDK officiel [`railway`](https://github.com/railwayapp/railway-ts-sdk) (npm, v3.13.0) et
CLI officielle `@railway/cli` (v5.63.4, aide de `railway config`).

## Ce qui est déjà fait (dans le dépôt)

`.railway/railway.ts` a d'abord été généré par l'outil officiel
(`railway config migrate --service stockflow --apply`), puis **complété à la
main** : le fichier généré ne décrivait ni la source GitHub ni les variables,
et le premier `railway config plan` (2026-10-07) proposait de **supprimer les
13 variables du service** et de le déconnecter de GitHub.

Le fichier décrit maintenant tout le service `stockflow`, à l'identique de
la configuration en place :

- source : dépôt `Joseph02-Dev/stockflow`, branche `main`, dossier
  `backend`, attente de la CI (`checkSuites`) ;
- build RAILPACK `npm run build` ; démarrage
  `npm run migrate:deploy && npm run start:prod` ; healthcheck `/health`
  (300 s) ; redémarrage sur erreur limité à 3 essais, repris de
  `backend/railway.json` (`ON_FAILURE` est la valeur par défaut de Railway,
  non déclarée) ; sortie IPv6 activée ;
- variables : déclarées avec `preserve()`, qui **garde la valeur déjà
  saisie sur Railway**. Aucune valeur n'est écrite dans le dépôt.

`export const partial = "stockflow"` : ce dépôt ne gère **que** ce service.
La base PostgreSQL n'est pas décrite, donc pas gérée par ce fichier.

**Règle à retenir** : une variable absente de la liste `VARIABLES` de
`.railway/railway.ts` est supprimée au prochain `railway config apply`.
Pour ajouter une variable : l'ajouter d'abord à la liste (PR), puis la créer
sur Railway.

`WT_REFRESH_SECRET` existe sur Railway mais n'est lue nulle part dans le
code (faute de frappe probable de `JWT_REFRESH_SECRET`). Elle est conservée ;
à supprimer par l'exploitant s'il le souhaite, puis à retirer de la liste.

## Ce qu'il vous reste à faire (sur votre poste, environ 10 minutes)

À faire à un moment calme, sans déploiement en cours. Ne jamais copier de
jeton Railway dans le dépôt ni dans une conversation.

1. **Préparer la CLI** (version 5.42.1 ou plus récente) :
   ```bash
   npm install -g @railway/cli
   railway --version
   railway login
   ```
2. **Lier le dépôt**, à la racine du dépôt à jour (`git pull` sur `main`) :
   ```bash
   railway link        # projet stockflowgn, environnement production, service stockflow
   railway config migrate status
   npm install --no-save railway@3.13.0   # SDK lu par `plan`, rien n'est ajouté au dépôt
   ```
   Si `status` indique « No services in production read Config as Code »,
   sautez l'étape 3 (constaté le 2026-10-07).
3. **Basculer** le service vers l'IaC. Cette étape est réversible avec
   `railway config migrate undo` :
   ```bash
   railway config migrate cutover --service stockflow
   ```
4. **Prévisualiser**, aussitôt après :
   ```bash
   railway config plan
   ```
   Résultat attendu : **0 to destroy**, et au plus le réglage du build, du
   démarrage, du healthcheck et du redémarrage du service `stockflow`.
   **Arrêtez-vous** si le plan propose :
   - la création d'un service, ou la suppression d'un service ou d'une base ;
   - la suppression de variables (« Delete variable ») ;
   - la modification de la source (`source.repo`, `source.rootDirectory`) ;
   - le renommage du projet : le fichier indique `project("stockflowgn", …)`,
     le nom réel du projet sur Railway.

   Dans ce cas : ne lancez pas `apply` (et `railway config migrate undo` si
   l'étape 3 a été faite), puis envoyez-moi la sortie du plan. Les valeurs y sont
   masquées par défaut, n'utilisez pas `--show-values`.
5. **Appliquer** :
   ```bash
   railway config apply
   ```
6. **Vérifier** : au prochain déploiement, les journaux montrent
   `prisma migrate deploy` puis le démarrage de l'API, et `/health` répond
   `200`.
7. **Prévenez-moi** : je retirerai alors `backend/railway.json` dans une PR.
   Ce fichier ne doit être supprimé qu'**après** la bascule.

## Ensuite

Toute modification de configuration du service passe par
`.railway/railway.ts`, puis `railway config plan` et `railway config apply`.
Un `plan` qui ne propose aucun changement confirme que Railway et le dépôt
sont alignés.
