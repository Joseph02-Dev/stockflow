import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { AlerteNotificationService } from '../alertes/alerte-notification.service.js';
import type { CreateInventaireDto } from './dto/create-inventaire.dto.js';
import type { SaisirComptageDto } from './dto/saisir-comptage.dto.js';

@Injectable()
export class InventairesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerteNotification: AlerteNotificationService,
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
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const inventaire = await tx.inventaire.create({
        data: { entrepriseId, emplacementId: dto.emplacementId, utilisateurId },
      });
      if (produitsActifs.length > 0) {
        await tx.inventaireLigne.createMany({
          data: produitsActifs.map((p) => ({ inventaireId: inventaire.id, produitId: p.id })),
        });
      }
      return inventaire;
    });
  }

  async lister(entrepriseId: string, filtres: { emplacementId?: string; statut?: 'EN_COURS' | 'TERMINE' }) {
    return this.prisma.inventaire.findMany({
      where: { entrepriseId, emplacementId: filtres.emplacementId, statut: filtres.statut },
      include: {
        emplacement: { select: { id: true, nom: true } },
        utilisateur: { select: { id: true, nom: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
      include: { produit: { select: { id: true, nom: true, reference: true, uniteMesure: true } } },
      orderBy: { produit: { nom: 'asc' } },
    });

    const stocks = await this.prisma.stock.findMany({
      where: { emplacementId: inventaire.emplacementId, produitId: { in: lignes.map((l) => l.produitId) } },
    });
    const stockParProduit = new Map(stocks.map((s) => [s.produitId, s.quantite]));

    return {
      ...inventaire,
      emplacement,
      lignes: lignes.map((ligne) => {
        const quantiteSysteme = stockParProduit.get(ligne.produitId) ?? 0;
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
      const stockActuel = await tx.stock.findUnique({
        where: {
          produitId_emplacementId: { produitId: ligne.produitId, emplacementId: inventaire.emplacementId },
        },
      });
      const quantiteSysteme = stockActuel?.quantite ?? 0;
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

      await tx.mouvement.create({
        data: {
          entrepriseId,
          produitId: ligne.produitId,
          emplacementId: inventaire.emplacementId,
          type: 'AJUSTEMENT',
          quantite: ecart,
          utilisateurId,
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
