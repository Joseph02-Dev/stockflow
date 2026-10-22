-- Opérations saisies hors ligne déjà appliquées : l'identifiant créé sur
-- l'appareil rend leur renvoi sans effet (pas de mouvement en double).
CREATE TABLE "operation_hors_ligne" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "id_client" VARCHAR(36) NOT NULL,
    "nature" VARCHAR(40) NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_hors_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operation_hors_ligne_entreprise_id_id_client_key" ON "operation_hors_ligne"("entreprise_id", "id_client");

-- AddForeignKey
ALTER TABLE "operation_hors_ligne" ADD CONSTRAINT "operation_hors_ligne_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "operation_hors_ligne" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "operation_hors_ligne"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());
