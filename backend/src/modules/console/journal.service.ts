import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type ActionAudit = 'CONNEXION' | 'CONSULTATION_ENTREPRISE' | 'SUSPENSION' | 'RETABLISSEMENT' | 'MODIFICATION_REGLAGES';

export interface EntreeJournal {
  operateurId: string;
  action: ActionAudit;
  entrepriseId?: string | null;
  motif?: string | null;
  detail?: string | null;
}

/**
 * Journal d'audit de la console. Point d'entrée unique pour écrire :
 * toute route console qui lit ou modifie les données d'une entreprise
 * passe par ici, sans exception. Accepte un client de transaction pour
 * que l'inscription soit atomique avec l'action qu'elle trace.
 */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async inscrire(entree: EntreeJournal, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.journalAudit.create({
      data: {
        operateurId: entree.operateurId,
        action: entree.action,
        entrepriseId: entree.entrepriseId ?? null,
        motif: entree.motif ?? null,
        detail: entree.detail ?? null,
      },
    });
  }
}
