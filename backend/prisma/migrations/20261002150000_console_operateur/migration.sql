-- Console opérateur : suspension d'entreprise, opérateurs, journal d'audit.

-- CreateEnum
CREATE TYPE "StatutEntreprise" AS ENUM ('ACTIVE', 'SUSPENDUE');

-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('CONNEXION', 'CONSULTATION_ENTREPRISE', 'SUSPENSION', 'RETABLISSEMENT');

-- AlterTable entreprise : toutes les entreprises existantes restent actives
ALTER TABLE "entreprise" ADD COLUMN "statut" "StatutEntreprise" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "entreprise" ADD COLUMN "suspendue_at" TIMESTAMP(3);
ALTER TABLE "entreprise" ADD COLUMN "motif_suspension" TEXT;

-- CreateTable
CREATE TABLE "operateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "derniere_connexion_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operateur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operateur_email_key" ON "operateur"("email");

-- CreateTable
-- entreprise_id volontairement sans clé étrangère : le journal survit à l'entreprise.
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "operateur_id" TEXT NOT NULL,
    "action" "ActionAudit" NOT NULL,
    "entreprise_id" TEXT,
    "motif" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_audit_operateur_id_created_at_idx" ON "journal_audit"("operateur_id", "created_at");

-- CreateIndex
CREATE INDEX "journal_audit_entreprise_id_created_at_idx" ON "journal_audit"("entreprise_id", "created_at");

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_operateur_id_fkey" FOREIGN KEY ("operateur_id") REFERENCES "operateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
