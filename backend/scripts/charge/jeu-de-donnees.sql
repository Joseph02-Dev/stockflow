-- Jeu de données de charge (base locale ou de test UNIQUEMENT, jamais la production).
--   psql "$DATABASE_URL" -v entreprises=500 -f scripts/charge/jeu-de-donnees.sql
-- Crée N entreprises « normales » (c1..cN) et une « grosse » (gros), chacune
-- avec un administrateur charge-<code>@stockflow.dev, mot de passe des tests
-- (motdepasse-solide-123). Identifiants UUID v4 déterministes : l'injecteur
-- les recalcule à l'identique (u4).
\set ON_ERROR_STOP on
\if :{?entreprises}
\else
  \set entreprises 500
\endif
BEGIN;
CREATE FUNCTION pg_temp.u4(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  FROM md5(t) AS h
$$;

-- Volumes par entreprise : produits, mouvements, clients, ventes.
CREATE TEMP TABLE ents AS
  SELECT 'c' || g AS code, 100 AS np, 1000 AS nm, 30 AS nc, 300 AS nv FROM generate_series(1, :entreprises) g
  UNION ALL SELECT 'gros', 2000, 200000, 500, 20000;

INSERT INTO entreprise (id, nom) SELECT pg_temp.u4('ent-' || code), 'Charge ' || code FROM ents;
INSERT INTO utilisateur (id, entreprise_id, email, nom, password_hash, role, email_verifie_at)
  SELECT pg_temp.u4('u-' || code), pg_temp.u4('ent-' || code), 'charge-' || code || '@stockflow.dev', 'Admin ' || code,
         -- argon2id de « motdepasse-solide-123 » (mot de passe des tests, sans valeur réelle).
         '$argon2id$v=19$m=65536,t=3,p=4$gCb9ZtC9ynGn13/1CgfsNQ$jF5tX4SwC4zUfaxCfhvAZG4YMZm9I/2UYimYZD+hFdI', 'ADMIN', now()
  FROM ents;
INSERT INTO emplacement (id, entreprise_id, nom)
  SELECT pg_temp.u4('em-' || code || '-' || k), pg_temp.u4('ent-' || code), 'Dépôt ' || k FROM ents, generate_series(1, 2) k;
INSERT INTO produit (id, entreprise_id, nom, seuil_alerte, prix_achat, prix_vente, prix_gros, taux_tva)
  SELECT pg_temp.u4('p-' || code || '-' || k), pg_temp.u4('ent-' || code), 'Produit ' || k, 20, 50000, 60000 + k, 55000, 18
  FROM ents, generate_series(1, np) k;
INSERT INTO stock (produit_id, emplacement_id, quantite)
  SELECT pg_temp.u4('p-' || code || '-' || k), pg_temp.u4('em-' || code || '-1'), 1000000 FROM ents, generate_series(1, np) k;
INSERT INTO mouvement (id, entreprise_id, produit_id, emplacement_id, type, quantite, utilisateur_id, created_at)
  SELECT gen_random_uuid(), pg_temp.u4('ent-' || code), pg_temp.u4('p-' || code || '-' || (1 + k % np)), pg_temp.u4('em-' || code || '-1'),
         (CASE WHEN k % 3 = 0 THEN 'ENTREE' ELSE 'SORTIE' END)::"TypeMouvement", 1 + k % 50, pg_temp.u4('u-' || code),
         now() - ((k % 365) || ' days')::interval
  FROM ents, generate_series(1, nm) k;
INSERT INTO alerte (id, entreprise_id, produit_id, type, quantite_au_declenchement)
  SELECT gen_random_uuid(), pg_temp.u4('ent-' || code), pg_temp.u4('p-' || code || '-' || k), 'STOCK_FAIBLE', 5
  FROM ents, generate_series(1, 10) k;
INSERT INTO client (id, entreprise_id, nom, telephone, categorie)
  SELECT pg_temp.u4('c-' || code || '-' || k), pg_temp.u4('ent-' || code), 'Client ' || k, '+224 622 00 00 00', 'DETAIL'
  FROM ents, generate_series(1, nc) k;
INSERT INTO vente (id, entreprise_id, numero, client_id, emplacement_id, utilisateur_id, sous_total, montant_tva, total, mode_paiement, created_at)
  SELECT pg_temp.u4('v-' || code || '-' || k), pg_temp.u4('ent-' || code), 'V-2025-' || lpad(k::text, 5, '0'),
         pg_temp.u4('c-' || code || '-' || (1 + k % nc)), pg_temp.u4('em-' || code || '-1'), pg_temp.u4('u-' || code),
         200000, 36000, 236000, 'CREDIT', now() - ((k % 120) || ' days')::interval
  FROM ents, generate_series(1, nv) k;
INSERT INTO ligne_vente (id, vente_id, produit_id, libelle, quantite, prix_unitaire, taux_tva, montant_ligne)
  SELECT gen_random_uuid(), pg_temp.u4('v-' || code || '-' || k), pg_temp.u4('p-' || code || '-' || (1 + (k + j) % np)), 'Produit', 1, 100000, 18, 100000
  FROM ents, generate_series(1, nv) k, generate_series(1, 2) j;
INSERT INTO reglement (id, vente_id, montant, mode, utilisateur_id)
  SELECT gen_random_uuid(), pg_temp.u4('v-' || code || '-' || (1 + k % nv)), 100000, 'ESPECES', pg_temp.u4('u-' || code)
  FROM ents, generate_series(1, (nv * 4) / 3) k;
COMMIT;
ANALYZE entreprise, utilisateur, emplacement, produit, stock, mouvement, alerte, client, vente, ligne_vente, reglement;
