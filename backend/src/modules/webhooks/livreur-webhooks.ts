import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service.js';
import { fonctionnalitesSuspendues } from '../../config/fonctionnalites.js';
import { emettreEvenement } from './emission.js';
import {
  ECHECS_AVANT_DESACTIVATION,
  MAX_TENTATIVES,
  delaiAvantNouvelleTentative,
  signer,
} from './regles-webhook.js';
import { refusUrlWebhook, reseauPriveAutorise } from './securite-url.js';
import { AdresseRefusee, posterWebhook } from './envoi-securise.js';

interface LivraisonReservee {
  id: string;
  evenement_id: string;
  abonnement_id: string;
  tentatives: number;
}

const DELAI_REPONSE_MS = 5_000;
const PAR_PASSAGE = 50;

/**
 * Livreur des webhooks : toutes les 15 s, réserve les livraisons dues
 * (FOR UPDATE SKIP LOCKED : plusieurs instances ne prennent jamais la même)
 * puis les envoie hors transaction. Échec : nouvelle tentative de plus en
 * plus espacée, abandon après 6 ; trop d'échecs consécutifs désactivent
 * l'abonnement. Coupé pour tous par FONCTIONNALITES_DESACTIVEES=webhooks.
 */
@Injectable()
export class LivreurWebhooks {
  private readonly journal = new Logger(LivreurWebhooks.name);
  private enCours = false;

  constructor(private readonly prisma: PrismaService) {}

  @Interval('livraison-webhooks', 15_000)
  async passage() {
    // En test, les passages sont déclenchés explicitement (livrer()) : un
    // passage automatique au milieu d'un test le rendrait instable.
    if (process.env.NODE_ENV === 'test') return;
    if (this.enCours || fonctionnalitesSuspendues().includes('webhooks')) return;
    this.enCours = true;
    try {
      await this.livrer();
    } catch (erreur) {
      this.journal.error(`Livraison des webhooks en échec : ${(erreur as Error).message}`);
    } finally {
      this.enCours = false;
    }
  }

  /** Un passage : renvoie le nombre de livraisons tentées. */
  async livrer(): Promise<number> {
    // Réservation : la prochaine tentative est repoussée de 2 min le temps
    // de l'envoi (une instance arrêtée en plein envoi est rattrapée ensuite).
    const reservees = await this.prisma.$queryRaw<LivraisonReservee[]>`
      UPDATE livraison_webhook
      SET prochaine_tentative_at = now() + interval '2 minutes', tentatives = tentatives + 1
      WHERE id IN (
        SELECT id FROM livraison_webhook
        WHERE statut = 'EN_ATTENTE' AND prochaine_tentative_at <= now()
        ORDER BY prochaine_tentative_at
        LIMIT ${PAR_PASSAGE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, evenement_id, abonnement_id, tentatives`;
    await Promise.allSettled(reservees.map((l) => this.envoyer(l)));
    return reservees.length;
  }

