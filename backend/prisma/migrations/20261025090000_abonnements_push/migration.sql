-- Notifications push (Web Push) : appareils abonnés, tant qu'une personne
-- y est connectée.
CREATE TABLE "abonnement_push" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "utilisateur_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" VARCHAR(200) NOT NULL,
    "auth" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonnement_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "abonnement_push_endpoint_key" ON "abonnement_push"("endpoint");

-- CreateIndex
CREATE INDEX "abonnement_push_entreprise_id_idx" ON "abonnement_push"("entreprise_id");

-- CreateIndex
CREATE INDEX "abonnement_push_utilisateur_id_idx" ON "abonnement_push"("utilisateur_id");

-- AddForeignKey
ALTER TABLE "abonnement_push" ADD CONSTRAINT "abonnement_push_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement_push" ADD CONSTRAINT "abonnement_push_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "abonnement_push" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "abonnement_push"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());
