-- AlterTable produit : unité de mesure
ALTER TABLE "produit" ADD COLUMN "unite_mesure" TEXT;

-- AlterTable fournisseur : délai de livraison moyen (jours, saisi manuellement)
ALTER TABLE "fournisseur" ADD COLUMN "delai_livraison_jours" INTEGER;
