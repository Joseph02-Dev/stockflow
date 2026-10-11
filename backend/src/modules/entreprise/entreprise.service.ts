import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { UpdateEntrepriseDto } from './dto/update-entreprise.dto.js';

@Injectable()
export class EntrepriseService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntreprise(entrepriseId: string) {
    return this.prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId } });
  }

  async updateEntreprise(entrepriseId: string, dto: UpdateEntrepriseDto) {
    if (dto.moduleLots === false) await this.exigerAucunProduitSuiviParLot(entrepriseId);
    return this.prisma.entreprise.update({
      where: { id: entrepriseId },
      data: {
        ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
        ...(dto.secteurActivite !== undefined ? { secteurActivite: dto.secteurActivite } : {}),
        ...(dto.tauxTvaParDefaut !== undefined ? { tauxTvaParDefaut: dto.tauxTvaParDefaut } : {}),
        ...(dto.adresse !== undefined ? { adresse: dto.adresse } : {}),
        ...(dto.telephone !== undefined ? { telephone: dto.telephone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.rccm !== undefined ? { rccm: dto.rccm } : {}),
        ...(dto.nif !== undefined ? { nif: dto.nif } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.moduleLots !== undefined ? { moduleLots: dto.moduleLots } : {}),
        ...(dto.moduleArborescence !== undefined ? { moduleArborescence: dto.moduleArborescence } : {}),
      },
    });
  }

  /**
   * Le module Lots ne se coupe pas sous un produit suivi par lot : ses
   * sorties FEFO et ses péremptions deviendraient invisibles. On désactive
   * d'abord le suivi produit par produit (refusé tant qu'un lot a du stock).
   */
  private async exigerAucunProduitSuiviParLot(entrepriseId: string) {
    const suivis = await this.prisma.produit.findMany({
      where: { entrepriseId, suiviParLot: true, archive: false },
      select: { nom: true },
      orderBy: { nom: 'asc' },
      take: 4,
    });
    if (suivis.length > 0) {
      const noms = suivis.slice(0, 3).map((p) => `« ${p.nom} »`).join(', ');
      throw new ConflictException(
        `Des produits sont encore suivis par lot (${noms}${suivis.length > 3 ? '…' : ''}) : désactivez leur suivi avant de couper le module.`,
      );
    }
  }
}
