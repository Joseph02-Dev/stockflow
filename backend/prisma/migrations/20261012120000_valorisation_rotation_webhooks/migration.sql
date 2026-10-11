-- Vague 5 « core engine » : valorisation du stock par couches (FIFO ou
-- coût moyen pondéré), rapports de rotation et webhooks, chacun derrière
-- un module désactivé par défaut. Uniquement des ajouts : la version
-- précédente de l'API continue de fonctionner (retour arrière sûr).

-- CreateEnum
CREATE TYPE "MethodeValorisation" AS ENUM ('FIFO', 'PMP');

-- CreateEnum
CREATE TYPE "StatutLivraisonWebhook" AS ENUM ('EN_ATTENTE', 'LIVREE', 'ECHEC');

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "methode_valorisation" "MethodeValorisation" NOT NULL DEFAULT 'PMP',
ADD COLUMN     "module_rotation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module_valorisation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module_webhooks" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "couche_valorisation" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "mouvement_id" TEXT,
    "quantite" INTEGER NOT NULL,
    "cout_unitaire" INTEGER NOT NULL,
    "valeur" BIGINT NOT NULL,
    "quantite_restante" INTEGER NOT NULL DEFAULT 0,
    "libelle" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couche_valorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonnement_webhook" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "evenements" TEXT[],
    "secret" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "echecs_consecutifs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonnement_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_webhook" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "charge" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livraison_webhook" (
    "id" TEXT NOT NULL,
    "evenement_id" TEXT NOT NULL,
    "abonnement_id" TEXT NOT NULL,
    "statut" "StatutLivraisonWebhook" NOT NULL DEFAULT 'EN_ATTENTE',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "prochaine_tentative_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code_http" INTEGER,
    "erreur" TEXT,
    "livree_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "livraison_webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "couche_valorisation_produit_id_created_at_idx" ON "couche_valorisation"("produit_id", "created_at");

-- CreateIndex
CREATE INDEX "couche_valorisation_entreprise_id_created_at_idx" ON "couche_valorisation"("entreprise_id", "created_at");

-- CreateIndex
CREATE INDEX "abonnement_webhook_entreprise_id_idx" ON "abonnement_webhook"("entreprise_id");

-- CreateIndex
CREATE INDEX "evenement_webhook_entreprise_id_created_at_idx" ON "evenement_webhook"("entreprise_id", "created_at");

-- CreateIndex
CREATE INDEX "livraison_webhook_statut_prochaine_tentative_at_idx" ON "livraison_webhook"("statut", "prochaine_tentative_at");

-- CreateIndex
CREATE INDEX "livraison_webhook_abonnement_id_created_at_idx" ON "livraison_webhook"("abonnement_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "livraison_webhook_evenement_id_abonnement_id_key" ON "livraison_webhook"("evenement_id", "abonnement_id");

-- AddForeignKey
ALTER TABLE "couche_valorisation" ADD CONSTRAINT "couche_valorisation_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couche_valorisation" ADD CONSTRAINT "couche_valorisation_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couche_valorisation" ADD CONSTRAINT "couche_valorisation_mouvement_id_fkey" FOREIGN KEY ("mouvement_id") REFERENCES "mouvement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnement_webhook" ADD CONSTRAINT "abonnement_webhook_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_webhook" ADD CONSTRAINT "evenement_webhook_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livraison_webhook" ADD CONSTRAINT "livraison_webhook_evenement_id_fkey" FOREIGN KEY ("evenement_id") REFERENCES "evenement_webhook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livraison_webhook" ADD CONSTRAINT "livraison_webhook_abonnement_id_fkey" FOREIGN KEY ("abonnement_id") REFERENCES "abonnement_webhook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Une couche d'entrée porte une quantité et une valeur positives, et son
-- reste non consommé ; une sortie, des valeurs négatives et aucun reste.
ALTER TABLE "couche_valorisation" ADD CONSTRAINT "couche_valorisation_coherente"
  CHECK ("cout_unitaire" >= 0
         AND "quantite_restante" >= 0
         AND (("quantite" > 0 AND "quantite_restante" <= "quantite") OR ("quantite" < 0 AND "quantite_restante" = 0)));

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "couche_valorisation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "couche_valorisation"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "abonnement_webhook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "abonnement_webhook"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "evenement_webhook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "evenement_webhook"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "livraison_webhook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "livraison_webhook"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "abonnement_webhook" parent WHERE parent.id = "livraison_webhook".abonnement_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "abonnement_webhook" parent WHERE parent.id = "livraison_webhook".abonnement_id));
