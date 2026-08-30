import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateEmplacementDto } from './dto/create-emplacement.dto.js';
import type { UpdateEmplacementDto } from './dto/update-emplacement.dto.js';

@Injectable()
export class EmplacementsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string, inclureArchives: boolean) {
    return this.prisma.emplacement.findMany({
      where: { entrepriseId, ...(inclureArchives ? {} : { archive: false }) },
      orderBy: { nom: 'asc' },
    });
  }

  async creer(entrepriseId: string, dto: CreateEmplacementDto) {
    return this.prisma.emplacement.create({
      data: { entrepriseId, nom: dto.nom, adresse: dto.adresse },
    });
  }

  async modifier(entrepriseId: string, emplacementId: string, dto: UpdateEmplacementDto) {
    await this.trouverOuEchouer(entrepriseId, emplacementId);
    return this.prisma.emplacement.update({ where: { id: emplacementId }, data: dto });
  }

  /**
   * ENT-003 — Archivage plutôt que suppression physique (décision validée
   * en audit Lead Developer, pour préserver l'intégrité des mouvements
   * historiques qui référencent obligatoirement un emplacement).
   */
  async archiver(entrepriseId: string, emplacementId: string) {
    await this.trouverOuEchouer(entrepriseId, emplacementId);
    return this.prisma.emplacement.update({ where: { id: emplacementId }, data: { archive: true } });
  }

  /**
   * Vérifie que l'emplacement existe ET appartient bien à l'entreprise
   * courante — jamais uniquement l'existence de l'id, pour ne pas
   * permettre à un utilisateur de modifier un emplacement d'une autre
   * entreprise en devinant son identifiant (isolation multi-tenant).
   */
  private async trouverOuEchouer(entrepriseId: string, emplacementId: string) {
    const emplacement = await this.prisma.emplacement.findUnique({ where: { id: emplacementId } });
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) {
      // Même erreur (404) dans les deux cas — ne jamais confirmer à
      // l'appelant qu'un identifiant existe dans une autre entreprise.
      throw new NotFoundException('Emplacement introuvable.');
    }
    return emplacement;
  }
}
