-- Ventes saisies hors ligne : heure réelle de la vente, et quantités
-- vendues sans stock enregistré, à régulariser.
ALTER TABLE "vente" ADD COLUMN "saisie_hors_ligne_at" TIMESTAMP(3),
ADD COLUMN "a_regulariser" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ligne_vente" ADD COLUMN "quantite_a_regulariser" INTEGER NOT NULL DEFAULT 0;

