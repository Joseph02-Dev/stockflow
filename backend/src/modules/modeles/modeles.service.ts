import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { LimitesService } from '../../common/limites/limites.service.js';
import type { TransactionPrisma } from '../stock/moteur-stock.js';
import type { CreerModeleDto, ModifierModeleDto } from './dto/modele.dto.js';
import {
  MAX_VARIANTES_PAR_MODELE,
  cleVariante,
  combinaisons,
  nomVariante,
  normaliserAttributs,
  referenceVariante,
  refusModificationAttributs,
  tailleGrille,
  type Attribut,
} from './variantes.js';

/**
 * Modèles de produits à variantes (module « variantes ») : un modèle
 * « T-shirt » × Couleur × Taille génère une variante par combinaison.
 * Chaque variante est un Produit ordinaire : stock, ventes, lots et
 * inventaires fonctionnent sans changement.
 */
@Injectable()
export class ModelesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limites: LimitesService,
  ) {}

  async lister(entrepriseId: string, inclureArchives: boolean) {
    return this.prisma.modeleProduit.findMany({
      where: { entrepriseId, ...(inclureArchives ? {} : { archive: false }) },
      include: {
        attributs: { orderBy: { ordre: 'asc' } },
        _count: { select: { variantes: { where: { archive: false } } } },
      },
      orderBy: { nom: 'asc' },
    });
  }

  /** Le modèle, ses attributs et ses variantes avec leur stock total. */
  async obtenir(entrepriseId: string, modeleId: string) {
    const modele = await this.prisma.modeleProduit.findUnique({
      where: { id: modeleId },
      include: {
        attributs: { orderBy: { ordre: 'asc' } },
        categorie: { select: { id: true, nom: true } },
        marque: { select: { id: true, nom: true } },
        variantes: {
          select: {
            id: true,
            nom: true,
            reference: true,
            valeursVariante: true,
            prixVente: true,
            seuilAlerte: true,
            archive: true,
          },
          orderBy: { nom: 'asc' },
        },
      },
    });
    if (!modele || modele.entrepriseId !== entrepriseId) throw new NotFoundException('Modèle introuvable.');
    const stocks = await this.prisma.stock.groupBy({
      by: ['produitId'],
      where: { produitId: { in: modele.variantes.map((v) => v.id) } },
      _sum: { quantite: true },
    });
    const stockDe = new Map(stocks.map((s) => [s.produitId, s._sum.quantite ?? 0]));
    return { ...modele, variantes: modele.variantes.map((v) => ({ ...v, stock: stockDe.get(v.id) ?? 0 })) };
  }

  async creer(entrepriseId: string, dto: CreerModeleDto) {
    await this.verifierReferences(entrepriseId, dto);
    const attributs = this.attributsValides(dto.attributs);
    await this.limites.exigerPlaces(entrepriseId, 'references', tailleGrille(attributs));
    const tauxTva = dto.tauxTva ?? (await this.tauxTvaParDefaut(entrepriseId));

    const id = await this.prisma.$transaction(async (tx) => {
      const modele = await tx.modeleProduit.create({
        data: {
          entrepriseId,
          nom: dto.nom.trim(),
          reference: dto.reference?.trim() || null,
          categorieId: dto.categorieId,
          marqueId: dto.marqueId,
          uniteMesure: dto.uniteMesure,
          prixAchat: dto.prixAchat,
          prixVente: dto.prixVente,
          tauxTva,
          seuilAlerte: dto.seuilAlerte ?? 0,
          attributs: { create: attributs.map((a, ordre) => ({ ...a, ordre })) },
        },
      });
      await this.genererVariantesManquantes(tx, modele.id, attributs);
      return modele.id;
    });
    return this.obtenir(entrepriseId, id);
  }

  /**
   * Valeurs par défaut (pour les variantes à venir) et attributs. Ajouter
   * des valeurs génère les variantes manquantes ; une variante existante
   * n'est jamais modifiée ici (elle a sa propre fiche produit).
   */
  async modifier(entrepriseId: string, modeleId: string, dto: ModifierModeleDto) {
    const actuel = await this.obtenir(entrepriseId, modeleId);
    await this.verifierReferences(entrepriseId, dto);
    const { attributs: demandes, ...champs } = dto;

    let attributs: Attribut[] | null = null;
    if (demandes) {
      attributs = this.attributsValides(demandes);
      const refus = refusModificationAttributs(actuel.attributs, attributs);
      if (refus) throw new ConflictException(refus);
      // Ordre des axes inchangé : il fixe le nom et la référence des variantes.
      attributs = actuel.attributs.map((a) => attributs!.find((n) => n.nom.toLowerCase() === a.nom.toLowerCase())!);
      const nouvelles = tailleGrille(attributs) - actuel.variantes.length;
      if (nouvelles > 0) await this.limites.exigerPlaces(entrepriseId, 'references', nouvelles);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.modeleProduit.update({
        where: { id: modeleId },
        data: { ...champs, nom: champs.nom?.trim(), reference: champs.reference?.trim() },
      });
      if (attributs) {
        for (const [ordre, a] of attributs.entries()) {
          await tx.attributModele.update({
            where: { modeleId_nom: { modeleId, nom: actuel.attributs[ordre].nom } },
            data: { valeurs: a.valeurs },
          });
        }
        await this.genererVariantesManquantes(tx, modeleId, attributs);
      }
    });
    return this.obtenir(entrepriseId, modeleId);
  }

  /** Archive le modèle et toutes ses variantes (jamais de suppression). */
  async archiver(entrepriseId: string, modeleId: string) {
    await this.obtenir(entrepriseId, modeleId);
    await this.prisma.$transaction([
      this.prisma.produit.updateMany({ where: { modeleId }, data: { archive: true } }),
      this.prisma.modeleProduit.update({ where: { id: modeleId }, data: { archive: true } }),
    ]);
    return this.obtenir(entrepriseId, modeleId);
  }

  /**
   * Crée chaque combinaison absente, avec les valeurs par défaut du modèle.
   * Idempotent : la clé (modèle, combinaison) est unique en base.
   */
  private async genererVariantesManquantes(tx: TransactionPrisma, modeleId: string, attributs: Attribut[]) {
    const modele = await tx.modeleProduit.findUniqueOrThrow({ where: { id: modeleId } });
    const existantes = new Set(
      (await tx.produit.findMany({ where: { modeleId }, select: { cleVariante: true } })).map((p) => p.cleVariante),
    );
    const ordre = attributs.map((a) => a.nom);
    const aCreer = combinaisons(attributs).filter((valeurs) => !existantes.has(cleVariante(valeurs)));
    if (aCreer.length === 0) return;
    await tx.produit.createMany({
      data: aCreer.map((valeurs) => ({
        entrepriseId: modele.entrepriseId,
        modeleId,
        valeursVariante: valeurs,
        cleVariante: cleVariante(valeurs),
        nom: nomVariante(modele.nom, valeurs, ordre),
        reference: referenceVariante(modele.reference, valeurs, ordre),
        categorieId: modele.categorieId,
        marqueId: modele.marqueId,
        uniteMesure: modele.uniteMesure,
        prixAchat: modele.prixAchat,
        prixVente: modele.prixVente,
        tauxTva: modele.tauxTva,
        seuilAlerte: modele.seuilAlerte,
      })),
    });
  }

  private attributsValides(demandes: Attribut[]): Attribut[] {
    const attributs = normaliserAttributs(demandes);
    const noms = attributs.map((a) => a.nom.toLowerCase());
    if (noms.some((n) => n === '')) throw new BadRequestException('Chaque attribut doit avoir un nom.');
    if (new Set(noms).size !== noms.length) throw new BadRequestException('Deux attributs portent le même nom.');
    const vide = attributs.find((a) => a.valeurs.length === 0);
    if (vide) throw new BadRequestException(`L’attribut « ${vide.nom} » n’a aucune valeur.`);
    const taille = tailleGrille(attributs);
    if (taille > MAX_VARIANTES_PAR_MODELE) {
      throw new BadRequestException(
        `Cette grille produirait ${taille} variantes : ${MAX_VARIANTES_PAR_MODELE} au maximum par modèle.`,
      );
    }
    return attributs;
  }

  private async tauxTvaParDefaut(entrepriseId: string) {
    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { tauxTvaParDefaut: true },
    });
    return entreprise.tauxTvaParDefaut ?? undefined;
  }

  /** Catégorie et marque de la même entreprise, jamais devinées ailleurs. */
  private async verifierReferences(entrepriseId: string, dto: { categorieId?: string; marqueId?: string }) {
    if (dto.categorieId) {
      const categorie = await this.prisma.categorie.findUnique({ where: { id: dto.categorieId } });
      if (!categorie || categorie.entrepriseId !== entrepriseId) throw new NotFoundException('Catégorie introuvable.');
    }
    if (dto.marqueId) {
      const marque = await this.prisma.marque.findUnique({ where: { id: dto.marqueId } });
      if (!marque || marque.entrepriseId !== entrepriseId) throw new NotFoundException('Marque introuvable.');
    }
  }
}
