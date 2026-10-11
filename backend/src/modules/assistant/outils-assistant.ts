import { Injectable } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, validate } from 'class-validator';
import { PrismaService } from '../../config/prisma.service.js';
import { bornesPeriode } from '../statistiques/statistiques.service.js';
import { PERIODES } from '../statistiques/dto/statistiques.dto.js';
import type { DefinitionOutil } from './fournisseur-ia.js';

/**
 * Outils de l'assistant : fonctions de LECTURE déterministes, seules
 * portes du modèle vers les données. Règles, toutes vérifiées ici et non
 * confiées au modèle :
 * - l'entreprise vient du contexte authentifié, jamais des arguments
 *   (aucun schéma ne contient entrepriseId, et tout argument inconnu est refusé) ;
 * - arguments validés, nombre de résultats et périodes bornés ;
 * - données agrégées minimales : quantités et totaux, ni client, ni
 *   utilisateur, ni prix d'achat, ni marge.
 */

export class ErreurOutil extends Error {}

// ——— Arguments (validés côté serveur, en plus du schéma strict côté modèle) ———

class RechercherProduitsArgs {
  @IsString()
  @Length(2, 80)
  texte!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limite?: number;
}

class StockProduitArgs {
  @IsUUID('4')
  produitId!: string;

  @IsOptional()
  @IsUUID('4')
  emplacementId?: string;
}

class ListeBorneeArgs {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limite?: number;
}

class LotsPeremptionArgs extends ListeBorneeArgs {
  @IsInt()
  @Min(1)
  @Max(180)
  jours!: number;
}

class ResumeVentesArgs {
  @IsIn(PERIODES)
  periode!: (typeof PERIODES)[number];
}

class MeilleursProduitsArgs {
  @IsIn(PERIODES)
  periode!: (typeof PERIODES)[number];

  @IsIn(['montant', 'quantite'])
  critere!: 'montant' | 'quantite';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limite?: number;
}

const periode = {
  type: 'string',
  enum: [...PERIODES],
  description: "7j = 7 derniers jours (aujourd'hui compris), 30j = 30 derniers jours, 12m = 12 derniers mois (mois en cours compris).",
};

/** Schéma strict : propriétés listées, aucune autre acceptée. */
const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

interface Outil {
  definition: DefinitionOutil;
  args: ClassConstructor<object>;
  /** Module d'entreprise requis pour proposer l'outil. */
  module?: 'lots';
}

export const OUTILS: Record<string, Outil> = {
  rechercher_produits: {
    definition: {
      nom: 'rechercher_produits',
      description:
        "Cherche des produits actifs par nom, référence ou code-barres. Renvoie l'identifiant (à réutiliser dans stock_produit), le nom, l'unité et le stock total.",
      schema: schema(
        {
          texte: { type: 'string', description: 'Texte recherché (2 à 80 caractères).' },
          limite: { type: 'integer', description: 'Nombre maximal de résultats (1 à 10, 5 par défaut).' },
        },
        ['texte'],
      ),
    },
    args: RechercherProduitsArgs,
  },
  stock_produit: {
    definition: {
      nom: 'stock_produit',
      description:
        "Stock d'un produit (identifiant obtenu par rechercher_produits), détaillé par emplacement, avec son seuil d'alerte. emplacementId restreint à un emplacement.",
      schema: schema({ produitId: { type: 'string' }, emplacementId: { type: 'string' } }, ['produitId']),
    },
    args: StockProduitArgs,
  },
  produits_sous_seuil: {
    definition: {
      nom: 'produits_sous_seuil',
      description:
        "Produits dont le stock total est inférieur à leur seuil d'alerte (seuil > 0), les plus en manque d'abord, avec le nombre total de produits concernés.",
      schema: schema({ limite: { type: 'integer', description: 'Nombre maximal de produits (1 à 20, 10 par défaut).' } }, []),
    },
    args: ListeBorneeArgs,
  },
  lots_proches_peremption: {
    definition: {
      nom: 'lots_proches_peremption',
      description:
        'Lots en stock qui périment dans les N prochains jours, ou déjà périmés, les plus proches d’abord.',
      schema: schema(
        {
          jours: { type: 'integer', description: 'Horizon en jours (1 à 180).' },
          limite: { type: 'integer', description: 'Nombre maximal de lots (1 à 20, 10 par défaut).' },
        },
        ['jours'],
      ),
    },
    args: LotsPeremptionArgs,
    module: 'lots',
  },
  resume_ventes: {
    definition: {
      nom: 'resume_ventes',
      description:
        "Chiffre d'affaires TTC (ventes validées), nombre de ventes et panier moyen sur la période, comparés à la période précédente de même durée.",
      schema: schema({ periode }, ['periode']),
    },
    args: ResumeVentesArgs,
  },
  meilleurs_produits: {
    definition: {
      nom: 'meilleurs_produits',
      description:
        "Produits les plus vendus sur la période (ventes validées), classés par montant hors taxes ou par quantité.",
      schema: schema(
        {
          periode,
          critere: { type: 'string', enum: ['montant', 'quantite'] },
          limite: { type: 'integer', description: 'Nombre de produits (1 à 10, 5 par défaut).' },
        },
        ['periode', 'critere'],
      ),
    },
    args: MeilleursProduitsArgs,
  },
};

