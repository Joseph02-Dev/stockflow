-- Assistant IA en lecture seule, derrière un module désactivé par défaut.
-- Uniquement un ajout : la version précédente de l'API continue de
-- fonctionner (retour arrière sûr).

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "module_assistant" BOOLEAN NOT NULL DEFAULT false;
