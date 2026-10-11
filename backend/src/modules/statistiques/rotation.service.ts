import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { indicateursRotation } from './rotation.js';

interface LigneBrute {
  id: string;
  nom: string;
  reference: string | null;
  categorie: string | null;
  prix_achat: number | null;
  stock: bigint;
  sorties: bigint;
  derniere_sortie: Date | null;
  valeur_couches: bigint | null;
}

const JOUR_MS = 86_400_000;

/**
 * Rotation et stock dormant (module « rotation ») : pour chaque produit
 * actif, sorties nettes vers les clients sur la période, rotation,
 * couverture et valeur immobilisée ; agrégats par catégorie (en valeur,
 * seule unité commune à tous les produits).
 */
@Injectable()
export class RotationService {
  constructor(private readonly prisma: PrismaService) {}

  async rapport(entrepriseId: string, jours = 90, maintenant = new Date()) {
    const debut = new Date(maintenant.getTime() - jours * JOUR_MS);
    const { moduleValorisation } = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { moduleValorisation: true },
    });
    // Sorties nettes : vers les clients, moins ce qui en revient (retours,
    // ventes annulées), sur la période. Dernière sortie : toutes périodes.
    const lignes = await this.prisma.$queryRaw<LigneBrute[]>`
      WITH stock AS (
        SELECT s.produit_id, SUM(s.quantite) AS quantite
        FROM stock s JOIN produit p ON p.id = s.produit_id
        WHERE p.entreprise_id = ${entrepriseId}
        GROUP BY s.produit_id
      ), clients AS (
        SELECT produit_id,
               COALESCE(SUM(ABS(quantite)) FILTER (WHERE destination = 'CLIENT' AND created_at >= ${debut}), 0)
             - COALESCE(SUM(ABS(quantite)) FILTER (WHERE origine = 'CLIENT' AND created_at >= ${debut}), 0) AS sorties,
               MAX(created_at) FILTER (WHERE destination = 'CLIENT') AS derniere_sortie
        FROM mouvement
        WHERE entreprise_id = ${entrepriseId} AND (destination = 'CLIENT' OR origine = 'CLIENT')
        GROUP BY produit_id
      ), valeurs AS (
        SELECT produit_id, SUM(valeur) AS valeur
        FROM couche_valorisation WHERE entreprise_id = ${entrepriseId}
        GROUP BY produit_id
      )
      SELECT p.id, p.nom, p.reference, c.nom AS categorie, p.prix_achat,
             COALESCE(st.quantite, 0)::bigint AS stock,
             COALESCE(cl.sorties, 0)::bigint AS sorties,
             cl.derniere_sortie,
             va.valeur AS valeur_couches
      FROM produit p
      LEFT JOIN categorie c ON c.id = p.categorie_id
      LEFT JOIN stock st ON st.produit_id = p.id
      LEFT JOIN clients cl ON cl.produit_id = p.id
      LEFT JOIN valeurs va ON va.produit_id = p.id
      WHERE p.entreprise_id = ${entrepriseId} AND p.archive = false`;

    const produits = lignes.map((l) => {
      const stock = Number(l.stock);
      const sorties = Number(l.sorties);
      // Valeur au coût : couches (module valorisation), sinon prix d'achat actuel.
      const valeur =
        moduleValorisation && l.valeur_couches !== null
          ? Number(l.valeur_couches)
          : l.prix_achat !== null
            ? stock * l.prix_achat
            : null;
      const coutUnitaire = valeur !== null && stock > 0 ? valeur / stock : l.prix_achat;
      return {
        produit: { id: l.id, nom: l.nom, reference: l.reference, categorie: l.categorie },
        stock,
        sorties: Math.max(0, sorties),
        derniereSortie: l.derniere_sortie,
        valeur,
        valeurSorties: coutUnitaire !== null ? Math.round(Math.max(0, sorties) * coutUnitaire) : null,
        ...indicateursRotation({ stock, sorties, jours }),
      };
    });

    // Dormants d'abord (par valeur immobilisée), puis rotation croissante.
    produits.sort((a, b) =>
      a.dormant !== b.dormant
        ? a.dormant
          ? -1
          : 1
        : a.dormant
          ? (b.valeur ?? 0) - (a.valeur ?? 0)
          : (a.rotation ?? Infinity) - (b.rotation ?? Infinity),
    );

    const categories = new Map<string, { categorie: string; valeur: number; valeurSorties: number; produits: number; dormants: number }>();
    for (const p of produits) {
      const nom = p.produit.categorie ?? 'Sans catégorie';
      const c = categories.get(nom) ?? { categorie: nom, valeur: 0, valeurSorties: 0, produits: 0, dormants: 0 };
      c.valeur += p.valeur ?? 0;
      c.valeurSorties += p.valeurSorties ?? 0;
      c.produits++;
      if (p.dormant) c.dormants++;
      categories.set(nom, c);
    }

    const dormants = produits.filter((p) => p.dormant);
    return {
      jours,
      depuis: debut,
      valorisation: moduleValorisation ? 'couches' : 'prix_achat',
      totaux: {
        valeurStock: produits.reduce((t, p) => t + (p.valeur ?? 0), 0),
        valeurDormante: dormants.reduce((t, p) => t + (p.valeur ?? 0), 0),
        produitsDormants: dormants.length,
      },
      categories: [...categories.values()]
        .map((c) => ({ ...c, rotation: c.valeur > 0 ? Math.round((c.valeurSorties / c.valeur) * 100) / 100 : null }))
        .sort((a, b) => b.valeur - a.valeur),
      produits,
    };
  }
}
