import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { AlerteNotificationService } from '../alertes/alerte-notification.service.js';
import {
  ORDRE_RECENT_DABORD,
  type Pagination,
} from '../../common/pagination/pagination.js';
import type { EntreeStockDto } from './dto/entree-stock.dto.js';
import type { SortieStockDto } from './dto/sortie-stock.dto.js';
import type { TransfertStockDto } from './dto/transfert-stock.dto.js';
import { ligneCsv } from '../../common/pagination/csv.js';
import {
  joursRestants,
  lireDatePeremption,
  repartirFefo,
  type LotFefo,
} from '../lots/fefo.js';

/** Client Prisma d'une transaction en cours. */
export type TransactionPrisma = Parameters<
  Parameters<PrismaService['$transaction']>[0]
>[0];

/** Numéro du lot qui reçoit le stock antérieur au suivi par lot. */
export const NUMERO_LOT_SANS_DATE = 'SANS-LOT';

export interface AlerteANotifier {
  type: 'STOCK_FAIBLE' | 'RUPTURE';
  produitNom: string;
  quantite: number;
}

@Injectable()
export class MouvementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerteNotification: AlerteNotificationService,
  ) {}

  /**
   * MVT-001 — Entrée de stock.
   * Transaction : met à jour le stock, enregistre le mouvement (immuable),
   * puis résout automatiquement l'alerte active du produit si le stock
   * total repasse au-dessus du seuil (décision validée en audit Lead
   * Developer — résolution symétrique au déclenchement de MVT-002).
   * Produit suivi par lot : numéro de lot et date de péremption
   * obligatoires ; le lot est créé, ou complété s'il existe déjà.
   */
  async entree(
    entrepriseId: string,
    utilisateurId: string,
    dto: EntreeStockDto,
  ) {
    await this.verifierProduitEtEmplacement(
      entrepriseId,
      dto.produitId,
      dto.emplacementId,
    );
    if (dto.fournisseurId) {
      await this.verifierFournisseur(entrepriseId, dto.fournisseurId);
    }

    return this.prisma.$transaction((tx) =>
      this.entreeDansTransaction(tx, entrepriseId, utilisateurId, dto),
    );
  }

  /**
   * Cœur de entree(), exécuté dans une transaction fournie par l'appelant
   * — pour qu'une opération composée (annulation de vente) applique
   * plusieurs mouvements de façon atomique. Aucune vérification
   * d'appartenance ici : c'est à l'appelant de l'avoir faite.
   *
   * `options.lotId` remet la quantité dans un lot précis (restitution
   * d'une vente annulée) ; `options.venteId` rattache le mouvement à sa
   * vente.
   */
  async entreeDansTransaction(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    dto: EntreeStockDto,
    options: { lotId?: string; venteId?: string } = {},
  ) {
    {
      await this.verrouillerProduit(tx, dto.produitId);
      const produit = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
      });

      await tx.stock.upsert({
        where: {
          produitId_emplacementId: {
            produitId: dto.produitId,
            emplacementId: dto.emplacementId,
          },
        },
        create: {
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          quantite: dto.quantite,
        },
        update: { quantite: { increment: dto.quantite } },
      });

      const lotId = produit.suiviParLot
        ? await this.alimenterLot(tx, entrepriseId, dto, options.lotId)
        : this.refuserInfosLot(dto);

      const mouvement = await tx.mouvement.create({
        data: {
          entrepriseId,
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          type: 'ENTREE',
          quantite: dto.quantite,
          fournisseurId: dto.fournisseurId,
          utilisateurId,
          lotId,
          venteId: options.venteId,
        },
      });

      const stockTotal = await this.stockTotalProduit(tx, dto.produitId);

      if (stockTotal >= produit.seuilAlerte) {
        const alerteActive = await tx.alerte.findFirst({
          where: { produitId: dto.produitId, statut: 'ACTIVE' },
        });
        if (alerteActive) {
          await tx.alerte.update({
            where: { id: alerteActive.id },
            data: { statut: 'RESOLUE', resolvedAt: new Date() },
          });
        }
      }

      return mouvement;
    }
  }

  /**
   * MVT-002 — Sortie de stock.
   * Refuse toute sortie qui ferait passer le stock sous zéro (règle
   * d'intégrité validée en architecture). Déclenche une alerte si le
   * nouveau stock total passe sous le seuil du produit.
   * Produit suivi par lot : la quantité est prise dans l'ordre FEFO, un
   * mouvement par lot traversé — la réponse est alors la liste des
   * mouvements dès qu'il y en a plusieurs.
   */
  async sortie(
    entrepriseId: string,
    utilisateurId: string,
    dto: SortieStockDto,
  ) {
    await this.verifierProduitEtEmplacement(
      entrepriseId,
      dto.produitId,
      dto.emplacementId,
    );

    const resultat = await this.prisma.$transaction((tx) =>
      this.sortieDansTransaction(tx, entrepriseId, utilisateurId, dto),
    );

    // ALERT-004 — Notification envoyée APRÈS le commit de la transaction :
    // un échec d'email ne doit jamais annuler un mouvement déjà validé.
    if (resultat.alerteANotifier) {
      await this.notifierAlerte(entrepriseId, resultat.alerteANotifier);
    }

    return resultat.mouvements.length === 1
      ? resultat.mouvement
      : resultat.mouvements;
  }

  /**
   * Cœur de sortie(), exécuté dans une transaction fournie par l'appelant
   * (vente : toutes les lignes ou aucune). Renvoie l'alerte à notifier,
   * que l'appelant envoie APRÈS le commit via notifierAlerte(). Aucune
   * vérification d'appartenance ici : c'est à l'appelant de l'avoir faite.
   *
   * Décrément conditionnel (quantite >= demandée) en une seule requête :
   * deux sorties simultanées ne peuvent jamais faire passer le stock sous
   * zéro, contrairement à une lecture suivie d'une écriture.
   */
  async sortieDansTransaction(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    dto: SortieStockDto,
    options: { venteId?: string } = {},
  ) {
    {
      await this.verrouillerProduit(tx, dto.produitId);
      const { count } = await tx.stock.updateMany({
        where: {
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          quantite: { gte: dto.quantite },
        },
        data: { quantite: { decrement: dto.quantite } },
      });

      if (count === 0) {
        throw new ConflictException(
          'Stock insuffisant pour effectuer cette sortie.',
        );
      }

      const produit = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
      });

      const mouvements = produit.suiviParLot
        ? await this.sortirDesLots(tx, {
            entrepriseId,
            utilisateurId,
            produitId: dto.produitId,
            emplacementId: dto.emplacementId,
            quantite: dto.quantite,
            type: 'SORTIE',
            venteId: options.venteId,
          })
        : [
            await tx.mouvement.create({
              data: {
                entrepriseId,
                produitId: dto.produitId,
                emplacementId: dto.emplacementId,
                type: 'SORTIE',
                quantite: dto.quantite,
                utilisateurId,
                venteId: options.venteId,
              },
            }),
          ];

      const alerteANotifier = await this.evaluerAlerteApresBaisse(
        tx,
        entrepriseId,
        produit,
      );

      return { mouvement: mouvements[0], mouvements, alerteANotifier };
    }
  }

  /**
   * Sortie d'un lot périmé : tout le lot quitte le stock, par un
   * mouvement PERIME (une perte, distincte d'une sortie commerciale).
   * Refusée si le lot n'est pas encore périmé.
   */
  async sortirLotPerime(
    entrepriseId: string,
    utilisateurId: string,
    lotId: string,
  ) {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot || lot.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Lot introuvable.');
    }
    await this.verifierProduitEtEmplacement(
      entrepriseId,
      lot.produitId,
      lot.emplacementId,
    );
    if (
      !lot.datePeremption ||
      joursRestants(lot.datePeremption, new Date()) >= 0
    ) {
      throw new ConflictException(
        'Ce lot n’est pas périmé : il ne peut pas être sorti comme perte.',
      );
    }

    const resultat = await this.prisma.$transaction(async (tx) => {
      await this.verrouillerProduit(tx, lot.produitId);
      // Verrou du stock AVANT celui du lot, dans le même ordre que toutes
      // les autres opérations : jamais d'interblocage entre elles.
      await tx.$queryRaw`SELECT 1 FROM stock WHERE produit_id = ${lot.produitId} AND emplacement_id = ${lot.emplacementId} FOR UPDATE`;
      const [actuel] = await tx.$queryRaw<{ quantite: number }[]>`
        SELECT quantite FROM lot WHERE id = ${lot.id} FOR UPDATE`;
      if (!actuel || actuel.quantite <= 0) {
        throw new ConflictException('Ce lot est déjà vide.');
      }
      await tx.stock.update({
        where: {
          produitId_emplacementId: {
            produitId: lot.produitId,
            emplacementId: lot.emplacementId,
          },
        },
        data: { quantite: { decrement: actuel.quantite } },
      });
      const [mouvement] = await this.sortirDesLots(tx, {
        entrepriseId,
        utilisateurId,
        produitId: lot.produitId,
        emplacementId: lot.emplacementId,
        quantite: actuel.quantite,
        type: 'PERIME',
        lotId: lot.id,
      });
      const produit = await tx.produit.findUniqueOrThrow({
        where: { id: lot.produitId },
      });
      const alerteANotifier = await this.evaluerAlerteApresBaisse(
        tx,
        entrepriseId,
        produit,
      );
      return { mouvement, alerteANotifier };
    });

    if (resultat.alerteANotifier) {
      await this.notifierAlerte(entrepriseId, resultat.alerteANotifier);
    }
    return resultat.mouvement;
  }

  /** Envoie la notification d'une alerte déclenchée par une sortie déjà validée. */
  async notifierAlerte(entrepriseId: string, alerte: AlerteANotifier) {
    await this.alerteNotification.notifierAlerte(
      entrepriseId,
      alerte.produitNom,
      alerte.type,
      alerte.quantite,
    );
  }

  /**
   * Transfert de stock entre deux emplacements de la même entreprise.
   * Un seul mouvement enregistré (type TRANSFERT, emplacementId = source,
   * emplacementDestinationId = destination) plutôt que deux mouvements
   * séparés, pour que l'historique affiche une ligne unique « Madina →
   * Coyah » comme le prévoit le design.
   *
   * Aucun impact sur les alertes : elles sont calculées sur le stock
   * total de l'entreprise (décision d'architecture déjà validée), et un
   * transfert ne change jamais ce total — seule sa répartition entre
   * emplacements change. Contrairement à entree()/sortie(), aucune
   * vérification de seuil n'est donc nécessaire ici.
   *
   * Produit suivi par lot : le lot garde son numéro, sa date de
   * péremption et sa date de réception à destination ; sans lot désigné,
   * la quantité est prise dans l'ordre FEFO (un mouvement par lot).
   */
  async transfert(
    entrepriseId: string,
    utilisateurId: string,
    dto: TransfertStockDto,
  ) {
    if (dto.emplacementSourceId === dto.emplacementDestinationId) {
      throw new ConflictException(
        'L’emplacement de destination doit être différent de la source.',
      );
    }

    await this.verifierProduitEtEmplacement(
      entrepriseId,
      dto.produitId,
      dto.emplacementSourceId,
    );
    const destination = await this.prisma.emplacement.findUnique({
      where: { id: dto.emplacementDestinationId },
    });
    if (!destination || destination.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Emplacement de destination introuvable.');
    }
    if (destination.archive) {
      throw new ConflictException('L’emplacement de destination est archivé.');
    }

    const resultat = await this.prisma.$transaction(async (tx) => {
      await this.verrouillerProduit(tx, dto.produitId);
      const stockSource = await tx.stock.findUnique({
        where: {
          produitId_emplacementId: {
            produitId: dto.produitId,
            emplacementId: dto.emplacementSourceId,
          },
        },
      });
      if (!stockSource || stockSource.quantite < dto.quantite) {
        throw new ConflictException(
          'Stock insuffisant à l’emplacement source pour effectuer ce transfert.',
        );
      }

      await tx.stock.update({
        where: {
          produitId_emplacementId: {
            produitId: dto.produitId,
            emplacementId: dto.emplacementSourceId,
          },
        },
        data: { quantite: { decrement: dto.quantite } },
      });

      await tx.stock.upsert({
        where: {
          produitId_emplacementId: {
            produitId: dto.produitId,
            emplacementId: dto.emplacementDestinationId,
          },
        },
        create: {
          produitId: dto.produitId,
          emplacementId: dto.emplacementDestinationId,
          quantite: dto.quantite,
        },
        update: { quantite: { increment: dto.quantite } },
      });

      const produit = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
      });
      if (produit.suiviParLot) {
        return this.transfererDesLots(tx, entrepriseId, utilisateurId, dto);
      }
      if (dto.lotId) {
        throw new BadRequestException(
          'Ce produit n’est pas suivi par lot : aucun lot à transférer.',
        );
      }

      return [
        await tx.mouvement.create({
          data: {
            entrepriseId,
            produitId: dto.produitId,
            emplacementId: dto.emplacementSourceId,
            emplacementDestinationId: dto.emplacementDestinationId,
            type: 'TRANSFERT',
            quantite: dto.quantite,
            utilisateurId,
          },
        }),
      ];
    });

    return resultat.length === 1 ? resultat[0] : resultat;
  }

  /** MVT-003 — Historique des mouvements, filtrable. */
  /**
   * Historique paginé (curseur), du plus récent au plus ancien : jamais
   * tout l'historique d'un coup — il grossit chaque jour.
   */
  async listerMouvements(
    entrepriseId: string,
    filtres: { produitId?: string; emplacementId?: string },
    pagination: Pagination,
  ) {
    return this.prisma.mouvement.findMany({
      where: {
        entrepriseId,
        produitId: filtres.produitId,
        // Un transfert doit apparaître dans l'historique filtré de son
        // emplacement source ET de sa destination — sinon un utilisateur
        // qui filtre sur "Coyah" ne verrait jamais les transferts reçus.
        ...(filtres.emplacementId
          ? {
              OR: [
                { emplacementId: filtres.emplacementId },
                { emplacementDestinationId: filtres.emplacementId },
              ],
            }
          : {}),
      },
      // Les noms sont indispensables à l'affichage de l'historique : sans
      // eux, l'interface ne pourrait montrer que des identifiants bruts.
      // `select` explicite sur l'utilisateur pour ne jamais exposer son
      // hash de mot de passe.
      include: {
        produit: { select: { id: true, nom: true, reference: true } },
        emplacement: { select: { id: true, nom: true } },
        emplacementDestination: { select: { id: true, nom: true } },
        utilisateur: { select: { id: true, nom: true } },
        fournisseur: { select: { id: true, nom: true } },
      },
      orderBy: ORDRE_RECENT_DABORD,
      ...pagination,
    });
  }

  /** MVT-004 — Stock actuel par emplacement, filtrable. */
  /**
   * Export CSV de TOUT l'historique filtré, produit en flux continu par lots
   * de 2 000 : une seule requête HTTP, mémoire constante côté serveur,
   * quel que soit le volume (200 000 mouvements ≈ 20 Mo de CSV).
   */
  async exporterMouvements(
    entrepriseId: string,
    filtres: { produitId?: string; emplacementId?: string },
    ecrire: (morceau: string) => Promise<void>,
  ) {
    const LIBELLES = {
      ENTREE: 'Entrée',
      SORTIE: 'Sortie',
      TRANSFERT: 'Transfert',
      AJUSTEMENT: 'Ajustement',
      PERIME: 'Périmé',
    } as const;
    await ecrire(
      ligneCsv([
        'Date',
        'Type',
        'Produit',
        'Emplacement',
        'Emplacement destination',
        'Quantité',
        'Utilisateur',
        'Fournisseur',
      ]),
    );
    let apres: string | undefined;
    for (;;) {
      const lot = await this.listerMouvements(entrepriseId, filtres, {
        take: 2000,
        ...(apres ? { cursor: { id: apres }, skip: 1 } : {}),
      });
      if (lot.length > 0) {
        await ecrire(
          lot
            .map((m) =>
              ligneCsv([
                m.createdAt.toLocaleDateString('fr-FR'),
                LIBELLES[m.type],
                m.produit.nom,
                m.emplacement.nom,
                m.emplacementDestination?.nom ?? '',
                m.quantite,
                m.utilisateur.nom,
                m.fournisseur?.nom ?? '',
              ]),
            )
            .join(''),
        );
      }
      if (lot.length < 2000) return;
      apres = lot[lot.length - 1].id;
    }
  }

  async listerStock(
    entrepriseId: string,
    filtres: { produitId?: string; emplacementId?: string },
  ) {
    return this.prisma.stock.findMany({
      where: {
        produit: { entrepriseId },
        produitId: filtres.produitId,
        emplacementId: filtres.emplacementId,
      },
      // Seuls les champs lus par les écrans (stock, produits, alertes,
      // vente) : la fiche produit complète (description, code-barre…)
      // n'a rien à faire dans chaque ligne de stock.
      select: {
        produitId: true,
        emplacementId: true,
        quantite: true,
        produit: {
          select: {
            id: true,
            nom: true,
            reference: true,
            seuilAlerte: true,
            photoUrl: true,
            uniteMesure: true,
            prixAchat: true,
            prixVente: true,
            prixGros: true,
            prixDemiGros: true,
            tauxTva: true,
            archive: true,
          },
        },
        emplacement: { select: { id: true, nom: true } },
      },
    });
  }

  /**
   * Après une baisse du stock total (sortie, perte) : déclenche ou
   * aggrave l'alerte du produit si le total passe sous le seuil.
   */
  private async evaluerAlerteApresBaisse(
    tx: TransactionPrisma,
    entrepriseId: string,
    produit: { id: string; nom: string; seuilAlerte: number },
  ): Promise<AlerteANotifier | null> {
    const stockTotal = await this.stockTotalProduit(tx, produit.id);
    let alerteANotifier: AlerteANotifier | null = null;

    if (stockTotal < produit.seuilAlerte || stockTotal === 0) {
      const typeAlerte = stockTotal === 0 ? 'RUPTURE' : 'STOCK_FAIBLE';
      const alerteActive = await tx.alerte.findFirst({
        where: { produitId: produit.id, statut: 'ACTIVE' },
      });

      if (alerteActive) {
        // Alerte déjà active : on ne notifie à nouveau que si sa gravité
        // change (passage de STOCK_FAIBLE à RUPTURE), pour éviter de
        // spammer les utilisateurs à chaque sortie.
        if (alerteActive.type !== typeAlerte) {
          await tx.alerte.update({
            where: { id: alerteActive.id },
            data: { type: typeAlerte, quantiteAuDeclenchement: stockTotal },
          });
          alerteANotifier = {
            type: typeAlerte,
            produitNom: produit.nom,
            quantite: stockTotal,
          };
        }
      } else {
        await tx.alerte.create({
          data: {
            entrepriseId,
            produitId: produit.id,
            type: typeAlerte,
            quantiteAuDeclenchement: stockTotal,
          },
        });
        alerteANotifier = {
          type: typeAlerte,
          produitNom: produit.nom,
          quantite: stockTotal,
        };
      }
    }
    return alerteANotifier;
  }

  /**
   * Lot « sans date » d'un produit suivi par lot à un emplacement (créé
   * vide s'il n'existe pas) : il accueille le stock antérieur à
   * l'activation du suivi, et sort en dernier (FEFO). Renvoie undefined
   * pour un produit sans suivi par lot.
   */
  async lotSansDateSiSuivi(
    tx: TransactionPrisma,
    entrepriseId: string,
    produitId: string,
    emplacementId: string,
  ): Promise<string | undefined> {
    const produit = await tx.produit.findUniqueOrThrow({
      where: { id: produitId },
    });
    if (!produit.suiviParLot) return undefined;
    const lot = await tx.lot.upsert({
      where: {
        produitId_emplacementId_numero: {
          produitId,
          emplacementId,
          numero: NUMERO_LOT_SANS_DATE,
        },
      },
      create: {
        entrepriseId,
        produitId,
        emplacementId,
        numero: NUMERO_LOT_SANS_DATE,
        quantite: 0,
      },
      update: {},
    });
    return lot.id;
  }

  /** Un produit sans suivi par lot n'accepte ni numéro de lot ni date. */
  private refuserInfosLot(dto: EntreeStockDto): undefined {
    if (dto.numeroLot !== undefined || dto.datePeremption !== undefined) {
      throw new BadRequestException(
        'Ce produit n’est pas suivi par lot : ni numéro de lot ni date de péremption à saisir.',
      );
    }
    return undefined;
  }

  /**
   * Entrée dans un lot : le lot désigné (restitution), sinon celui du
   * numéro saisi — complété s'il existe déjà avec la même date, créé
   * sinon. Le stock a déjà été incrémenté par l'appelant.
   */
  private async alimenterLot(
    tx: TransactionPrisma,
    entrepriseId: string,
    dto: EntreeStockDto,
    lotIdCible?: string,
  ): Promise<string> {
    if (lotIdCible) {
      await tx.lot.update({
        where: { id: lotIdCible },
        data: { quantite: { increment: dto.quantite } },
      });
      return lotIdCible;
    }
    if (!dto.numeroLot || !dto.datePeremption) {
      throw new BadRequestException(
        'Ce produit est suivi par lot : indiquez le numéro de lot et la date de péremption.',
      );
    }
    const datePeremption = lireDatePeremption(dto.datePeremption);
    const existant = await tx.lot.findUnique({
      where: {
        produitId_emplacementId_numero: {
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          numero: dto.numeroLot,
        },
      },
    });
    if (existant) {
      this.verifierMemeDate(existant, datePeremption);
      await tx.lot.update({
        where: { id: existant.id },
        data: { quantite: { increment: dto.quantite } },
      });
      return existant.id;
    }
    const lot = await tx.lot.create({
      data: {
        entrepriseId,
        produitId: dto.produitId,
        emplacementId: dto.emplacementId,
        numero: dto.numeroLot,
        quantite: dto.quantite,
        datePeremption,
      },
    });
    return lot.id;
  }

  private verifierMemeDate(
    lot: { numero: string; datePeremption: Date | null },
    date: Date | null,
  ) {
    if ((lot.datePeremption?.getTime() ?? null) !== (date?.getTime() ?? null)) {
      throw new ConflictException(
        `Le lot ${lot.numero} existe déjà ici avec une autre date de péremption.`,
      );
    }
  }

  /** Lots non vides d'un produit à un emplacement, verrouillés, en ordre FEFO. */
  private lotsFefoVerrouilles(
    tx: TransactionPrisma,
    produitId: string,
    emplacementId: string,
  ) {
    return tx.$queryRaw<LotFefo[]>`
      SELECT id, numero, quantite,
             date_peremption AS "datePeremption", recu_at AS "recuAt"
      FROM lot
      WHERE produit_id = ${produitId} AND emplacement_id = ${emplacementId}
        AND quantite > 0
      ORDER BY date_peremption ASC NULLS LAST, recu_at ASC, numero ASC
      FOR UPDATE`;
  }

  /**
   * Sortie répartie entre les lots (FEFO, ou le seul lot désigné) : un
   * mouvement par lot traversé. Le stock a déjà été décrémenté par
   * l'appelant ; si les lots ne suffisent pas, la transaction échoue et
   * rien n'est écrit.
   */
  private async sortirDesLots(
    tx: TransactionPrisma,
    p: {
      entrepriseId: string;
      utilisateurId: string;
      produitId: string;
      emplacementId: string;
      quantite: number;
      type: 'SORTIE' | 'PERIME';
      venteId?: string;
      lotId?: string;
    },
  ) {
    const lots = await this.lotsFefoVerrouilles(
      tx,
      p.produitId,
      p.emplacementId,
    );
    const plan = repartirFefo(
      p.lotId ? lots.filter((l) => l.id === p.lotId) : lots,
      p.quantite,
    );
    if (!plan) {
      throw new ConflictException(
        'Stock insuffisant pour effectuer cette sortie.',
      );
    }
    const mouvements = [];
    for (const part of plan) {
      await tx.lot.update({
        where: { id: part.lot.id },
        data: { quantite: { decrement: part.quantite } },
      });
      mouvements.push(
        await tx.mouvement.create({
          data: {
            entrepriseId: p.entrepriseId,
            produitId: p.produitId,
            emplacementId: p.emplacementId,
            type: p.type,
            quantite: part.quantite,
            utilisateurId: p.utilisateurId,
            lotId: part.lot.id,
            venteId: p.venteId,
          },
        }),
      );
    }
    return mouvements;
  }

  /**
   * Transfert lot par lot : chaque lot garde numéro, péremption et date
   * de réception à destination (complété si le même lot y est déjà).
   */
  private async transfererDesLots(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    dto: TransfertStockDto,
  ) {
    const lots = await this.lotsFefoVerrouilles(
      tx,
      dto.produitId,
      dto.emplacementSourceId,
    );
    const cibles = dto.lotId ? lots.filter((l) => l.id === dto.lotId) : lots;
    if (dto.lotId && cibles.length === 0) {
      throw new NotFoundException(
        'Lot introuvable ou vide à l’emplacement source.',
      );
    }
    const plan = repartirFefo(cibles, dto.quantite);
    if (!plan) {
      throw new ConflictException(
        'Stock insuffisant à l’emplacement source pour effectuer ce transfert.',
      );
    }

    const mouvements = [];
    for (const { lot, quantite } of plan) {
      await tx.lot.update({
        where: { id: lot.id },
        data: { quantite: { decrement: quantite } },
      });
      const cle = {
        produitId: dto.produitId,
        emplacementId: dto.emplacementDestinationId,
        numero: lot.numero,
      };
      const existant = await tx.lot.findUnique({
        where: { produitId_emplacementId_numero: cle },
      });
      if (existant) {
        this.verifierMemeDate(existant, lot.datePeremption);
        await tx.lot.update({
          where: { id: existant.id },
          data: { quantite: { increment: quantite } },
        });
      } else {
        await tx.lot.create({
          data: {
            ...cle,
            entrepriseId,
            quantite,
            datePeremption: lot.datePeremption,
            recuAt: lot.recuAt,
          },
        });
      }
      mouvements.push(
        await tx.mouvement.create({
          data: {
            entrepriseId,
            produitId: dto.produitId,
            emplacementId: dto.emplacementSourceId,
            emplacementDestinationId: dto.emplacementDestinationId,
            type: 'TRANSFERT',
            quantite,
            utilisateurId,
            lotId: lot.id,
          },
        }),
      );
    }
    return mouvements;
  }

  /**
   * Verrou partagé sur le produit pour la durée de la transaction : une
   * activation ou désactivation du suivi par lot (qui met à jour cette
   * ligne) attend la fin du mouvement, et inversement. Sans lui, une
   * entrée lancée juste avant l'activation ajouterait du stock hors lot.
   */
  async verrouillerProduit(tx: TransactionPrisma, produitId: string) {
    await tx.$queryRaw`SELECT 1 FROM produit WHERE id = ${produitId} FOR SHARE`;
  }

  private async stockTotalProduit(
    tx: TransactionPrisma,
    produitId: string,
  ): Promise<number> {
    const result = await tx.stock.aggregate({
      where: { produitId },
      _sum: { quantite: true },
    });
    return result._sum.quantite ?? 0;
  }

  async verifierProduitEtEmplacement(
    entrepriseId: string,
    produitId: string,
    emplacementId: string,
  ) {
    const produit = await this.prisma.produit.findUnique({
      where: { id: produitId },
    });
    if (!produit || produit.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Produit introuvable.');
    }
    if (produit.archive) {
      throw new ConflictException(
        'Ce produit est archivé et ne peut plus faire l’objet de mouvements.',
      );
    }

    const emplacement = await this.prisma.emplacement.findUnique({
      where: { id: emplacementId },
    });
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Emplacement introuvable.');
    }
    if (emplacement.archive) {
      throw new ConflictException(
        'Cet emplacement est archivé et ne peut plus faire l’objet de mouvements.',
      );
    }
  }

  private async verifierFournisseur(
    entrepriseId: string,
    fournisseurId: string,
  ) {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: fournisseurId },
    });
    if (!fournisseur || fournisseur.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Fournisseur introuvable.');
    }
  }
}
