-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GESTIONNAIRE');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('ENTREE', 'SORTIE');

-- CreateEnum
CREATE TYPE "TypeAlerte" AS ENUM ('STOCK_FAIBLE', 'RUPTURE');

-- CreateEnum
CREATE TYPE "StatutAlerte" AS ENUM ('ACTIVE', 'RESOLUE');

-- CreateTable
CREATE TABLE "entreprise" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emplacement" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produit" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "reference" TEXT,
    "seuil_alerte" INTEGER NOT NULL DEFAULT 0,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email_contact" TEXT,
    "telephone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fournisseur_produit" (
    "fournisseur_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,

    CONSTRAINT "fournisseur_produit_pkey" PRIMARY KEY ("fournisseur_id","produit_id")
);

-- CreateTable
CREATE TABLE "stock" (
    "produit_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("produit_id","emplacement_id")
);

-- CreateTable
CREATE TABLE "mouvement" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "emplacement_id" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "fournisseur_id" TEXT,
    "utilisateur_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerte" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "type" "TypeAlerte" NOT NULL,
    "statut" "StatutAlerte" NOT NULL DEFAULT 'ACTIVE',
    "quantite_au_declenchement" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alerte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE INDEX "utilisateur_entreprise_id_idx" ON "utilisateur"("entreprise_id");

-- CreateIndex
CREATE INDEX "emplacement_entreprise_id_idx" ON "emplacement"("entreprise_id");

-- CreateIndex
CREATE INDEX "produit_entreprise_id_nom_idx" ON "produit"("entreprise_id", "nom");

-- CreateIndex
CREATE INDEX "fournisseur_entreprise_id_idx" ON "fournisseur"("entreprise_id");

-- CreateIndex
CREATE INDEX "mouvement_produit_id_created_at_idx" ON "mouvement"("produit_id", "created_at");

-- CreateIndex
CREATE INDEX "mouvement_entreprise_id_created_at_idx" ON "mouvement"("entreprise_id", "created_at");

-- CreateIndex
CREATE INDEX "alerte_entreprise_id_statut_idx" ON "alerte"("entreprise_id", "statut");

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emplacement" ADD CONSTRAINT "emplacement_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur" ADD CONSTRAINT "fournisseur_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_produit" ADD CONSTRAINT "fournisseur_produit_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fournisseur_produit" ADD CONSTRAINT "fournisseur_produit_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_emplacement_id_fkey" FOREIGN KEY ("emplacement_id") REFERENCES "emplacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_fournisseur_id_fkey" FOREIGN KEY ("fournisseur_id") REFERENCES "fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerte" ADD CONSTRAINT "alerte_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerte" ADD CONSTRAINT "alerte_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
