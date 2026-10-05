import { Injectable, NotFoundException } from '@nestjs/common';
import type { Content } from 'pdfmake/interfaces.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../config/prisma.service.js';
import { BOM_UTF8, ligneCsv } from '../../common/pagination/csv.js';
import { ESPACE_FINE_PDF, dateIso, formaterDate, formaterDateHeure, formaterPeriode, formaterQuantiteSignee } from './format.js';
import { PdfService } from './pdf/pdf.service.js';
import { COULEURS, bandeauSynthese, documentRapport, nombre, tableau, titreSection, zoneSignature } from './pdf/gabarit.js';
import { lirePeriode, type RapportGenere, type TYPES_MOUVEMENT_RAPPORT } from './rapports.types.js';

type TypeMouvement = (typeof TYPES_MOUVEMENT_RAPPORT)[number];

export interface FiltresMouvements {
  debut?: string;
  fin?: string;
  emplacementId?: string;
  type?: TypeMouvement;
  signature: boolean;
}

export interface LigneJournal {
  id: string;
  date: Date;
  produit: string;
  reference: string | null;
  lot: string | null;
  type: TypeMouvement;
  /** Sens du transfert pour l'emplacement de la ligne ; null sinon. */
  sens: 'source' | 'destination' | null;
  quantite: number;
  soldeApres: number;
  emplacement: string;
  autreEmplacement: string | null;
  auteur: string;
  piece: string;
  annule: boolean;
}

const LIBELLES: Record<TypeMouvement, string> = {
  ENTREE: 'Entrée',
  SORTIE: 'Sortie',
  TRANSFERT: 'Transfert',
  AJUSTEMENT: 'Ajustement',
  PERIME: 'Périmé',
  CASSE: 'Casse',
  RETOUR_CLIENT: 'Retour client',
  RETOUR_FOURNISSEUR: 'Retour fournisseur',
};

/** Au-delà, le PDF devient illisible : l'export CSV reste complet. */
const LIGNES_MAX_PDF = 5000;

/**
 * Journal des mouvements : chaque ligne porte le solde de la référence
 * dans l'emplacement après l'opération, ce qui permet de refaire le calcul
 * à la main. Un transfert apparaît deux fois : sortie de la source,
 * entrée à la destination.
 */
@Injectable()
export class RapportMouvementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  async donnees(entrepriseId: string, filtres: Omit<FiltresMouvements, 'signature'>) {
    const periode = lirePeriode(filtres.debut, filtres.fin);
    let emplacement: string | null = null;
    if (filtres.emplacementId) {
      const e = await this.prisma.emplacement.findUnique({ where: { id: filtres.emplacementId }, select: { entrepriseId: true, nom: true } });
      if (!e || e.entrepriseId !== entrepriseId) throw new NotFoundException('Emplacement introuvable.');
      emplacement = e.nom;
    }

