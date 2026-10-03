import {
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

/** Client Prisma d'une transaction en cours. */
export type TransactionPrisma = Parameters<
  Parameters<PrismaService['$transaction']>[0]
>[0];

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
   */
  async entreeDansTransaction(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    dto: EntreeStockDto,
  ) {
    {
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

      const mouvement = await tx.mouvement.create({
        data: {
          entrepriseId,
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          type: 'ENTREE',
          quantite: dto.quantite,
          fournisseurId: dto.fournisseurId,
          utilisateurId,
        },
      });

      const stockTotal = await this.stockTotalProduit(tx, dto.produitId);
      const produit = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
      });

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

    return resultat.mouvement;
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
  ) {
    {
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

      const mouvement = await tx.mouvement.create({
        data: {
          entrepriseId,
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          type: 'SORTIE',
          quantite: dto.quantite,
          utilisateurId,
        },
      });

      const stockTotal = await this.stockTotalProduit(tx, dto.produitId);
      const produit = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
      });
      let alerteANotifier: AlerteANotifier | null = null;

      if (stockTotal < produit.seuilAlerte || stockTotal === 0) {
        const typeAlerte = stockTotal === 0 ? 'RUPTURE' : 'STOCK_FAIBLE';
        const alerteActive = await tx.alerte.findFirst({
          where: { produitId: dto.produitId, statut: 'ACTIVE' },
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
              produitId: dto.produitId,
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

      return { mouvement, alerteANotifier };
    }
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

    return this.prisma.$transaction(async (tx) => {
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

      return tx.mouvement.create({
        data: {
          entrepriseId,
          produitId: dto.produitId,
          emplacementId: dto.emplacementSourceId,
          emplacementDestinationId: dto.emplacementDestinationId,
          type: 'TRANSFERT',
          quantite: dto.quantite,
          utilisateurId,
        },
      });
    });
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
