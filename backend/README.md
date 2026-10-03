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
- [x] DASH-001 — Vue d'ensemble du stock
- [x] DASH-002 — Produits en alerte
- [x] **MVP backend terminé** — 90 tests d'intégration, tous les tickets backend du MVP livrés

### Reste à faire hors backend
- Tickets frontend (React) : AUTH-001-FE, AUTH-004-FE, MVT-001-FE, MVT-002-FE, ALERT-004-FE
- TECH-006 à TECH-009 : CI/CD, monitoring, tests d'isolation multi-tenant dédiés
- Remplacement du transport email `dev` par un fournisseur réel avant la mise en production

## API disponible

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Crée une entreprise + son premier utilisateur (Admin) |
| POST | `/auth/login` | Public | Connexion, retourne access + refresh token |
| POST | `/auth/logout` | Authentifié | Révoque le refresh token fourni (déconnexion côté serveur) |
| GET | `/users` | Admin | Liste les utilisateurs de l’entreprise (sans le hash du mot de passe) |
| POST | `/users` | Admin | Invite un utilisateur (email + rôle), envoie un email avec un jeton |
| PATCH | `/users/:id/role` | Admin | Modifie le rôle d’un utilisateur (refuse de rétrograder le dernier Admin) |
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
| GET | `/dashboard/overview` | Authentifié | KPI agrégés + produits actuellement en alerte |

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

## Console opérateur

Espace réservé au propriétaire de la plateforme, sous `/console/*`. C'est le **seul** endroit qui traverse volontairement l'isolation multi-tenant ; il est donc cloisonné de l'application cliente à tous les niveaux :

- **Authentification séparée** : modèle `Operateur` (distinct d'`Utilisateur`, rattaché à aucune entreprise), token signé avec `JWT_CONSOLE_SECRET` et portant `typ: "console"`. Un token client est refusé sur `/console/*`, un token opérateur est refusé sur les routes clientes (401 dans les deux cas, tests à l'appui).
- **Garde propre** : `@RouteConsole()` applique `ConsoleGuard` ; `TenantContextMiddleware` et `RolesGuard` ne s'exécutent pas sur ces routes. Ne jamais y utiliser `@CurrentTenant()`.
- **Fermée par défaut** : si `JWT_CONSOLE_SECRET` est absent ou identique à un autre secret JWT, la console refuse toute connexion.
- **Journal d'audit** : toute lecture ou modification des données d'une entreprise par un opérateur est inscrite dans `journal_audit`.
- **Lecture seule** sur les données métier : un opérateur consulte et suspend, rien d'autre.

### Routes

| Route | Rôle | Journalisé |
| --- | --- | --- |
| `POST /console/auth/login` | Connexion opérateur (token 2 h, pas de refresh) | `CONNEXION` |
| `GET /console/auth/moi` | Vérifie la session | — |
| `GET /console/apercu` | KPI plateforme, répartition des mouvements, entreprises à surveiller | `CONSULTATION_ENTREPRISE` |
| `GET /console/entreprises` | Liste avec agrégats (`?recherche=`, `?etat=`) | `CONSULTATION_ENTREPRISE` |
| `GET /console/entreprises/:id` | Synthèse, emplacements, utilisateurs | `CONSULTATION_ENTREPRISE` |
| `GET /console/entreprises/:id/stock` | Stock par référence, paginé | `CONSULTATION_ENTREPRISE` |
| `GET /console/entreprises/:id/mouvements` | Historique paginé (`?page=&taille=`, 100 max) | `CONSULTATION_ENTREPRISE` |
| `POST /console/entreprises/:id/suspendre` | `{ motif }` obligatoire — statut, révocation des sessions et journal dans une transaction | `SUSPENSION` |
| `POST /console/entreprises/:id/retablir` | `{ motif? }` | `RETABLISSEMENT` |
| `PATCH /console/entreprises/:id/reglages` | Limites (`limiteEmplacements`, `limiteUtilisateurs`, `limiteReferences` : entier ou `null` = illimité) et modules (`moduleInventaires`, `moduleTransferts`), `motif?` | `MODIFICATION_REGLAGES` |
| `GET /console/journal` | Journal paginé (`?entrepriseId=`, `?action=`) | — |

**Réglages (phase 2)** — appliqués côté serveur, jamais seulement masqués dans l'interface :
- *Limites* : vérifiées par `LimitesService.exigerPlace()` à la création d'un emplacement, d'un produit et à l'envoi d'une invitation (403, `code: "LIMITE_ATTEINTE"`). L'usage compte les emplacements et produits non archivés, et les utilisateurs **plus les invitations en attente**. Une limite inférieure à l'usage actuel est refusée (400) : rien n'est archivé à la place de l'entreprise.
- *Modules* : `@ModuleRequis('inventaires' | 'transferts')` sur les routes concernées ; `EntrepriseActiveGuard` refuse (403, `code: "MODULE_DESACTIVE"`) dans la même lecture que le statut, sans requête supplémentaire.

