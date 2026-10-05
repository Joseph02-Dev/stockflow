-- Coordonnées de l'entreprise, imprimées en en-tête des rapports PDF.
ALTER TABLE "entreprise"
  ADD COLUMN "adresse" TEXT,
  ADD COLUMN "telephone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "rccm" TEXT,
  ADD COLUMN "nif" TEXT,
  ADD COLUMN "logo_url" TEXT;
