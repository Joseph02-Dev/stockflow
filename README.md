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
- [x] TECH-003 — Middleware multi-tenant (extraction entreprise_id depuis le JWT)
- [x] TECH-004 — Guard de rôles
- [x] TECH-005 — Service d'email (transport dev, avancé plus tôt que prévu pour AUTH-003)
- [x] AUTH-001-BE — Inscription (création entreprise + admin)
- [x] AUTH-002 — Connexion / déconnexion
- [x] AUTH-003 — Invitation d'un utilisateur par un Admin
- [x] ENT-001 — Configuration de l'entreprise
- [x] ENT-002 — Création d'emplacement
- [x] ENT-003 — Modification / archivage d'emplacement
- [x] PROD-001 à PROD-004 — Produits (création, modification, recherche/filtre, archivage)
- [x] FOUR-001 — Fiche fournisseur (création, modification)
- [x] FOUR-002 — Association / dissociation de produits à un fournisseur
- [x] MVT-001 — Entrée de stock (+ résolution automatique des alertes)
- [x] MVT-002 — Sortie de stock (+ déclenchement automatique des alertes)
- [x] MVT-003 — Historique des mouvements
- [x] MVT-004 — Stock par emplacement
- [x] FOUR-003 — Historique des réceptions par fournisseur
- [x] ALERT-001, ALERT-002 — Seuils et détection automatique (implémentés dans MVT-001/MVT-002)
- [x] ALERT-003 — Consultation des alertes
- [x] ALERT-004 — Notification par email
- [ ] **Sprint 4 (Alertes) terminé** — passage au Sprint 5 (Dashboard : DASH-001, DASH-002)

## API disponible

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Crée une entreprise + son premier utilisateur (Admin) |
| POST | `/auth/login` | Public | Connexion, retourne access + refresh token |
| POST | `/auth/logout` | Authentifié | Révoque le refresh token fourni (déconnexion côté serveur) |
| POST | `/users` | Admin | Invite un utilisateur (email + rôle), envoie un email avec un jeton |
| POST | `/auth/accept-invite` | Public | Accepte une invitation (nom + mot de passe), crée le compte, connecte automatiquement |
| GET | `/entreprise` | Authentifié | Consulte les informations de l'entreprise |
| PATCH | `/entreprise` | Admin | Modifie le nom de l'entreprise |
| GET | `/emplacements?archive=` | Authentifié | Liste les emplacements (actifs par défaut) |
| POST | `/emplacements` | Admin | Crée un emplacement |
| PATCH | `/emplacements/:id` | Admin | Modifie un emplacement |
| PATCH | `/emplacements/:id/archive` | Admin | Archive un emplacement (jamais de suppression physique) |
| GET | `/produits?search=&archive=` | Authentifié | Liste/recherche les produits (actifs par défaut) |
| POST | `/produits` | Authentifié | Crée un produit |
| PATCH | `/produits/:id` | Authentifié | Modifie un produit |
| PATCH | `/produits/:id/archive` | Authentifié | Archive un produit (jamais de suppression physique) |
| GET | `/fournisseurs` | Authentifié | Liste les fournisseurs |
| GET | `/fournisseurs/:id` | Authentifié | Détail d'un fournisseur |
| POST | `/fournisseurs` | Authentifié | Crée une fiche fournisseur |
| PATCH | `/fournisseurs/:id` | Authentifié | Modifie une fiche fournisseur |
| GET | `/fournisseurs/:id/produits` | Authentifié | Liste les produits associés |
| GET | `/fournisseurs/:id/receptions` | Authentifié | Historique des réceptions (entrées de stock du fournisseur) |
| POST | `/fournisseurs/:id/produits` | Authentifié | Associe un produit |
| DELETE | `/fournisseurs/:id/produits/:produitId` | Authentifié | Dissocie un produit |
| POST | `/mouvements/entree` | Authentifié | Enregistre une entrée de stock |
| POST | `/mouvements/sortie` | Authentifié | Enregistre une sortie de stock (409 si stock insuffisant) |
| GET | `/mouvements?produit_id=&emplacement_id=` | Authentifié | Historique des mouvements |
| GET | `/stock?produit_id=&emplacement_id=` | Authentifié | Stock actuel par emplacement |
| GET | `/alertes?statut=ACTIVE\|RESOLUE` | Authentifié | Liste les alertes (actives par défaut) |

## Logique d'alertes

- Une **sortie** qui fait passer le stock total sous le seuil du produit déclenche une alerte (`STOCK_FAIBLE` ou `RUPTURE` si le stock atteint 0).
- Une **entrée** qui fait remonter le stock total au-dessus du seuil **résout automatiquement** l'alerte active (décision validée en audit Lead Developer).
- Le déclenchement/la résolution sont **transactionnels** avec la mise à jour du stock et la création du mouvement : jamais d'incohérence entre `stock`, `mouvement` et `alerte`.
- **Notification email (ALERT-004)** : envoyée à tous les utilisateurs de l'entreprise, **après le commit** de la transaction — un échec d'envoi ne peut jamais annuler un mouvement de stock déjà validé. Un nouvel email n'est envoyé que si la gravité change (`STOCK_FAIBLE` → `RUPTURE`), jamais à chaque sortie.

## Service d'email

`EMAIL_SERVICE` (token DI) est une abstraction — actuellement implémentée par `DevEmailService` (`EMAIL_PROVIDER=dev`), qui journalise les emails sans les envoyer réellement. Un vrai fournisseur (Resend, SendGrid...) sera branché avant la mise en production, sans changer le code métier.

## Contexte multi-tenant

`TenantContextMiddleware` (appliqué à toutes les routes) décode le JWT présent dans l'en-tête `Authorization: Bearer <token>` et dépose `{ entrepriseId, utilisateurId, role }` :
- dans `req.tenantContext` (accessible via les décorateurs `@CurrentTenant()` et `@CurrentUser()`) ;
- dans `TenantContextService` (AsyncLocalStorage), injectable dans n'importe quel service pour filtrer systématiquement les requêtes Prisma par `entrepriseId`.

**Règle absolue** : `entrepriseId` ne provient jamais d'une donnée envoyée par le client (body, query, params) — toujours de ce contexte.

## Contrôle d'accès

`RolesGuard` (appliqué globalement) protège toutes les routes par défaut :
- `@Public()` → route accessible sans authentification (ex. connexion, inscription).
- Sans `@Public()` → authentification valide requise (401 sinon).
- `@Roles('ADMIN')` (ou plusieurs rôles) → restreint en plus l'accès à ces rôles (403 sinon).

Exemple :
```ts
@Public()
@Post('login')
login() { ... }

@Roles('ADMIN')
@Post('utilisateurs')
inviterUtilisateur() { ... }
```

## Base de données

ORM : **Prisma 7** (adaptateur `@prisma/adapter-pg`). Schéma : `prisma/schema.prisma` — reflète les 9 entités validées en architecture (avec `archive` sur `emplacement`, décision validée en audit Lead Developer).

```bash
npx prisma migrate dev     # créer/appliquer une migration en développement
npx prisma generate        # régénérer le client après modification du schéma
npx prisma studio          # explorateur visuel de la base
```

## Documentation

La documentation produit, architecture et UX complète est maintenue en dehors de ce dépôt (source de vérité du projet). Ce README sera enrichi au fil de l'implémentation.
