# StockFlow

Application SaaS de gestion de stock pour PME : produits, mouvements d'entrée/sortie, fournisseurs, alertes et dashboard.

```
stockflow/
├── backend/    # API NestJS + PostgreSQL (Prisma) — 102 tests
└── frontend/   # Application React + Vite + Tailwind
```

## Prérequis

- **Node.js 20 ou plus** (`node --version`)
- **PostgreSQL 14 ou plus**, démarré localement

## Installation

### 1. Créer la base de données

```bash
createdb stockflow
```

Si `createdb` n'est pas disponible :

```bash
psql -U postgres -c "CREATE DATABASE stockflow;"
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Ouvrez `.env` et renseignez au minimum :

```
DATABASE_URL="postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/stockflow?schema=public"
JWT_ACCESS_SECRET=une-chaine-aleatoire-longue
JWT_REFRESH_SECRET=une-autre-chaine-aleatoire-longue
EMAIL_PROVIDER=dev
```

Pour générer des secrets : `openssl rand -hex 32`

Puis créez les tables, chargez le jeu de démonstration et démarrez :

```bash
npx prisma migrate dev
npm run seed
npm run start:dev          # http://localhost:3000
```

### 3. Frontend

Dans un **second terminal** :

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Ouvrez ensuite **http://localhost:5173**.

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@demo.fr` | `motdepasse123` |
| Gestionnaire | `gestionnaire@demo.fr` | `motdepasse123` |

Le jeu de démonstration contient 6 produits, 2 emplacements, 2 fournisseurs, 13 mouvements, 2 alertes actives et 1 alerte résolue.

`npm run seed` est rejouable : il remet à zéro les données de démonstration sans créer de doublon.

## Que tester

- **Dashboard** — indicateurs et produits en alerte, pastille de comptage dans le menu
- **Produits** — recherche, création, modification, archivage
- **Stock & Mouvements** — état du stock par emplacement, historique, enregistrement d'une entrée ou d'une sortie. Essayez une sortie supérieure au stock disponible : elle est refusée.
- **Alertes** — actives et résolues. Réapprovisionnez un produit en alerte : elle se résout automatiquement.
- **Fournisseurs** — fiche, produits associés, historique des réceptions
- **Paramètres** *(Administrateur uniquement)* — entreprise, emplacements, utilisateurs et rôles
- **Différence de rôle** — connectez-vous en gestionnaire : le menu Paramètres disparaît

Les emails d'alerte ne sont pas réellement envoyés en développement (`EMAIL_PROVIDER=dev`) : leur contenu s'affiche dans la console du backend.

## Limites connues

- Pas de navigation sur mobile : le menu latéral disparaît sous 768 px de large
- Pas encore de CI/CD ni de monitoring
- Le service d'email doit être branché sur un vrai fournisseur avant une mise en production

## Déploiement

### Backend — Railway

1. Sur [railway.app](https://railway.app), créez un projet depuis le dépôt GitHub.
2. Dans les réglages du service, définissez le **Root Directory** sur `backend`.
3. Ajoutez un plugin **PostgreSQL** au projet — Railway injecte automatiquement `DATABASE_URL`.
4. Variables d'environnement à ajouter manuellement :

   ```
   JWT_ACCESS_SECRET=...       # openssl rand -hex 32
   JWT_REFRESH_SECRET=...      # openssl rand -hex 32
   EMAIL_PROVIDER=dev
   FRONTEND_URL=https://votre-site.netlify.app
   ```

5. Railway détecte `backend/railway.json` : build avec `npm run build`, puis au démarrage `npm run migrate:deploy` (applique les migrations, jamais `migrate dev` en production) suivi de `npm run start:prod`.
6. Notez l'URL publique attribuée par Railway — elle sera nécessaire pour `VITE_API_URL` côté frontend.

### Frontend — Netlify

Le fichier `netlify.toml` à la racine indique déjà à Netlify que le projet vit dans `frontend/` et gère le routage React Router. Il reste à définir, dans les réglages du site Netlify :

```
VITE_API_URL=https://votre-backend.up.railway.app
```

## Documentation

`backend/README.md` — architecture, principe multi-tenant, contrôle d'accès, liste complète des routes API et état d'avancement du backlog.