    // Solde après opération = stock actuel − somme des variations
    // postérieures, calculée sur TOUT l'historique (puis filtrée), par
    // référence et emplacement. Ordre total : date, puis identifiant.
    const lignes = await this.prisma.$queryRaw<
      {
        id: string;
        created_at: Date;
        produit: string;
        reference: string | null;
        lot: string | null;
        type: TypeMouvement;
        sens: 'source' | 'destination' | null;
        delta: number;
        solde_apres: number;
        emplacement: string;
        autre_emplacement: string | null;
        auteur: string;
        vente: string | null;
        vente_retour: string | null;
        fournisseur_retour: string | null;
        annule: boolean;
        annulation: boolean;
      }[]
    >`
      WITH lignes AS (
        SELECT m.id, m.created_at, m.produit_id, m.emplacement_id AS emplacement_id,
               m.emplacement_destination_id AS autre_id, m.type,
               CASE WHEN m.type = 'TRANSFERT' THEN 'source' END AS sens,
               CASE
                 WHEN m.type IN ('ENTREE', 'RETOUR_CLIENT', 'AJUSTEMENT') THEN m.quantite
                 ELSE -m.quantite
               END AS delta
        FROM mouvement m WHERE m.entreprise_id = ${entrepriseId}
        UNION ALL
        SELECT m.id, m.created_at, m.produit_id, m.emplacement_destination_id, m.emplacement_id,
               m.type, 'destination', m.quantite
        FROM mouvement m
        WHERE m.entreprise_id = ${entrepriseId} AND m.type = 'TRANSFERT' AND m.emplacement_destination_id IS NOT NULL
      ),
      soldes AS (
        SELECT l.*,
               COALESCE(s.quantite, 0) - COALESCE(SUM(l.delta) OVER (
                 PARTITION BY l.produit_id, l.emplacement_id
                 ORDER BY l.created_at DESC, l.id DESC, l.sens ASC NULLS FIRST
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
               ), 0) AS solde_apres
        FROM lignes l
        LEFT JOIN stock s ON s.produit_id = l.produit_id AND s.emplacement_id = l.emplacement_id
      )
      SELECT so.id, so.created_at, p.nom AS produit, p.reference, lo.numero AS lot, so.type, so.sens,
             so.delta::int AS delta, so.solde_apres::int AS solde_apres,
             e.nom AS emplacement, a.nom AS autre_emplacement, u.nom AS auteur,
             v.numero AS vente, vr.numero AS vente_retour, f.nom AS fournisseur_retour,
             (m.annule_at IS NOT NULL) AS annule, (m.annule_mouvement_id IS NOT NULL) AS annulation
      FROM soldes so
      JOIN mouvement m ON m.id = so.id
      JOIN produit p ON p.id = so.produit_id
      JOIN emplacement e ON e.id = so.emplacement_id
      LEFT JOIN emplacement a ON a.id = so.autre_id
      JOIN utilisateur u ON u.id = m.utilisateur_id
      LEFT JOIN lot lo ON lo.id = m.lot_id
      LEFT JOIN vente v ON v.id = m.vente_id
      LEFT JOIN retour_client rc ON rc.id = m.retour_client_id
      LEFT JOIN vente vr ON vr.id = rc.vente_id
      LEFT JOIN retour_fournisseur rf ON rf.id = m.retour_fournisseur_id
      LEFT JOIN fournisseur f ON f.id = rf.fournisseur_id
      WHERE so.created_at >= ${periode.debut} AND so.created_at < ${periode.finExclue}
        ${filtres.emplacementId ? Prisma.sql`AND so.emplacement_id = ${filtres.emplacementId}` : Prisma.empty}
        ${filtres.type ? Prisma.sql`AND so.type = ${filtres.type}::"TypeMouvement"` : Prisma.empty}
      ORDER BY so.created_at ASC, so.id ASC, so.sens DESC NULLS FIRST`;

    const journal: LigneJournal[] = lignes.map((l) => ({
      id: l.id,
      date: l.created_at,
      produit: l.produit,
      reference: l.reference,
      lot: l.lot,
      type: l.type,
      sens: l.sens,
      quantite: l.delta,
      soldeApres: l.solde_apres,
      emplacement: l.emplacement,
      autreEmplacement: l.autre_emplacement,
      auteur: l.auteur,
      piece:
        l.vente ??
        (l.vente_retour ? `Retour ${l.vente_retour}` : null) ??
        (l.fournisseur_retour ? `Avoir ${l.fournisseur_retour}` : null) ??
        (l.annulation ? 'Annulation casse' : null) ??
        '—',
      annule: l.annule,
    }));

