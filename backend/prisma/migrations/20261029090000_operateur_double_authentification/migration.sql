-- Double authentification (TOTP) de la console opérateur. Colonnes
-- facultatives : la version précédente les ignore (retour arrière sans
-- effet), et chaque opérateur s'enrôle à sa prochaine connexion.
ALTER TABLE "operateur" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "operateur" ADD COLUMN "totp_actif_at" TIMESTAMP(3);
ALTER TABLE "operateur" ADD COLUMN "totp_dernier_pas" INTEGER;
