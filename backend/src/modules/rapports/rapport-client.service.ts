import { Injectable, NotFoundException } from '@nestjs/common';
import type { Content } from 'pdfmake/interfaces.js';
import { PrismaService } from '../../config/prisma.service.js';
import { BOM_UTF8, ligneCsv } from '../../common/pagination/csv.js';
import { dateIso, formaterDate, formaterJourMois, formaterPeriode } from './format.js';
import { PdfService } from './pdf/pdf.service.js';
import { COULEURS, LARGEUR_UTILE, bandeauSynthese, documentRapport, montant, tableau, titreSection, zoneSignature } from './pdf/gabarit.js';
import { lirePeriode, type RapportGenere } from './rapports.types.js';

export interface FiltresReleve {
  debut?: string;
  fin?: string;
}

export interface EcritureReleve {
  date: Date;
  piece: string;
  libelle: string;
  debit: number;
  credit: number;
  solde: number;
}

const MODES: Record<string, string> = {
  ESPECES: 'Règlement en espèces',
  ORANGE_MONEY: 'Règlement Orange Money',
  MTN_MOMO: 'Règlement MTN MoMo',
  AVOIR: 'Avoir sur retour de marchandise',
};

/**
 * Relevé de compte client, au format d'un relevé bancaire : débit (ventes),
 * crédit (règlements et avoirs), solde ligne à ligne. Même règle que le
 * solde de l'application : seules les ventes validées comptent ; les
 * règlements d'une vente annulée sont réputés remboursés.
 */
