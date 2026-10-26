-- Dernière étape de péremption signalée (email et push quotidiens) : un
-- lot n'est signalé qu'une fois par étape. Nouvelle table : retour
-- arrière sans effet sur la version précédente.
CREATE TABLE "peremption_signalee" (
    "lot_id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "etape" TEXT NOT NULL,
    "signalee_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peremption_signalee_pkey" PRIMARY KEY ("lot_id")
);

-- CreateIndex
CREATE INDEX "peremption_signalee_entreprise_id_idx" ON "peremption_signalee"("entreprise_id");

-- AddForeignKey
ALTER TABLE "peremption_signalee" ADD CONSTRAINT "peremption_signalee_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peremption_signalee" ADD CONSTRAINT "peremption_signalee_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "peremption_signalee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "peremption_signalee"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());
