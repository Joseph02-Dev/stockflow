import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { LimitesService } from '../../common/limites/limites.service.js';
import type { Usage } from '../../common/limites/limites.service.js';
import { JournalService } from './journal.service.js';
import type { ReglagesDto } from './dto/reglages.dto.js';

const LIMITES = [
  { champ: 'limiteEmplacements', usage: 'emplacements', libelle: 'Emplacements' },
  { champ: 'limiteUtilisateurs', usage: 'utilisateurs', libelle: 'Utilisateurs' },
  { champ: 'limiteReferences', usage: 'references', libelle: 'Références' },
] as const;

const MODULES = [
  { champ: 'moduleInventaires', libelle: 'Inventaires' },
  { champ: 'moduleTransferts', libelle: 'Transferts' },
] as const;

const afficherLimite = (v: number | null) => (v === null ? 'illimité' : String(v));
const afficherModule = (v: boolean) => (v ? 'activé' : 'désactivé');

/**
 * Réglages d'une entreprise (phase 2) : limites et modules à la carte.
 * Ne touche à aucune donnée métier — seulement aux plafonds et aux
 * modules, appliqués ensuite côté client par LimitesService et
 * EntrepriseActiveGuard. Chaque modification est journalisée.
 */
@Injectable()
export class ConsoleReglagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limites: LimitesService,
    private readonly journal: JournalService,
  ) {}

  async lire(entrepriseId: string) {
    const entreprise = await this.prisma.entreprise.findUnique({ where: { id: entrepriseId } });
    if (!entreprise) throw new NotFoundException('Entreprise introuvable.');
    return {
      limites: {
        emplacements: entreprise.limiteEmplacements,
        utilisateurs: entreprise.limiteUtilisateurs,
        references: entreprise.limiteReferences,
      },
      modules: { inventaires: entreprise.moduleInventaires, transferts: entreprise.moduleTransferts },
      usage: await this.limites.usage(entrepriseId),
    };
  }

  async modifier(operateurId: string, entrepriseId: string, dto: ReglagesDto) {
    const entreprise = await this.prisma.entreprise.findUnique({ where: { id: entrepriseId } });
    if (!entreprise) throw new NotFoundException('Entreprise introuvable.');
    const usage: Usage = await this.limites.usage(entrepriseId);

    const changements: string[] = [];
    const data: Record<string, number | boolean | null> = {};

    for (const { champ, usage: cle, libelle } of LIMITES) {
      const demande = dto[champ];
      if (demande === undefined || demande === entreprise[champ]) continue;
      // Décision validée : jamais une limite sous l'usage actuel — rien
      // n'est archivé à la place de l'entreprise, la modification est refusée.
      if (demande !== null && demande < usage[cle]) {
        throw new BadRequestException(
          `${libelle} : impossible de fixer la limite à ${demande}, l'entreprise en utilise déjà ${usage[cle]}.`,
        );
      }
      data[champ] = demande;
      changements.push(`${libelle} : ${afficherLimite(entreprise[champ])} → ${afficherLimite(demande)}`);
    }

    for (const { champ, libelle } of MODULES) {
      const demande = dto[champ];
      if (demande === undefined || demande === entreprise[champ]) continue;
      data[champ] = demande;
      changements.push(`${libelle} : ${afficherModule(entreprise[champ])} → ${afficherModule(demande)}`);
    }

    if (changements.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.entreprise.update({ where: { id: entrepriseId }, data });
        await this.journal.inscrire(
          {
            operateurId,
            action: 'MODIFICATION_REGLAGES',
            entrepriseId,
            motif: dto.motif || null,
            detail: changements.join(' ; '),
          },
          tx,
        );
      });
    }

    return { ...(await this.lire(entrepriseId)), changements };
  }
}
