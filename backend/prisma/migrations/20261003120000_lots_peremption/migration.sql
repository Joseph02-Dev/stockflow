-- Suivi par lot et péremptions (FEFO). Facultatif, produit par produit :
-- toutes les colonnes ajoutées ont une valeur par défaut ou sont nulles,
-- aucune donnée existante n'est migrée.
--
-- inventaire_ligne : l'unicité passe de (inventaire, produit) à
-- (inventaire, produit, lot) — une ligne par lot pour un produit suivi.
-- Pour les lignes sans lot (lot_id nul), PostgreSQL ne compare pas les
-- nuls : l'unicité n'est plus garantie par la base, mais ces lignes ne
-- sont créées qu'en une fois, à l'ouverture de l'inventaire.
-- AlterEnum
ALTER TYPE "TypeMouvement" ADD VALUE 'PERIME';

-- DropIndex
DROP INDEX "inventaire_ligne_inventaire_id_produit_id_key";

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "seuil_alerte_peremption_jours" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "inventaire_ligne" ADD COLUMN     "lot_id" TEXT;

-- AlterTable
ALTER TABLE "mouvement" ADD COLUMN     "lot_id" TEXT,
ADD COLUMN     "vente_id" TEXT;

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "seuil_alerte_peremption" INTEGER,
ADD COLUMN     "suivi_par_lot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lot" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "date_peremption" TIMESTAMP(3),
    "recu_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lot_entreprise_id_date_peremption_idx" ON "lot"("entreprise_id", "date_peremption");

-- CreateIndex
CREATE INDEX "lot_produit_id_emplacement_id_date_peremption_idx" ON "lot"("produit_id", "emplacement_id", "date_peremption");

-- CreateIndex
CREATE UNIQUE INDEX "lot_produit_id_emplacement_id_numero_key" ON "lot"("produit_id", "emplacement_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "inventaire_ligne_inventaire_id_produit_id_lot_id_key" ON "inventaire_ligne"("inventaire_id", "produit_id", "lot_id");

-- CreateIndex
CREATE INDEX "mouvement_lot_id_idx" ON "mouvement"("lot_id");

-- CreateIndex
CREATE INDEX "mouvement_vente_id_idx" ON "mouvement"("vente_id");

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_vente_id_fkey" FOREIGN KEY ("vente_id") REFERENCES "vente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

