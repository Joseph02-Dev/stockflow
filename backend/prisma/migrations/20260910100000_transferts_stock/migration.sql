-- AlterEnum : ajout de la valeur TRANSFERT
ALTER TYPE "TypeMouvement" ADD VALUE 'TRANSFERT';

-- AlterTable mouvement : emplacement de destination (transferts uniquement)
ALTER TABLE "mouvement" ADD COLUMN "emplacement_destination_id" TEXT;

-- AddForeignKey
ALTER TABLE "mouvement" ADD CONSTRAINT "mouvement_emplacement_destination_id_fkey" FOREIGN KEY ("emplacement_destination_id") REFERENCES "emplacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
