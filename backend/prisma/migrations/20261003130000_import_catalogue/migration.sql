-- Import de catalogue : sessions d'import, lignes reçues (journal) et
-- rattachement des produits créés à leur import, pour pouvoir l'annuler.
-- Aucune donnée existante n'est modifiée.
-- CreateEnum
CREATE TYPE "StatutImport" AS ENUM ('EN_COURS', 'VERIFIE', 'EXECUTE', 'ANNULE');

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "import_id" TEXT;

-- CreateTable
CREATE TABLE "import_catalogue" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "nom_fichier" TEXT NOT NULL,
    "statut" "StatutImport" NOT NULL DEFAULT 'EN_COURS',
    "lignes_total" INTEGER NOT NULL DEFAULT 0,
    "lignes_creees" INTEGER NOT NULL DEFAULT 0,
    "lignes_mises_a_jour" INTEGER NOT NULL DEFAULT 0,
    "lignes_ignorees" INTEGER NOT NULL DEFAULT 0,
    "execute_at" TIMESTAMP(3),
    "annule_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_catalogue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_ligne" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "donnees" JSONB NOT NULL,
    "produit_id" TEXT,
    "mouvement_id" TEXT,

    CONSTRAINT "import_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_catalogue_entreprise_id_created_at_idx" ON "import_catalogue"("entreprise_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_ligne_import_id_numero_key" ON "import_ligne"("import_id", "numero");

-- CreateIndex
CREATE INDEX "produit_import_id_idx" ON "produit"("import_id");

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "import_catalogue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_catalogue" ADD CONSTRAINT "import_catalogue_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_catalogue" ADD CONSTRAINT "import_catalogue_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_ligne" ADD CONSTRAINT "import_ligne_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "import_catalogue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

