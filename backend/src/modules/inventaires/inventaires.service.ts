import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { AlerteNotificationService } from '../alertes/alerte-notification.service.js';
import type { CreateInventaireDto } from './dto/create-inventaire.dto.js';
import type { SaisirComptageDto } from './dto/saisir-comptage.dto.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';

@Injectable()
export class InventairesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerteNotification: AlerteNotificationService,
    private readonly mouvements: MouvementsService,
  ) {}

  /**
   * Crée une session d'inventaire portant sur tout le catalogue actif de
   * l'entreprise (décision validée) — une InventaireLigne par produit non
   * archivé, même pour un produit qui n'a jamais eu de stock à cet
   * emplacement : un comptage doit pouvoir révéler sa présence physique
   * inattendue autant que son absence.
   */
  async creer(entrepriseId: string, utilisateurId: string, dto: CreateInventaireDto) {
    const emplacement = await this.prisma.emplacement.findUnique({ where: { id: dto.emplacementId } });
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Emplacement introuvable.');
    }
    if (emplacement.archive) {
      throw new ConflictException('Cet emplacement est archivé et ne peut plus faire l’objet d’un inventaire.');
    }

    const produitsActifs = await this.prisma.produit.findMany({
      where: { entrepriseId, archive: false },
      select: { id: true, suiviParLot: true },
    });
    // Produit suivi par lot : une ligne par lot en stock à l'emplacement
    // (un lot inconnu se déclare par une réception, avec sa date).
    const lots = await this.prisma.lot.findMany({
      where: {
        emplacementId: dto.emplacementId,
        quantite: { gt: 0 },
        produitId: { in: produitsActifs.filter((p) => p.suiviParLot).map((p) => p.id) },
      },
      select: { id: true, produitId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const inventaire = await tx.inventaire.create({
        data: { entrepriseId, emplacementId: dto.emplacementId, utilisateurId },
      });
      const lignes = [
        ...produitsActifs.filter((p) => !p.suiviParLot).map((p) => ({ inventaireId: inventaire.id, produitId: p.id })),
        ...lots.map((l) => ({ inventaireId: inventaire.id, produitId: l.produitId, lotId: l.id })),
      ];
      if (lignes.length > 0) {
        await tx.inventaireLigne.createMany({ data: lignes });
      }
      return inventaire;
    });
  }

  async lister(entrepriseId: string, filtres: { emplacementId?: string; statut?: 'EN_COURS' | 'TERMINE' }) {
    const elements = await this.prisma.inventaire.findMany({
      where: { entrepriseId, emplacementId: filtres.emplacementId, statut: filtres.statut },
      include: {
        emplacement: { select: { id: true, nom: true } },
        utilisateur: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Nombre de lignes compté pour les seuls inventaires listés : un `_count`
    // Prisma agrégerait les lignes de toutes les entreprises à chaque appel.
    const comptes = await this.prisma.inventaireLigne.groupBy({
      by: ['inventaireId'],
      where: { inventaireId: { in: elements.map((e) => e.id) } },
      _count: { _all: true },
    });
    const parId = new Map(comptes.map((c) => [c.inventaireId, c._count._all]));
    return elements.map((e) => ({ ...e, _count: { lignes: parId.get(e.id) ?? 0 } }));
  }

  /**
   * Détail complet avec, pour chaque ligne, le stock RÉEL actuel (pas un
   * instantané pris à la création) et l'écart qui en découle — voir la
   * justification dans le schéma Prisma.
   */
  async obtenir(entrepriseId: string, inventaireId: string) {
    const inventaire = await this.trouverOuEchouer(entrepriseId, inventaireId);
    const emplacement = await this.prisma.emplacement.findUniqueOrThrow({
      where: { id: inventaire.emplacementId },
      select: { id: true, nom: true },
    });

    const lignes = await this.prisma.inventaireLigne.findMany({
      where: { inventaireId },
      include: {
        produit: { select: { id: true, nom: true, reference: true, uniteMesure: true } },
        lot: { select: { id: true, numero: true, quantite: true, datePeremption: true } },
      },
      orderBy: [{ produit: { nom: 'asc' } }, { lot: { datePeremption: 'asc' } }],
    });

    const stocks = await this.prisma.stock.findMany({
      where: { emplacementId: inventaire.emplacementId, produitId: { in: lignes.map((l) => l.produitId) } },
    });
    const stockParProduit = new Map(stocks.map((s) => [s.produitId, s.quantite]));

    return {
      ...inventaire,
      emplacement,
      lignes: lignes.map((ligne) => {
        // Ligne d'un lot : comparée au lot, pas au stock total du produit.
        const quantiteSysteme = ligne.lot ? ligne.lot.quantite : (stockParProduit.get(ligne.produitId) ?? 0);
        return {
          ...ligne,
          quantiteSysteme,
          ecart: ligne.quantiteComptee !== null ? ligne.quantiteComptee - quantiteSysteme : null,
        };
      }),
    };
  }

  /** Saisie ou correction d'un comptage — uniquement pendant EN_COURS. */
  async saisirComptage(entrepriseId: string, inventaireId: string, ligneId: string, dto: SaisirComptageDto) {
    const inventaire = await this.trouverOuEchouer(entrepriseId, inventaireId);
    if (inventaire.statut !== 'EN_COURS') {
      throw new ConflictException('Cet inventaire est terminé : les comptages ne sont plus modifiables.');
    }
    const ligne = await this.trouverLigneOuEchouer(inventaireId, ligneId);

    return this.prisma.inventaireLigne.update({
      where: { id: ligne.id },
      data: { quantiteComptee: dto.quantiteComptee },
    });
  }

  /** Verrouille les comptages ; rend les écarts disponibles à la validation. */
  async terminer(entrepriseId: string, inventaireId: string) {
    const inventaire = await this.trouverOuEchouer(entrepriseId, inventaireId);
    if (inventaire.statut !== 'EN_COURS') {
      throw new ConflictException('Cet inventaire est déjà terminé.');
    }
    return this.prisma.inventaire.update({
      where: { id: inventaireId },
      data: { statut: 'TERMINE', termineAt: new Date() },
    });
  }

  /**
   * Applique la correction pour une ligne : crée un mouvement
   * d'ajustement (quantité signée) et met à jour le stock en
   * conséquence. Contrairement à un transfert, un ajustement change bel
   * et bien le stock total de l'entreprise — les alertes sont donc
   * réévaluées, exactement comme pour une entrée ou une sortie.
   */
  async validerLigne(entrepriseId: string, utilisateurId: string, inventaireId: string, ligneId: string) {
    const inventaire = await this.trouverOuEchouer(entrepriseId, inventaireId);
    if (inventaire.statut !== 'TERMINE') {
      throw new ConflictException('L’inventaire doit être terminé avant de valider un écart.');
    }
    const ligne = await this.trouverLigneOuEchouer(inventaireId, ligneId);
    if (ligne.statutAjustement !== 'EN_ATTENTE') {
      throw new ConflictException('Cette ligne a déjà été traitée.');
    }
    if (ligne.quantiteComptee === null) {
      throw new ConflictException('Cette ligne n’a pas été comptée.');
    }

    const resultat = await this.prisma.$transaction(async (tx) => {
      // Même verrou que les mouvements : le suivi par lot ne peut pas
      // basculer pendant l'ajustement.
      await this.mouvements.verrouillerProduit(tx, ligne.produitId);
      const { suiviParLot } = await tx.produit.findUniqueOrThrow({
        where: { id: ligne.produitId },
        select: { suiviParLot: true },
      });
      if (suiviParLot && !ligne.lotId) {
        throw new ConflictException(
          'Ce produit est suivi par lot : un ajustement doit porter sur un lot précis. Ouvrez un nouvel inventaire.',
        );
      }
      if (!suiviParLot && ligne.lotId) {
        throw new ConflictException('Ce produit n’est plus suivi par lot : ouvrez un nouvel inventaire.');
      }

      // Verrous dans l'ordre des mouvements : stock, puis lot.
      await tx.$queryRaw`SELECT 1 FROM stock WHERE produit_id = ${ligne.produitId} AND emplacement_id = ${inventaire.emplacementId} FOR UPDATE`;
      const stockActuel = await tx.stock.findUnique({
        where: {
          produitId_emplacementId: { produitId: ligne.produitId, emplacementId: inventaire.emplacementId },
        },
      });
      const lotActuel = ligne.lotId
        ? (await tx.$queryRaw<{ quantite: number }[]>`SELECT quantite FROM lot WHERE id = ${ligne.lotId} FOR UPDATE`)[0]
        : undefined;
      const quantiteSysteme = lotActuel ? lotActuel.quantite : (stockActuel?.quantite ?? 0);
      const ecart = ligne.quantiteComptee! - quantiteSysteme;

      if (ecart === 0) {
        throw new ConflictException('Aucun écart à valider : le stock correspond déjà au comptage.');
      }

      await tx.stock.upsert({
        where: {
          produitId_emplacementId: { produitId: ligne.produitId, emplacementId: inventaire.emplacementId },
        },
        create: { produitId: ligne.produitId, emplacementId: inventaire.emplacementId, quantite: ecart },
        update: { quantite: { increment: ecart } },
      });

      if (ligne.lotId) {
        await tx.lot.update({ where: { id: ligne.lotId }, data: { quantite: { increment: ecart } } });
      }

      await tx.mouvement.create({
        data: {
          entrepriseId,
          produitId: ligne.produitId,
          emplacementId: inventaire.emplacementId,
          type: 'AJUSTEMENT',
          quantite: ecart,
          utilisateurId,
          lotId: ligne.lotId,
        },
      });

      await tx.inventaireLigne.update({
        where: { id: ligne.id },
        data: { statutAjustement: 'VALIDEE', valideParId: utilisateurId, valideAt: new Date() },
      });

      // Un ajustement change le stock total : mêmes règles de
      // déclenchement/résolution d'alerte qu'une entrée ou une sortie.
      const stockTotal = await this.stockTotalProduit(tx, ligne.produitId);
      const produit = await tx.produit.findUniqueOrThrow({ where: { id: ligne.produitId } });
      let alerteANotifier: { type: 'STOCK_FAIBLE' | 'RUPTURE'; produitNom: string; quantite: number } | null = null;

      const alerteActive = await tx.alerte.findFirst({ where: { produitId: ligne.produitId, statut: 'ACTIVE' } });

      if (stockTotal < produit.seuilAlerte || stockTotal === 0) {
        const typeAlerte = stockTotal === 0 ? 'RUPTURE' : 'STOCK_FAIBLE';
        if (alerteActive) {
          if (alerteActive.type !== typeAlerte) {
            await tx.alerte.update({
              where: { id: alerteActive.id },
              data: { type: typeAlerte, quantiteAuDeclenchement: stockTotal },
            });
            alerteANotifier = { type: typeAlerte, produitNom: produit.nom, quantite: stockTotal };
          }
        } else {
          await tx.alerte.create({
            data: { entrepriseId, produitId: ligne.produitId, type: typeAlerte, quantiteAuDeclenchement: stockTotal },
          });
          alerteANotifier = { type: typeAlerte, produitNom: produit.nom, quantite: stockTotal };
        }
      } else if (alerteActive) {
        await tx.alerte.update({ where: { id: alerteActive.id }, data: { statut: 'RESOLUE', resolvedAt: new Date() } });
      }

      return { ecart, alerteANotifier };
    });

    // Notification envoyée après le commit, comme pour MVT-002 : un échec
    // d'email ne doit jamais annuler une correction déjà validée.
    if (resultat.alerteANotifier) {
      await this.alerteNotification.notifierAlerte(
        entrepriseId,
        resultat.alerteANotifier.produitNom,
        resultat.alerteANotifier.type,
        resultat.alerteANotifier.quantite,
      );
    }

    return { ecartApplique: resultat.ecart };
  }

  /** Écarte un écart sans toucher au stock (ex. erreur de comptage assumée). */
  async ignorerLigne(entrepriseId: string, inventaireId: string, ligneId: string) {
    const inventaire = await this.trouverOuEchouer(entrepriseId, inventaireId);
    if (inventaire.statut !== 'TERMINE') {
      throw new ConflictException('L’inventaire doit être terminé avant de traiter un écart.');
    }
    const ligne = await this.trouverLigneOuEchouer(inventaireId, ligneId);
    if (ligne.statutAjustement !== 'EN_ATTENTE') {
      throw new ConflictException('Cette ligne a déjà été traitée.');
    }

    return this.prisma.inventaireLigne.update({
      where: { id: ligne.id },
      data: { statutAjustement: 'IGNOREE' },
    });
  }

  private async stockTotalProduit(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    produitId: string,
  ): Promise<number> {
    const result = await tx.stock.aggregate({ where: { produitId }, _sum: { quantite: true } });
    return result._sum.quantite ?? 0;
  }

  private async trouverOuEchouer(entrepriseId: string, inventaireId: string) {
    const inventaire = await this.prisma.inventaire.findUnique({ where: { id: inventaireId } });
    if (!inventaire || inventaire.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Inventaire introuvable.');
    }
    return inventaire;
  }

  private async trouverLigneOuEchouer(inventaireId: string, ligneId: string) {
    const ligne = await this.prisma.inventaireLigne.findUnique({ where: { id: ligneId } });
    if (!ligne || ligne.inventaireId !== inventaireId) {
      throw new NotFoundException('Ligne d’inventaire introuvable.');
    }
    return ligne;
  }
}
