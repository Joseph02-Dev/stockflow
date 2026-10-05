import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { Pagination } from '../../common/pagination/pagination.js';
import { ORDRE_RECENT_DABORD } from '../../common/pagination/pagination.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import type { DeclarerCasseDto, FiltresPertesDto } from './dto/pertes.dto.js';

/** Motifs de la synthèse : ceux d'une casse, plus les avoirs fournisseur refusés. */
const MOTIFS_SYNTHESE = [
  'CASSE_MANUTENTION',
  'DEGAT_EAUX',
  'VOL',
  'ERREUR_SAISIE',
  'AUTRE',
  'AVOIR_REFUSE',
] as const;
const PLURIELS_MOTIF: Record<string, string> = {
  CASSE_MANUTENTION: 'casses de manutention',
  DEGAT_EAUX: 'dégâts des eaux',
  VOL: 'vols',
  ERREUR_SAISIE: 'erreurs de saisie',
  AUTRE: 'autres pertes',
  AVOIR_REFUSE: 'avoirs refusés',
};

function debutMois(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function ajouterMois(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
}
/** Part en pourcentage, à une décimale (un ratio, jamais un montant). */
function pourcentage(partie: number, tout: number): number {
  return tout > 0 ? Math.round((partie * 1000) / tout) / 10 : 0;
}
function formatPart(valeur: number): string {
  return Math.round(valeur).toLocaleString('fr-FR');
}

/** Champs affichés d'une perte (mouvement CASSE). */
const SELECTION_PERTE = {
  id: true,
  quantite: true,
  motifPerte: true,
  valeurUnitaire: true,
  valeurTotale: true,
  commentaire: true,
  photoUrl: true,
  createdAt: true,
  annuleAt: true,
  motifAnnulation: true,
  retourClientId: true,
  produit: {
    select: {
      id: true,
      nom: true,
      reference: true,
      photoUrl: true,
      uniteMesure: true,
    },
  },
  emplacement: { select: { id: true, nom: true } },
  utilisateur: { select: { id: true, nom: true } },
  annulePar: { select: { id: true, nom: true } },
  lot: { select: { id: true, numero: true } },
} as const;

/**
 * Pertes déclarées (mouvements CASSE). Un gestionnaire déclare librement :
 * chaque déclaration est nominative, immuable, et visible ici. Seul un
 * administrateur l'annule, par un mouvement inverse ; elle reste alors
 * visible, marquée annulée.
 */
@Injectable()
export class PertesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvements: MouvementsService,
  ) {}

  /**
   * Déclare une casse : sortie de stock (FEFO, ou lot désigné), motif
   * obligatoire, valeur figée au prix d'achat du moment. Produit suivi par
   * lot : un mouvement par lot traversé.
   */
  async declarer(
    entrepriseId: string,
    utilisateurId: string,
    dto: DeclarerCasseDto,
  ) {
    await this.mouvements.verifierProduitEtEmplacement(
      entrepriseId,
      dto.produitId,
      dto.emplacementId,
    );
    const resultat = await this.prisma.$transaction(async (tx) => {
      const { prixAchat } = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
        select: { prixAchat: true },
      });
      return this.mouvements.sortieDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        {
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          quantite: dto.quantite,
        },
        {
          type: 'CASSE',
          lotId: dto.lotId,
          donnees: {
            motifPerte: dto.motif,
            // On perd ce qu'on a payé, pas la marge espérée.
            valeurUnitaire: prixAchat ?? 0,
            commentaire: dto.commentaire,
            photoUrl: dto.photoUrl,
          },
        },
      );
    });
    // Notification après le commit : un email en échec n'annule jamais la déclaration.
    if (resultat.alerteANotifier)
      await this.mouvements.notifierAlerte(
        entrepriseId,
        resultat.alerteANotifier,
      );
    return this.prisma.mouvement.findMany({
      where: { id: { in: resultat.mouvements.map((m) => m.id) } },
      select: SELECTION_PERTE,
    });
  }

  /** Historique des pertes, le plus récent d'abord, filtrable. */
  async lister(
    entrepriseId: string,
    filtres: FiltresPertesDto,
    pagination: Pagination,
  ) {
    return this.prisma.mouvement.findMany({
      where: {
        entrepriseId,
        type: 'CASSE',
        motifPerte: filtres.motif,
        emplacementId: filtres.emplacementId,
        utilisateurId: filtres.utilisateurId,
        createdAt: {
          gte: filtres.debut
            ? new Date(`${filtres.debut}T00:00:00.000Z`)
            : undefined,
          lt: filtres.fin
            ? new Date(
                new Date(`${filtres.fin}T00:00:00.000Z`).getTime() + 86_400_000,
              )
            : undefined,
        },
      },
      select: SELECTION_PERTE,
      orderBy: ORDRE_RECENT_DABORD,
      ...pagination,
    });
  }

  /**
   * Annulation (administrateur) : mouvement inverse — la quantité revient
   * dans le même lot — et déclaration marquée annulée avec son motif. Ses
   * quantités et sa valeur ne changent jamais.
   */
  async annuler(
    entrepriseId: string,
    utilisateurId: string,
    perteId: string,
    motif: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const [verrouillee] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM mouvement WHERE id = ${perteId} FOR UPDATE`;
      const perte = verrouillee
        ? await tx.mouvement.findUnique({ where: { id: perteId } })
        : null;
      if (
        !perte ||
        perte.entrepriseId !== entrepriseId ||
        perte.type !== 'CASSE'
      ) {
        throw new NotFoundException('Perte introuvable.');
      }
      if (perte.annuleAt)
        throw new ConflictException('Cette perte est déjà annulée.');

      // Casse antérieure à l'activation du suivi par lot : rejoint le lot sans date.
      const lotId =
        perte.lotId ??
        (await this.mouvements.lotSansDateSiSuivi(
          tx,
          entrepriseId,
          perte.produitId,
          perte.emplacementId,
        ));
      await this.mouvements.entreeDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        {
          produitId: perte.produitId,
          emplacementId: perte.emplacementId,
          quantite: perte.quantite,
        },
        {
          type: 'AJUSTEMENT',
          lotId,
          donnees: {
            commentaire: `Annulation d’une casse : ${motif}`,
            annuleMouvementId: perte.id,
          },
        },
      );
      await tx.mouvement.update({
        where: { id: perte.id },
        data: {
          annuleAt: new Date(),
          annuleParId: utilisateurId,
          motifAnnulation: motif,
        },
      });
    });
    return this.prisma.mouvement.findUniqueOrThrow({
      where: { id: perteId },
      select: SELECTION_PERTE,
    });
  }

  /**
   * Synthèse du mois : total perdu, part de la valeur du stock, évolution,
   * répartition par motif et par emplacement, et une phrase d'analyse
   * calculée depuis les données. Pertes = casses non annulées + retours
   * fournisseur dont l'avoir a été refusé (leur stock est déjà sorti au
   * renvoi : comptés ici une seule fois, sans mouvement supplémentaire).
   */
  async synthese(entrepriseId: string, mois?: string) {
    const debut = mois
      ? new Date(`${mois}-01T00:00:00.000Z`)
      : debutMois(new Date());
    if (Number.isNaN(debut.getTime()))
      throw new BadRequestException('Mois au format AAAA-MM.');
    const fin = ajouterMois(debut, 1);
    const debutFenetre = ajouterMois(debut, -5);

    const lignes = await this.prisma.$queryRaw<
      {
        mois: Date;
        motif: string;
        emplacement_id: string;
        valeur: bigint;
        nombre: bigint;
      }[]
    >`
      WITH pertes AS (
        SELECT m.created_at AS date, m.motif_perte::text AS motif, m.emplacement_id,
               COALESCE(m.valeur_totale, 0) AS valeur
        FROM mouvement m
        WHERE m.entreprise_id = ${entrepriseId} AND m.type = 'CASSE' AND m.annule_at IS NULL
        UNION ALL
        SELECT r.refuse_at, 'AVOIR_REFUSE', r.emplacement_id, r.valeur_totale
        FROM retour_fournisseur r
        WHERE r.entreprise_id = ${entrepriseId} AND r.statut_avoir = 'REFUSE'
      )
      SELECT date_trunc('month', date) AS mois, motif, emplacement_id,
             SUM(valeur)::bigint AS valeur, COUNT(*)::bigint AS nombre
      FROM pertes
      WHERE date >= ${debutFenetre} AND date < ${fin}
      GROUP BY 1, 2, 3`;
    const [stocks, emplacements] = await Promise.all([
      this.prisma.$queryRaw<{ emplacement_id: string; valeur: bigint }[]>`
        SELECT s.emplacement_id, SUM(s.quantite::bigint * COALESCE(p.prix_achat, 0))::bigint AS valeur
        FROM stock s JOIN produit p ON p.id = s.produit_id
        WHERE p.entreprise_id = ${entrepriseId}
        GROUP BY s.emplacement_id`,
      this.prisma.emplacement.findMany({
        where: { entrepriseId },
        select: { id: true, nom: true },
      }),
    ]);

    const cle = (d: Date) => d.toISOString().slice(0, 7);
    const moisCourant = cle(debut);
    const moisPrecedent = cle(ajouterMois(debut, -1));
    const somme = (
      filtre: (l: (typeof lignes)[number]) => boolean,
      champ: 'valeur' | 'nombre' = 'valeur',
    ) => lignes.filter(filtre).reduce((a, l) => a + Number(l[champ]), 0);
    const duMois = (l: (typeof lignes)[number]) => cle(l.mois) === moisCourant;

    const total = somme(duMois);
    const nombre = somme(duMois, 'nombre');
    const totalPrecedent = somme((l) => cle(l.mois) === moisPrecedent);
    const valeurStock = stocks.reduce((a, s) => a + Number(s.valeur), 0);
    const stockParEmplacement = new Map(
      stocks.map((s) => [s.emplacement_id, Number(s.valeur)]),
    );
    const nomEmplacement = new Map(emplacements.map((e) => [e.id, e.nom]));

    const parMotif = MOTIFS_SYNTHESE.map((motif) => ({
      motif,
      valeur: somme((l) => duMois(l) && l.motif === motif),
      nombre: somme((l) => duMois(l) && l.motif === motif, 'nombre'),
    }));
    const parEmplacement = [
      ...new Set(lignes.filter(duMois).map((l) => l.emplacement_id)),
    ]
      .map((id) => {
        const valeur = somme((l) => duMois(l) && l.emplacement_id === id);
        return {
          emplacementId: id,
          nom: nomEmplacement.get(id) ?? '—',
          valeur,
          partPertes: pourcentage(valeur, total),
          partStock: pourcentage(stockParEmplacement.get(id) ?? 0, valeurStock),
        };
      })
      .sort((a, b) => b.valeur - a.valeur);
    const evolution = Array.from({ length: 6 }, (_, i) => {
      const m = cle(ajouterMois(debutFenetre, i));
      return { mois: m, valeur: somme((l) => cle(l.mois) === m) };
    });

    return {
      mois: moisCourant,
      total,
      nombre,
      moyenne: nombre > 0 ? Math.round(total / nombre) : 0,
      totalPrecedent,
      evolutionPourcentage:
        totalPrecedent > 0
          ? pourcentage(total - totalPrecedent, totalPrecedent)
          : null,
      valeurStock,
      partDuStock: pourcentage(total, valeurStock),
      parMotif,
      parEmplacement,
      evolution,
      analyse: this.analyser(parEmplacement, lignes, debut),
    };
  }

  /**
   * « « Dépôt Madina » concentre 46 % des pertes pour 38 % du stock. Les
   * dégâts des eaux y ont triplé depuis juillet. » — calculée, jamais
   * écrite en dur : premier emplacement par valeur perdue, puis le motif
   * qui y a le plus progressé (3 derniers mois contre les 3 précédents).
   */
  private analyser(
    parEmplacement: {
      emplacementId: string;
      nom: string;
      partPertes: number;
      partStock: number;
    }[],
    lignes: {
      mois: Date;
      motif: string;
      emplacement_id: string;
      valeur: bigint;
    }[],
    debut: Date,
  ): string | null {
    const premier = parEmplacement[0];
    if (!premier) return null;
    let phrase =
      parEmplacement.length === 1
        ? `Toutes les pertes du mois viennent de « ${premier.nom} ».`
        : `« ${premier.nom} » concentre ${formatPart(premier.partPertes)} % des pertes pour ${formatPart(premier.partStock)} % du stock.`;

    const debutRecent = ajouterMois(debut, -2);
    let meilleure: { motif: string; ratio: number } | null = null;
    for (const motif of MOTIFS_SYNTHESE) {
      const ici = lignes.filter(
        (l) => l.emplacement_id === premier.emplacementId && l.motif === motif,
      );
      const recent = ici
        .filter((l) => l.mois >= debutRecent)
        .reduce((a, l) => a + Number(l.valeur), 0);
      const avant = ici
        .filter((l) => l.mois < debutRecent)
        .reduce((a, l) => a + Number(l.valeur), 0);
      if (
        avant > 0 &&
        recent / avant >= 2 &&
        (!meilleure || recent / avant > meilleure.ratio)
      ) {
        meilleure = { motif, ratio: recent / avant };
      }
    }
    if (meilleure) {
      const n = Math.floor(meilleure.ratio);
      const verbe =
        n === 2
          ? 'ont doublé'
          : n === 3
            ? 'ont triplé'
            : `ont été multipliés par ${n}`;
      const depuis = debutRecent.toLocaleDateString('fr-FR', {
        month: 'long',
        timeZone: 'UTC',
      });
      phrase += ` Les ${PLURIELS_MOTIF[meilleure.motif]} y ${verbe} depuis ${depuis}.`;
    }
    return phrase;
  }
}
