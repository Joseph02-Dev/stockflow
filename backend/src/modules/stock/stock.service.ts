import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { exigerModule } from '../../common/modules/exiger-module.js';
import type { Pagination } from '../../common/pagination/pagination.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import { cheminComplet, type NoeudEmplacement } from '../emplacements/arborescence.js';
import type { NatureEmplacement } from '../../generated/prisma/enums.js';
import type { CreerMouvementDto, ExtremiteDto } from './dto/creer-mouvement.dto.js';
import { LIBELLES_NATURES, extremites } from './sens-mouvement.js';

const NATURES_VIRTUELLES = (Object.keys(LIBELLES_NATURES) as NatureEmplacement[]).filter((n) => n !== 'INTERNE');

/**
 * Vue « double entrée » du stock (inspirée d'Odoo) : emplacements réels et
 * virtuels, quantités en main par emplacement et par lot, mouvements
 * source → destination. Les écritures passent par MouvementsService, donc
 * par le moteur de stock : mêmes règles, verrous et alertes que les écrans.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvementsService: MouvementsService,
  ) {}

  async emplacements(entrepriseId: string) {
    const tous = await this.prisma.emplacement.findMany({
      where: { entrepriseId },
      select: { id: true, nom: true, parentId: true, archive: true },
    });
    const parId = new Map<string, NoeudEmplacement>(tous.map((e) => [e.id, e]));
    return {
      internes: tous
        .filter((e) => !e.archive)
        .map((e) => ({ id: e.id, nom: e.nom, parentId: e.parentId, chemin: cheminComplet(e.id, parId) }))
        .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr')),
      virtuels: NATURES_VIRTUELLES.map((nature) => ({ nature, libelle: LIBELLES_NATURES[nature] })),
    };
  }

  /** Quantités en main (≠ 0) par produit et emplacement, détaillées par lot. */
  async quantites(entrepriseId: string, filtres: { produitId?: string; emplacementId?: string }) {
    const lignes = await this.prisma.stock.findMany({
      where: {
        produit: { entrepriseId },
        produitId: filtres.produitId,
        emplacementId: filtres.emplacementId,
        quantite: { not: 0 },
      },
      select: {
        quantite: true,
        produit: { select: { id: true, nom: true, reference: true, uniteMesure: true, suiviParLot: true } },
        emplacement: { select: { id: true, nom: true } },
      },
      orderBy: [{ produit: { nom: 'asc' } }, { emplacement: { nom: 'asc' } }],
    });
    const lots = await this.prisma.lot.findMany({
      where: {
        entrepriseId,
        produitId: filtres.produitId,
        emplacementId: filtres.emplacementId,
        quantite: { gt: 0 },
      },
      select: { id: true, produitId: true, emplacementId: true, numero: true, quantite: true, datePeremption: true },
      orderBy: [{ datePeremption: { sort: 'asc', nulls: 'last' } }, { recuAt: 'asc' }],
    });
    return lignes.map((l) => ({
      ...l,
      lots: l.produit.suiviParLot
        ? lots
            .filter((lot) => lot.produitId === l.produit.id && lot.emplacementId === l.emplacement.id)
            .map(({ id, numero, quantite, datePeremption }) => ({ id, numero, quantite, datePeremption }))
        : [],
    }));
  }

  /** Historique paginé, chaque mouvement exprimé en source → destination. */
  async mouvements(entrepriseId: string, filtres: { produitId?: string; emplacementId?: string }, pagination: Pagination) {
    const page = await this.mouvementsService.listerMouvements(entrepriseId, filtres, pagination);
    return page.map((m) => {
      const { source, destination } = extremites(m);
      // Côté interne : emplacementId, sauf l'arrivée d'un transfert.
      const libelle = (nature: NatureEmplacement, arrivee: boolean) =>
        nature !== 'INTERNE'
          ? LIBELLES_NATURES[nature]
          : arrivee && m.emplacementDestination
            ? m.emplacementDestination.nom
            : m.emplacement.nom;
      return {
        ...m,
        source: { ...source, libelle: libelle(source.nature, false) },
        destination: { ...destination, libelle: libelle(destination.nature, true) },
      };
    });
  }

  /**
   * Mouvement générique. Fournisseur → emplacement : réception ;
   * emplacement → client : sortie ; emplacement → emplacement : transfert.
   */
  async creerMouvement(entrepriseId: string, utilisateurId: string, dto: CreerMouvementDto) {
    const { source, destination } = dto;
    if (source.nature === 'FOURNISSEUR' && destination.nature === 'INTERNE') {
      this.refuser(dto, ['lotId']);
      return this.mouvementsService.entree(entrepriseId, utilisateurId, {
        produitId: dto.produitId,
        emplacementId: this.emplacementInterne(destination, 'destination'),
        quantite: dto.quantite,
        fournisseurId: dto.fournisseurId,
        numeroLot: dto.numeroLot,
        datePeremption: dto.datePeremption,
        conditionnementId: dto.conditionnementId,
      });
    }
    if (source.nature === 'INTERNE' && destination.nature === 'CLIENT') {
      this.refuser(dto, ['fournisseurId', 'lotId', 'numeroLot', 'datePeremption']);
      return this.mouvementsService.sortie(entrepriseId, utilisateurId, {
        produitId: dto.produitId,
        emplacementId: this.emplacementInterne(source, 'source'),
        quantite: dto.quantite,
        conditionnementId: dto.conditionnementId,
      });
    }
    if (source.nature === 'INTERNE' && destination.nature === 'INTERNE') {
      this.refuser(dto, ['fournisseurId', 'numeroLot', 'datePeremption']);
      await exigerModule(this.prisma, entrepriseId, 'transferts');
      return this.mouvementsService.transfert(entrepriseId, utilisateurId, {
        produitId: dto.produitId,
        emplacementSourceId: this.emplacementInterne(source, 'source'),
        emplacementDestinationId: this.emplacementInterne(destination, 'destination'),
        quantite: dto.quantite,
        lotId: dto.lotId,
        conditionnementId: dto.conditionnementId,
      });
    }
    throw new BadRequestException(
      `Mouvement ${LIBELLES_NATURES[source.nature]} → ${LIBELLES_NATURES[destination.nature]} non pris en charge ici : ` +
        'les casses passent par Pertes, les retours par Ventes ou Fournisseurs, les ajustements par Inventaires.',
    );
  }

  private emplacementInterne(e: ExtremiteDto, cote: 'source' | 'destination'): string {
    if (!e.emplacementId) {
      throw new BadRequestException(`Indiquez l’emplacement ${cote === 'source' ? 'de départ' : 'd’arrivée'} (emplacementId).`);
    }
    return e.emplacementId;
  }

  private refuser(dto: CreerMouvementDto, champs: (keyof CreerMouvementDto)[]) {
    const presents = champs.filter((c) => dto[c] !== undefined);
    if (presents.length > 0) {
      throw new BadRequestException(`Champ${presents.length > 1 ? 's' : ''} sans objet pour ce mouvement : ${presents.join(', ')}.`);
    }
  }
}
