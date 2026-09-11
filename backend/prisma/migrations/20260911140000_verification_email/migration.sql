-- AlterTable utilisateur : statut de vérification d'email
ALTER TABLE "utilisateur" ADD COLUMN "email_verifie_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "verification_email" (
    "id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_email_token_hash_key" ON "verification_email"("token_hash");

-- CreateIndex
CREATE INDEX "verification_email_utilisateur_id_idx" ON "verification_email"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "verification_email" ADD CONSTRAINT "verification_email_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
