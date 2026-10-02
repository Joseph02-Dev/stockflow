import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { JournalService } from './journal.service.js';
import { ConsoleReglagesService } from './console-reglages.service.js';
import type { PaginationDto } from './dto/pagination.dto.js';

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Au-delà, une entreprise démarrée sans aucune activité est « inactive ». */
export const JOURS_INACTIVITE = 14;

/**
 * Pic d'activité : mouvements des 7 derniers jours supérieurs à
 * MULTIPLICATEUR_PIC × la moyenne hebdomadaire des 3 semaines précédentes,
 * et au moins MIN_MOUVEMENTS_PIC (pour ignorer les petits volumes).
 */
const MULTIPLICATEUR_PIC = 3;
const MIN_MOUVEMENTS_PIC = 20;

/**
 * État affiché par la console, dérivé des données :
 * - SUSPENDUE : décision d'un opérateur (seul état stocké) ;
 * - JAMAIS_DEMARREE : aucun produit créé ;
 * - INACTIVE : aucune activité (mouvement ou connexion) depuis 14 jours ;
 * - ACTIVE : le reste.
 * « Essai expiré » n'existe pas : le schéma n'a aucune notion d'essai.
 */
export const ETATS_ENTREPRISE = ['ACTIVE', 'SUSPENDUE', 'INACTIVE', 'JAMAIS_DEMARREE'] as const;
export type EtatEntreprise = (typeof ETATS_ENTREPRISE)[number];

type Comptage = Map<string, number>;

function versCarte<T extends { entrepriseId: string; _count: { _all: number } }>(lignes: T[]): Comptage {
  return new Map(lignes.map((l) => [l.entrepriseId, l._count._all]));
}

/**
 * Consultation de la console : la seule couche de l'application qui lit
 * au-delà d'une entreprise. Lecture seule, et chaque méthode publique
 * inscrit son passage au journal d'audit.
 */
