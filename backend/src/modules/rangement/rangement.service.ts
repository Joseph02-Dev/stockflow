import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreerRegleRangementDto } from './dto/regle-rangement.dto.js';
import { regleApplicable } from './regle-rangement.js';

/**
 * Règles de rangement (module « rangement ») : à la réception, où ranger
 * un produit ou une catégorie. Proposées dans la saisie d'une entrée,
 * appliquées d'office à la réception d'une commande fournisseur.
 */
@Injectable()
export class RangementService {
  constructor(private readonly prisma: PrismaService) {}

  lister(entrepriseId: string) {
    return this.prisma.regleRangement.findMany({
      where: { entrepriseId },
      include: {
        produit: { select: { id: true, nom: true } },
        categorie: { select: { id: true, nom: true } },
        emplacementReception: { select: { id: true, nom: true } },
        emplacement: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async creer(entrepriseId: string, dto: CreerRegleRangementDto) {
    if (Boolean(dto.produitId) === Boolean(dto.categorieId)) {
      throw new BadRequestException('Indiquez un produit ou une catégorie (un seul des deux).');
    }
    if (dto.emplacementReceptionId && dto.emplacementReceptionId === dto.emplacementId) {
      throw new BadRequestException('L’emplacement de rangement doit différer de celui d’arrivée.');
    }
    await this.verifierReferences(entrepriseId, dto);
    const existante = await this.prisma.regleRangement.findFirst({
      where: {
        entrepriseId,
        produitId: dto.produitId ?? null,
        categorieId: dto.categorieId ?? null,
        emplacementReceptionId: dto.emplacementReceptionId ?? null,
      },
    });
    if (existante) throw new ConflictException('Une règle existe déjà pour ce produit (ou cette catégorie) et cette arrivée.');
    return this.prisma.regleRangement.create({
      data: {
        entrepriseId,
        produitId: dto.produitId ?? null,
        categorieId: dto.categorieId ?? null,
        emplacementReceptionId: dto.emplacementReceptionId ?? null,
        emplacementId: dto.emplacementId,
      },
    });
  }

  async supprimer(entrepriseId: string, id: string) {
    const regle = await this.prisma.regleRangement.findUnique({ where: { id } });
    if (!regle || regle.entrepriseId !== entrepriseId) throw new NotFoundException('Règle introuvable.');
    await this.prisma.regleRangement.delete({ where: { id } });
    return { supprimee: true };
  }

  /**
   * Emplacement où ranger ce produit arrivant à cet emplacement, ou null
   * (aucune règle, module coupé, destination archivée).
   */
  async proposer(entrepriseId: string, produitId: string, emplacementReceptionId: string) {
    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { moduleRangement: true },
    });
    if (!entreprise.moduleRangement) return null;
    const produit = await this.prisma.produit.findUnique({ where: { id: produitId }, select: { id: true, entrepriseId: true, categorieId: true } });
    if (!produit || produit.entrepriseId !== entrepriseId) return null;
    const regles = await this.prisma.regleRangement.findMany({
      where: {
        entrepriseId,
        OR: [{ produitId }, ...(produit.categorieId ? [{ categorieId: produit.categorieId }] : [])],
        emplacement: { archive: false },
      },
      include: { emplacement: { select: { id: true, nom: true } } },
    });
    return regleApplicable(regles, produit, emplacementReceptionId)?.emplacement ?? null;
  }

  /** Tout ce que la règle désigne appartient à l'entreprise et reste actif. */
  private async verifierReferences(entrepriseId: string, dto: CreerRegleRangementDto) {
    const verifier = (ligne: { entrepriseId: string; archive?: boolean } | null, libelle: string) => {
      if (!ligne || ligne.entrepriseId !== entrepriseId) throw new NotFoundException(`${libelle} introuvable.`);
      if (ligne.archive) throw new ConflictException(`${libelle} : archivé.`);
    };
    const emplacement = (id: string) =>
      this.prisma.emplacement.findUnique({ where: { id }, select: { entrepriseId: true, archive: true } });
    if (dto.produitId) {
      verifier(
        await this.prisma.produit.findUnique({ where: { id: dto.produitId }, select: { entrepriseId: true, archive: true } }),
        'Produit',
      );
    }
    if (dto.categorieId) {
      verifier(await this.prisma.categorie.findUnique({ where: { id: dto.categorieId }, select: { entrepriseId: true } }), 'Catégorie');
    }
    if (dto.emplacementReceptionId) verifier(await emplacement(dto.emplacementReceptionId), 'Emplacement d’arrivée');
    verifier(await emplacement(dto.emplacementId), 'Emplacement de rangement');
  }
}