@Injectable()
export class RapportClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  async donnees(entrepriseId: string, clientId: string, filtres: FiltresReleve) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { entrepriseId: true, nom: true, nomCommerce: true, telephone: true, plafondCredit: true },
    });
    // Client d'une autre entreprise : 404, exactement comme un client inexistant.
    if (!client || client.entrepriseId !== entrepriseId) throw new NotFoundException('Client introuvable.');
    const periode = lirePeriode(filtres.debut, filtres.fin);

    const ventes = await this.prisma.vente.findMany({
      where: { entrepriseId, clientId, statut: 'VALIDEE', createdAt: { lt: periode.finExclue } },
      select: {
        id: true,
        numero: true,
        total: true,
        createdAt: true,
        echeanceAt: true,
        lignes: { select: { quantite: true } },
        reglements: {
          where: { createdAt: { lt: periode.finExclue } },
          select: { montant: true, mode: true, createdAt: true },
        },
      },
    });

    type Mouvement = Omit<EcritureReleve, 'solde'> & { ordre: number };
    const toutes: Mouvement[] = ventes.flatMap((v) => {
      const articles = v.lignes.reduce((a, l) => a + l.quantite, 0);
      return [
        { date: v.createdAt, piece: v.numero, libelle: `Vente — ${articles} article${articles > 1 ? 's' : ''}`, debit: v.total, credit: 0, ordre: 0 },
        ...v.reglements.map((r) => ({
          date: r.createdAt,
          piece: v.numero,
          libelle: MODES[r.mode] ?? 'Règlement',
          debit: 0,
          credit: r.montant,
          ordre: 1,
        })),
      ];
    });
    toutes.sort((a, b) => a.date.getTime() - b.date.getTime() || a.ordre - b.ordre || a.piece.localeCompare(b.piece));

    const anterieures = toutes.filter((m) => m.date < periode.debut);
    const report = anterieures.reduce((a, m) => a + m.debit - m.credit, 0);
    let solde = report;
    const ecritures: EcritureReleve[] = toutes
      .filter((m) => m.date >= periode.debut)
      .map(({ ordre: _ordre, ...m }) => {
        solde += m.debit - m.credit;
        return { ...m, solde };
      });

    // Échéance : la plus proche parmi les ventes encore dues à la date d'arrêt.
    const echeances = ventes
      .filter((v) => v.echeanceAt && v.total > v.reglements.reduce((a, r) => a + r.montant, 0))
      .map((v) => v.echeanceAt as Date)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      client,
      periode,
      report,
      ecritures,
      totalDebit: ecritures.reduce((a, e) => a + e.debit, 0),
      totalCredit: ecritures.reduce((a, e) => a + e.credit, 0),
      soldeDu: solde,
      prochaineEcheance: echeances[0] ?? null,
    };
  }

  async generer(entrepriseId: string, utilisateurId: string, clientId: string, filtres: FiltresReleve): Promise<RapportGenere> {
    const [d, entreprise, editePar] = await Promise.all([
      this.donnees(entrepriseId, clientId, filtres),
      this.pdf.identite(entrepriseId),
      this.pdf.nomUtilisateur(utilisateurId),
    ]);
    const editeLe = new Date();
    const designation = d.client.nomCommerce ? `${d.client.nom} — ${d.client.nomCommerce}` : d.client.nom;
    const echu = d.prochaineEcheance !== null && d.prochaineEcheance < editeLe;

    const contenu: Content[] = [
      {
        columns: [
          {
            stack: [
              { text: 'Relevé établi pour', style: 'libelleIndicateur' },
              { text: designation, style: 'raisonSociale', fontSize: 12, margin: [0, 2, 0, 0] },
              ...(d.client.telephone ? [{ text: d.client.telephone, style: 'coordonnees' }] : []),
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },
      bandeauSynthese([
        { libelle: 'Solde antérieur', valeur: `${montant(d.report)} GNF`, detail: `au ${formaterDate(d.periode.debut)}` },
        { libelle: 'Achats de la période', valeur: `${montant(d.totalDebit)} GNF`, detail: 'débit' },
        { libelle: 'Règlements et avoirs', valeur: `${montant(d.totalCredit)} GNF`, detail: 'crédit' },
        { libelle: 'Solde dû', valeur: `${montant(d.soldeDu)} GNF`, detail: `au ${formaterDate(d.periode.fin)}` },
      ]),
      titreSection('Opérations de la période'),
      tableau({
        colonnes: [
          { titre: 'Date', largeur: 40 },
          { titre: 'Pièce', largeur: 70 },
          { titre: 'Libellé', largeur: '*' },
          { titre: 'Débit', largeur: 70, chiffres: true },
          { titre: 'Crédit', largeur: 70, chiffres: true },
          { titre: 'Solde', largeur: 76, chiffres: true },
        ],
        lignes: [
          { type: 'donnees', cellules: [formaterJourMois(d.periode.debut), '—', 'Report du solde antérieur', '—', '—', montant(d.report)] },
          ...d.ecritures.map((e) => ({
            type: 'donnees' as const,
            cellules: [formaterJourMois(e.date), e.piece, e.libelle, e.debit ? montant(e.debit) : '—', e.credit ? montant(e.credit) : '—', montant(e.solde)],
          })),
        ],
        totaux: ['', '', 'Totaux de la période et solde dû', montant(d.totalDebit), montant(d.totalCredit), montant(d.soldeDu)],
      }),
      {
        unbreakable: true,
        table: {
          widths: [LARGEUR_UTILE - 22],
          body: [
            [
              {
                stack: [
                  {
                    columns: [
                      { text: 'Solde dû', bold: true, fontSize: 11, color: COULEURS.encre },
                      { text: `${montant(d.soldeDu)} GNF`, bold: true, fontSize: 14, color: COULEURS.encre, alignment: 'right', noWrap: true },
                    ],
                  },
                  {
                    columns: [
                      {
                        text: d.prochaineEcheance
                          ? `${echu ? 'Échéance dépassée depuis le' : 'Prochaine échéance :'} ${formaterDate(d.prochaineEcheance)}`
                          : 'Aucune échéance fixée',
                        color: echu ? COULEURS.rupture : COULEURS.texte,
                      },
                      {
                        text: d.client.plafondCredit !== null ? `Plafond de crédit : ${montant(d.client.plafondCredit)} GNF` : 'Sans plafond de crédit',
                        alignment: 'right',
                      },
                    ],
                    fontSize: 8.5,
                    margin: [0, 6, 0, 0],
                  },
                ],
                margin: [6, 8, 6, 8],
              },
            ],
          ],
        },
        layout: 'gabarit-cadre',
        margin: [0, 0, 0, 14],
      },
      { text: 'En cas de désaccord sur ce relevé, merci de nous contacter sous huit jours.', bold: true, fontSize: 9, color: COULEURS.encre, margin: [0, 0, 0, 6] },
      {
        text: [
          `Relevé arrêté au ${formaterDate(d.periode.fin)}, établi par ${entreprise.nom}`,
          entreprise.rccm ? `, RCCM ${entreprise.rccm}` : '',
          entreprise.nif ? `, NIF ${entreprise.nif}` : '',
          '. Montants en francs guinéens (GNF). Seules les ventes validées y figurent ; une vente annulée et ses règlements en sont exclus.',
        ].join(''),
        style: 'paragraphe',
        color: COULEURS.discret,
      },
      zoneSignature(['Le client, pour accord', entreprise.nom]),
    ];

    const document = documentRapport(
      entreprise,
      { titre: 'Relevé de compte client', periode: formaterPeriode(d.periode.debut, d.periode.fin), editeLe, editePar },
      contenu,
    );
    const nomFichier = `releve-${d.client.nom.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${dateIso(d.periode.fin)}`;
    return {
      nomFichier,
      pdf: () => this.pdf.rendre(document),
      csv: () =>
        BOM_UTF8 +
        ligneCsv(['Date', 'Pièce', 'Libellé', 'Débit', 'Crédit', 'Solde'], ';') +
        ligneCsv([formaterDate(d.periode.debut), '', 'Report du solde antérieur', '', '', d.report], ';') +
        d.ecritures.map((e) => ligneCsv([formaterDate(e.date), e.piece, e.libelle, e.debit || '', e.credit || '', e.solde], ';')).join(''),
    };
  }
}