    return {
      periode,
      emplacement,
      synthese: {
        nombre: journal.length,
        entrees: journal.filter((l) => l.quantite > 0).reduce((a, l) => a + l.quantite, 0),
        sorties: journal.filter((l) => l.quantite < 0).reduce((a, l) => a - l.quantite, 0),
      },
      journal,
    };
  }

  async generer(entrepriseId: string, utilisateurId: string, filtres: FiltresMouvements): Promise<RapportGenere> {
    const [d, entreprise, editePar] = await Promise.all([
      this.donnees(entrepriseId, filtres),
      this.pdf.identite(entrepriseId),
      this.pdf.nomUtilisateur(utilisateurId),
    ]);
    const editeLe = new Date();
    const perimetre = [d.emplacement, filtres.type ? LIBELLES[filtres.type] : null].filter(Boolean).join(' · ');
    const signee = (n: number) => formaterQuantiteSignee(n, ESPACE_FINE_PDF);
    const tronque = d.journal.length > LIGNES_MAX_PDF;
    const visibles = tronque ? d.journal.slice(0, LIGNES_MAX_PDF) : d.journal;

    const typeAffiche = (l: LigneJournal) =>
      l.type === 'TRANSFERT' ? `Transfert ${l.sens === 'source' ? 'vers' : 'depuis'} ${l.autreEmplacement ?? '—'}` : LIBELLES[l.type];

    const contenu: Content[] = [
      bandeauSynthese([
        { libelle: 'Mouvements', valeur: nombre(d.synthese.nombre), detail: perimetre || 'Tous emplacements, tous types' },
        { libelle: 'Entrées', valeur: signee(d.synthese.entrees), detail: 'unités' },
        { libelle: 'Sorties', valeur: signee(-d.synthese.sorties), detail: 'unités' },
        { libelle: 'Variation nette', valeur: signee(d.synthese.entrees - d.synthese.sorties), detail: 'unités sur la période' },
      ]),
      titreSection(
        'Journal',
        'Solde après : stock de la référence dans l’emplacement une fois l’opération passée. Un transfert figure deux fois : sortie de la source, entrée à la destination.',
      ),
      tableau({
        colonnes: [
          { titre: 'Date et heure', largeur: 62 },
          { titre: 'Produit', largeur: '*' },
          { titre: 'Type', largeur: 62 },
          { titre: 'Qté', largeur: 32, chiffres: true },
          { titre: 'Solde après', largeur: 38, chiffres: true },
          { titre: 'Emplacement', largeur: 56 },
          { titre: 'Auteur', largeur: 54 },
          { titre: 'Pièce', largeur: 54 },
        ],
        lignes: visibles.map((l) => ({
          type: 'donnees',
          cellules: [
            formaterDateHeure(l.date),
            { texte: l.produit, sousLigne: [l.reference, l.lot && `lot ${l.lot}`].filter(Boolean).join(' · ') || null },
            { texte: typeAffiche(l), sousLigne: l.annule ? 'annulée ensuite' : null },
            { texte: signee(l.quantite), couleur: l.quantite < 0 ? COULEURS.rupture : COULEURS.ok },
            nombre(l.soldeApres),
            l.emplacement,
            l.auteur,
            l.piece,
          ],
        })),
        taillePolice: 7,
      }),
    ];
    if (tronque) {
      contenu.push({
        text: `Journal limité aux ${nombre(LIGNES_MAX_PDF)} premières opérations sur ${nombre(d.journal.length)} : l’export CSV contient la totalité.`,
        style: 'paragraphe',
      });
    }
    if (filtres.signature) contenu.push(zoneSignature(['Établi par', 'Vérifié par']));

    const document = documentRapport(
      entreprise,
      {
        titre: 'Journal des mouvements',
        periode: `${formaterPeriode(d.periode.debut, d.periode.fin)}${perimetre ? ` · ${perimetre}` : ''}`,
        editeLe,
        editePar,
      },
      contenu,
    );
    return {
      nomFichier: `journal-des-mouvements-${dateIso(d.periode.debut)}-${dateIso(d.periode.fin)}`,
      pdf: () => this.pdf.rendre(document),
      csv: () =>
        BOM_UTF8 +
        ligneCsv(['Date', 'Heure', 'Produit', 'Référence', 'Lot', 'Type', 'Quantité', 'Solde après', 'Emplacement', 'Auteur', 'Pièce', 'Annulée'], ';') +
        d.journal
          .map((l) =>
            ligneCsv(
              [
                formaterDate(l.date),
                formaterDateHeure(l.date).slice(-5),
                l.produit,
                l.reference ?? '',
                l.lot ?? '',
                typeAffiche(l),
                l.quantite,
                l.soldeApres,
                l.emplacement,
                l.auteur,
                l.piece === '—' ? '' : l.piece,
                l.annule ? 'oui' : '',
              ],
              ';',
            ),
          )
          .join(''),
    };
  }
}
