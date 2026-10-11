-- Vague 1 « core engine » : double entrée des mouvements, arborescence des
-- emplacements et modules métier activables par entreprise.
--
-- retour-arriere: origine et destination deviennent NOT NULL après
-- rétro-remplissage, mais le déclencheur mouvement_sens_par_defaut les
-- déduit du type quand l'INSERT ne les fournit pas : la version précédente
-- de l'API, qui les ignore, continue d'enregistrer des mouvements valides.

-- CreateEnum
CREATE TYPE "NatureEmplacement" AS ENUM ('INTERNE', 'FOURNISSEUR', 'CLIENT', 'REBUT', 'INVENTAIRE', 'TRANSIT');

-- AlterTable
ALTER TABLE "emplacement" ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "module_arborescence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module_lots" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "mouvement" ADD COLUMN     "origine" "NatureEmplacement",
ADD COLUMN     "destination" "NatureEmplacement";

-- Sens par défaut d'un mouvement selon son type (même règle que
-- sensParDefaut() dans src/modules/stock/sens-mouvement.ts, vérifiée par
-- un test). AJUSTEMENT : quantité signée, positive = entrée d'inventaire.
CREATE FUNCTION mouvement_origine_par_defaut(t "TypeMouvement", quantite INTEGER)
RETURNS "NatureEmplacement" LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'ENTREE' THEN 'FOURNISSEUR'
    WHEN 'RETOUR_CLIENT' THEN 'CLIENT'
    WHEN 'AJUSTEMENT' THEN CASE WHEN quantite >= 0 THEN 'INVENTAIRE' ELSE 'INTERNE' END
    ELSE 'INTERNE'
  END::"NatureEmplacement"
$$;

CREATE FUNCTION mouvement_destination_par_defaut(t "TypeMouvement", quantite INTEGER)
RETURNS "NatureEmplacement" LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'SORTIE' THEN 'CLIENT'
    WHEN 'PERIME' THEN 'REBUT'
    WHEN 'CASSE' THEN 'REBUT'
    WHEN 'RETOUR_FOURNISSEUR' THEN 'FOURNISSEUR'
    WHEN 'AJUSTEMENT' THEN CASE WHEN quantite >= 0 THEN 'INTERNE' ELSE 'INVENTAIRE' END
    ELSE 'INTERNE'
  END::"NatureEmplacement"
$$;

CREATE FUNCTION mouvement_sens_par_defaut() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origine IS NULL THEN
    NEW.origine := mouvement_origine_par_defaut(NEW.type, NEW.quantite);
  END IF;
  IF NEW.destination IS NULL THEN
    NEW.destination := mouvement_destination_par_defaut(NEW.type, NEW.quantite);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER mouvement_sens_par_defaut
  BEFORE INSERT ON "mouvement"
  FOR EACH ROW EXECUTE FUNCTION mouvement_sens_par_defaut();

-- Rétro-remplissage de l'historique, puis cas que le type seul ne dit pas.
UPDATE "mouvement"
SET "origine" = mouvement_origine_par_defaut("type", "quantite"),
    "destination" = mouvement_destination_par_defaut("type", "quantite");

-- Restitution d'une vente annulée : la marchandise revient du client.
UPDATE "mouvement" SET "origine" = 'CLIENT'
WHERE "type" = 'ENTREE' AND "vente_id" IS NOT NULL;

-- Annulation d'une casse : la quantité revient du rebut.
UPDATE "mouvement" SET "origine" = 'REBUT'
WHERE "type" = 'AJUSTEMENT' AND "annule_mouvement_id" IS NOT NULL;

-- Quantités initiales d'un import de catalogue : stock d'ouverture.
UPDATE "mouvement" SET "origine" = 'INVENTAIRE'
WHERE "type" = 'ENTREE'
  AND "id" IN (SELECT "mouvement_id" FROM "import_ligne" WHERE "mouvement_id" IS NOT NULL);

ALTER TABLE "mouvement" ALTER COLUMN "origine" SET NOT NULL,
ALTER COLUMN "destination" SET NOT NULL;

-- Invariant de la double entrée : un mouvement touche toujours le stock
-- réel d'au moins un côté, et seul un transfert va d'interne à interne.
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_touche_stock_interne"
  CHECK ("origine" = 'INTERNE' OR "destination" = 'INTERNE');
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_origine_differente_destination"
  CHECK ("origine" <> "destination" OR "type" = 'TRANSFERT');

-- Emplacement parent : jamais lui-même (les cycles plus longs sont
-- refusés par l'API).
ALTER TABLE "emplacement" ADD CONSTRAINT "emplacement_parent_different"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- CreateIndex
CREATE INDEX "emplacement_parent_id_idx" ON "emplacement"("parent_id");

-- AddForeignKey
ALTER TABLE "emplacement" ADD CONSTRAINT "emplacement_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "emplacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
