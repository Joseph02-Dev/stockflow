import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { hours } from '@nestjs/throttler';
import { InjectThrottlerStorage, type ThrottlerStorage } from '@nestjs/throttler';

export const QUOTA_JOUR_PAR_DEFAUT = 50;

/** ASSISTANT_QUOTA_JOUR, entier positif ; valeur par défaut sinon. */
export function quotaJournalier(env: NodeJS.ProcessEnv = process.env): number {
  const valeur = Number(env.ASSISTANT_QUOTA_JOUR);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : QUOTA_JOUR_PAR_DEFAUT;
}

/**
 * Quota de questions par ENTREPRISE (et non par IP) sur une fenêtre de
 * 24 h : borne le coût du fournisseur IA. Même stockage que la limitation
 * de débit (Redis en production : compteur partagé entre instances).
 * Toujours actif, y compris en test : chaque test crée sa propre entreprise.
 */
@Injectable()
export class QuotaAssistant {
  constructor(@InjectThrottlerStorage() private readonly stockage: ThrottlerStorage) {}

  async consommer(entrepriseId: string, quota = quotaJournalier()) {
    const { totalHits } = await this.stockage.increment(`assistant:${entrepriseId}`, hours(24), quota, 0, 'assistant');
    if (totalHits > quota) {
      throw new HttpException(
        {
          code: 'QUOTA_ASSISTANT_ATTEINT',
          message: `Votre entreprise a atteint la limite de ${quota} questions à l'assistant sur 24 heures. Réessayez plus tard.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
