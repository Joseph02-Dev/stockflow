import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../config/prisma.service.js';
import { sensParDefaut, type Sens } from './sens-mouvement.js';
import { valoriserMouvement } from './valorisation.js';
import { emettreEvenement } from '../webhooks/emission.js';

/**
 * Moteur de stock : SEUL point d'écriture des quantités (tables stock et
 * lot) et des mouvements. Aucun service n'incrémente un stock lui-même —
 * il appelle ces primitives dans sa transaction (test d'architecture :
 * architecture-stock.spec.ts). Chaque fonction s'exécute dans la
 * transaction fournie : l'appelant garde l'atomicité de son opération
 * composée (vente, retour, inventaire…) et l'ordre des verrous
 * (produit, puis stock, puis lot).
 */

/** Client Prisma d'une transaction en cours. */
export type TransactionPrisma = Parameters<
  Parameters<PrismaService['$transaction']>[0]
>[0];

export interface CleStock {
  produitId: string;
  emplacementId: string;
}

export const STOCK_INSUFFISANT = 'Stock insuffisant pour effectuer cette sortie.';

const quantitePositive = (quantite: number) => {
  if (!Number.isInteger(quantite) || quantite <= 0) {
    throw new Error(`Quantité de stock invalide : ${quantite}.`);
  }
};

/** Ajoute une quantité au stock d'un emplacement (ligne créée au besoin). */
export async function crediterStock(
  tx: TransactionPrisma,
  cle: CleStock,
  quantite: number,
) {
  quantitePositive(quantite);
  await tx.stock.upsert({
    where: { produitId_emplacementId: cle },
    create: { ...cle, quantite },
    update: { quantite: { increment: quantite } },
  });
}

/**
 * Retire une quantité du stock d'un emplacement. Décrément conditionnel
 * (quantite >= demandée) en une seule requête : deux sorties simultanées
 * ne peuvent jamais faire passer le stock sous zéro.
 */
export async function debiterStock(
  tx: TransactionPrisma,
  cle: CleStock,
  quantite: number,
  messageInsuffisant = STOCK_INSUFFISANT,
) {
  quantitePositive(quantite);
  const { count } = await tx.stock.updateMany({
    where: { ...cle, quantite: { gte: quantite } },
    data: { quantite: { decrement: quantite } },
  });
  if (count === 0) throw new ConflictException(messageInsuffisant);
}

/** Écart signé (inventaire) : crédit s'il est positif, débit sinon. */
export async function ajusterStock(
  tx: TransactionPrisma,
  cle: CleStock,
  ecart: number,
) {
  if (ecart > 0) await crediterStock(tx, cle, ecart);
  else if (ecart < 0) await debiterStock(tx, cle, -ecart);
}

/** Crée un lot avec sa quantité initiale. */
export function creerLot(
  tx: TransactionPrisma,
  data: Prisma.LotUncheckedCreateInput,
) {
  return tx.lot.create({ data });
}

/**
 * Lot d'un produit à un emplacement identifié par son numéro, créé vide
 * s'il n'existe pas (lot « sans date » qui reçoit le stock antérieur au
 * suivi par lot).
 */
export function obtenirLot(
  tx: TransactionPrisma,
  data: { entrepriseId: string; produitId: string; emplacementId: string; numero: string },
) {
  const { entrepriseId, ...cle } = data;
  return tx.lot.upsert({
    where: { produitId_emplacementId_numero: cle },
    create: { ...cle, entrepriseId, quantite: 0 },
    update: {},
  });
}

export async function crediterLot(
  tx: TransactionPrisma,
  lotId: string,
  quantite: number,
) {
  quantitePositive(quantite);
  await tx.lot.update({
    where: { id: lotId },
    data: { quantite: { increment: quantite } },
  });
}

/** Retrait conditionnel, comme debiterStock : un lot ne passe jamais sous zéro. */
export async function debiterLot(
  tx: TransactionPrisma,
  lotId: string,
  quantite: number,
  messageInsuffisant = STOCK_INSUFFISANT,
) {
  quantitePositive(quantite);
  const { count } = await tx.lot.updateMany({
    where: { id: lotId, quantite: { gte: quantite } },
    data: { quantite: { decrement: quantite } },
  });
  if (count === 0) throw new ConflictException(messageInsuffisant);
}

export async function ajusterLot(
  tx: TransactionPrisma,
  lotId: string,
  ecart: number,
) {
  if (ecart > 0) await crediterLot(tx, lotId, ecart);
  else if (ecart < 0) await debiterLot(tx, lotId, -ecart);
}

export type DonneesNouveauMouvement = Omit<
  Prisma.MouvementUncheckedCreateInput,
  'origine' | 'destination'
> &
  Partial<Sens>;

/**
 * Enregistre un mouvement (immuable) avec son origine et sa destination,
 * puis sa couche de valorisation (module « valorisation ») :
 * déduites du type, sauf précision de l'appelant (restitution d'une
 * vente : CLIENT ; annulation d'une casse : REBUT ; stock d'ouverture :
 * INVENTAIRE). La base refuse un mouvement qui ne touche aucun
 * emplacement interne.
 */
export async function enregistrerMouvement(
  tx: TransactionPrisma,
  data: DonneesNouveauMouvement,
  options: {
    /** Coût unitaire d'achat saisi à la réception (valorisation). */
    coutUnitaire?: number;
  } = {},
) {
  const sens = sensParDefaut(data.type, data.quantite);
  const mouvement = await tx.mouvement.create({
    data: {
      ...data,
      origine: data.origine ?? sens.origine,
      destination: data.destination ?? sens.destination,
    },
  });
  // Même transaction : un mouvement n'existe jamais sans sa valorisation
  // ni son événement webhook (et inversement).
  await valoriserMouvement(tx, mouvement, options.coutUnitaire);
  await emettreEvenement(tx, mouvement.entrepriseId, 'mouvement.cree', {
    id: mouvement.id,
    type: mouvement.type,
    produitId: mouvement.produitId,
    quantite: mouvement.quantite,
    origine: mouvement.origine,
    destination: mouvement.destination,
    emplacementId: mouvement.emplacementId,
    emplacementDestinationId: mouvement.emplacementDestinationId,
    lotId: mouvement.lotId,
    venteId: mouvement.venteId,
    creeLe: mouvement.createdAt.toISOString(),
  });
  return mouvement;
}
