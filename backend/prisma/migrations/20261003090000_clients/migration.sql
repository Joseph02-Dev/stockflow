-- Ventes, étape 1 : clients et catégories tarifaires.

-- CreateEnum
CREATE TYPE "CategorieTarifaire" AS ENUM ('GROS', 'DEMI_GROS', 'DETAIL');

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "nom_commerce" TEXT,
    "categorie" "CategorieTarifaire" NOT NULL DEFAULT 'DETAIL',
    "plafond_credit" INTEGER,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_entreprise_id_archive_idx" ON "client"("entreprise_id", "archive");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
