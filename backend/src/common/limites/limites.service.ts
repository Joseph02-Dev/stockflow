import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';

export type RessourceLimitee = 'emplacements' | 'utilisateurs' | 'references';

export const CODE_LIMITE_ATTEINTE = 'LIMITE_ATTEINTE';

const LIBELLES: Record<RessourceLimitee, [string, string]> = {
  emplacements: ['emplacement', 'emplacements'],
  utilisateurs: ['utilisateur', 'utilisateurs'],
  references: ['référence', 'références'],
};

export interface Usage {
  emplacements: number;
  utilisateurs: number;
  references: number;
}

/**
 * Limites par entreprise fixées depuis la console (phase 2).
 *
 * L'usage compté est celui qui consomme réellement la limite :
 * - emplacements et références : non archivés (archiver libère une place) ;
 * - utilisateurs : comptes existants + invitations encore valides, sinon
 *   on contournerait la limite en envoyant dix invitations d'un coup.
 */
@Injectable()
export class LimitesService {
  constructor(private readonly prisma: PrismaService) {}

  async usage(entrepriseId: string): Promise<Usage> {
    const [emplacements, comptes, invitations, references] = await Promise.all([
      this.prisma.emplacement.count({ where: { entrepriseId, archive: false } }),
      this.prisma.utilisateur.count({ where: { entrepriseId } }),
      this.prisma.invitation.count({ where: { entrepriseId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.produit.count({ where: { entrepriseId, archive: false } }),
    ]);
    return { emplacements, utilisateurs: comptes + invitations, references };
  }

  /**
   * Refuse (403, code LIMITE_ATTEINTE) une création qui dépasserait la
   * limite. À appeler juste avant chaque création concernée. Deux
   * créations strictement simultanées pourraient dépasser d'une unité :
   * risque assumé, la limite sert le modèle commercial, pas la sécurité.
   */
  async exigerPlace(entrepriseId: string, ressource: RessourceLimitee): Promise<void> {
    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { limiteEmplacements: true, limiteUtilisateurs: true, limiteReferences: true },
    });
    const limite = {
      emplacements: entreprise.limiteEmplacements,
      utilisateurs: entreprise.limiteUtilisateurs,
      references: entreprise.limiteReferences,
    }[ressource];
    if (limite === null) return;

    const utilise = (await this.usage(entrepriseId))[ressource];
    if (utilise >= limite) {
      const [singulier, pluriel] = LIBELLES[ressource];
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: CODE_LIMITE_ATTEINTE,
        message: `Limite atteinte : votre formule autorise ${limite} ${limite > 1 ? pluriel : singulier}. Contactez StockFlow pour l'augmenter.`,
      });
    }
  }
}
