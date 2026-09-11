-- CreateEnum
CREATE TYPE "SecteurActivite" AS ENUM ('MATERIAUX', 'COMMERCE', 'ARTISANAT', 'AUTRE');

-- AlterTable utilisateur : verrouillage après échecs de connexion
ALTER TABLE "utilisateur" ADD COLUMN "tentatives_echouees" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "utilisateur" ADD COLUMN "bloque_jusqua" TIMESTAMP(3);

-- AlterTable entreprise : secteur d'activité et TVA par défaut
ALTER TABLE "entreprise" ADD COLUMN "secteur_activite" "SecteurActivite";
ALTER TABLE "entreprise" ADD COLUMN "taux_tva_par_defaut" INTEGER;

-- CreateTable
CREATE TABLE "reinitialisation_mot_de_passe" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinitialisation_mot_de_passe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reinitialisation_mot_de_passe_token_hash_key" ON "reinitialisation_mot_de_passe"("token_hash");

-- CreateIndex
CREATE INDEX "reinitialisation_mot_de_passe_utilisateur_id_idx" ON "reinitialisation_mot_de_passe"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "reinitialisation_mot_de_passe" ADD CONSTRAINT "reinitialisation_mot_de_passe_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
