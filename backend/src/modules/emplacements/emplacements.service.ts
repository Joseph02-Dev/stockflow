import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { LimitesService } from '../../common/limites/limites.service.js';
import { exigerModule } from '../../common/modules/exiger-module.js';
import type { CreateEmplacementDto } from './dto/create-emplacement.dto.js';
import type { UpdateEmplacementDto } from './dto/update-emplacement.dto.js';
import { cheminComplet, creeraitUnCycle, type NoeudEmplacement } from './arborescence.js';

@Injectable()
export class EmplacementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limites: LimitesService,
  ) {}

  /**
   * Chaque emplacement porte son chemin complet (« Dépôt / Zone A ») : sans
   * arborescence, il se réduit au nom. Tri par chemin, qui regroupe les
   * sous-emplacements sous leur parent.
   */
  async lister(entrepriseId: string, inclureArchives: boolean) {
    const tous = await this.prisma.emplacement.findMany({ where: { entrepriseId } });
    const parId = new Map<string, NoeudEmplacement>(tous.map((e) => [e.id, e]));
    return tous
      .filter((e) => inclureArchives || !e.archive)
      .map((e) => ({ ...e, chemin: cheminComplet(e.id, parId) }))
      .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  }

  async creer(entrepriseId: string, dto: CreateEmplacementDto) {
    await this.limites.exigerPlace(entrepriseId, 'emplacements');
    if (dto.parentId) await this.verifierParent(entrepriseId, dto.parentId);
    if (dto.strategieSortie) await exigerModule(this.prisma, entrepriseId, 'strategiesSortie');
    return this.prisma.emplacement.create({
      data: {
        entrepriseId,
        nom: dto.nom,
        adresse: dto.adresse,
        parentId: dto.parentId ?? null,
        strategieSortie: dto.strategieSortie ?? null,
      },
    });
  }

  async modifier(entrepriseId: string, emplacementId: string, dto: UpdateEmplacementDto) {
    await this.trouverOuEchouer(entrepriseId, emplacementId);
    if (dto.parentId) await this.verifierParent(entrepriseId, dto.parentId, emplacementId);
    if (dto.strategieSortie) await exigerModule(this.prisma, entrepriseId, 'strategiesSortie');
    return this.prisma.emplacement.update({ where: { id: emplacementId }, data: dto });
  }

  /**
   * ENT-003 — Archivage plutôt que suppression physique (décision validée
   * en audit Lead Developer, pour préserver l'intégrité des mouvements
   * historiques qui référencent obligatoirement un emplacement). Un parent
   * ne s'archive pas avant ses sous-emplacements actifs.
   */
  async archiver(entrepriseId: string, emplacementId: string) {
    await this.trouverOuEchouer(entrepriseId, emplacementId);
    const enfants = await this.prisma.emplacement.count({ where: { parentId: emplacementId, archive: false } });
    if (enfants > 0) {
      throw new ConflictException(
        `Cet emplacement contient encore ${enfants} sous-emplacement${enfants > 1 ? 's' : ''} actif${enfants > 1 ? 's' : ''} : archivez-les ou déplacez-les d’abord.`,
      );
    }
    return this.prisma.emplacement.update({ where: { id: emplacementId }, data: { archive: true } });
  }

  /** Parent de la même entreprise, actif, et jamais un descendant de l'emplacement. */
  private async verifierParent(entrepriseId: string, parentId: string, emplacementId?: string) {
    await exigerModule(this.prisma, entrepriseId, 'arborescence');
    const parent = await this.trouverOuEchouer(entrepriseId, parentId, 'Emplacement parent introuvable.');
    if (parent.archive) throw new ConflictException('L’emplacement parent est archivé.');
    if (!emplacementId) return;
    const tous = await this.prisma.emplacement.findMany({
      where: { entrepriseId },
      select: { id: true, nom: true, parentId: true },
    });
    if (creeraitUnCycle(emplacementId, parentId, new Map(tous.map((e) => [e.id, e])))) {
      throw new ConflictException('Un emplacement ne peut pas être rangé dans lui-même ni dans l’un de ses sous-emplacements.');
    }
  }

  /**
   * Vérifie que l'emplacement existe ET appartient bien à l'entreprise
   * courante — jamais uniquement l'existence de l'id, pour ne pas
   * permettre à un utilisateur de modifier un emplacement d'une autre
   * entreprise en devinant son identifiant (isolation multi-tenant).
   */
  private async trouverOuEchouer(entrepriseId: string, emplacementId: string, message = 'Emplacement introuvable.') {
    const emplacement = await this.prisma.emplacement.findUnique({ where: { id: emplacementId } });
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) {
      // Même erreur (404) dans les deux cas — ne jamais confirmer à
      // l'appelant qu'un identifiant existe dans une autre entreprise.
      throw new NotFoundException(message);
    }
    return emplacement;
  }
}
