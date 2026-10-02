-- Ventes, étape 3 : ventes, lignes figées et règlements.
-- Montants en GNF, entiers. Aucun solde stocké : il se calcule.

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'ORANGE_MONEY', 'MTN_MOMO', 'CREDIT');

-- CreateEnum
CREATE TYPE "StatutVente" AS ENUM ('VALIDEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "vente" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "client_id" TEXT,
    "emplacement_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "statut" "StatutVente" NOT NULL DEFAULT 'VALIDEE',
    "sous_total" INTEGER NOT NULL,
    "remise" INTEGER NOT NULL DEFAULT 0,
    "montant_tva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "mode_paiement" "ModePaiement" NOT NULL,
    "echeance_at" TIMESTAMP(3),
    "annulee_at" TIMESTAMP(3),
    "motif_annulation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_vente" (
    "id" TEXT NOT NULL,
    "vente_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prix_unitaire" INTEGER NOT NULL,
    "taux_tva" INTEGER NOT NULL,
    "montant_ligne" INTEGER NOT NULL,

    CONSTRAINT "ligne_vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglement" (
    "id" TEXT NOT NULL,
    "vente_id" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vente_entreprise_id_numero_key" ON "vente"("entreprise_id", "numero");

-- CreateIndex
CREATE INDEX "vente_entreprise_id_created_at_idx" ON "vente"("entreprise_id", "created_at");

-- CreateIndex
CREATE INDEX "vente_client_id_created_at_idx" ON "vente"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "ligne_vente_vente_id_idx" ON "ligne_vente"("vente_id");

-- CreateIndex
CREATE INDEX "reglement_vente_id_idx" ON "reglement"("vente_id");

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente" ADD CONSTRAINT "vente_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_vente" ADD CONSTRAINT "ligne_vente_vente_id_fkey" FOREIGN KEY ("vente_id") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_vente" ADD CONSTRAINT "ligne_vente_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement" ADD CONSTRAINT "reglement_vente_id_fkey" FOREIGN KEY ("vente_id") REFERENCES "vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement" ADD CONSTRAINT "reglement_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
