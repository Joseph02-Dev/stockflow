import { BadRequestException } from '@nestjs/common';

/**
 * Pagination par curseur des historiques (mouvements, ventes) : une page de
 * `limite` éléments, du plus récent au plus ancien, puis les suivants
 * « après » l'identifiant du dernier élément reçu. Contrairement à un
 * décalage (offset), le coût d'une page ne dépend pas de sa profondeur et
 * une insertion pendant la lecture ne décale rien.
 *
 * La réponse reste un tableau : la page suivante existe tant que le
 * tableau reçu est plein (longueur === limite).
 */
export const LIMITE_PAR_DEFAUT = 50;
export const LIMITE_MAX = 200;
const FORMAT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Pagination {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

export function lirePagination(
  limite?: string | number,
  apres?: string,
): Pagination {
  let take = LIMITE_PAR_DEFAUT;
  if (limite !== undefined && limite !== '') {
    take = Number(limite);
    if (!Number.isInteger(take) || take < 1 || take > LIMITE_MAX) {
      throw new BadRequestException(
        `La limite doit être un entier entre 1 et ${LIMITE_MAX}.`,
      );
    }
  }
  if (apres === undefined || apres === '') return { take };
  if (!FORMAT_UUID.test(apres))
    throw new BadRequestException('Curseur de pagination invalide.');
  return { take, cursor: { id: apres }, skip: 1 };
}

/** Ordre stable pour le curseur : date, puis identifiant pour départager. */
export const ORDRE_RECENT_DABORD = [
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
];
