import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { exigerModule } from '../../common/modules/exiger-module.js';
import type { CreerConditionnementDto, ModifierConditionnementDto } from './dto/conditionnement.dto.js';

/** Saisie convertie en unité de base, avec ce qu'il faut tracer sur le mouvement. */
export interface SaisieConvertie {
  quantite: number;
  conditionnementId?: string;
  facteurConditionnement?: number;
}

/**
 * Conditionnements d'un produit (module « conditionnements ») : carton de
 * 20, palette de 200. Le stock reste tenu en unité de base ; une saisie en
 * cartons est convertie (quantité × facteur) avant d'atteindre le moteur.
 */
@Injectable()
export class ConditionnementsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string, produitId: string) {
    await this.produitOuEchouer(entrepriseId, produitId);
    return this.prisma.conditionnement.findMany({
      where: { produitId, archive: false },
      orderBy: { facteur: 'asc' },
    });
  }

  async creer(entrepriseId: string, produitId: string, dto: CreerConditionnementDto) {
    const produit = await this.produitOuEchouer(entrepriseId, produitId);
    if (produit.archive) throw new ConflictException('Ce produit est archivé.');
    try {
      return await this.prisma.conditionnement.create({
        data: { entrepriseId, produitId, nom: dto.nom, facteur: dto.facteur, codeBarre: dto.codeBarre || null },
      });
    } catch (erreur) {
      throw this.traduireDoublon(erreur);
    }
  }

  async modifier(entrepriseId: string, id: string, dto: ModifierConditionnementDto) {
    await this.conditionnementOuEchouer(entrepriseId, id);
    try {
      return await this.prisma.conditionnement.update({
        where: { id },
        data: { nom: dto.nom, ...(dto.codeBarre !== undefined ? { codeBarre: dto.codeBarre || null } : {}) },
      });
    } catch (erreur) {
      throw this.traduireDoublon(erreur);
    }
  }

  async archiver(entrepriseId: string, id: string) {
    await this.conditionnementOuEchouer(entrepriseId, id);
    return this.prisma.conditionnement.update({ where: { id }, data: { archive: true } });
  }

  /**
   * Convertit une saisie en unité de base. Sans conditionnement, la
   * quantité est rendue telle quelle (aucune lecture en base).
   */
  async convertir(
    entrepriseId: string,
    produitId: string,
    quantite: number,
    conditionnementId?: string,
  ): Promise<SaisieConvertie> {
    if (!conditionnementId) return { quantite };
    await exigerModule(this.prisma, entrepriseId, 'conditionnements');
    const conditionnement = await this.prisma.conditionnement.findUnique({ where: { id: conditionnementId } });
    if (!conditionnement || conditionnement.entrepriseId !== entrepriseId || conditionnement.produitId !== produitId) {
      throw new NotFoundException('Conditionnement introuvable pour ce produit.');
    }
    if (conditionnement.archive) throw new ConflictException('Ce conditionnement est archivé.');
    const total = quantite * conditionnement.facteur;
    if (!Number.isSafeInteger(total) || total > 2_000_000_000) {
      throw new BadRequestException('Quantité trop grande une fois convertie en unités.');
    }
    return { quantite: total, conditionnementId, facteurConditionnement: conditionnement.facteur };
  }

  private async produitOuEchouer(entrepriseId: string, produitId: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id: produitId } });
    if (!produit || produit.entrepriseId !== entrepriseId) throw new NotFoundException('Produit introuvable.');
    return produit;
  }

  private async conditionnementOuEchouer(entrepriseId: string, id: string) {
    const conditionnement = await this.prisma.conditionnement.findUnique({ where: { id } });
    if (!conditionnement || conditionnement.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Conditionnement introuvable.');
    }
    return conditionnement;
  }

  private traduireDoublon(erreur: unknown): unknown {
    const doublon = erreur instanceof Object && 'code' in erreur && (erreur as { code: unknown }).code === 'P2002';
    return doublon ? new ConflictException('Ce produit a déjà un conditionnement de ce nom.') : erreur;
  }
}
