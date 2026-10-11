-- Vague 4 « core engine » : règles de réapprovisionnement min/max et
-- règles de rangement, chacune derrière un module désactivé par défaut.
-- Uniquement des ajouts : la version précédente de l'API continue de
-- fonctionner (retour arrière sûr).

-- AlterTable
ALTER TABLE "commande_fournisseur" ADD COLUMN     "automatique" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "dernier_reappro_at" TIMESTAMP(3),
ADD COLUMN     "module_rangement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module_reapprovisionnement" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "regle_reapprovisionnement" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "fournisseur_id" TEXT,
    "stock_min" INTEGER NOT NULL,
    "stock_max" INTEGER NOT NULL,
    "multiple" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regle_reapprovisionnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regle_rangement" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT,
    "categorie_id" TEXT,
    "emplacement_reception_id" TEXT,
    "emplacement_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regle_rangement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regle_reapprovisionnement_entreprise_id_idx" ON "regle_reapprovisionnement"("entreprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "regle_reapprovisionnement_produit_id_emplacement_id_key" ON "regle_reapprovisionnement"("produit_id", "emplacement_id");

-- CreateIndex
CREATE INDEX "regle_rangement_entreprise_id_idx" ON "regle_rangement"("entreprise_id");

-- AddForeignKey
ALTER TABLE "regle_reapprovisionnement" ADD CONSTRAINT "regle_reapprovisionnement_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_reapprovisionnement" ADD CONSTRAINT "regle_reapprovisionnement_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_reapprovisionnement" ADD CONSTRAINT "regle_reapprovisionnement_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_reapprovisionnement" ADD CONSTRAINT "regle_reapprovisionnement_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_emplacement_reception_id_fkey" FOREIGN KEY ("emplacement_reception_id") REFERENCES "emplacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Bornes cohérentes : 0 ≤ min ≤ max, multiple de commande ≥ 1.
ALTER TABLE "regle_reapprovisionnement" ADD CONSTRAINT "regle_reappro_bornes"
  CHECK ("stock_min" >= 0 AND "stock_max" >= "stock_min" AND "stock_max" > 0 AND "multiple" >= 1);

-- Une règle de rangement vise soit un produit, soit une catégorie, et
-- range ailleurs que là où la marchandise arrive.
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_cible"
  CHECK (num_nonnulls("produit_id", "categorie_id") = 1);
ALTER TABLE "regle_rangement" ADD CONSTRAINT "regle_rangement_destination_differente"
  CHECK ("emplacement_reception_id" IS NULL OR "emplacement_reception_id" <> "emplacement_id");

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "regle_reapprovisionnement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "regle_reapprovisionnement"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "regle_rangement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "regle_rangement"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());
