-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('BROUILLON', 'ENVOYEE', 'RECUE', 'ANNULEE');

-- CreateTable
CREATE TABLE "commande_fournisseur" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "fournisseur_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "statut" "StatutCommande" NOT NULL DEFAULT 'BROUILLON',
    "utilisateur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envoyee_at" TIMESTAMP(3),
    "recue_at" TIMESTAMP(3),

    CONSTRAINT "commande_fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commande_ligne" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "quantite_commandee" INTEGER NOT NULL,

    CONSTRAINT "commande_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commande_fournisseur_entreprise_id_fournisseur_id_idx" ON "commande_fournisseur"("entreprise_id", "fournisseur_id");

-- CreateIndex
CREATE UNIQUE INDEX "commande_ligne_commande_id_produit_id_key" ON "commande_ligne"("commande_id", "produit_id");

-- AddForeignKey
ALTER TABLE "commande_fournisseur" ADD CONSTRAINT "commande_fournisseur_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_fournisseur" ADD CONSTRAINT "commande_fournisseur_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_fournisseur" ADD CONSTRAINT "commande_fournisseur_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_fournisseur" ADD CONSTRAINT "commande_fournisseur_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commande_fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande_ligne" ADD CONSTRAINT "commande_ligne_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
