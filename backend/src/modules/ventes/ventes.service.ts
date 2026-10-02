import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../config/prisma.service.js';
import { resoudrePrix } from '../../common/tarifs/prix.js';
import {
  MouvementsService,
  type AlerteANotifier,
  type TransactionPrisma,
} from '../mouvements/mouvements.service.js';
import { ClientsService } from '../clients/clients.service.js';
import {
  calculerTotaux,
  tauxRemiseAffiche,
  ventilerTva,
} from './calcul-vente.js';
import { SoldesService } from './soldes.service.js';
import type { CreerVenteDto } from './dto/creer-vente.dto.js';
import type { ReglementDto } from './dto/reglement.dto.js';
import type { ListerVentesDto } from './dto/lister-ventes.dto.js';

/** Plus grand montant stockable dans une colonne Int (PostgreSQL integer). */
const MONTANT_MAX = 2_147_483_647;
const TENTATIVES_NUMEROTATION = 5;

@Injectable()
export class VentesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvements: MouvementsService,
    private readonly clients: ClientsService,
    private readonly soldes: SoldesService,
  ) {}

  /**
   * Crée une vente : lignes figées, sorties de stock et règlement initial
   * dans UNE transaction. Si une seule ligne manque de stock, rien n'est
   * enregistré (409 nommant le produit). Prix, libellés, taux et totaux
   * sont toujours déterminés ici, jamais repris du client.
   */
  async creer(entrepriseId: string, utilisateurId: string, dto: CreerVenteDto) {
    const aCredit = dto.modePaiement === 'CREDIT';
    if (aCredit && !dto.clientId) {
      throw new BadRequestException(
        'Une vente à crédit exige un client identifié.',
      );
    }
    if (!aCredit && (dto.avance || dto.echeanceAt)) {
      throw new BadRequestException(
        'Avance et échéance ne concernent que les ventes à crédit.',
      );
    }

    const client = dto.clientId
      ? await this.clients.trouverOuEchouer(entrepriseId, dto.clientId)
      : null;
    if (client?.archive) {
      throw new ConflictException(
        'Ce client est archivé : il ne peut plus faire l’objet de ventes.',
      );
    }
    const emplacement = await this.prisma.emplacement.findUnique({
      where: { id: dto.emplacementId },
    });
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Emplacement introuvable.');
    }
    if (emplacement.archive) {
      throw new ConflictException(
        'Cet emplacement est archivé : il ne peut plus faire l’objet de ventes.',
      );
    }

    const lignes = await this.preparerLignes(
      entrepriseId,
      dto,
      client?.categorie ?? 'DETAIL',
    );
    const totaux = calculerTotaux(lignes, dto.tauxRemise ?? 0);
    if (totaux.sousTotal > MONTANT_MAX || totaux.total > MONTANT_MAX) {
      throw new BadRequestException(
        'Montant trop élevé pour une seule vente : scindez-la en plusieurs ventes.',
      );
    }
    if (dto.avance && dto.avance.montant > totaux.total) {
      throw new BadRequestException(
        'L’avance ne peut pas dépasser le total de la vente.',
      );
    }

    const reglementInitial = aCredit
      ? dto.avance
      : { montant: totaux.total, mode: dto.modePaiement };

    for (let tentative = 1; ; tentative++) {
      try {
        const { venteId, alertes } = await this.prisma.$transaction(
          async (tx) => {
            // Sérialise les ventes d'une même entreprise : numérotation sans
            // trou ni doublon, et contrôles de stock cohérents entre ventes.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entrepriseId}))`;
            const numero = await this.prochainNumero(tx, entrepriseId);

            const vente = await tx.vente.create({
              data: {
                entrepriseId,
                numero,
                clientId: client?.id,
                emplacementId: emplacement.id,
                utilisateurId,
                sousTotal: totaux.sousTotal,
                remise: totaux.remise,
                montantTva: totaux.montantTva,
                total: totaux.total,
                modePaiement: dto.modePaiement,
                echeanceAt: dto.echeanceAt
                  ? new Date(dto.echeanceAt)
                  : undefined,
                lignes: {
                  create: lignes.map((l, i) => ({
                    produitId: l.produitId,
                    libelle: l.libelle,
                    quantite: l.quantite,
                    prixUnitaire: l.prixUnitaire,
                    tauxTva: l.tauxTva,
                    montantLigne: totaux.montantsLignes[i],
                  })),
                },
              },
            });

            const alertes: AlerteANotifier[] = [];
            for (const ligne of lignes) {
              const resultat = await this.sortirLigne(
                tx,
                entrepriseId,
                utilisateurId,
                emplacement.id,
                ligne,
              );
              if (resultat.alerteANotifier)
                alertes.push(resultat.alerteANotifier);
            }

            if (reglementInitial && reglementInitial.montant > 0) {
              await tx.reglement.create({
                data: {
                  venteId: vente.id,
                  montant: reglementInitial.montant,
                  mode: reglementInitial.mode,
                  utilisateurId,
                },
              });
            }
            return { venteId: vente.id, alertes };
          },
        );

        // Notifications APRÈS le commit : un email en échec n'annule jamais une vente.
        for (const alerte of alertes)
          await this.mouvements.notifierAlerte(entrepriseId, alerte);

        const detail = await this.obtenir(entrepriseId, venteId);
        return {
          ...detail,
          alertePlafond: await this.alertePlafond(entrepriseId, client),
        };
      } catch (erreur) {
        // Dernier rempart : la contrainte unique (entreprise, numéro).
        if (
          this.estCollisionNumero(erreur) &&
          tentative < TENTATIVES_NUMEROTATION
        )
          continue;
        throw erreur;
      }
    }
  }

  async lister(entrepriseId: string, filtres: ListerVentesDto) {
    const ventes = await this.prisma.vente.findMany({
      where: {
        entrepriseId,
        clientId: filtres.clientId,
        emplacementId: filtres.emplacementId,
        createdAt: {
          gte: filtres.du ? new Date(filtres.du) : undefined,
          lte: filtres.au ? new Date(filtres.au) : undefined,
        },
      },
      include: {
        client: { select: { id: true, nom: true, telephone: true } },
        emplacement: { select: { id: true, nom: true } },
        reglements: { select: { montant: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return ventes.map(({ reglements, _count, ...vente }) => {
      const paye =
        vente.statut === 'VALIDEE'
          ? reglements.reduce((a, r) => a + r.montant, 0)
          : 0;
      return {
        ...vente,
        nombreLignes: _count.lignes,
        paye,
        resteDu: vente.statut === 'VALIDEE' ? vente.total - paye : 0,
      };
    });
  }

  async obtenir(entrepriseId: string, venteId: string) {
    const vente = await this.prisma.vente.findUnique({
      where: { id: venteId },
      include: {
        client: true,
        emplacement: { select: { id: true, nom: true } },
        utilisateur: { select: { id: true, nom: true } },
        // Pas de colonne de rang dans le schéma : ordre déterministe par libellé.
        lignes: { orderBy: { libelle: 'asc' } },
        reglements: {
          include: { utilisateur: { select: { nom: true } } },
          orderBy: { createdAt: 'asc' },
        },
        entreprise: { select: { nom: true } },
      },
    });
    if (!vente || vente.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Vente introuvable.');
    }
    const encaisse = vente.reglements.reduce((a, r) => a + r.montant, 0);
    const validee = vente.statut === 'VALIDEE';
    return {
      ...vente,
      tauxRemise: tauxRemiseAffiche(vente.sousTotal, vente.remise),
      // Recalculée depuis les lignes figées et la remise enregistrée : la
      // somme est, par construction, égale au montantTva stocké.
      tvaParTaux: ventilerTva(vente.lignes, vente.remise),
      paye: validee ? encaisse : 0,
      resteDu: validee ? vente.total - encaisse : 0,
      // Vente annulée : ses règlements sont réputés remboursés au client.
      montantARembourser: validee ? 0 : encaisse,
    };
  }

  /**
   * Annulation : la vente n'est jamais modifiée ni supprimée, elle passe
   * ANNULEE avec un motif, et une entrée de stock inverse est créée par
   * ligne — le tout dans une transaction. Ses règlements sont réputés
   * remboursés (décision validée) : elle sort du solde du client.
   */
  async annuler(
    entrepriseId: string,
    utilisateurId: string,
    venteId: string,
    motif: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const vente = await this.verrouillerVente(tx, entrepriseId, venteId);
      if (vente.statut !== 'VALIDEE') {
        throw new ConflictException('Cette vente est déjà annulée.');
      }
      const lignes = await tx.ligneVente.findMany({ where: { venteId } });
      for (const ligne of lignes) {
        await this.mouvements.entreeDansTransaction(
          tx,
          entrepriseId,
          utilisateurId,
          {
            produitId: ligne.produitId,
            emplacementId: vente.emplacementId,
            quantite: ligne.quantite,
          },
        );
      }
      await tx.vente.update({
        where: { id: venteId },
        data: {
          statut: 'ANNULEE',
          annuleeAt: new Date(),
          motifAnnulation: motif.trim(),
        },
      });
    });
    return this.obtenir(entrepriseId, venteId);
  }

  /** Règlement d'une vente : jamais au-delà de son reste dû. */
  async reglerVente(
    entrepriseId: string,
    utilisateurId: string,
    venteId: string,
    dto: ReglementDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const vente = await this.verrouillerVente(tx, entrepriseId, venteId);
      if (vente.statut !== 'VALIDEE') {
        throw new ConflictException(
          'Une vente annulée ne peut plus recevoir de règlement.',
        );
      }
      const { _sum } = await tx.reglement.aggregate({
        where: { venteId },
        _sum: { montant: true },
      });
      const resteDu = vente.total - (_sum.montant ?? 0);
      if (resteDu <= 0) {
        throw new ConflictException('Cette vente est déjà entièrement réglée.');
      }
      if (dto.montant > resteDu) {
        throw new BadRequestException(
          `Le montant dépasse le reste dû de cette vente (${resteDu} GNF).`,
        );
      }
      await tx.reglement.create({
        data: { venteId, montant: dto.montant, mode: dto.mode, utilisateurId },
      });
    });
    return this.obtenir(entrepriseId, venteId);
  }

  /** Solde, plafond et dépassement éventuel — affichés avant de valider une vente. */
  async situationClient(entrepriseId: string, clientId: string) {
    const client = await this.clients.trouverOuEchouer(entrepriseId, clientId);
    const solde = await this.soldes.solde(entrepriseId, clientId);
    return { clientId, solde, plafondCredit: client.plafondCredit };
  }

  /** Ventes, règlements et annulations du client, du plus récent au plus ancien. */
  async historiqueClient(entrepriseId: string, clientId: string) {
    const client = await this.clients.trouverOuEchouer(entrepriseId, clientId);
    const ventes = await this.prisma.vente.findMany({
      where: { entrepriseId, clientId },
      include: {
        reglements: { include: { utilisateur: { select: { nom: true } } } },
      },
    });

    type Evenement =
      | {
          type: 'VENTE';
          date: Date;
          venteId: string;
          numero: string;
          montant: number;
          modePaiement: string;
          statut: string;
        }
      | {
          type: 'REGLEMENT';
          date: Date;
          venteId: string;
          numero: string;
          montant: number;
          mode: string;
          par: string;
        }
      | {
          type: 'ANNULATION';
          date: Date;
          venteId: string;
          numero: string;
          montant: number;
          motif: string | null;
          montantRembourse: number;
        };
    const evenements: Evenement[] = [];
    for (const v of ventes) {
      evenements.push({
        type: 'VENTE',
        date: v.createdAt,
        venteId: v.id,
        numero: v.numero,
        montant: v.total,
        modePaiement: v.modePaiement,
        statut: v.statut,
      });
      for (const r of v.reglements) {
        evenements.push({
          type: 'REGLEMENT',
          date: r.createdAt,
          venteId: v.id,
          numero: v.numero,
          montant: r.montant,
          mode: r.mode,
          par: r.utilisateur.nom,
        });
      }
      if (v.statut === 'ANNULEE' && v.annuleeAt) {
        evenements.push({
          type: 'ANNULATION',
          date: v.annuleeAt,
          venteId: v.id,
          numero: v.numero,
          montant: v.total,
          motif: v.motifAnnulation,
          montantRembourse: v.reglements.reduce((a, r) => a + r.montant, 0),
        });
      }
    }
    evenements.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      client,
      solde: await this.soldes.solde(entrepriseId, clientId),
      evenements,
    };
  }

  /** Lignes prêtes à figer : produits du tenant, non archivés, prix résolu. */
  private async preparerLignes(
    entrepriseId: string,
    dto: CreerVenteDto,
    categorie: 'GROS' | 'DEMI_GROS' | 'DETAIL',
  ) {
    const ids = dto.lignes.map((l) => l.produitId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Un même produit apparaît sur deux lignes : regroupez les quantités.',
      );
    }
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: ids }, entrepriseId },
    });
    const parId = new Map(produits.map((p) => [p.id, p]));

    return dto.lignes.map((ligne) => {
      const produit = parId.get(ligne.produitId);
      if (!produit) throw new NotFoundException('Produit introuvable.');
      if (produit.archive) {
        throw new ConflictException(
          `« ${produit.nom} » est archivé et ne peut plus être vendu.`,
        );
      }
      const prixUnitaire = resoudrePrix(produit, categorie);
      if (prixUnitaire === null) {
        throw new BadRequestException(
          `« ${produit.nom} » n’a pas de prix de vente : renseignez-le avant de le vendre.`,
        );
      }
      return {
        produitId: produit.id,
        libelle: produit.nom,
        quantite: ligne.quantite,
        prixUnitaire,
        tauxTva: produit.tauxTva ?? 0,
      };
    });
  }

  /** Sortie de stock d'une ligne ; un manque est signalé avec le produit en cause. */
  private async sortirLigne(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    emplacementId: string,
    ligne: { produitId: string; libelle: string; quantite: number },
  ) {
    try {
      return await this.mouvements.sortieDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        {
          produitId: ligne.produitId,
          emplacementId,
          quantite: ligne.quantite,
        },
      );
    } catch (erreur) {
      if (!(erreur instanceof ConflictException)) throw erreur;
      const stock = await tx.stock.findUnique({
        where: {
          produitId_emplacementId: {
            produitId: ligne.produitId,
            emplacementId,
          },
        },
      });
      throw new ConflictException(
        `Stock insuffisant pour « ${ligne.libelle} » : ${stock?.quantite ?? 0} disponible(s), ${ligne.quantite} demandé(s). Aucune ligne n’a été enregistrée.`,
      );
    }
  }

  /** V-ANNEE-NNNN, séquentiel par entreprise et par année ; appelé sous verrou, dans la transaction. */
  private async prochainNumero(
    tx: TransactionPrisma,
    entrepriseId: string,
  ): Promise<string> {
    const annee = new Date().getFullYear();
    const prefixe = `V-${annee}-`;
    const [{ dernier }] = await tx.$queryRaw<{ dernier: number | null }[]>`
      SELECT MAX(CAST(split_part(numero, '-', 3) AS INTEGER)) AS dernier
      FROM vente WHERE entreprise_id = ${entrepriseId} AND numero LIKE ${prefixe + '%'}`;
    return `${prefixe}${String((dernier ?? 0) + 1).padStart(4, '0')}`;
  }

  /** Verrou de ligne : deux règlements ou annulations simultanés passent l'un après l'autre. */
  private async verrouillerVente(
    tx: TransactionPrisma,
    entrepriseId: string,
    venteId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM vente WHERE id = ${venteId} FOR UPDATE`;
    const vente = await tx.vente.findUnique({ where: { id: venteId } });
    if (!vente || vente.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Vente introuvable.');
    }
    return vente;
  }

  private estCollisionNumero(erreur: unknown): boolean {
    return (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === 'P2002'
    );
  }

  private async alertePlafond(
    entrepriseId: string,
    client: { id: string; plafondCredit: number | null } | null,
  ) {
    if (!client || client.plafondCredit === null) return null;
    const solde = await this.soldes.solde(entrepriseId, client.id);
    return solde > client.plafondCredit
      ? {
          plafondCredit: client.plafondCredit,
          solde,
          depassement: solde - client.plafondCredit,
        }
      : null;
  }
}
