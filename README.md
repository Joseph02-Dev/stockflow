# StockFlow — Backend

Application SaaS de gestion de stock pour PME. Backend NestJS (TypeScript), architecture **monolithe modulaire**, multi-tenant.

## Stack

- **Framework** : NestJS + TypeScript
- **Base de données** : PostgreSQL (à connecter au ticket TECH-002)
- **Authentification** : JWT (access + refresh)
- **Frontend associé** : React (dépôt séparé)

## Structure du projet

```
src/
├── modules/            # Un module = un epic produit
│   ├── auth/            # AUTH-* : authentification, utilisateurs, rôles
│   ├── entreprise/       # ENT-001 : configuration entreprise
│   ├── emplacements/     # ENT-002, ENT-003 : gestion des emplacements
│   ├── produits/         # PROD-* : catalogue produits
│   ├── fournisseurs/     # FOUR-* : fournisseurs
│   ├── mouvements/       # MVT-* : entrées/sorties de stock
│   ├── alertes/          # ALERT-* : seuils et notifications
│   └── dashboard/        # DASH-* : vue d'ensemble
├── common/              # Briques transverses
│   ├── guards/           # Contrôle d'accès par rôle, garde multi-tenant
│   ├── decorators/       # Ex. @CurrentUser(), @CurrentTenant()
│   ├── middleware/       # Extraction/validation du contexte entreprise
│   ├── filters/          # Filtres d'exception globaux
│   └── interceptors/     # Ex. logging, formatage des réponses
├── config/              # Configuration (variables d'environnement typées)
├── app.module.ts
└── main.ts
```

## Principe multi-tenant

Toute donnée est rattachée à une `entreprise_id`, déduite du token JWT — jamais transmise par le client. Voir `src/common/middleware` (implémenté au ticket TECH-003).

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les valeurs réelles localement
npm run start:dev
```

## Scripts

| Commande | Description |
|---|---|
| `npm run start:dev` | Démarrage en mode watch |
| `npm run build` | Build de production |
| `npm run lint` | Analyse statique |
| `npm run test` | Tests unitaires |
| `npm run test:e2e` | Tests end-to-end |

## État d'avancement

- [x] TECH-001 — Structure modulaire initialisée
- [x] TECH-002 — Connexion PostgreSQL (Prisma) + migration initiale
- [ ] TECH-003 — Middleware multi-tenant
- [ ] TECH-004 — Guard de rôles
- [ ] Voir le backlog produit et technique pour la suite

## Base de données

ORM : **Prisma 7** (adaptateur `@prisma/adapter-pg`). Schéma : `prisma/schema.prisma` — reflète les 9 entités validées en architecture (avec `archive` sur `emplacement`, décision validée en audit Lead Developer).

```bash
npx prisma migrate dev     # créer/appliquer une migration en développement
npx prisma generate        # régénérer le client après modification du schéma
npx prisma studio          # explorateur visuel de la base
```

## Documentation

La documentation produit, architecture et UX complète est maintenue en dehors de ce dépôt (source de vérité du projet). Ce README sera enrichi au fil de l'implémentation.
