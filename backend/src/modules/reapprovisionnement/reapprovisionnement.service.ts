import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransactionPrisma } from '../stock/moteur-stock.js';
import type { CreerRegleReapproDto, ModifierRegleReapproDto } from './dto/regle-reappro.dto.js';
import { fournisseurRetenu, quantiteACommander, sousEmplacements } from './calcul-reappro.js';

export interface ResultatReappro {
  commandes: { id: string; fournisseur: string; emplacement: string; lignes: number }[];
  ignorees: { produit: string; emplacement: string; motif: string }[];
}

/**
 * Réapprovisionnement automatique (module « reapprovisionnement ») : règles
 * min/max par produit et emplacement, et calcul qui génère des brouillons
 * de commande fournisseur — jamais d'envoi automatique, un humain relit.
 * Lancé chaque jour par ReapproPlanificateur, ou à la demande.
 */
@Injectable()
export class ReapprovisionnementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Règles avec, pour chacune, le stock prévisionnel et la quantité à commander. */
  async lister(entrepriseId: string) {
    const regles = await this.prisma.regleReapprovisionnement.findMany({
      where: { entrepriseId },
      include: {
        produit: { select: { id: true, nom: true, reference: true, uniteMesure: true } },
        emplacement: { select: { id: true, nom: true } },
        fournisseur: { select: { id: true, nom: true } },
      },
      orderBy: [{ produit: { nom: 'asc' } }, { emplacement: { nom: 'asc' } }],
    });
    const etats = await this.etats(this.prisma, entrepriseId, regles);
    return regles.map((r, i) => ({ ...r, ...etats[i] }));
  }

  async creer(entrepriseId: string, dto: CreerRegleReapproDto) {
    await this.verifierReferences(entrepriseId, dto);
    this.verifierBornes(dto.stockMin, dto.stockMax);
    try {
      return await this.prisma.regleReapprovisionnement.create({
        data: {
          entrepriseId,
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          fournisseurId: dto.fournisseurId ?? null,
          stockMin: dto.stockMin,
          stockMax: dto.stockMax,
          multiple: dto.multiple ?? 1,
        },
      });
    } catch (erreur) {
      const doublon = erreur instanceof Object && 'code' in erreur && (erreur as { code: unknown }).code === 'P2002';
      if (doublon) throw new ConflictException('Ce produit a déjà une règle pour cet emplacement : modifiez-la.');
      throw erreur;
    }
  }

  async modifier(entrepriseId: string, id: string, dto: ModifierRegleReapproDto) {
    const regle = await this.regleOuEchouer(entrepriseId, id);
    if (dto.fournisseurId) await this.verifierFournisseur(entrepriseId, dto.fournisseurId);
    this.verifierBornes(dto.stockMin ?? regle.stockMin, dto.stockMax ?? regle.stockMax);
    return this.prisma.regleReapprovisionnement.update({ where: { id }, data: dto });
  }

  /** Une règle ne porte aucun historique : suppression réelle. */
  async supprimer(entrepriseId: string, id: string) {
    await this.regleOuEchouer(entrepriseId, id);
    await this.prisma.regleReapprovisionnement.delete({ where: { id } });
    return { supprimee: true };
  }

  /**
   * Calcul : pour chaque règle active sous son minimum, une ligne dans un
   * brouillon de commande par (fournisseur, emplacement). Idempotent : les
   * brouillons comptent dans le prévisionnel, un second calcul ne
   * recommande rien. Le verrou consultatif par entreprise sérialise les
   * calculs simultanés (planificateur sur plusieurs instances, clic).
   *
   * `attendre` faux (planificateur) : si un autre calcul tient le verrou,
   * celui-ci s'efface au lieu d'attendre ; renvoie alors null.
   */
  async lancer(entrepriseId: string, utilisateurId?: string, attendre = true): Promise<ResultatReappro | null> {
    const auteur = utilisateurId ?? (await this.administrateurDe(entrepriseId));
    return this.prisma.$transaction(
      async (tx) => {
        const cle = `reappro:${entrepriseId}`;
        if (attendre) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cle}))`;
        } else {
          const [{ obtenu }] = await tx.$queryRaw<{ obtenu: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(hashtext(${cle})) AS obtenu`;
          if (!obtenu) return null;
        }

        const regles = await tx.regleReapprovisionnement.findMany({
          where: { entrepriseId, actif: true, produit: { archive: false }, emplacement: { archive: false } },
          include: {
            produit: { select: { nom: true, fournisseursAssocies: { select: { fournisseurId: true } } } },
            emplacement: { select: { nom: true } },
          },
        });
        const etats = await this.etats(tx, entrepriseId, regles);
        const resultat: ResultatReappro = { commandes: [], ignorees: [] };
        const groupes = new Map<string, { fournisseurId: string; emplacementId: string; lignes: Map<string, number> }>();

        regles.forEach((regle, i) => {
          const quantite = etats[i].aCommander;
          if (quantite === 0) return;
          const fournisseurId = fournisseurRetenu(
            regle.fournisseurId,
            regle.produit.fournisseursAssocies.map((a) => a.fournisseurId),
          );
          if (!fournisseurId) {
            resultat.ignorees.push({
              produit: regle.produit.nom,
              emplacement: regle.emplacement.nom,
              motif: 'Aucun fournisseur : choisissez-en un sur la règle, ou associez-en un seul au produit.',
            });
            return;
          }
          const cleGroupe = `${fournisseurId}|${regle.emplacementId}`;
          const groupe = groupes.get(cleGroupe) ?? { fournisseurId, emplacementId: regle.emplacementId, lignes: new Map() };
          groupe.lignes.set(regle.produitId, quantite);
          groupes.set(cleGroupe, groupe);
        });

        for (const groupe of groupes.values()) {
          const commande = await tx.commandeFournisseur.create({
            data: {
              entrepriseId,
              fournisseurId: groupe.fournisseurId,
              emplacementId: groupe.emplacementId,
              utilisateurId: auteur,
              automatique: true,
              lignes: {
                create: [...groupe.lignes].map(([produitId, quantiteCommandee]) => ({ produitId, quantiteCommandee })),
              },
            },
            include: { fournisseur: { select: { nom: true } }, emplacement: { select: { nom: true } } },
          });
          resultat.commandes.push({
            id: commande.id,
            fournisseur: commande.fournisseur.nom,
            emplacement: commande.emplacement.nom,
            lignes: groupe.lignes.size,
          });
        }
        await tx.entreprise.update({ where: { id: entrepriseId }, data: { dernierReapproAt: new Date() } });
        return resultat;
      },
      { timeout: 60_000 },
    );
  }

  /**
   * Stock prévisionnel de chaque règle : en stock + reste des commandes
   * fournisseur en cours (brouillon ou envoyée), à l'emplacement de la
   * règle ET à ses sous-emplacements (arborescence) — comme Odoo, et pour
   * qu'une règle de rangement qui envoie la marchandise vers une zone
   * fille ne déclenche pas une recommande chaque jour.
   */
  private async etats(
    client: TransactionPrisma | PrismaService,
    entrepriseId: string,
    regles: { produitId: string; emplacementId: string; stockMin: number; stockMax: number; multiple: number }[],
  ) {
    if (regles.length === 0) return [];
    const produitIds = [...new Set(regles.map((r) => r.produitId))];
    const [emplacements, stocks, entrants] = await Promise.all([
      client.emplacement.findMany({ where: { entrepriseId }, select: { id: true, parentId: true } }),
      client.stock.findMany({ where: { produitId: { in: produitIds } }, select: { produitId: true, emplacementId: true, quantite: true } }),
      client.commandeLigne.findMany({
        where: { produitId: { in: produitIds }, commande: { statut: { in: ['BROUILLON', 'ENVOYEE'] } } },
        select: { produitId: true, quantiteCommandee: true, commande: { select: { emplacementId: true } } },
      }),
    ]);
    const sousArbre = sousEmplacements(emplacements);
    const somme = (lignes: { produitId: string; emplacementId: string; quantite: number }[], r: { produitId: string; emplacementId: string }) => {
      const arbre = sousArbre(r.emplacementId);
      return lignes.filter((l) => l.produitId === r.produitId && arbre.has(l.emplacementId)).reduce((t, l) => t + l.quantite, 0);
    };
    const commandes = entrants.map((e) => ({ produitId: e.produitId, emplacementId: e.commande.emplacementId, quantite: e.quantiteCommandee }));
    return regles.map((r) => {
      const stock = somme(stocks, r);
      const entrant = somme(commandes, r);
      const previsionnel = stock + entrant;
      return {
        enStock: stock,
        enCommande: entrant,
        previsionnel,
        aCommander: quantiteACommander(previsionnel, r.stockMin, r.stockMax, r.multiple),
      };
    });
  }

  /** Auteur des brouillons générés par le planificateur : le plus ancien administrateur actif. */
  private async administrateurDe(entrepriseId: string) {
    const admin = await this.prisma.utilisateur.findFirst({
      where: { entrepriseId, role: 'ADMIN', desactiveAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) throw new ConflictException('Aucun administrateur actif pour signer les brouillons de commande.');
    return admin.id;
  }

  private verifierBornes(min: number, max: number) {
    if (max < min) throw new BadRequestException('Le stock maximum doit être supérieur ou égal au minimum.');
  }

  private async regleOuEchouer(entrepriseId: string, id: string) {
    const regle = await this.prisma.regleReapprovisionnement.findUnique({ where: { id } });
    if (!regle || regle.entrepriseId !== entrepriseId) throw new NotFoundException('Règle introuvable.');
    return regle;
  }

  private async verifierReferences(entrepriseId: string, dto: CreerRegleReapproDto) {
    const [produit, emplacement] = await Promise.all([
      this.prisma.produit.findUnique({ where: { id: dto.produitId }, select: { entrepriseId: true, archive: true } }),
      this.prisma.emplacement.findUnique({ where: { id: dto.emplacementId }, select: { entrepriseId: true, archive: true } }),
    ]);
    if (!produit || produit.entrepriseId !== entrepriseId) throw new NotFoundException('Produit introuvable.');
    if (produit.archive) throw new ConflictException('Ce produit est archivé.');
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) throw new NotFoundException('Emplacement introuvable.');
    if (emplacement.archive) throw new ConflictException('Cet emplacement est archivé.');
    if (dto.fournisseurId) await this.verifierFournisseur(entrepriseId, dto.fournisseurId);
  }

  private async verifierFournisseur(entrepriseId: string, fournisseurId: string) {
    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id: fournisseurId }, select: { entrepriseId: true } });
    if (!fournisseur || fournisseur.entrepriseId !== entrepriseId) throw new NotFoundException('Fournisseur introuvable.');
  }
}
