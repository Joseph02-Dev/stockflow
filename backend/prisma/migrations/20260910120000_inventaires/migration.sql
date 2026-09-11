-- AlterEnum : ajout de la valeur AJUSTEMENT
ALTER TYPE "TypeMouvement" ADD VALUE 'AJUSTEMENT';

-- CreateEnum
CREATE TYPE "StatutInventaire" AS ENUM ('EN_COURS', 'TERMINE');

-- CreateEnum
CREATE TYPE "StatutLigneInventaire" AS ENUM ('EN_ATTENTE', 'VALIDEE', 'IGNOREE');

-- CreateTable
CREATE TABLE "inventaire" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "statut" "StatutInventaire" NOT NULL DEFAULT 'EN_COURS',
    "utilisateur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termine_at" TIMESTAMP(3),

    CONSTRAINT "inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventaire_ligne" (
    "id" TEXT NOT NULL,
    "inventaire_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "quantite_comptee" INTEGER,
    "statut_ajustement" "StatutLigneInventaire" NOT NULL DEFAULT 'EN_ATTENTE',
    "valide_par_id" TEXT,
    "valide_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventaire_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventaire_entreprise_id_emplacement_id_idx" ON "inventaire"("entreprise_id", "emplacement_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventaire_ligne_inventaire_id_produit_id_key" ON "inventaire_ligne"("inventaire_id", "produit_id");

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire" ADD CONSTRAINT "inventaire_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_inventaire_id_fkey" FOREIGN KEY ("inventaire_id") REFERENCES "inventaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaire_ligne" ADD CONSTRAINT "inventaire_ligne_valide_par_id_fkey" FOREIGN KEY ("valide_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