/** Outils proposés selon les modules actifs de l'entreprise. */
export function outilsDisponibles(modules: { lots: boolean }): DefinitionOutil[] {
  return Object.values(OUTILS)
    .filter((o) => !o.module || modules[o.module])
    .map((o) => o.definition);
}

/** Valide les arguments proposés par le modèle ; message lisible par le modèle sinon. */
export async function validerArguments<T extends object>(classe: ClassConstructor<T>, brut: unknown): Promise<T> {
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) throw new ErreurOutil('Arguments invalides : objet attendu.');
  const args = plainToInstance(classe, brut);
  const erreurs = await validate(args, { whitelist: true, forbidNonWhitelisted: true });
  if (erreurs.length > 0) {
    const champs = erreurs.map((e) => e.property).join(', ');
    throw new ErreurOutil(`Arguments invalides : ${champs}.`);
  }
  return args;
}

const nombre = (v: bigint | number | null) => Number(v ?? 0);

@Injectable()
export class OutilsAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exécute un outil pour l'entreprise du contexte authentifié. Un outil
   * non proposé (module désactivé, nom inventé) est refusé comme un nom inconnu.
   */
  async executer(entrepriseId: string, nom: string, brut: unknown, proposes: DefinitionOutil[], maintenant = new Date()) {
    const outil = OUTILS[nom];
    if (!outil || !proposes.some((d) => d.nom === nom)) throw new ErreurOutil(`Outil inconnu : ${nom}.`);
    const args = await validerArguments(outil.args, brut);
    switch (nom) {
      case 'rechercher_produits':
        return this.rechercherProduits(entrepriseId, args as RechercherProduitsArgs);
      case 'stock_produit':
        return this.stockProduit(entrepriseId, args as StockProduitArgs);
      case 'produits_sous_seuil':
        return this.produitsSousSeuil(entrepriseId, (args as ListeBorneeArgs).limite ?? 10);
      case 'lots_proches_peremption':
        return this.lotsProchesPeremption(entrepriseId, args as LotsPeremptionArgs, maintenant);
      case 'resume_ventes':
        return this.resumeVentes(entrepriseId, (args as ResumeVentesArgs).periode, maintenant);
      default:
        return this.meilleursProduits(entrepriseId, args as MeilleursProduitsArgs, maintenant);
    }
  }

  private async rechercherProduits(entrepriseId: string, { texte, limite = 5 }: RechercherProduitsArgs) {
    const produits = await this.prisma.produit.findMany({
      where: {
        entrepriseId,
        archive: false,
        OR: [
          { nom: { contains: texte, mode: 'insensitive' } },
          { reference: { contains: texte, mode: 'insensitive' } },
          { codeBarre: texte },
        ],
      },
      select: { id: true, nom: true, reference: true, uniteMesure: true, stocks: { select: { quantite: true } } },
      orderBy: { nom: 'asc' },
      take: limite,
    });
    return {
      produits: produits.map((p) => ({
        id: p.id,
        nom: p.nom,
        reference: p.reference,
        unite: p.uniteMesure,
        stockTotal: p.stocks.reduce((t, s) => t + s.quantite, 0),
      })),
    };
  }

  private async stockProduit(entrepriseId: string, { produitId, emplacementId }: StockProduitArgs) {
    const produit = await this.prisma.produit.findFirst({
      where: { id: produitId, entrepriseId },
      select: {
        id: true,
        nom: true,
        uniteMesure: true,
        seuilAlerte: true,
        archive: true,
        stocks: {
          where: emplacementId ? { emplacementId } : {},
          select: { quantite: true, emplacement: { select: { id: true, nom: true } } },
          orderBy: { emplacement: { nom: 'asc' } },
        },
      },
    });
    // Même réponse qu'un identifiant inexistant : rien ne révèle l'existence
    // d'un produit d'une autre entreprise.
    if (!produit) throw new ErreurOutil('Produit introuvable.');
    if (emplacementId) {
      const emplacement = await this.prisma.emplacement.findFirst({ where: { id: emplacementId, entrepriseId }, select: { id: true } });
      if (!emplacement) throw new ErreurOutil('Emplacement introuvable.');
    }
    const emplacements = produit.stocks.map((s) => ({ id: s.emplacement.id, nom: s.emplacement.nom, quantite: s.quantite }));
    return {
      produit: { id: produit.id, nom: produit.nom, unite: produit.uniteMesure, seuilAlerte: produit.seuilAlerte, archive: produit.archive },
      total: emplacements.reduce((t, e) => t + e.quantite, 0),
      emplacements,
    };
  }

  private async produitsSousSeuil(entrepriseId: string, limite: number) {
    const lignes = await this.prisma.$queryRaw<
      { id: string; nom: string; unite: string | null; seuil: number; stock: bigint; total: bigint }[]
    >`
      WITH niveaux AS (
        SELECT p.id, p.nom, p.unite_mesure AS unite, p.seuil_alerte AS seuil, COALESCE(SUM(s.quantite), 0)::bigint AS stock
        FROM produit p
        LEFT JOIN stock s ON s.produit_id = p.id
        WHERE p.entreprise_id = ${entrepriseId} AND p.archive = false AND p.seuil_alerte > 0
        GROUP BY p.id
      )
      SELECT *, COUNT(*) OVER ()::bigint AS total
      FROM niveaux
      WHERE stock < seuil
      ORDER BY stock - seuil ASC, nom ASC
      LIMIT ${limite}`;
    return {
      nombreTotal: nombre(lignes[0]?.total ?? 0),
      produits: lignes.map((l) => ({ id: l.id, nom: l.nom, unite: l.unite, stock: nombre(l.stock), seuilAlerte: l.seuil })),
    };
  }

  private async lotsProchesPeremption(entrepriseId: string, { jours, limite = 10 }: LotsPeremptionArgs, maintenant: Date) {
    const limiteDate = new Date(maintenant.getTime() + jours * 86_400_000);
    const lots = await this.prisma.lot.findMany({
      where: { entrepriseId, quantite: { gt: 0 }, datePeremption: { not: null, lte: limiteDate }, produit: { archive: false } },
      select: {
        numero: true,
        quantite: true,
        datePeremption: true,
        produit: { select: { nom: true, uniteMesure: true } },
        emplacement: { select: { nom: true } },
      },
      orderBy: [{ datePeremption: 'asc' }, { numero: 'asc' }],
      take: limite,
    });
    return {
      horizonJours: jours,
      lots: lots.map((l) => ({
        produit: l.produit.nom,
        unite: l.produit.uniteMesure,
        lot: l.numero,
        emplacement: l.emplacement.nom,
        quantite: l.quantite,
        datePeremption: l.datePeremption!.toISOString().slice(0, 10),
        perime: l.datePeremption! < maintenant,
      })),
    };
  }

  private async resumeVentes(entrepriseId: string, periode: ResumeVentesArgs['periode'], maintenant: Date) {
    const { debut, fin, debutPrecedent } = bornesPeriode(periode, maintenant);
    const [ligne] = await this.prisma.$queryRaw<
      { montant: bigint | null; nombre: bigint; montant_precedent: bigint | null; nombre_precedent: bigint }[]
    >`
      SELECT SUM(total) FILTER (WHERE created_at >= ${debut})::bigint AS montant,
             COUNT(*) FILTER (WHERE created_at >= ${debut}) AS nombre,
             SUM(total) FILTER (WHERE created_at < ${debut})::bigint AS montant_precedent,
             COUNT(*) FILTER (WHERE created_at < ${debut}) AS nombre_precedent
      FROM vente
      WHERE entreprise_id = ${entrepriseId} AND statut = 'VALIDEE'
        AND created_at >= ${debutPrecedent} AND created_at < ${fin}`;
    const montant = nombre(ligne.montant);
    const ventes = nombre(ligne.nombre);
    const precedent = nombre(ligne.montant_precedent);
    return {
      devise: 'GNF',
      periode: { du: jour(debut), au: jour(new Date(fin.getTime() - 1)) },
      chiffreAffairesTtc: montant,
      nombreVentes: ventes,
      panierMoyen: ventes > 0 ? Math.round(montant / ventes) : 0,
      periodePrecedente: {
        du: jour(debutPrecedent),
        au: jour(new Date(debut.getTime() - 1)),
        chiffreAffairesTtc: precedent,
        nombreVentes: nombre(ligne.nombre_precedent),
      },
      variationPourcent: precedent > 0 ? Math.round(((montant - precedent) / precedent) * 1000) / 10 : null,
    };
  }

  private async meilleursProduits(entrepriseId: string, { periode, critere, limite = 5 }: MeilleursProduitsArgs, maintenant: Date) {
    const { debut, fin } = bornesPeriode(periode, maintenant);
    const lignes = await this.prisma.$queryRaw<{ id: string; nom: string; unite: string | null; quantite: bigint; montant: bigint }[]>`
      SELECT p.id, p.nom, p.unite_mesure AS unite, SUM(lv.quantite)::bigint AS quantite, SUM(lv.montant_ligne)::bigint AS montant
      FROM ligne_vente lv
      JOIN vente v ON v.id = lv.vente_id
      JOIN produit p ON p.id = lv.produit_id
      WHERE v.entreprise_id = ${entrepriseId} AND v.statut = 'VALIDEE' AND v.created_at >= ${debut} AND v.created_at < ${fin}
      GROUP BY p.id, p.nom, p.unite_mesure
      ORDER BY CASE WHEN ${critere} = 'quantite' THEN SUM(lv.quantite)::bigint ELSE SUM(lv.montant_ligne)::bigint END DESC, p.nom ASC
      LIMIT ${limite}`;
    return {
      devise: 'GNF',
      periode: { du: jour(debut), au: jour(new Date(fin.getTime() - 1)) },
      classePar: critere,
      produits: lignes.map((l) => ({ id: l.id, nom: l.nom, unite: l.unite, quantite: nombre(l.quantite), montantHt: nombre(l.montant) })),
    };
  }
}

const jour = (d: Date) => d.toISOString().slice(0, 10);
