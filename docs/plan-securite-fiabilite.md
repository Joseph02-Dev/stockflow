# Plan sécurité et fiabilité

Feuille de route issue de l'état des lieux d'octobre 2026. Évolution
progressive de l'existant, sans réécriture. Chaque brique est livrée avec
ses tests et peut être déployée sans interruption de service.

## Phase 1 — Sécurisation minimale viable

| Brique | État | Référence |
|---|---|---|
| 1.1 Rôle et état du compte relus à chaque requête, retrait d'accès d'un utilisateur | Fait | #18 |
| 1.2 Validation des variables d'environnement au démarrage | Fait | #18, #19 |
| 1.3 Test d'isolation transverse sur toutes les routes à identifiant | Fait | #18 |
| 1.4 RLS PostgreSQL — étape 1 : règles par entreprise (inertes) | Fait | #18 |
| 1.4 RLS PostgreSQL — étape 2 : poser l'entreprise depuis l'application | Reportée (décision C, 2026-10-06) | voir ci-dessous |
| 1.5 CSP du frontend, en-têtes Vercel, neutralisation des formules CSV | Fait | #18 |
| Healthcheck Railway (un déploiement défaillant ne remplace plus l'ancien) | Fait | #19 |

### Décision : RLS étape 2 — option C retenue (2026-10-06)

Constat mesuré : Prisma 7 regroupe des requêtes de plusieurs appelants et
les exécute hors de leur contexte asynchrone. Poser l'entreprise au niveau
du pool PostgreSQL depuis le contexte de requête n'est donc pas fiable.

- **A.** Extension Prisma : chaque opération dans une transaction qui pose
  l'entreprise (`set_config` local). Environ 3 allers-retours de plus par
  requête ; dépend d'une API interne de Prisma pour les transactions.
- **B.** Contexte explicite passé module par module (refactoring long).
- **C.** Reporter : isolation applicative + test transverse (1.3) exécuté
  par la CI à chaque PR. **Retenue.** À réexaminer (option A) après une
  montée de version de Prisma, ou quand l'équipe ou le nombre de clients grandit.

## Phase 2 — Consolidation et fiabilité

| Brique | Priorité | État |
|---|---|---|
| 2.1 Intégration continue GitHub Actions : lint, build, tests sur PostgreSQL (dont RLS avec rôle restreint) | P1 | Fait |
| 2.2 Migration de `railway.json` (Config as Code) vers l'Infrastructure as Code de Railway — **échéance ferme : 1er décembre 2026** (arrêt annoncé par Railway, [documentation](https://docs.railway.com/config-as-code)). La commande de démarrage (migrations puis API) et le healthcheck y sont définis. Configuration décrite dans `.railway/railway.ts` (source, build, démarrage, healthcheck, variables conservées par `preserve()`), appliquée le 2026-10-07 ; `backend/railway.json` supprimé ([procédure](migration-railway-iac.md)). | **P0 (échéance)** | Fait |
| 2.3 Route `/health` vérifiant la base (`SELECT 1`, délai 3 s, 503 sans détail), utilisée par le healthcheck Railway. Redis non bloquant (repli mémoire existant) | P1 | Fait |
| 2.4 Logs structurés JSON (pino) : identifiant de requête (`X-Request-Id`), entreprise, utilisateur, statut, durée ; ni en-têtes, ni corps, ni IP, paramètres d'URL sensibles masqués ; `/health` non journalisé | P1 | Fait |
| 2.5 Suivi des erreurs (Sentry) : erreurs inattendues de l'API (`SENTRY_DSN`, Railway) et du navigateur (`VSENTRY_DSN`, Vercel, injectée au build), avec entreprise, utilisateur et identifiant de requête ; collecte automatique coupée (en-têtes, cookies, corps, variables locales), jetons d'URL masqués ; inactif sans DSN | P1 | Fait |
| 2.6 Procédure de retour arrière : [runbook](runbook-retour-arriere.md) Railway / Vercel / base ; migrations compatibles avec la version précédente vérifiées en CI | P1 | Fait |
| 2.7 Interrupteurs globaux `FONCTIONNALITES_DESACTIVEES` (import, rapports, uploads) : 503 `FONCTIONNALITE_SUSPENDUE` avant tout accès base, interface masquée ; complète les modules par entreprise de la console | P2 | Fait |
| 2.8 Vulnérabilités des dépendances : `npm audit` à 0 (backend et frontend) ; audit des dépendances de production bloquant en CI | P0 | Fait |

**Dépendances (2.8)** — `backend/package.json` force `deepmerge-ts` ^8 et
`mysql2` ^3.24 (`overrides`) : dépendances de la CLI Prisma 7.10, sans
correctif dans la branche 7. À retirer lors du passage à une version de
Prisma qui les embarque (vérifier avec `npm ls deepmerge-ts mysql2`).

## Phase 3 — Préparation de la montée en charge

Mesures faites le 2026-10-06 ([rapport](mesures-performance.md)) : le goulot
est le processeur de Node (génération PDF sur le fil principal), pas la base.

| Brique | Priorité | Statut |
|---|---|---|
| 3.1 Mesurer : jeu de données et injecteur de charge reproductibles (`backend/scripts/charge/`) | P1 | Fait |
| 3.2 PDF hors du fil principal (`worker_threads`) : p95 divisé par environ 3 à 100 utilisateurs, PDF identiques au pixel près | P1 | Fait |
| 3.3 Créances : options mesurées ([rapport](mesures-performance.md)) ; option B à réaliser quand `reglement` dépasse 500 000 lignes ou `/creances` dépasse 300 ms au p95 | P2 | Reportée (déclencheur défini) |
| 3.4 Emails : envoi en arrière-plan (requête jamais bloquée, « mot de passe oublié » sans écart de temps révélant les comptes), délai de 8 s, 3 tentatives avec clé d'idempotence (jamais de doublon), échec signalé à Sentry sans l'adresse, envois en cours terminés à l'arrêt | P2 | Fait |
| 3.5 Pool de connexions : taille mesurée sans effet de 2 à 20 (10 conservé) ; attente d'une connexion bornée à 5 s, requête SQL à 30 s, transaction inactive à 60 s ; connexions nommées `stockflow-api` ; avertissement au démarrage si pool × processus dépasse la moitié du `max_connections` | P2 | Fait |
| 3.6 Cache des synthèses | — | Reporté : aucun gain mesuré |
| 3.7 Redis + `WEB_CONCURRENCY` (débit environ ×2 mesuré avec 3 processus), BullMQ, plusieurs instances, sauvegardes automatiques | P1 à l'ouverture | Offre payante |
