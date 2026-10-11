-- Vague 2 « core engine » : modèles de produits à variantes et
-- conditionnements (unités multiples avec conversion), chacun derrière un
-- module désactivé par défaut. Uniquement des ajouts : la version
-- précédente de l'API continue de fonctionner (retour arrière sûr).

-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "module_conditionnements" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "module_variantes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mouvement" ADD COLUMN     "conditionnement_id" TEXT,
ADD COLUMN     "facteur_conditionnement" INTEGER;

-- AlterTable
ALTER TABLE "produit" ADD COLUMN     "cle_variante" TEXT,
ADD COLUMN     "modele_id" TEXT,
ADD COLUMN     "valeurs_variante" JSONB;

-- CreateTable
CREATE TABLE "modele_produit" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "reference" TEXT,
    "categorie_id" TEXT,
    "marque_id" TEXT,
    "unite_mesure" TEXT,
    "prix_achat" INTEGER,
    "prix_vente" INTEGER,
    "taux_tva" INTEGER,
    "seuil_alerte" INTEGER NOT NULL DEFAULT 0,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modele_produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribut_modele" (
    "id" TEXT NOT NULL,
    "modele_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "valeurs" TEXT[],

    CONSTRAINT "attribut_modele_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditionnement" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "facteur" INTEGER NOT NULL,
    "code_barre" TEXT,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conditionnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modele_produit_entreprise_id_nom_idx" ON "modele_produit"("entreprise_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "attribut_modele_modele_id_nom_key" ON "attribut_modele"("modele_id", "nom");

-- CreateIndex
CREATE INDEX "conditionnement_entreprise_id_idx" ON "conditionnement"("entreprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "conditionnement_produit_id_nom_key" ON "conditionnement"("produit_id", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "produit_modele_id_cle_variante_key" ON "produit"("modele_id", "cle_variante");

-- AddForeignKey
ALTER TABLE "produit" ADD CONSTRAINT "produit_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_conditionnement_id_fkey" FOREIGN KEY ("conditionnement_id") REFERENCES "conditionnement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_produit" ADD CONSTRAINT "modele_produit_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_produit" ADD CONSTRAINT "modele_produit_categorie_id_fkey" FOREIGN KEY ("categorie_id") REFERENCES "categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_produit" ADD CONSTRAINT "modele_produit_marque_id_fkey" FOREIGN KEY ("marque_id") REFERENCES "marque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribut_modele" ADD CONSTRAINT "attribut_modele_modele_id_fkey" FOREIGN KEY ("modele_id") REFERENCES "modele_produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditionnement" ADD CONSTRAINT "conditionnement_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditionnement" ADD CONSTRAINT "conditionnement_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un conditionnement contient au moins 2 unités (sinon c'est l'unité de
-- base) ; un mouvement saisi en conditionnement fige son facteur.
ALTER TABLE "conditionnement" ADD CONSTRAINT "conditionnement_facteur_valide" CHECK ("facteur" >= 2);
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_facteur_conditionnement_valide"
  CHECK (("conditionnement_id" IS NULL) = ("facteur_conditionnement" IS NULL)
         AND ("facteur_conditionnement" IS NULL OR "facteur_conditionnement" >= 2));

-- Isolation des entreprises (Row-Level Security), comme les autres tables.
ALTER TABLE "modele_produit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "modele_produit"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "conditionnement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "conditionnement"
  USING (app_contexte_systeme() OR entreprise_id = app_entreprise_courante())
  WITH CHECK (app_contexte_systeme() OR entreprise_id = app_entreprise_courante());

ALTER TABLE "attribut_modele" ENABLE ROW LEVEL SECURITY;
CREATE POLICY isolation_entreprise ON "attribut_modele"
  USING (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "modele_produit" parent WHERE parent.id = "attribut_modele".modele_id))
  WITH CHECK (app_contexte_systeme() OR EXISTS (SELECT 1 FROM "modele_produit" parent WHERE parent.id = "attribut_modele".modele_id));
