import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';
import { adresseSite, composerEmail } from '../../common/email/gabarit-email.js';
import { PushService } from '../notifications/push.service.js';

/** Lignes détaillées dans l'email ; au-delà, la fiche de la commande donne la suite. */
const LIGNES_AFFICHEES = 20;

/**
 * Commande fournisseur réceptionnée : toute l'équipe active est prévenue
 * (email et notification push), sauf la personne qui a réceptionné.
 * Appelé après la réception, déjà enregistrée : ne lève jamais.
 */
@Injectable()
export class ReceptionNotificationService {
  private readonly journal = new Logger(ReceptionNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly push: PushService,
  ) {}

  async notifier(entrepriseId: string, auteurId: string, commandeId: string): Promise<void> {
    try {
      const commande = await this.prisma.commandeFournisseur.findUniqueOrThrow({
        where: { id: commandeId },
        select: {
          fournisseur: { select: { nom: true } },
          emplacement: { select: { nom: true } },
          entreprise: { select: { nom: true } },
          lignes: { select: { quantiteCommandee: true, produit: { select: { nom: true, uniteMesure: true } } } },
        },
      });
      const auteur = await this.prisma.utilisateur.findUniqueOrThrow({ where: { id: auteurId }, select: { nom: true } });
      const fournisseur = commande.fournisseur.nom;
      const resume = `${auteur.nom} a réceptionné la commande ${fournisseur} (${commande.lignes.length} produit${commande.lignes.length > 1 ? 's' : ''}) à ${commande.emplacement.nom}.`;
      const url = `/commandes/${commandeId}`;

      await this.push.envoyer(
        entrepriseId,
        { titre: 'Commande réceptionnée', corps: resume, url, etiquette: `reception-${commandeId}` },
        auteurId,
      );

      const destinataires = await this.prisma.utilisateur.findMany({
        where: { entrepriseId, desactiveAt: null, id: { not: auteurId } },
        select: { email: true },
      });
      if (destinataires.length === 0) return;
      const affichees = commande.lignes.slice(0, LIGNES_AFFICHEES);
      const contenu = composerEmail({
        apercu: resume,
        titre: 'Commande réceptionnée',
        paragraphes: [
          resume,
          'Les quantités sont entrées en stock.',
          ...(commande.lignes.length > affichees.length
            ? [`Les ${affichees.length} premiers produits sont listés ci-dessous ; la suite est sur la fiche de la commande.`]
            : []),
        ],
        details: [
          { libelle: 'Fournisseur', valeur: fournisseur },
          { libelle: 'Emplacement', valeur: commande.emplacement.nom },
          ...affichees.map((l) => ({
            libelle: l.produit.nom,
            valeur: `+${l.quantiteCommandee}${l.produit.uniteMesure ? ` ${l.produit.uniteMesure}` : ''}`,
          })),
        ],
        bouton: { libelle: 'Voir la commande', url: `${adresseSite()}${url}` },
        mentions: [`Vous recevez cet email car vous êtes membre de ${commande.entreprise.nom} sur NimbaFlow.`],
      });
      await Promise.all(
        destinataires.map((d) =>
          this.emailService.send({ to: d.email, subject: `Commande réceptionnée : ${fournisseur}`, ...contenu }),
        ),
      );
    } catch (erreur) {
      this.journal.error(`Réception ${commandeId} non signalée : ${(erreur as Error).message}`);
    }
  }
}
