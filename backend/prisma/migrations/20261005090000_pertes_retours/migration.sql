-- Pertes et retours : casse (motif obligatoire, valeur figée au prix
-- d'achat), retour client, retour fournisseur avec suivi de l'avoir.
-- Colonnes ajoutées toutes nulles ou à valeur par défaut : aucune donnée
-- existante n'est modifiée. PostgreSQL ≥ 12 accepte plusieurs ADD VALUE
-- dans une même migration (les nouvelles valeurs n'y sont pas utilisées).
-- CreateEnum
CREATE TYPE "MotifPerte" AS ENUM ('CASSE_MANUTENTION', 'DEGAT_EAUX', 'VOL', 'ERREUR_SAISIE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutAvoir" AS ENUM ('ATTENDU', 'RECU', 'REFUSE');

-- CreateEnum
CREATE TYPE "EtatRetourClient" AS ENUM ('REMISE_EN_STOCK', 'CASSE', 'RETOUR_FOURNISSEUR');

-- CreateEnum
CREATE TYPE "CompensationRetour" AS ENUM ('DEDUIRE_DETTE', 'REMBOURSEMENT');

-- AlterEnum
ALTER TYPE "ModePaiement" ADD VALUE 'AVOIR';

-- AlterEnum


ALTER TYPE "TypeMouvement" ADD VALUE 'CASSE';
ALTER TYPE "TypeMouvement" ADD VALUE 'RETOUR_CLIENT';
ALTER TYPE "TypeMouvement" ADD VALUE 'RETOUR_FOURNISSEUR';

-- AlterTable
ALTER TABLE "mouvement" ADD COLUMN     "annule_at" TIMESTAMP(3),
ADD COLUMN     "annule_mouvement_id" TEXT,
ADD COLUMN     "annule_par_id" TEXT,
ADD COLUMN     "commentaire" TEXT,
ADD COLUMN     "motif_annulation" TEXT,
ADD COLUMN     "motif_perte" "MotifPerte",
ADD COLUMN     "photo_url" TEXT,
ADD COLUMN     "retour_client_id" TEXT,
ADD COLUMN     "retour_fournisseur_id" TEXT,
ADD COLUMN     "valeur_totale" INTEGER,
ADD COLUMN     "valeur_unitaire" INTEGER;

-- CreateTable
CREATE TABLE "retour_fournisseur" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "fournisseur_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "valeur_totale" INTEGER NOT NULL,
    "statut_avoir" "StatutAvoir" NOT NULL DEFAULT 'ATTENDU',
    "avoir_recu_at" TIMESTAMP(3),
    "refuse_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retour_fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retour_client" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "vente_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "etat" "EtatRetourClient" NOT NULL,
    "compensation" "CompensationRetour" NOT NULL,
    "montant" INTEGER NOT NULL,
    "reglement_id" TEXT,
    "retour_fournisseur_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retour_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retour_client_ligne" (
    "id" TEXT NOT NULL,
    "retour_id" TEXT NOT NULL,
    "ligne_vente_id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "retour_client_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retour_fournisseur_entreprise_id_created_at_idx" ON "retour_fournisseur"("entreprise_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "retour_client_reglement_id_key" ON "retour_client"("reglement_id");

-- CreateIndex
CREATE INDEX "retour_client_vente_id_idx" ON "retour_client"("vente_id");

-- CreateIndex
CREATE INDEX "retour_client_entreprise_id_created_at_idx" ON "retour_client"("entreprise_id", "created_at");

-- CreateIndex
CREATE INDEX "retour_client_ligne_ligne_vente_id_idx" ON "retour_client_ligne"("ligne_vente_id");

-- CreateIndex
CREATE UNIQUE INDEX "mouvement_annule_mouvement_id_key" ON "mouvement"("annule_mouvement_id");

-- CreateIndex
CREATE INDEX "mouvement_entreprise_id_type_created_at_idx" ON "mouvement"("entreprise_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "mouvement_retour_fournisseur_id_idx" ON "mouvement"("retour_fournisseur_id");

-- CreateIndex
CREATE INDEX "mouvement_retour_client_id_idx" ON "mouvement"("retour_client_id");

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_annule_par_id_fkey" FOREIGN KEY ("annule_par_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_annule_mouvement_id_fkey" FOREIGN KEY ("annule_mouvement_id") REFERENCES "mouvement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_retour_fournisseur_id_fkey" FOREIGN KEY ("retour_fournisseur_id") REFERENCES "retour_fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_retour_client_id_fkey" FOREIGN KEY ("retour_client_id") REFERENCES "retour_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_fournisseur" ADD CONSTRAINT "retour_fournisseur_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client" ADD CONSTRAINT "retour_client_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client" ADD CONSTRAINT "retour_client_vente_id_fkey" FOREIGN KEY ("vente_id") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client" ADD CONSTRAINT "retour_client_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client" ADD CONSTRAINT "retour_client_reglement_id_fkey" FOREIGN KEY ("reglement_id") REFERENCES "reglement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client" ADD CONSTRAINT "retour_client_retour_fournisseur_id_fkey" FOREIGN KEY ("retour_fournisseur_id") REFERENCES "retour_fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client_ligne" ADD CONSTRAINT "retour_client_ligne_retour_id_fkey" FOREIGN KEY ("retour_id") REFERENCES "retour_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retour_client_ligne" ADD CONSTRAINT "retour_client_ligne_ligne_vente_id_fkey" FOREIGN KEY ("ligne_vente_id") REFERENCES "ligne_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