  private async envoyer(livraison: LivraisonReservee) {
    const [evenement, abonnement] = await Promise.all([
      this.prisma.evenementWebhook.findUniqueOrThrow({ where: { id: livraison.evenement_id } }),
      this.prisma.abonnementWebhook.findUniqueOrThrow({
        where: { id: livraison.abonnement_id },
        include: { entreprise: { select: { moduleWebhooks: true } } },
      }),
    ]);
    if (!abonnement.actif || !abonnement.entreprise.moduleWebhooks) {
      await this.prisma.livraisonWebhook.update({
        where: { id: livraison.id },
        data: { statut: 'ECHEC', erreur: 'Abonnement ou module désactivé.' },
      });
      return;
    }

    let codeHttp: number | null = null;
    let erreur: string | null = await refusUrlWebhook(abonnement.url);
    if (!erreur) {
      const corps = JSON.stringify({
        id: evenement.id,
        type: evenement.type,
        creeLe: evenement.createdAt.toISOString(),
        donnees: evenement.charge,
      });
      try {
        codeHttp = await posterWebhook(
          abonnement.url,
          {
            'Content-Type': 'application/json',
            // En-têtes gardés au nom d'origine : les intégrations existantes les vérifient.
            'User-Agent': 'StockFlow-Webhooks/1.0',
            'X-StockFlow-Evenement': evenement.type,
            'X-StockFlow-Livraison': livraison.id,
            'X-StockFlow-Signature': signer(abonnement.secret, Math.floor(Date.now() / 1000), corps),
          },
          corps,
          DELAI_REPONSE_MS,
          reseauPriveAutorise(),
        );
        if (codeHttp < 200 || codeHttp >= 300) erreur = `Réponse HTTP ${codeHttp}.`;
      } catch (e) {
        erreur = messageEchecEnvoi(e);
      }
    }

    if (!erreur) {
      await this.prisma.$transaction([
        this.prisma.livraisonWebhook.update({
          where: { id: livraison.id },
          data: { statut: 'LIVREE', codeHttp, erreur: null, livreeAt: new Date() },
        }),
        this.prisma.abonnementWebhook.update({ where: { id: abonnement.id }, data: { echecsConsecutifs: 0 } }),
      ]);
      return;
    }
    const abandon = livraison.tentatives >= MAX_TENTATIVES;
    const echecs = abonnement.echecsConsecutifs + 1;
    await this.prisma.$transaction([
      this.prisma.livraisonWebhook.update({
        where: { id: livraison.id },
        data: {
          statut: abandon ? 'ECHEC' : 'EN_ATTENTE',
          codeHttp,
          erreur,
          prochaineTentativeAt: new Date(Date.now() + delaiAvantNouvelleTentative(livraison.tentatives)),
        },
      }),
      this.prisma.abonnementWebhook.update({
        where: { id: abonnement.id },
        data: { echecsConsecutifs: echecs, ...(echecs >= ECHECS_AVANT_DESACTIVATION ? { actif: false } : {}) },
      }),
    ]);
  }

  /**
   * Chaque matin, « lot.peremption » : les lots en stock périmés ou sous
   * surveillance (seuil du produit, sinon de l'entreprise), par entreprise
   * abonnée.
   */
  @Cron('30 5 * * *', { name: 'webhooks-peremption', timeZone: 'Africa/Conakry' })
  async peremptionsQuotidiennes(maintenant = new Date()) {
    if (fonctionnalitesSuspendues().includes('webhooks')) return;
    const entreprises = await this.prisma.entreprise.findMany({
      where: {
        moduleWebhooks: true,
        statut: 'ACTIVE',
        abonnementsWebhook: { some: { actif: true, evenements: { has: 'lot.peremption' } } },
      },
      select: { id: true, seuilAlertePeremptionJours: true },
    });
    for (const entreprise of entreprises) {
      const lots = await this.prisma.lot.findMany({
        where: { entrepriseId: entreprise.id, quantite: { gt: 0 }, datePeremption: { not: null } },
        select: {
          id: true,
          numero: true,
          quantite: true,
          datePeremption: true,
          produit: { select: { id: true, nom: true, seuilAlertePeremption: true } },
          emplacement: { select: { id: true, nom: true } },
        },
      });
      const concernes = lots.filter((l) => {
        const seuil = l.produit.seuilAlertePeremption ?? entreprise.seuilAlertePeremptionJours;
        return l.datePeremption!.getTime() - maintenant.getTime() <= seuil * 86_400_000;
      });
      if (concernes.length === 0) continue;
      await emettreEvenement(this.prisma, entreprise.id, 'lot.peremption', {
        lots: concernes.map((l) => ({
          id: l.id,
          numero: l.numero,
          quantite: l.quantite,
          datePeremption: l.datePeremption!.toISOString().slice(0, 10),
          perime: l.datePeremption!.getTime() < maintenant.getTime(),
          produit: { id: l.produit.id, nom: l.produit.nom },
          emplacement: l.emplacement,
        })),
      });
    }
  }
}

/**
 * Motif d'échec montré à l'entreprise : jamais le message brut du système
 * (il peut décrire le réseau de l'hébergeur), seulement la cause et son code.
 */
export function messageEchecEnvoi(erreur: unknown): string {
  if (erreur instanceof AdresseRefusee) return erreur.message;
  const { name, code } = erreur as { name?: string; code?: string };
  if (name === 'TimeoutError' || name === 'AbortError') return `Pas de réponse en ${DELAI_REPONSE_MS / 1000} s.`;
  return code && /^E[A-Z_]+$/.test(code) ? `Connexion impossible au serveur destinataire (${code}).` : 'Connexion impossible au serveur destinataire.';
}
