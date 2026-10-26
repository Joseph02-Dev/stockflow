-- Synchronisation incrémentale, suite (docs/adr/0001, ticket SYNC-07) :
-- commandes fournisseur recopiées sur l'appareil, et règlements des ventes.
-- Colonne avec valeur par défaut : retour arrière sûr.

-- Commandes : date de modification tenue par la base (app_maj_updated_at, SYNC-01).
ALTER TABLE "commande_fournisseur" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "commande_fournisseur" SET "updated_at" = COALESCE("recue_at", "envoyee_at", "created_at");
CREATE INDEX "commande_fournisseur_entreprise_id_updated_at_idx" ON "commande_fournisseur"("entreprise_id", "updated_at");
CREATE TRIGGER commande_fournisseur_maj_updated_at BEFORE UPDATE ON "commande_fournisseur" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- Une ligne ajoutée, modifiée ou retirée change sa commande : la commande est
-- renvoyée (avec ses lignes) à la synchronisation suivante.
CREATE FUNCTION app_toucher_commande() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "commande_fournisseur" SET "updated_at" = now()
  WHERE "id" = COALESCE(NEW."commande_id", OLD."commande_id");
  RETURN NULL;
END;
$$;
CREATE TRIGGER commande_ligne_touche_commande AFTER INSERT OR UPDATE OR DELETE ON "commande_ligne"
  FOR EACH ROW EXECUTE FUNCTION app_toucher_commande();

-- Un règlement (encaissement d'une créance) change ce qui reste dû sur sa
-- vente : la vente est renvoyée, avec ses règlements.
CREATE FUNCTION app_toucher_vente() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "vente" SET "updated_at" = now()
  WHERE "id" = COALESCE(NEW."vente_id", OLD."vente_id");
  RETURN NULL;
END;
$$;
CREATE TRIGGER reglement_touche_vente AFTER INSERT OR UPDATE OR DELETE ON "reglement"
  FOR EACH ROW EXECUTE FUNCTION app_toucher_vente();