@Injectable()
export class ConsoleEntreprisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly reglages: ConsoleReglagesService,
  ) {}

  /** Agrégats de toutes les entreprises, en une poignée de requêtes groupées (jamais N+1). */
  private async agregats(maintenant = Date.now()) {
    const il30j = new Date(maintenant - 30 * JOUR_MS);
    const il7j = new Date(maintenant - 7 * JOUR_MS);
    const il28j = new Date(maintenant - 28 * JOUR_MS);

    const [emplacements, utilisateurs, produits, mouvements30j, mouvements7j, mouvements8a28j, dernierMouvement, derniereConnexion] =
      await Promise.all([
        this.prisma.emplacement.groupBy({ by: ['entrepriseId'], where: { archive: false }, _count: { _all: true } }),
        this.prisma.utilisateur.groupBy({ by: ['entrepriseId'], _count: { _all: true } }),
        this.prisma.produit.groupBy({ by: ['entrepriseId'], where: { archive: false }, _count: { _all: true } }),
        this.prisma.mouvement.groupBy({ by: ['entrepriseId'], where: { createdAt: { gte: il30j } }, _count: { _all: true } }),
        this.prisma.mouvement.groupBy({ by: ['entrepriseId'], where: { createdAt: { gte: il7j } }, _count: { _all: true } }),
        this.prisma.mouvement.groupBy({
          by: ['entrepriseId'],
          where: { createdAt: { gte: il28j, lt: il7j } },
          _count: { _all: true },
        }),
        this.prisma.mouvement.groupBy({ by: ['entrepriseId'], _max: { createdAt: true } }),
        // Dernière connexion = dernier refresh token émis (un par login).
        this.prisma.$queryRaw<{ entreprise_id: string; derniere: Date }[]>`
          SELECT u.entreprise_id, MAX(r.created_at) AS derniere
          FROM refresh_token r JOIN utilisateur u ON u.id = r.utilisateur_id
          GROUP BY u.entreprise_id`,
      ]);

    return {
      emplacements: versCarte(emplacements),
      utilisateurs: versCarte(utilisateurs),
      produits: versCarte(produits),
      mouvements30j: versCarte(mouvements30j),
      mouvements7j: versCarte(mouvements7j),
      mouvements8a28j: versCarte(mouvements8a28j),
      dernierMouvement: new Map(dernierMouvement.map((l) => [l.entrepriseId, l._max.createdAt])),
      derniereConnexion: new Map(derniereConnexion.map((l) => [l.entreprise_id, l.derniere])),
    };
  }

  private async lignesEntreprises(maintenant = Date.now()) {
    const [entreprises, a] = await Promise.all([
      this.prisma.entreprise.findMany({
        select: { id: true, nom: true, createdAt: true, statut: true, suspendueAt: true, motifSuspension: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.agregats(maintenant),
    ]);

    return entreprises.map((e) => {
      const dates = [a.dernierMouvement.get(e.id), a.derniereConnexion.get(e.id)].filter(
        (d): d is Date => d instanceof Date,
      );
      const derniereActivite = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
      const references = a.produits.get(e.id) ?? 0;
      const mouvements7j = a.mouvements7j.get(e.id) ?? 0;
      const moyenneHebdoPrecedente = (a.mouvements8a28j.get(e.id) ?? 0) / 3;

      let etat: EtatEntreprise = 'ACTIVE';
      if (e.statut === 'SUSPENDUE') etat = 'SUSPENDUE';
      else if (references === 0) etat = 'JAMAIS_DEMARREE';
      else if (!derniereActivite || maintenant - derniereActivite.getTime() > JOURS_INACTIVITE * JOUR_MS) etat = 'INACTIVE';

      return {
        ...e,
        emplacements: a.emplacements.get(e.id) ?? 0,
        utilisateurs: a.utilisateurs.get(e.id) ?? 0,
        references,
        mouvements30j: a.mouvements30j.get(e.id) ?? 0,
        derniereActivite,
        etat,
        picActivite:
          mouvements7j >= MIN_MOUVEMENTS_PIC && mouvements7j > MULTIPLICATEUR_PIC * Math.max(moyenneHebdoPrecedente, 1),
        mouvements7j,
      };
    });
  }

  async lister(operateurId: string, filtres: { recherche?: string; etat?: EtatEntreprise }) {
    const recherche = filtres.recherche?.trim().toLowerCase();
    const lignes = (await this.lignesEntreprises()).filter(
      (l) => (!recherche || l.nom.toLowerCase().includes(recherche)) && (!filtres.etat || l.etat === filtres.etat),
    );
    await this.journal.inscrire({
      operateurId,
      action: 'CONSULTATION_ENTREPRISE',
      detail: 'Liste des entreprises',
    });
    return lignes;
  }

  async apercu(operateurId: string) {
    const maintenant = Date.now();
    const [lignes, utilisateurs, references] = await Promise.all([
      this.lignesEntreprises(maintenant),
      this.prisma.utilisateur.count(),
      this.prisma.produit.count({ where: { archive: false } }),
    ]);

    const parMouvements = lignes
      .filter((l) => l.mouvements30j > 0)
      .sort((a, b) => b.mouvements30j - a.mouvements30j);
    const premieres = parMouvements.slice(0, 5);
    const autres = parMouvements.slice(5);

    await this.journal.inscrire({
      operateurId,
      action: 'CONSULTATION_ENTREPRISE',
      detail: 'Aperçu de la plateforme',
    });

    return {
      kpi: {
        entreprisesActives: lignes.filter((l) => l.statut === 'ACTIVE').length,
        entreprisesSuspendues: lignes.filter((l) => l.statut === 'SUSPENDUE').length,
        utilisateurs,
        references,
        mouvements30j: lignes.reduce((n, l) => n + l.mouvements30j, 0),
      },
      repartitionMouvements: {
        entreprises: premieres.map((l) => ({ id: l.id, nom: l.nom, mouvements: l.mouvements30j })),
        autres: {
          nombreEntreprises: autres.length,
          mouvements: autres.reduce((n, l) => n + l.mouvements30j, 0),
        },
      },
      aSurveiller: {
        inactives: lignes
          .filter((l) => l.etat === 'INACTIVE')
          .map((l) => ({ id: l.id, nom: l.nom, derniereActivite: l.derniereActivite })),
        jamaisDemarrees: lignes
          .filter((l) => l.etat === 'JAMAIS_DEMARREE')
          .map((l) => ({ id: l.id, nom: l.nom, createdAt: l.createdAt })),
        picsActivite: lignes
          .filter((l) => l.picActivite && l.statut === 'ACTIVE')
          .map((l) => ({ id: l.id, nom: l.nom, mouvements7j: l.mouvements7j })),
      },
    };
  }

  private async exiger(entrepriseId: string) {
    const entreprise = await this.prisma.entreprise.findUnique({ where: { id: entrepriseId } });
    if (!entreprise) throw new NotFoundException('Entreprise introuvable.');
    return entreprise;
  }

  async fiche(operateurId: string, entrepriseId: string) {
    const entreprise = await this.exiger(entrepriseId);
    const il30j = new Date(Date.now() - 30 * JOUR_MS);
    const where = { entrepriseId };

    const [
      utilisateurs,
      emplacements,
      references,
      fournisseurs,
      mouvements30j,
      mouvementsTotal,
      alertesActives,
      commandesEnCours,
      stockParEmplacement,
      dernierMouvement,
      reglages,
    ] = await Promise.all([
      // Champs choisis un à un : jamais de hash de mot de passe ni de jeton.
      this.prisma.utilisateur.findMany({
        where,
        select: {
          id: true,
          nom: true,
          email: true,
          role: true,
          createdAt: true,
          emailVerifieAt: true,
          refreshTokens: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.emplacement.findMany({
        where,
        select: { id: true, nom: true, adresse: true, archive: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.produit.count({ where: { ...where, archive: false } }),
      this.prisma.fournisseur.count({ where }),
      this.prisma.mouvement.count({ where: { ...where, createdAt: { gte: il30j } } }),
      this.prisma.mouvement.count({ where }),
      this.prisma.alerte.count({ where: { ...where, statut: 'ACTIVE' } }),
      this.prisma.commandeFournisseur.count({ where: { ...where, statut: { in: ['BROUILLON', 'ENVOYEE'] } } }),
      this.prisma.stock.groupBy({
        by: ['emplacementId'],
        where: { emplacement: where, quantite: { gt: 0 } },
        _count: { _all: true },
        _sum: { quantite: true },
      }),
      this.prisma.mouvement.findFirst({ where, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.reglages.lire(entrepriseId),
    ]);

    await this.journal.inscrire({ operateurId, action: 'CONSULTATION_ENTREPRISE', entrepriseId, detail: 'Fiche entreprise' });

    const stock = new Map(stockParEmplacement.map((s) => [s.emplacementId, s]));
    const connexions = utilisateurs.map((u) => u.refreshTokens[0]?.createdAt).filter((d): d is Date => !!d);
    const dates = [dernierMouvement?.createdAt, ...connexions].filter((d): d is Date => !!d);

    return {
      entreprise: {
        id: entreprise.id,
        nom: entreprise.nom,
        createdAt: entreprise.createdAt,
        secteurActivite: entreprise.secteurActivite,
        statut: entreprise.statut,
        suspendueAt: entreprise.suspendueAt,
        motifSuspension: entreprise.motifSuspension,
      },
      synthese: {
        utilisateurs: utilisateurs.length,
        sessionsActives: utilisateurs.reduce((n, u) => n + u._count.refreshTokens, 0),
        emplacements: emplacements.filter((e) => !e.archive).length,
        references,
        fournisseurs,
        mouvements30j,
        mouvementsTotal,
        alertesActives,
        commandesEnCours,
        derniereActivite: dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
      },
      reglages,
      emplacements: emplacements.map((e) => ({
        ...e,
        referencesEnStock: stock.get(e.id)?._count._all ?? 0,
        quantiteTotale: stock.get(e.id)?._sum.quantite ?? 0,
      })),
      utilisateurs: utilisateurs.map((u) => ({
        id: u.id,
        nom: u.nom,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        emailVerifie: u.emailVerifieAt !== null,
        derniereConnexion: u.refreshTokens[0]?.createdAt ?? null,
        sessionsActives: u._count.refreshTokens,
      })),
    };
  }

  async stock(operateurId: string, entrepriseId: string, pagination: PaginationDto) {
    await this.exiger(entrepriseId);
    const where = { entrepriseId, archive: false };
    const [total, produits] = await Promise.all([
      this.prisma.produit.count({ where }),
      this.prisma.produit.findMany({
        where,
        select: {
          id: true,
          nom: true,
          reference: true,
          seuilAlerte: true,
          uniteMesure: true,
          stocks: { select: { quantite: true } },
        },
        orderBy: { nom: 'asc' },
        skip: (pagination.page - 1) * pagination.taille,
        take: pagination.taille,
      }),
    ]);

    await this.journal.inscrire({
      operateurId,
      action: 'CONSULTATION_ENTREPRISE',
      entrepriseId,
      detail: `Stock, page ${pagination.page}`,
    });

    return {
      total,
      page: pagination.page,
      taille: pagination.taille,
      elements: produits.map(({ stocks, ...p }) => ({ ...p, quantite: stocks.reduce((n, s) => n + s.quantite, 0) })),
    };
  }

  async mouvements(operateurId: string, entrepriseId: string, pagination: PaginationDto) {
    await this.exiger(entrepriseId);
    const where = { entrepriseId };
    const [total, elements] = await Promise.all([
      this.prisma.mouvement.count({ where }),
      this.prisma.mouvement.findMany({
        where,
        select: {
          id: true,
          type: true,
          quantite: true,
          createdAt: true,
          produit: { select: { nom: true, reference: true } },
          emplacement: { select: { nom: true } },
          emplacementDestination: { select: { nom: true } },
          utilisateur: { select: { nom: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.taille,
        take: pagination.taille,
      }),
    ]);

    await this.journal.inscrire({
      operateurId,
      action: 'CONSULTATION_ENTREPRISE',
      entrepriseId,
      detail: `Mouvements, page ${pagination.page}`,
    });

    return { total, page: pagination.page, taille: pagination.taille, elements };
  }
}
