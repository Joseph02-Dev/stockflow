-- Synchronisation incrémentale (docs/adr/0001-application-web-local-first.md,
-- ticket SYNC-01) : date de dernière modification de chaque ligne des
-- tables recopiées sur l'appareil, et index pour lire « ce qui a changé
-- depuis » par entreprise.
--
-- Tenue à jour par un déclencheur, et non par Prisma (@updatedAt) : toute
-- écriture la met à jour, y compris le SQL brut et les corrections
-- manuelles. Colonnes avec valeur par défaut : l'ancienne version du code,
-- qui ne les connaît pas, continue de fonctionner (retour arrière sûr).

CREATE FUNCTION app_maj_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- produit
ALTER TABLE "produit" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "produit" SET "updated_at" = "created_at";
CREATE INDEX "produit_entreprise_id_updated_at_idx" ON "produit"("entreprise_id", "updated_at");
CREATE TRIGGER produit_maj_updated_at BEFORE UPDATE ON "produit" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- stock
ALTER TABLE "stock" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "stock_updated_at_idx" ON "stock"("updated_at");
CREATE TRIGGER stock_maj_updated_at BEFORE UPDATE ON "stock" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- emplacement
ALTER TABLE "emplacement" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "emplacement" SET "updated_at" = "created_at";
CREATE INDEX "emplacement_entreprise_id_updated_at_idx" ON "emplacement"("entreprise_id", "updated_at");
CREATE TRIGGER emplacement_maj_updated_at BEFORE UPDATE ON "emplacement" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- categorie
ALTER TABLE "categorie" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "categorie" SET "updated_at" = "created_at";
CREATE INDEX "categorie_entreprise_id_updated_at_idx" ON "categorie"("entreprise_id", "updated_at");
CREATE TRIGGER categorie_maj_updated_at BEFORE UPDATE ON "categorie" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- marque
ALTER TABLE "marque" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "marque" SET "updated_at" = "created_at";
CREATE INDEX "marque_entreprise_id_updated_at_idx" ON "marque"("entreprise_id", "updated_at");
CREATE TRIGGER marque_maj_updated_at BEFORE UPDATE ON "marque" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- client
ALTER TABLE "client" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "client" SET "updated_at" = "created_at";
CREATE INDEX "client_entreprise_id_updated_at_idx" ON "client"("entreprise_id", "updated_at");
CREATE TRIGGER client_maj_updated_at BEFORE UPDATE ON "client" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- fournisseur
ALTER TABLE "fournisseur" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "fournisseur" SET "updated_at" = "created_at";
CREATE INDEX "fournisseur_entreprise_id_updated_at_idx" ON "fournisseur"("entreprise_id", "updated_at");
CREATE TRIGGER fournisseur_maj_updated_at BEFORE UPDATE ON "fournisseur" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- alerte
ALTER TABLE "alerte" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "alerte" SET "updated_at" = "created_at";
CREATE INDEX "alerte_entreprise_id_updated_at_idx" ON "alerte"("entreprise_id", "updated_at");
CREATE TRIGGER alerte_maj_updated_at BEFORE UPDATE ON "alerte" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- lot
ALTER TABLE "lot" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "lot" SET "updated_at" = "created_at";
CREATE INDEX "lot_entreprise_id_updated_at_idx" ON "lot"("entreprise_id", "updated_at");
CREATE TRIGGER lot_maj_updated_at BEFORE UPDATE ON "lot" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- vente
ALTER TABLE "vente" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "vente" SET "updated_at" = "created_at";
CREATE INDEX "vente_entreprise_id_updated_at_idx" ON "vente"("entreprise_id", "updated_at");
CREATE TRIGGER vente_maj_updated_at BEFORE UPDATE ON "vente" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();

-- mouvement
ALTER TABLE "mouvement" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "mouvement" SET "updated_at" = "created_at";
CREATE INDEX "mouvement_entreprise_id_updated_at_idx" ON "mouvement"("entreprise_id", "updated_at");
CREATE TRIGGER mouvement_maj_updated_at BEFORE UPDATE ON "mouvement" FOR EACH ROW EXECUTE FUNCTION app_maj_updated_at();
