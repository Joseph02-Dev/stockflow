-- Notifications lues (panneau de la cloche) : seule la lecture est
-- conservée, les notifications sont calculées à la volée.
CREATE TABLE "notification_lue" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "cle" VARCHAR(120) NOT NULL,
    "lue_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_lue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_lue_utilisateur_id_cle_key" ON "notification_lue"("utilisateur_id", "cle");

-- CreateIndex
CREATE INDEX "notification_lue_entreprise_id_idx" ON "notification_lue"("entreprise_id");

-- AddForeignKey
ALTER TABLE "notification_lue" ADD CONSTRAINT "notification_lue_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_lue" ADD CONSTRAINT "notification_lue_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "notification_lue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "notification_lue"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());
