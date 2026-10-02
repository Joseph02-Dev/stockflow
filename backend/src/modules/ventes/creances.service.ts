import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { SoldesService, type VenteNonSoldee } from './soldes.service.js';
import type { ReglementDto } from './dto/reglement.dto.js';

const JOUR_MS = 86_400_000;
/**
 * Sans échéance convenue, une créance est réputée en retard au-delà de ce
 * délai (convention à valider avec le métier ; l'échéance saisie à la
 * vente prime toujours).
 */
export const DELAI_PAIEMENT_PAR_DEFAUT_JOURS = 30;

/** Tranches de vieillissement, en jours depuis la vente. */
export const TRANCHES = [
  { cle: 'MOINS_DE_8', libelle: 'Moins de 8 jours', max: 7 },
  { cle: 'DE_8_A_30', libelle: '8 à 30 jours', max: 30 },
  { cle: 'DE_31_A_60', libelle: '31 à 60 jours', max: 60 },
  {
    cle: 'PLUS_DE_60',
    libelle: 'Plus de 60 jours',
    max: Number.POSITIVE_INFINITY,
  },
] as const;

function joursDepuis(date: Date, maintenant: number): number {
  return Math.max(0, Math.floor((maintenant - date.getTime()) / JOUR_MS));
}

function enRetard(vente: VenteNonSoldee, maintenant: number): boolean {
  if (vente.echeanceAt) return vente.echeanceAt.getTime() < maintenant;
  return (
    joursDepuis(vente.createdAt, maintenant) > DELAI_PAIEMENT_PAR_DEFAUT_JOURS
  );
}

/** Début de la semaine en cours (lundi 00:00, heure du serveur). */
function debutSemaine(maintenant: Date): Date {
  const debut = new Date(maintenant);
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - ((debut.getDay() + 6) % 7));
  return debut;
}

