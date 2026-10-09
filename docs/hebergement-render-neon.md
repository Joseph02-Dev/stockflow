# Hébergement d'attente : Render + Neon + stockflowgn.com

**Contexte (2026-10-09)** : l'essai Railway a expiré et la carte de
paiement y est refusée. Solution gratuite le temps de régler Railway :

| Élément | Hébergeur | Adresse |
|---|---|---|
| Frontend | Vercel (inchangé) | `https://stockflowgn.com` |
| API | Render, offre gratuite (`render.yaml`) | `https://api.stockflowgn.com` |
| Base PostgreSQL | Neon, offre gratuite | — |
| DNS | Cloudflare | — |

Limites à connaître (documentation officielle) :
- **Render gratuit** : l'API se met en veille après **15 min** sans
  requête ; la suivante attend environ **1 min** le réveil. 750 h par mois.
  ([render.com/docs/free](https://render.com/docs/free))
- **Neon gratuit** : sans limite de durée ni carte, 1 Go de stockage,
  100 heures de calcul par mois, base suspendue après 5 min d'inactivité.
  ([neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans))
- Ne pas utiliser la base PostgreSQL gratuite de Render : elle est
  supprimée après 30 jours.
  ([changelog Render](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90))

Convient aux essais, pas à l'ouverture au public (réveil d'une minute).

Règle de sécurité : aucun secret n'est écrit dans le dépôt ni envoyé dans
une conversation. Les valeurs sont saisies uniquement dans les tableaux de
bord Neon, Render et Vercel.

## 1. Base de données Neon (5 min)

1. Créer un compte sur [neon.com](https://neon.com), puis un projet
   `stockflowgn`, région **AWS Europe Central 1 (Frankfurt)** (proche de
   l'API Render).
2. **Connect** → choisir la chaîne de connexion **directe** : désactiver
   « Connection pooling » (l'hôte ne doit **pas** contenir `-pooler`).
   L'API est un serveur permanent avec son propre pool, et les migrations
   Prisma exigent une connexion directe
   ([doc Neon](https://neon.com/docs/guides/prisma-migrations)).
3. Garder cette chaîne (elle se termine par `?sslmode=require`) pour
   l'étape 2 : c'est `DATABASE_URL`.

La base est vide : les migrations créent toutes les tables au premier
démarrage de l'API.

## 2. API sur Render (10 min)

1. Créer un compte sur [render.com](https://render.com) avec GitHub, et
   autoriser l'accès au dépôt `Joseph02-Dev/stockflow`.
2. **New → Blueprint** → choisir le dépôt, branche `main`. Render lit
   `render.yaml` et propose le service `stockflow-api` (gratuit, Francfort).
3. Render demande les variables marquées `sync: false` :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | chaîne Neon de l'étape 1 |
   | `JWT_ACCESS_SECRET` | `openssl rand -hex 32` (sur votre poste) |
   | `JWT_REFRESH_SECRET` | une **autre** exécution de `openssl rand -hex 32` |
   | `JWT_CONSOLE_SECRET` | une **troisième** valeur, distincte des deux autres |
   | `EMAIL_PROVIDER` | même valeur que sur Railway (en principe `resend`) |
   | `EMAIL_FROM` | même valeur que sur Railway |
   | `RESEND_API_KEY` | clé Resend existante |
   | `CLOUDINARY_*` (3) | mêmes valeurs que sur Railway |
   | `SENTRY_DSN` | DSN Sentry de l'API (facultatif) |

   Les secrets JWT peuvent être neufs : les sessions de test existantes
   seront simplement invalidées.
4. **Apply**. Au premier déploiement, les journaux doivent montrer
   l'installation, `nest build`, puis `prisma migrate deploy` et le
   démarrage de l'API. Vérifier :
   `https://stockflow-api-XXXX.onrender.com/health` → `200` (adresse
   exacte affichée par Render).

`NODE_VERSION`, `NODE_ENV`, `FRONTEND_URL` et `DB_DELAI_CONNEXION_MS` sont
déjà fixées dans `render.yaml`.

## 3. Domaine stockflowgn.com (Cloudflare)

### Frontend → Vercel

1. Vercel → projet stockflow → **Settings → Domains** :
   - ajouter `stockflowgn.com` ;
   - ajouter `www.stockflowgn.com` avec **redirection** vers
     `stockflowgn.com` (l'API n'accepte qu'une origine, sans `www`).
2. Cloudflare → **DNS → Records** :

   | Type | Nom | Valeur | Proxy |
   |---|---|---|---|
   | A | `@` | valeur affichée par Vercel (en général `76.76.21.21`) | **DNS only** (nuage gris) |
   | CNAME | `www` | valeur affichée par Vercel (en général `cname.vercel-dns.com`) | **DNS only** |

   Le proxy Cloudflare (nuage orange) empêche Vercel de valider le domaine
   ([doc Vercel](https://vercel.com/kb/guide/use-domain-vercel-a-records)).

### API → Render

1. Render → `stockflow-api` → **Settings → Custom Domains** → ajouter
   `api.stockflowgn.com`.
2. Cloudflare → **DNS → Records** :

   | Type | Nom | Valeur | Proxy |
   |---|---|---|---|
   | CNAME | `api` | `stockflow-api-XXXX.onrender.com` (adresse Render) | **DNS only** |

   Render demande « DNS only » pour vérifier le domaine et émettre le
   certificat ([doc Render](https://render.com/docs/configure-cloudflare-dns)).
   Supprimer tout enregistrement AAAA sur `api` : Render ne gère pas IPv6.

## 4. Relier le frontend à la nouvelle API

Vercel → **Settings → Environment Variables** (Production) :
- `VITE_API_URL` = `https://api.stockflowgn.com`

Puis **Deployments → Redeploy** : la variable est lue au build, et la
politique de sécurité (CSP) du frontend autorise automatiquement cette
origine.

## 5. Vérifications

- `https://api.stockflowgn.com/health` → `200` ;
- `https://stockflowgn.com` s'ouvre en HTTPS, `www` redirige vers lui ;
- créer une entreprise, recevoir l'email de vérification : le lien pointe
  vers `https://stockflowgn.com` ;
- se connecter, créer un produit, faire un mouvement.

L'adresse `*.vercel.app` reste en ligne mais ne peut plus appeler l'API
(une seule origine autorisée) : utiliser `https://stockflowgn.com`.

## Retour sur Railway (une fois la carte acceptée)

1. Railway : remplacer `FRONTEND_URL` par `https://stockflowgn.com` et
   ajouter le domaine `api.stockflowgn.com` au service.
2. Cloudflare : faire pointer `api` vers l'adresse Railway.
3. Supprimer le service Render (et la base Neon si elle n'est plus utile).

`.railway/railway.ts` est conservé à l'identique dans le dépôt pour ce
retour.
