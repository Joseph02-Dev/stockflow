# Migration Railway : Config as Code → Infrastructure as Code

**Échéance : 1er décembre 2026.** Passé cette date, `backend/railway.json`
ne sera plus lu : le service perdrait sa commande de démarrage (migrations
puis API) et son healthcheck `/health`.

Sources : [Railway — Config as Code (dépréciation)](https://docs.railway.com/config-as-code),
[Railway — Infrastructure as Code](https://docs.railway.com/infrastructure-as-code),
SDK officiel [`railway`](https://github.com/railwayapp/railway-ts-sdk) (npm, v3.13.0) et
CLI officielle `@railway/cli` (v5.63.4, aide de `railway config`).

## Ce qui est déjà fait (dans le dépôt)

`.railway/railway.ts` a été généré par l'outil officiel :

```bash
railway config migrate --service stockflow --apply
```

- Le projet s'appelle **`stockflowgn`** et le service **`stockflow`** (noms
  réels sur Railway : le projet confirmé par l'exploitant, le service vu dans
  les journaux de démarrage). Sans `--service`, l'outil l'aurait nommé
  `backend`, d'après le dossier, et un `apply` aurait pu créer un second
  service.
- Il reprend à l'identique `backend/railway.json` : build `npm run build`,
  démarrage `npm run migrate:deploy && npm run start:prod`, healthcheck
  `/health` avec un délai de 300 s, builder RAILPACK.
- `export const partial = "stockflow"` : ce dépôt ne gère **que** ce service.
  La base PostgreSQL et les variables ne sont pas décrites, donc pas gérées
  par ce fichier.
- Le fichier est sans effet tant que la bascule (étape 3) n'est pas faite :
  Railway continue de lire `backend/railway.json`.

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
   ```
   `status` doit indiquer que `stockflow` lit encore Config as Code.
3. **Basculer** le service vers l'IaC. Cette étape est réversible avec
   `railway config migrate undo` :
   ```bash
   railway config migrate cutover --service stockflow
   ```
4. **Prévisualiser**, aussitôt après :
   ```bash
   railway config plan
   ```
   Résultat attendu : **au plus** le réglage de la commande de build, de
   démarrage et du healthcheck du service `stockflow`. **Arrêtez-vous** si le
   plan propose :
   - la création d'un service, ou la suppression d'un service ou d'une base ;
   - la suppression de variables ;
   - le renommage du projet : le fichier indique `project("stockflowgn", …)`,
     le nom réel du projet sur Railway.

   Dans ce cas : `railway config migrate undo`, puis envoyez-moi la sortie du
   plan. Les valeurs y sont masquées par défaut, n'utilisez pas
   `--show-values`.
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