Une entreprise suspendue est refusée partout côté client : à la connexion (403, après vérification du mot de passe) et à chaque requête authentifiée (`EntrepriseActiveGuard`, 403 avec `code: "ENTREPRISE_SUSPENDUE"`). Les emails de réinitialisation et de confirmation ne partent plus.

### Créer un opérateur

Aucune interface ne permet de créer un opérateur — uniquement en ligne de commande, depuis un accès au serveur (ou `railway run` en production) :

```bash
npm run --silent console:creer-operateur -- --email=vous@exemple.com --nom="Votre Nom" --motdepasse='au-moins-12-caracteres'
```

- `--silent` évite que npm réaffiche la commande (et donc le mot de passe) dans la sortie.
- Le mot de passe est haché avec argon2 ; il reste en revanche dans l'historique du shell : préférez un terminal éphémère ou effacez la ligne après coup.
- Refuse de créer un opérateur dont l'email existe déjà (jamais d'écrasement).

## Base de données

ORM : **Prisma 7** (adaptateur `@prisma/adapter-pg`). Schéma : `prisma/schema.prisma` — reflète les 11 entités validées en architecture (`archive` sur `emplacement`/`produit` ; `categorie` et `marque` ajoutées pour la fiche produit enrichie).

```bash
npx prisma migrate dev     # créer/appliquer une migration en développement
npx prisma generate        # régénérer le client après modification du schéma
npx prisma studio          # explorateur visuel de la base
```

## Fiche produit enrichie et images

Le produit dispose de champs facultatifs : `photoUrl`, `prixAchat`/`prixVente` (en francs guinéens — GNF, entiers, sans subdivision décimale), `tauxTva` (pourcentage), `codeBarre` (unique par entreprise), `description`, `categorieId`/`marqueId`. Les catégories et marques sont des entités de référence gérées par l'Admin (`/categories`, `/marques`), consultables par tous.

Les images (produits, fournisseurs, photo de profil) sont téléversées sur **Cloudinary**, jamais stockées localement — le système de fichiers de Railway est éphémère, un stockage local disparaîtrait au prochain déploiement.

```
POST /uploads/image?type=produits|fournisseurs|utilisateurs
```
Champ `fichier` (multipart), JPEG/PNG/WEBP uniquement, 5 Mo maximum. Retourne `{ url }`. Nécessite `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` dans `.env`.

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/categories` | Authentifié | Liste les catégories |
| POST | `/categories` | Admin | Crée une catégorie |
| PATCH | `/categories/:id` | Admin | Renomme une catégorie |
| DELETE | `/categories/:id` | Admin | Supprime (refuse si utilisée par un produit) |
| GET/POST/PATCH/DELETE | `/marques` | idem | Même logique que Catégories |
| PATCH | `/users/me/photo` | Authentifié | Modifie sa propre photo de profil |

## Montée en charge

Mesuré localement (4 vCPU, 501 entreprises, 700 000 mouvements, utilisateurs
qui agissent toutes les 1,5 à 4,5 s) : un processus tient environ 400
utilisateurs actifs (médiane du tableau de bord ≈ 20 ms) et sature vers
800. Avec 4 processus et Redis, 800 utilisateurs actifs restent à ≈ 35 ms
de médiane (414 req/s).

| Variable | Rôle | Défaut |
|---|---|---|
| `WEB_CONCURRENCY` | Processus API dans le conteneur (Node n'utilise qu'un cœur par processus) | 1 |
| `DB_POOL_MAX` | Connexions PostgreSQL par processus | 10 |
| `REDIS_URL` | Compteurs de limitation de débit partagés | mémoire locale |

- **Dès que `WEB_CONCURRENCY > 1` ou plusieurs instances : `REDIS_URL` est
  obligatoire.** Sans lui, chaque processus compte ses propres limites (la
  limite réelle est multipliée). Si Redis devient injoignable, l'API se
  replie sur la mémoire locale (journalisé) au lieu de refuser le trafic.
- Connexions : `DB_POOL_MAX × WEB_CONCURRENCY × instances` doit rester sous
  le `max_connections` de PostgreSQL, avec une marge (migrations,
  administration).
- Le seul état gardé en mémoire par l'API est la limitation de débit : les
  sessions (JWT), les données et les images sont déjà partagées.
- Les listes d'historique sont paginées (curseur) et le tableau de bord est
  calculé par la base : voir `common/pagination`.

## Documentation

La documentation produit, architecture et UX complète est maintenue en dehors de ce dépôt (source de vérité du projet). Ce README sera enrichi au fil de l'implémentation.
