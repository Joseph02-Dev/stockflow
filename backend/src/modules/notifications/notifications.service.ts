import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { debutJour, joursRestants } from '../lots/fefo.js';
import { trancheDe } from '../lots/lots.service.js';

export type NiveauNotification = 'CRITIQUE' | 'AVERTISSEMENT' | 'INFO';
export type TypeNotification =
  | 'RUPTURE'
  | 'STOCK_FAIBLE'
  | 'LOT_PERIME'
  | 'LOT_BIENTOT_PERIME'
  | 'LOT_A_SURVEILLER';

export interface Notification {
  /** Clé stable : une aggravation (rupture, lot périmé) change de clé, donc redevient non lue. */
  cle: string;
  niveau: NiveauNotification;
  type: TypeNotification;
  /** Déclenchement de l'alerte, ou date de péremption du lot. */
  date: Date;
  lue: boolean;
  produit: { id: string; nom: string; reference: string | null; uniteMesure: string | null };
  stock?: { actuel: number; seuil: number };
  lot?: {
    id: string;
    numero: string;
    quantite: number;
    joursRestants: number;
    valeur: number;
    emplacement: string;
  };
}

const RANG: Record<NiveauNotification, number> = { CRITIQUE: 0, AVERTISSEMENT: 1, INFO: 2 };
const NIVEAU_LOT = { PERIME: 'CRITIQUE', MOINS_7: 'AVERTISSEMENT', DE_8_A_30: 'INFO' } as const;
const TYPE_LOT = {
  PERIME: 'LOT_PERIME',
  MOINS_7: 'LOT_BIENTOT_PERIME',
  DE_8_A_30: 'LOT_A_SURVEILLER',
} as const;

/** Bornes de lecture : le panneau montre l'urgent, l'écran Alertes montre tout. */
export const MAX_ALERTES = 100;
export const MAX_LOTS = 50;
/** Lectures plus anciennes purgées : un problème toujours là redevient visible. */
export const CONSERVATION_LECTURE_JOURS = 90;

const JOUR_MS = 86_400_000;

/**
 * Panneau de notifications (cloche) : alertes de stock actives et lots à
 * surveiller, calculés à la lecture. Seul l'état « lu » est stocké, par
 * utilisateur.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string, utilisateurId: string, maintenant = new Date()) {
    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { moduleLots: true },
    });

    const produit = { select: { id: true, nom: true, reference: true, uniteMesure: true } };
    const alertes = await this.prisma.alerte.findMany({
      where: { entrepriseId, statut: 'ACTIVE' },
      select: { id: true, type: true, createdAt: true, produit: { select: { ...produit.select, seuilAlerte: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ALERTES,
    });
    const stocks = await this.prisma.stock.groupBy({
      by: ['produitId'],
      where: { produitId: { in: alertes.map((a) => a.produit.id) } },
      _sum: { quantite: true },
    });
    const stockDe = new Map(stocks.map((s) => [s.produitId, s._sum.quantite ?? 0]));

    // Module Lots coupé : aucune péremption (le reste de l'application les masque aussi).
    const limite = new Date(debutJour(maintenant).getTime() + 31 * JOUR_MS);
    const lots = entreprise.moduleLots
      ? await this.prisma.lot.findMany({
          where: { entrepriseId, quantite: { gt: 0 }, datePeremption: { lt: limite } },
          select: {
            id: true,
            numero: true,
            quantite: true,
            datePeremption: true,
            emplacement: { select: { nom: true } },
            produit: { select: { ...produit.select, prixAchat: true } },
          },
          orderBy: [{ datePeremption: 'asc' }, { id: 'asc' }],
          take: MAX_LOTS,
        })
      : [];

    const notifications: Omit<Notification, 'lue'>[] = [
      ...alertes.map(({ id, type, createdAt, produit: { seuilAlerte, ...p } }) => ({
        cle: `alerte:${id}:${type}`,
        niveau: (type === 'RUPTURE' ? 'CRITIQUE' : 'AVERTISSEMENT') as NiveauNotification,
        type: type as TypeNotification,
        date: createdAt,
        produit: p,
        stock: { actuel: stockDe.get(p.id) ?? 0, seuil: seuilAlerte },
      })),
      ...lots.map(({ produit: { prixAchat, ...p }, ...lot }) => {
        const jours = joursRestants(lot.datePeremption!, maintenant);
        const tranche = trancheDe(jours) as keyof typeof NIVEAU_LOT;
        return {
          cle: `lot:${lot.id}:${tranche}`,
          niveau: NIVEAU_LOT[tranche] as NiveauNotification,
          type: TYPE_LOT[tranche] as TypeNotification,
          date: lot.datePeremption!,
          produit: p,
          lot: {
            id: lot.id,
            numero: lot.numero,
            quantite: lot.quantite,
            joursRestants: jours,
            valeur: lot.quantite * (prixAchat ?? 0),
            emplacement: lot.emplacement.nom,
          },
        };
      }),
    ].sort((a, b) => RANG[a.niveau] - RANG[b.niveau]);

    const lues = await this.prisma.notificationLue.findMany({
      where: { utilisateurId, cle: { in: notifications.map((n) => n.cle) } },
      select: { cle: true },
    });
    const dejaLues = new Set(lues.map((l) => l.cle));
    const resultat = notifications.map((n) => ({ ...n, lue: dejaLues.has(n.cle) }));
    return { notifications: resultat, nonLues: resultat.filter((n) => !n.lue).length };
  }

  async marquerLues(entrepriseId: string, utilisateurId: string, cles: string[], maintenant = new Date()) {
    await this.prisma.notificationLue.createMany({
      data: [...new Set(cles)].map((cle) => ({ entrepriseId, utilisateurId, cle })),
      skipDuplicates: true,
    });
    await this.prisma.notificationLue.deleteMany({
      where: { utilisateurId, lueLe: { lt: new Date(maintenant.getTime() - CONSERVATION_LECTURE_JOURS * JOUR_MS) } },
    });
  }
}
