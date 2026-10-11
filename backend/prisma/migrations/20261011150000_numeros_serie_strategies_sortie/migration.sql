-- Vague 3 « core engine » : numéros de série et stratégies de sortie
-- (FEFO, FIFO, LIFO), chacun derrière un module désactivé par défaut.
-- Uniquement des ajouts avec valeurs par défaut : la version précédente
-- de l'API continue de fonctionner (retour arrière sûr) — sans le module,
-- les sorties restent en FEFO, comme avant.

-- CreateEnum
CREATE TYPE "StrategieSortie" AS ENUM ('FEFO', 'FIFO', 'LIFO');

-- AlterTable
ALTER TABLE "emplacement" ADD COLUMN     "strategie_sortie" "StrategieSortie";

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "module_numeros_serie" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module_strategies_sortie" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "strategie_sortie" "StrategieSortie" NOT NULL DEFAULT 'FEFO';

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "suivi_par_serie" BOOLEAN NOT NULL DEFAULT false;

-- Un numéro de série est un lot d'une unité : le suivi par série repose
-- sur le suivi par lot.
ALTER TABLE "produit" ADD CONSTRAINT "produit_serie_implique_lot"
  CHECK (NOT "suivi_par_serie" OR "suivi_par_lot");
