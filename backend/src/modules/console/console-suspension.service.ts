import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { JournalService } from './journal.service.js';

/**
 * Suspension et rétablissement — les deux seules écritures de la console,
 * et elles ne touchent qu'au statut de l'entreprise et aux sessions : les
 * données métier restent intactes (jamais de suppression).
 */
@Injectable()
export class ConsoleSuspensionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Une seule transaction pour les trois effets : statut, révocation de
   * toutes les sessions, journal. L'accès est coupé immédiatement : les
   * access tokens encore valides sont refusés par EntrepriseActiveGuard,
   * qui relit ce statut à chaque requête.
   */
  async suspendre(operateurId: string, entrepriseId: string, motif: string) {
    return this.prisma.$transaction(async (tx) => {
      const entreprise = await tx.entreprise.findUnique({ where: { id: entrepriseId } });
      if (!entreprise) throw new NotFoundException('Entreprise introuvable.');
      if (entreprise.statut === 'SUSPENDUE') throw new ConflictException('Cette entreprise est déjà suspendue.');

      const maintenant = new Date();
      const misAJour = await tx.entreprise.update({
        where: { id: entrepriseId },
        data: { statut: 'SUSPENDUE', suspendueAt: maintenant, motifSuspension: motif },
        select: { id: true, statut: true, suspendueAt: true, motifSuspension: true },
      });
      const { count } = await tx.refreshToken.updateMany({
        where: { utilisateur: { entrepriseId }, revokedAt: null },
        data: { revokedAt: maintenant },
      });
      await this.journal.inscrire(
        {
          operateurId,
          action: 'SUSPENSION',
          entrepriseId,
          motif,
          detail: `${count} session${count > 1 ? 's' : ''} révoquée${count > 1 ? 's' : ''}`,
        },
        tx,
      );

      return { ...misAJour, sessionsRevoquees: count };
    });
  }

  async retablir(operateurId: string, entrepriseId: string, motif?: string) {
    return this.prisma.$transaction(async (tx) => {
      const entreprise = await tx.entreprise.findUnique({ where: { id: entrepriseId } });
      if (!entreprise) throw new NotFoundException('Entreprise introuvable.');
      if (entreprise.statut !== 'SUSPENDUE') throw new ConflictException("Cette entreprise n'est pas suspendue.");

      const misAJour = await tx.entreprise.update({
        where: { id: entrepriseId },
        data: { statut: 'ACTIVE', suspendueAt: null, motifSuspension: null },
        select: { id: true, statut: true, suspendueAt: true, motifSuspension: true },
      });
      // Le motif de la suspension levée est conservé dans le détail : la
      // fiche ne le porte plus, le journal si.
      await this.journal.inscrire(
        {
          operateurId,
          action: 'RETABLISSEMENT',
          entrepriseId,
          motif: motif || null,
          detail: `Suspendue depuis le ${entreprise.suspendueAt?.toISOString() ?? '?'} pour : ${entreprise.motifSuspension ?? '?'}`,
        },
        tx,
      );
      return misAJour;
    });
  }
}