@Injectable()
export class CreancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soldes: SoldesService,
    private readonly clients: ClientsService,
  ) {}

  /**
   * Qui doit de l'argent, et depuis quand. Classement par ANCIENNETÉ de la
   * dette (plus ancienne vente non soldée), jamais par montant : c'est le
   * risque qui prime. À ancienneté égale, le plus gros montant d'abord.
   */
  async lister(entrepriseId: string) {
    const maintenant = Date.now();
    const ventes = await this.soldes.ventesNonSoldees(entrepriseId);

    const parClient = new Map<string, VenteNonSoldee[]>();
    for (const v of ventes)
      parClient.set(v.clientId, [...(parClient.get(v.clientId) ?? []), v]);
    const clientIds = [...parClient.keys()];

    const [clients, derniersReglements, encaisse] = await Promise.all([
      this.prisma.client.findMany({
        where: { entrepriseId, id: { in: clientIds } },
      }),
      this.prisma.$queryRaw<{ client_id: string; dernier: Date }[]>`
        SELECT v.client_id, MAX(r.created_at) AS dernier
        FROM reglement r JOIN vente v ON v.id = r.vente_id
        WHERE v.entreprise_id = ${entrepriseId} AND v.statut = 'VALIDEE' AND v.client_id IS NOT NULL
        GROUP BY v.client_id`,
      this.prisma.$queryRaw<{ total: bigint | null }[]>`
        SELECT SUM(r.montant) AS total
        FROM reglement r JOIN vente v ON v.id = r.vente_id
        WHERE v.entreprise_id = ${entrepriseId} AND v.statut = 'VALIDEE' AND v.mode_paiement = 'CREDIT'
          AND r.created_at >= ${debutSemaine(new Date(maintenant))}`,
    ]);
    const clientParId = new Map(clients.map((c) => [c.id, c]));
    const dernierParClient = new Map(
      derniersReglements.map((d) => [d.client_id, d.dernier]),
    );

    const debiteurs = clientIds
      .map((clientId) => {
        const sesVentes = parClient.get(clientId)!; // déjà triées, la plus ancienne d'abord
        const client = clientParId.get(clientId)!;
        const echeances = sesVentes
          .map((v) => v.echeanceAt)
          .filter((d): d is Date => d !== null);
        return {
          client: {
            id: client.id,
            nom: client.nom,
            telephone: client.telephone,
            nomCommerce: client.nomCommerce,
            categorie: client.categorie,
            plafondCredit: client.plafondCredit,
          },
          solde: sesVentes.reduce((a, v) => a + v.resteDu, 0),
          ancienneteJours: joursDepuis(sesVentes[0].createdAt, maintenant),
          plusAncienneVenteAt: sesVentes[0].createdAt,
          dernierReglementAt: dernierParClient.get(clientId) ?? null,
          echeanceAt:
            echeances.length > 0
              ? new Date(Math.min(...echeances.map((d) => d.getTime())))
              : null,
          montantEnRetard: sesVentes
            .filter((v) => enRetard(v, maintenant))
            .reduce((a, v) => a + v.resteDu, 0),
          nombreVentes: sesVentes.length,
        };
      })
      .sort(
        (a, b) => b.ancienneteJours - a.ancienneteJours || b.solde - a.solde,
      );

    const tranches = TRANCHES.map((t) => ({
      cle: t.cle,
      libelle: t.libelle,
      montant: 0,
      nombreVentes: 0,
    }));
    for (const v of ventes) {
      const age = joursDepuis(v.createdAt, maintenant);
      const i = TRANCHES.findIndex((t) => age <= t.max);
      tranches[i].montant += v.resteDu;
      tranches[i].nombreVentes += 1;
    }

    return {
      resume: {
        totalDu: debiteurs.reduce((a, d) => a + d.solde, 0),
        nombreClients: debiteurs.length,
        montantEnRetard: debiteurs.reduce((a, d) => a + d.montantEnRetard, 0),
        encaisseCetteSemaine: Number(encaisse[0]?.total ?? 0),
        tranches,
      },
      debiteurs,
    };
  }

  /**
   * Encaissement depuis l'écran Créances (décision validée) : le montant
   * solde les ventes du client de la plus ancienne à la plus récente, un
   * règlement par vente touchée, dans une seule transaction. Jamais plus
   * que ce que le client doit.
   */
  async encaisser(
    entrepriseId: string,
    utilisateurId: string,
    clientId: string,
    dto: ReglementDto,
  ) {
    await this.clients.trouverOuEchouer(entrepriseId, clientId);

    const reglements = await this.prisma.$transaction(async (tx) => {
      // Verrouille les ventes du client : deux encaissements simultanés
      // ne peuvent pas imputer deux fois le même reste dû.
      await tx.$queryRaw`SELECT id FROM vente WHERE entreprise_id = ${entrepriseId} AND client_id = ${clientId} AND statut = 'VALIDEE' FOR UPDATE`;
      const ventes = await this.soldes.ventesNonSoldees(
        entrepriseId,
        clientId,
        tx,
      );
      const du = ventes.reduce((a, v) => a + v.resteDu, 0);
      if (du === 0) throw new BadRequestException('Ce client ne doit rien.');
      if (dto.montant > du) {
        throw new BadRequestException(
          `Le montant dépasse ce que le client doit (${du} GNF).`,
        );
      }

      let reste = dto.montant;
      const crees: { venteId: string; numero: string; montant: number }[] = [];
      for (const vente of ventes) {
        if (reste === 0) break;
        const montant = Math.min(reste, vente.resteDu);
        await tx.reglement.create({
          data: {
            venteId: vente.venteId,
            montant,
            mode: dto.mode,
            utilisateurId,
          },
        });
        crees.push({ venteId: vente.venteId, numero: vente.numero, montant });
        reste -= montant;
      }
      return crees;
    });

    return {
      reglements,
      solde: await this.soldes.solde(entrepriseId, clientId),
    };
  }
}
