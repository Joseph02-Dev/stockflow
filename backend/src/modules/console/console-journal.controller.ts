import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { JournalDto } from './dto/journal.dto.js';
import { RouteConsole } from './securite/console.decorators.js';

/**
 * Lecture du journal d'audit. Le journal lui-même n'est pas journalisé :
 * il ne contient aucune donnée métier d'entreprise, et chaque page vue
 * y ajouterait une ligne, noyant les actions qui comptent.
 */
@RouteConsole()
@Controller('console/journal')
export class ConsoleJournalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async lister(@Query() filtres: JournalDto) {
    const where = {
      ...(filtres.entrepriseId ? { entrepriseId: filtres.entrepriseId } : {}),
      ...(filtres.action ? { action: filtres.action } : {}),
    };
    const [total, entrees] = await Promise.all([
      this.prisma.journalAudit.count({ where }),
      this.prisma.journalAudit.findMany({
        where,
        include: { operateur: { select: { id: true, nom: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filtres.page - 1) * filtres.taille,
        take: filtres.taille,
      }),
    ]);

    // Pas de clé étrangère vers entreprise (le journal survit à
    // l'entreprise) : les noms sont résolus à part.
    const ids = [...new Set(entrees.map((e) => e.entrepriseId).filter((id): id is string => !!id))];
    const entreprises = await this.prisma.entreprise.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } });
    const noms = new Map(entreprises.map((e) => [e.id, e.nom]));

    return {
      total,
      page: filtres.page,
      taille: filtres.taille,
      elements: entrees.map((e) => ({
        id: e.id,
        action: e.action,
        motif: e.motif,
        detail: e.detail,
        createdAt: e.createdAt,
        operateur: e.operateur,
        entreprise: e.entrepriseId ? { id: e.entrepriseId, nom: noms.get(e.entrepriseId) ?? null } : null,
      })),
    };
  }
}
