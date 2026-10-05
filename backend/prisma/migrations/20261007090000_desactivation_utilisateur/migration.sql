-- Désactivation d'un utilisateur : accès retiré, compte conservé (historique).
-- Colonnes nullables, sans valeur par défaut : migration instantanée,
-- compatible avec la version précédente de l'application (expand).
ALTER TABLE "utilisateur"
  ADD COLUMN "desactive_at" TIMESTAMP(3),
  ADD COLUMN "desactive_par_id" TEXT;

ALTER TABLE "utilisateur"
  ADD CONSTRAINT "utilisateur_desactive_par_id_fkey"
  FOREIGN KEY ("desactive_par_id") REFERENCES "utilisateur"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
