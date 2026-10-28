import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../config/prisma.service.js';
import type { TransactionPrisma } from '../stock/moteur-stock.js';
import type { EvenementWebhook } from './regles-webhook.js';

let derniereEmissionAt = 0;

/**
 * Prévient le livreur qu'une livraison vient peut-être d'être créée : il
 * interroge alors la base pendant quelques minutes, le temps que la
 * transaction de l'émetteur soit validée.
 */
export function signalerEmission(maintenant = Date.now()) {
  derniereEmissionAt = maintenant;
}

export function derniereEmission(): number {
  return derniereEmissionAt;
}

/**
 * Émission d'un événement (outbox transactionnelle) : écrit l'événement et
 * une livraison par abonnement actif qui l'écoute — dans la transaction de
 * l'appelant quand il en a une, pour qu'un mouvement annulé n'émette
 * jamais rien. Sans module ou sans abonné : une seule lecture, rien
 * d'écrit. L'envoi HTTP est fait plus tard par LivreurWebhooks.
 */
export async function emettreEvenement(
  client: TransactionPrisma | PrismaService,
  entrepriseId: string,
  type: EvenementWebhook,
  charge: Prisma.InputJsonValue,
) {
  const abonnements = await client.abonnementWebhook.findMany({
    where: { entrepriseId, actif: true, evenements: { has: type }, entreprise: { moduleWebhooks: true } },
    select: { id: true },
  });
  if (abonnements.length === 0) return;
  signalerEmission();
  await client.evenementWebhook.create({
    data: {
      entrepriseId,
      type,
      charge,
      livraisons: { create: abonnements.map((a) => ({ abonnementId: a.id })) },
    },
  });
}
