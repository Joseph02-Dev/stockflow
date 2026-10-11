import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { coutMoyen } from '../stock/valorisation.js';

/**
 * Lecture de la valorisation (module « valorisation ») : valeur du stock
 * par produit = Σ des couches, et historique des couches d'un produit.
 * Montants en GNF ; les BigInt sont rendus en nombres (sûrs jusqu'à 9 × 10¹⁵).
 */
@Injectable()
export class ValorisationService {
  constructor(private readonly prisma: PrismaService) {}

  async resume(entrepriseId: string) {
    const [entreprise, sommes] = await Promise.all([
      this.prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId }, select: { methodeValorisation: true } }),
      this.prisma.coucheValorisation.groupBy({
        by: ['produitId'],
        where: { entrepriseId },
        _sum: { quantite: true, valeur: true },
      }),
    ]);
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: sommes.map((s) => s.produitId) } },
      select: { id: true, nom: true, reference: true, uniteMesure: true, categorie: { select: { nom: true } } },
    });
    const parId = new Map(produits.map((p) => [p.id, p]));
    const lignes = sommes
      .map((s) => {
        const quantite = s._sum.quantite ?? 0;
        const valeur = Number(s._sum.valeur ?? 0n);
        return { produit: parId.get(s.produitId)!, quantite, valeur, coutMoyen: coutMoyen(valeur, quantite) };
      })
      .filter((l) => l.produit && (l.quantite !== 0 || l.valeur !== 0))
      .sort((a, b) => b.valeur - a.valeur);
    return {
      methode: entreprise.methodeValorisation,
      valeurTotale: lignes.reduce((t, l) => t + l.valeur, 0),
      produits: lignes,
    };
  }

  /** Couches d'un produit, des plus récentes aux plus anciennes (200 au plus). */
  async couches(entrepriseId: string, produitId: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id: produitId }, select: { entrepriseId: true } });
    if (!produit || produit.entrepriseId !== entrepriseId) throw new NotFoundException('Produit introuvable.');
    const couches = await this.prisma.coucheValorisation.findMany({
      where: { produitId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        quantite: true,
        coutUnitaire: true,
        valeur: true,
        quantiteRestante: true,
        libelle: true,
        createdAt: true,
        mouvement: { select: { type: true, vente: { select: { numero: true } } } },
      },
    });
    return couches.map((c) => ({ ...c, valeur: Number(c.valeur) }));
  }
}
