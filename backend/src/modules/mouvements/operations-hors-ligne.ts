import type { PrismaService } from '../../config/prisma.service.js';
import type { TransactionPrisma } from '../stock/moteur-stock.js';

/** Réponse à un renvoi d'une opération déjà appliquée : rien n'est refait. */
export const DEJA_ENREGISTRE = { dejaEnregistre: true } as const;

/** L'opération portant cet identifiant a-t-elle déjà été appliquée ? */
export async function operationDejaAppliquee(
  prisma: PrismaService,
  entrepriseId: string,
  idClient?: string,
): Promise<boolean> {
  if (!idClient) return false;
  const existante = await prisma.operationHorsLigne.findUnique({
    where: { entrepriseId_idClient: { entrepriseId, idClient } },
  });
  return existante !== null;
}

/**
 * Inscrit l'identifiant dans la transaction de l'opération : si deux
 * renvois arrivent en même temps, la contrainte d'unicité fait échouer
 * le second, et toute sa transaction avec (voir estDoublonOperation).
 */
export async function reserverOperation(
  tx: TransactionPrisma,
  entrepriseId: string,
  idClient: string | undefined,
  nature: string,
): Promise<void> {
  if (!idClient) return;
  await tx.operationHorsLigne.create({ data: { entrepriseId, idClient, nature } });
}

/** Échec dû à un identifiant d'opération déjà inscrit (renvoi simultané). */
export function estDoublonOperation(erreur: unknown): boolean {
  if (!(erreur instanceof Object) || (erreur as { code?: unknown }).code !== 'P2002') return false;
  const cible = (erreur as { meta?: { target?: unknown; modelName?: unknown } }).meta;
  return (
    cible?.modelName === 'OperationHorsLigne' ||
    (Array.isArray(cible?.target) && cible.target.includes('id_client')) ||
    String(cible?.target ?? '').includes('operation_hors_ligne')
  );
}
