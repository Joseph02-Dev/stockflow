import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { exigerModule } from '../../common/modules/exiger-module.js';
import { resynchroniserValorisation } from '../stock/valorisation.js';
import type { TransactionPrisma } from '../stock/moteur-stock.js';
import type { UpdateEntrepriseDto } from './dto/update-entreprise.dto.js';

@Injectable()
export class EntrepriseService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntreprise(entrepriseId: string) {
    return this.prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId } });
  }

  async updateEntreprise(entrepriseId: string, dto: UpdateEntrepriseDto) {
    if (dto.moduleValorisation === true) {
      // Activation : le stock présent est ouvert au prix d'achat actuel,
      // dans la même transaction que la bascule du module.
      return this.prisma.$transaction(
        async (tx) => {
          const entreprise = await this.mettreAJour(tx, entrepriseId, dto);
          await resynchroniserValorisation(tx, entrepriseId);
          return entreprise;
        },
        { timeout: 60_000 },
      );
    }
    return this.mettreAJour(this.prisma, entrepriseId, dto);
  }

  private async mettreAJour(client: PrismaService | TransactionPrisma, entrepriseId: string, dto: UpdateEntrepriseDto) {
    if (dto.moduleLots === false) await this.exigerAucunProduitSuivi(entrepriseId, 'lot');
    if (dto.moduleNumerosSerie === false) await this.exigerAucunProduitSuivi(entrepriseId, 'numéro de série');
    // La stratégie peut accompagner l'activation du module dans la même requête.
    if (dto.strategieSortie !== undefined && dto.moduleStrategiesSortie !== true) {
      await exigerModule(this.prisma, entrepriseId, 'strategiesSortie');
    }
    if (dto.methodeValorisation !== undefined && dto.moduleValorisation !== true) {
      await exigerModule(this.prisma, entrepriseId, 'valorisation');
    }
    return client.entreprise.update({
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
        ...(dto.moduleVariantes !== undefined ? { moduleVariantes: dto.moduleVariantes } : {}),
        ...(dto.moduleConditionnements !== undefined ? { moduleConditionnements: dto.moduleConditionnements } : {}),
        ...(dto.moduleNumerosSerie !== undefined ? { moduleNumerosSerie: dto.moduleNumerosSerie } : {}),
        ...(dto.moduleStrategiesSortie !== undefined ? { moduleStrategiesSortie: dto.moduleStrategiesSortie } : {}),
        ...(dto.strategieSortie !== undefined ? { strategieSortie: dto.strategieSortie } : {}),
        ...(dto.moduleReapprovisionnement !== undefined ? { moduleReapprovisionnement: dto.moduleReapprovisionnement } : {}),
        ...(dto.moduleRangement !== undefined ? { moduleRangement: dto.moduleRangement } : {}),
        ...(dto.moduleValorisation !== undefined ? { moduleValorisation: dto.moduleValorisation } : {}),
        ...(dto.methodeValorisation !== undefined ? { methodeValorisation: dto.methodeValorisation } : {}),
        ...(dto.moduleRotation !== undefined ? { moduleRotation: dto.moduleRotation } : {}),
        ...(dto.moduleWebhooks !== undefined ? { moduleWebhooks: dto.moduleWebhooks } : {}),
      },
    });
  }

  /**
   * Les modules Lots et Numéros de série ne se coupent pas sous un produit
   * qui les utilise : ses lots et péremptions deviendraient invisibles. On
   * désactive d'abord le suivi produit par produit.
   */
  private async exigerAucunProduitSuivi(entrepriseId: string, suivi: 'lot' | 'numéro de série') {
    const suivis = await this.prisma.produit.findMany({
      where: { entrepriseId, archive: false, ...(suivi === 'lot' ? { suiviParLot: true } : { suiviParSerie: true }) },
      select: { nom: true },
      orderBy: { nom: 'asc' },
      take: 4,
    });
    if (suivis.length > 0) {
      const noms = suivis.slice(0, 3).map((p) => `« ${p.nom} »`).join(', ');
      throw new ConflictException(
        `Des produits sont encore suivis par ${suivi} (${noms}${suivis.length > 3 ? '…' : ''}) : désactivez leur suivi avant de couper le module.`,
      );
    }
  }
}
