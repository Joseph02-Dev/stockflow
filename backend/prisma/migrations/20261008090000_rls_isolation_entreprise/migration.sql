-- Isolation des entreprises au niveau de PostgreSQL (Row-Level Security).
--
-- Défense en profondeur : même si une requête applicative oubliait son
-- filtre « entreprise_id », la base ne renverrait ni ne modifierait aucune
-- ligne d'une autre entreprise.
--
-- Contexte posé par l'application sur chaque connexion empruntée au pool
-- (src/config/pool-isole.ts), quand RLS_ACTIF=true :
--   app.entreprise_id = entreprise du token   (requête authentifiée)
--   app.systeme       = 'oui'                 (connexion, inscription, console)
-- Sans contexte : aucune ligne visible (refus par défaut).
--
-- SANS EFFET tant que l'application se connecte avec le rôle propriétaire
-- des tables ou un superutilisateur (cas actuel) : PostgreSQL ne leur
-- applique pas la RLS. Elle s'applique dès que l'application utilise le
-- rôle restreint (scripts/rls/creer-role-application.sql).

CREATE OR REPLACE FUNCTION app_entreprise_courante() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.entreprise_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_contexte_systeme() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.systeme', true), '') = 'oui' $$;

-- Tables portant entreprise_id.
ALTER TABLE "alerte" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "alerte"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "categorie" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "categorie"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "client" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "client"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "commande_fournisseur" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "commande_fournisseur"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "emplacement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "emplacement"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "fournisseur" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "fournisseur"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "import_catalogue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "import_catalogue"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "inventaire" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "inventaire"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "invitation"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "journal_audit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "journal_audit"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "lot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "lot"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "marque" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "marque"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "mouvement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "mouvement"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "produit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "produit"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "retour_client" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "retour_client"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "retour_fournisseur" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "retour_fournisseur"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "utilisateur" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "utilisateur"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "vente" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "vente"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

-- L'entreprise elle-même : la sienne uniquement.
ALTER TABLE "entreprise" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "entreprise"
  USING (app_contexte_systeme() OR id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR id = app_entreprise_courante());

-- Opérateurs de la console : jamais visibles d'une entreprise cliente.
ALTER TABLE "operateur" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "operateur"
  USING (app_contexte_systeme()) WITH CHECK (app_contexte_systeme());

-- Tables filles : visibles si leur parent l'est (la RLS du parent s'applique dans la sous-requête).
ALTER TABLE "stock" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "stock"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "produit" parent WHERE parent.id = "stock".produit_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "produit" parent WHERE parent.id = "stock".produit_id));

ALTER TABLE "ligne_vente" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "ligne_vente"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "vente" parent WHERE parent.id = "ligne_vente".vente_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "vente" parent WHERE parent.id = "ligne_vente".vente_id));

ALTER TABLE "reglement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "reglement"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "vente" parent WHERE parent.id = "reglement".vente_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "vente" parent WHERE parent.id = "reglement".vente_id));

ALTER TABLE "retour_client_ligne" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "retour_client_ligne"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "retour_client" parent WHERE parent.id = "retour_client_ligne".retour_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "retour_client" parent WHERE parent.id = "retour_client_ligne".retour_id));

ALTER TABLE "commande_ligne" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "commande_ligne"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "commande_fournisseur" parent WHERE parent.id = "commande_ligne".commande_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "commande_fournisseur" parent WHERE parent.id = "commande_ligne".commande_id));

ALTER TABLE "inventaire_ligne" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "inventaire_ligne"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "inventaire" parent WHERE parent.id = "inventaire_ligne".inventaire_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "inventaire" parent WHERE parent.id = "inventaire_ligne".inventaire_id));

ALTER TABLE "import_ligne" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "import_ligne"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "import_catalogue" parent WHERE parent.id = "import_ligne".import_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "import_catalogue" parent WHERE parent.id = "import_ligne".import_id));

ALTER TABLE "fournisseur_produit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "fournisseur_produit"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "fournisseur" parent WHERE parent.id = "fournisseur_produit".fournisseur_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "fournisseur" parent WHERE parent.id = "fournisseur_produit".fournisseur_id));

ALTER TABLE "refresh_token" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "refresh_token"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "utilisateur" parent WHERE parent.id = "refresh_token".utilisateur_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "utilisateur" parent WHERE parent.id = "refresh_token".utilisateur_id));

ALTER TABLE "verification_email" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "verification_email"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "utilisateur" parent WHERE parent.id = "verification_email".utilisateur_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "utilisateur" parent WHERE parent.id = "verification_email".utilisateur_id));

ALTER TABLE "reinitialisation_mot_de_passe" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "reinitialisation_mot_de_passe"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "utilisateur" parent WHERE parent.id = "reinitialisation_mot_de_passe".utilisateur_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "utilisateur" parent WHERE parent.id = "reinitialisation_mot_de_passe".utilisateur_id));
