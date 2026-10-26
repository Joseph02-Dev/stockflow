import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';
import { adresseSite, composerEmail } from '../../common/email/gabarit-email.js';
import { joursRestants } from '../lots/fefo.js';
import { PushService } from './push.service.js';

/** Étape de péremption d'un lot ; seul un passage à une nouvelle étape est signalé. */
export type EtapePeremption = 'SURVEILLANCE' | 'MOINS_7' | 'PERIME';

/** Lots détaillés dans l'email ; au-delà, l'écran Péremptions donne la suite. */
const LOTS_AFFICHES = 20;

export function etapePeremption(jours: number, seuilJours: number): EtapePeremption | null {
  if (jours < 0) return 'PERIME';
  if (jours <= 7) return 'MOINS_7';
  return jours <= seuilJours ? 'SURVEILLANCE' : null;
}

interface LotSignale {
  numero: string;
  produit: string;
  emplacement: string;
  jours: number;
  etape: EtapePeremption;
}

function echeance(lot: LotSignale): string {
  if (lot.jours < 0) return 'périmé';
  if (lot.jours === 0) return 'expire aujourd’hui';
  if (lot.jours === 1) return 'expire demain';
  return `expire dans ${lot.jours} jours`;
}

/**
 * Péremptions : chaque matin à 7 h (heure de Conakry), un email et une
 * notification push par entreprise, seulement pour les lots qui viennent
 * d'entrer en surveillance (seuil du produit, sinon de l'entreprise),
 * de passer à moins de 7 jours ou d'être périmés. Un lot déjà signalé à
 * la même étape ne l'est plus : pas de rappel quotidien.
 *
 * L'étape signalée est enregistrée à part (peremption_signalee, la table
 * lot n'étant écrite que par le moteur de stock), par une écriture
 * conditionnelle : avec plusieurs instances, une seule signale chaque lot.
 */
@Injectable()
export class PeremptionPlanificateur {
  private readonly journal = new Logger(PeremptionPlanificateur.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly push: PushService,
  ) {}

  @Cron('0 7 * * *', { name: 'peremptions-notifications', timeZone: 'Africa/Conakry' })
  async signalerQuotidien(maintenant = new Date()): Promise<void> {
    const entreprises = await this.prisma.entreprise.findMany({
      where: { moduleLots: true, statut: 'ACTIVE' },
      select: { id: true, nom: true, seuilAlertePeremptionJours: true },
    });
    for (const entreprise of entreprises) {
      try {
        await this.signaler(entreprise, maintenant);
      } catch (erreur) {
        this.journal.error(`Péremptions de ${entreprise.id} non signalées : ${(erreur as Error).message}`);
      }
    }
  }

  async signaler(entreprise: { id: string; nom: string; seuilAlertePeremptionJours: number }, maintenant: Date): Promise<number> {
    const lots = await this.prisma.lot.findMany({
      where: { entrepriseId: entreprise.id, quantite: { gt: 0 }, datePeremption: { not: null } },
      select: {
        id: true,
        numero: true,
        datePeremption: true,
        peremptionSignalee: { select: { etape: true } },
        produit: { select: { nom: true, seuilAlertePeremption: true } },
        emplacement: { select: { nom: true } },
      },
      orderBy: [{ datePeremption: 'asc' }, { id: 'asc' }],
    });

    const signales: LotSignale[] = [];
    for (const lot of lots) {
      const jours = joursRestants(lot.datePeremption!, maintenant);
      const etape = etapePeremption(jours, lot.produit.seuilAlertePeremption ?? entreprise.seuilAlertePeremptionJours);
      if (!etape || etape === lot.peremptionSignalee?.etape) continue;
      // Une ligne revient seulement si l'étape est nouvelle pour ce lot.
      const reserve = await this.prisma.$queryRaw<{ lot_id: string }[]>`
        INSERT INTO peremption_signalee (lot_id, entreprise_id, etape) VALUES (${lot.id}, ${entreprise.id}, ${etape})
        ON CONFLICT (lot_id) DO UPDATE SET etape = EXCLUDED.etape, signalee_at = now()
        WHERE peremption_signalee.etape IS DISTINCT FROM EXCLUDED.etape
        RETURNING lot_id`;
      if (reserve.length === 1) signales.push({ numero: lot.numero, produit: lot.produit.nom, emplacement: lot.emplacement.nom, jours, etape });
    }
    if (signales.length === 0) return 0;

    const perimes = signales.filter((l) => l.etape === 'PERIME').length;
    const titre = perimes > 0 ? 'Lots périmés en stock' : 'Lots bientôt périmés';
    const resume =
      signales.length === 1
        ? `${signales[0].produit} (lot ${signales[0].numero}) ${echeance(signales[0])}.`
        : `${signales.length} lots à traiter, dont ${perimes} périmé${perimes > 1 ? 's' : ''}.`;

    await this.push.envoyer(entreprise.id, { titre, corps: resume, url: '/peremptions', etiquette: 'peremptions' });

    const destinataires = await this.prisma.utilisateur.findMany({
      where: { entrepriseId: entreprise.id, desactiveAt: null },
      select: { email: true },
    });
    const affiches = signales.slice(0, LOTS_AFFICHES);
    const contenu = composerEmail({
      apercu: resume,
      titre,
      paragraphes: [
        signales.length === 1
          ? 'Un lot vient de changer d’étape de péremption :'
          : `${signales.length} lots viennent de changer d’étape de péremption :`,
        ...(signales.length > affiches.length ? [`Les ${affiches.length} plus urgents sont listés ci-dessous ; la suite est dans l’écran Péremptions.`] : []),
        'Vendez-les en priorité ou sortez du stock ceux qui sont périmés.',
      ],
      details: affiches.map((l) => ({ libelle: `${l.produit} · lot ${l.numero} · ${l.emplacement}`, valeur: echeance(l) })),
      bouton: { libelle: 'Voir les péremptions', url: `${adresseSite()}/peremptions` },
      mentions: [`Vous recevez cet email car vous êtes membre de ${entreprise.nom} sur NimbaFlow.`],
    });
    await Promise.all(
      destinataires.map((d) => this.emailService.send({ to: d.email, subject: `${titre} : ${resume}`, ...contenu })),
    );
    return signales.length;
  }
}
