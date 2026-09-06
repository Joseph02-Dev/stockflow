-- AlterTable utilisateur : photo de profil
ALTER TABLE "utilisateur" ADD COLUMN "photo_url" TEXT;

-- AlterTable fournisseur : image
ALTER TABLE "fournisseur" ADD COLUMN "photo_url" TEXT;

-- CreateTable categorie
CREATE TABLE "categorie" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorie_pkey" PRIMARY KEY ("id")
);

-- CreateTable marque
CREATE TABLE "marque" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorie_entreprise_id_nom_key" ON "categorie"("entreprise_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "marque_entreprise_id_nom_key" ON "marque"("entreprise_id", "nom");

-- AddForeignKey
ALTER TABLE "categorie" ADD CONSTRAINT "categorie_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marque" ADD CONSTRAINT "marque_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable produit : fiche enrichie
ALTER TABLE "produit"
  ADD COLUMN "photo_url" TEXT,
  ADD COLUMN "prix_achat" INTEGER,
  ADD COLUMN "prix_vente" INTEGER,
  ADD COLUMN "taux_tva" INTEGER,
  ADD COLUMN "code_barre" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "categorie_id" TEXT,
  ADD COLUMN "marque_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "produit_entreprise_id_code_barre_key" ON "produit"("entreprise_id", "code_barre");

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_marque_id_fkey" FOREIGN KEY ("marque_id") REFERENCES "marque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
