-- Console opérateur, phase 2 : limites par entreprise et modules à la carte.

-- AlterEnum : nouvelle action journalisée
ALTER TYPE "ActionAudit" ADD VALUE 'MODIFICATION_REGLAGES';

-- AlterTable entreprise : limites nulles (illimité) et modules activés
-- par défaut — aucune entreprise existante ne perd quoi que ce soit.
ALTER TABLE "entreprise" ADD COLUMN "limite_emplacements" INTEGER;
ALTER TABLE "entreprise" ADD COLUMN "limite_utilisateurs" INTEGER;
ALTER TABLE "entreprise" ADD COLUMN "limite_references" INTEGER;
ALTER TABLE "entreprise" ADD COLUMN "module_inventaires" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "entreprise" ADD COLUMN "module_transferts" BOOLEAN NOT NULL DEFAULT true;
