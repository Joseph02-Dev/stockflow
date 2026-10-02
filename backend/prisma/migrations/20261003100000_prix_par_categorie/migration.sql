-- Ventes, étape 2 : prix par catégorie tarifaire.
-- Colonnes nulles : les produits existants restent vendables, ils
-- retombent sur prix_vente (prix de détail) pour toutes les catégories.

-- AlterTable
ALTER TABLE "produit" ADD COLUMN "prix_gros" INTEGER;
ALTER TABLE "produit" ADD COLUMN "prix_demi_gros" INTEGER;
