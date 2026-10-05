-- Rôle PostgreSQL restreint de l'application, soumis à la Row-Level Security.
--
-- À exécuter UNE FOIS, avec le rôle propriétaire de la base (celui de
-- DATABASE_URL, qui reste utilisé pour les migrations) :
--
--   psql "$DATABASE_URL" -v mot_de_passe='<choisi par vous>' -f scripts/rls/creer-role-application.sql
--
-- Le mot de passe n'est jamais écrit dans ce fichier ni dans le dépôt.
-- Puis, dans Railway (service API) :
--   DATABASE_URL_APPLICATION = même URL que DATABASE_URL, avec
--                              l'utilisateur stockflow_app et ce mot de passe
--   RLS_ACTIF = true
-- Retour arrière : retirer ces deux variables (l'application revient au rôle
-- propriétaire, la RLS ne s'applique plus).

-- Ni superutilisateur, ni BYPASSRLS, ni propriétaire des tables : sinon
-- PostgreSQL ne lui appliquerait pas la RLS (l'API refuse alors de démarrer).
CREATE ROLE stockflow_app LOGIN PASSWORD :'mot_de_passe'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

SELECT format('GRANT CONNECT ON DATABASE %I TO stockflow_app', current_database()) \gexec

GRANT USAGE ON SCHEMA public TO stockflow_app;
-- Lecture et écriture des données, rien de plus (ni DDL, ni TRUNCATE).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stockflow_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM stockflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stockflow_app;
GRANT EXECUTE ON FUNCTION app_entreprise_courante(), app_contexte_systeme() TO stockflow_app;

-- Tables créées par les migrations futures (exécutées par le propriétaire) :
-- mêmes droits automatiquement.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stockflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO stockflow_app;
