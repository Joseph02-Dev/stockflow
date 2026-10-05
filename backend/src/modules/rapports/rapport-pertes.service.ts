import { Injectable } from '@nestjs/common';
import type { Content } from 'pdfmake/interfaces.js';
import { PrismaService } from '../../config/prisma.service.js';
import { BOM_UTF8, ligneCsv } from '../../common/pagination/csv.js';
import { dateIso, formaterDate, formaterPeriode } from './format.js';
import { PdfService } from './pdf/pdf.service.js';
import {
  COULEURS,
  bandeauSynthese,
  barreRepartition,
  documentRapport,
  montant,
  nombre,
  pourcentage,
  tableau,
  titreSection,
  zoneSignature,
} from './pdf/gabarit.js';
import { lirePeriode, type RapportGenere } from './rapports.types.js';

export interface FiltresPertes {
  debut?: string;
  fin?: string;
  detail: boolean;
  graphiques: boolean;
  signature: boolean;
}

type Motif = 'CASSE_MANUTENTION' | 'DEGAT_EAUX' | 'VOL' | 'ERREUR_SAISIE' | 'AUTRE' | 'AVOIR_REFUSE';

/** Libellés et couleurs identiques à l'écran Pertes. */
const MOTIFS: Record<Motif, { libelle: string; couleur: string }> = {
  CASSE_MANUTENTION: { libelle: 'Casse de manutention', couleur: '#E05A4B' },
  DEGAT_EAUX: { libelle: 'Dégât des eaux', couleur: '#D9922B' },
  VOL: { libelle: 'Vol', couleur: '#9B7BD4' },
  ERREUR_SAISIE: { libelle: 'Erreur de saisie', couleur: '#6A91C9' },
  AUTRE: { libelle: 'Autre', couleur: '#8A94A6' },
  AVOIR_REFUSE: { libelle: 'Avoir fournisseur refusé', couleur: '#C9CFDA' },
};

export interface LignePerte {
  date: Date;
  designation: string;
  quantite: number | null;
  motif: Motif;
  emplacementId: string;
  emplacement: string;
  auteur: string;
  valeur: number;
  precision: string | null;
}

export interface ConcentrationEmplacement {
  emplacement: string;
  pertes: number;
  partPertes: number;
  valeurStock: number;
  partStock: number;
  /** Points d'écart : positif = l'emplacement perd plus que son poids. */
  ecart: number;
}

/**
 * Rapport de pertes : casses déclarées (non annulées) et avoirs
 * fournisseur refusés, valeurs figées au prix d'achat. La dernière
 * section confronte, par emplacement, la part des pertes à la part du
 * stock : c'est l'écart entre les deux qui désigne où agir.
 */
@Injectable()
export class RapportPertesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  async donnees(entrepriseId: string, filtres: Pick<FiltresPertes, 'debut' | 'fin'>) {
    const periode = lirePeriode(filtres.debut, filtres.fin);
    const [casses, refus, annulees, stocks, emplacements] = await Promise.all([
      this.prisma.mouvement.findMany({
        where: { entrepriseId, type: 'CASSE', annuleAt: null, createdAt: { gte: periode.debut, lt: periode.finExclue } },
        select: {
          createdAt: true,
          quantite: true,
          motifPerte: true,
          valeurTotale: true,
          commentaire: true,
          emplacementId: true,
          produit: { select: { nom: true } },
          utilisateur: { select: { nom: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.retourFournisseur.findMany({
        where: { entrepriseId, statutAvoir: 'REFUSE', refuseAt: { gte: periode.debut, lt: periode.finExclue } },
        select: { refuseAt: true, valeurTotale: true, motif: true, emplacementId: true, fournisseur: { select: { nom: true } }, utilisateur: { select: { nom: true } } },
        orderBy: { refuseAt: 'asc' },
      }),
      this.prisma.mouvement.count({
        where: { entrepriseId, type: 'CASSE', annuleAt: { not: null }, createdAt: { gte: periode.debut, lt: periode.finExclue } },
      }),
      // Valeur actuelle du stock au prix d'achat, par emplacement.
      this.prisma.$queryRaw<{ emplacement_id: string; valeur: bigint }[]>`
        SELECT s.emplacement_id, COALESCE(SUM(s.quantite::bigint * COALESCE(p.prix_achat, 0)), 0)::bigint AS valeur
        FROM stock s JOIN produit p ON p.id = s.produit_id
        WHERE p.entreprise_id = ${entrepriseId} AND s.quantite > 0
        GROUP BY s.emplacement_id`,
      this.prisma.emplacement.findMany({ where: { entrepriseId }, select: { id: true, nom: true } }),
    ]);
    const nomEmplacement = new Map(emplacements.map((e) => [e.id, e.nom]));

    const lignes: LignePerte[] = [
      ...casses.map((c) => ({
        date: c.createdAt,
        designation: c.produit.nom,
        quantite: c.quantite,
        motif: (c.motifPerte ?? 'AUTRE') as Motif,
        emplacementId: c.emplacementId,
        emplacement: nomEmplacement.get(c.emplacementId) ?? '—',
        auteur: c.utilisateur.nom,
        valeur: c.valeurTotale ?? 0,
        precision: c.commentaire,
      })),
      ...refus.map((r) => ({
        date: r.refuseAt as Date,
        designation: `Avoir refusé — ${r.fournisseur.nom}`,
        quantite: null,
        motif: 'AVOIR_REFUSE' as const,
        emplacementId: r.emplacementId,
        emplacement: nomEmplacement.get(r.emplacementId) ?? '—',
        auteur: r.utilisateur.nom,
        valeur: r.valeurTotale,
        precision: r.motif,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const total = lignes.reduce((a, l) => a + l.valeur, 0);
    const valeurStock = stocks.reduce((a, s) => a + Number(s.valeur), 0);
    const stockDe = new Map(stocks.map((s) => [s.emplacement_id, Number(s.valeur)]));
    const part = (valeur: number, tout: number) => (tout > 0 ? (valeur / tout) * 100 : 0);

    const concentration: ConcentrationEmplacement[] = [...new Set(lignes.map((l) => l.emplacementId))]
      .map((id) => {
        const pertes = lignes.filter((l) => l.emplacementId === id).reduce((a, l) => a + l.valeur, 0);
        const valeur = stockDe.get(id) ?? 0;
        const partPertes = part(pertes, total);
        const partStock = part(valeur, valeurStock);
        return { emplacement: nomEmplacement.get(id) ?? '—', pertes, partPertes, valeurStock: valeur, partStock, ecart: partPertes - partStock };
      })
      .sort((a, b) => b.pertes - a.pertes);

    return {
      periode,
      lignes,
      annulees,
      synthese: {
        total,
        nombre: lignes.length,
        moyenne: lignes.length > 0 ? Math.round(total / lignes.length) : 0,
        valeurStock,
        partDuStock: part(total, valeurStock),
      },
      parMotif: (Object.keys(MOTIFS) as Motif[]).map((motif) => ({
        motif,
        valeur: lignes.filter((l) => l.motif === motif).reduce((a, l) => a + l.valeur, 0),
      })),
      concentration,
    };
  }

  async generer(entrepriseId: string, utilisateurId: string, filtres: FiltresPertes): Promise<RapportGenere> {
    const [d, entreprise, editePar] = await Promise.all([
      this.donnees(entrepriseId, filtres),
      this.pdf.identite(entrepriseId),
      this.pdf.nomUtilisateur(utilisateurId),
    ]);
    const editeLe = new Date();
    const contenu: Content[] = [
      bandeauSynthese([
        { libelle: 'Pertes de la période', valeur: `${montant(d.synthese.total)} GNF`, detail: 'au prix d’achat' },
        { libelle: 'Déclarations', valeur: nombre(d.synthese.nombre), detail: d.annulees > 0 ? `${d.annulees} annulée(s), non comptée(s)` : 'casses et avoirs refusés' },
        { libelle: 'Perte moyenne', valeur: `${montant(d.synthese.moyenne)} GNF`, detail: 'par déclaration' },
        { libelle: 'Part du stock', valeur: pourcentage(d.synthese.partDuStock), detail: `de ${montant(d.synthese.valeurStock)} GNF en stock` },
      ]),
    ];

    if (filtres.graphiques) {
      contenu.push(
        titreSection('Répartition par motif'),
        barreRepartition(d.parMotif.filter((m) => m.valeur > 0).map((m) => ({ libelle: MOTIFS[m.motif].libelle, valeur: m.valeur, couleur: MOTIFS[m.motif].couleur }))),
      );
    }

    if (filtres.detail) {
      contenu.push(
        titreSection('Détail des déclarations', 'Chaque déclaration est nominative ; une casse annulée n’y figure pas.'),
        tableau({
          colonnes: [
            { titre: 'Date', largeur: 46 },
            { titre: 'Désignation', largeur: '*' },
            { titre: 'Qté', largeur: 30, chiffres: true },
            { titre: 'Motif', largeur: 74 },
            { titre: 'Emplacement', largeur: 66 },
            { titre: 'Déclarée par', largeur: 66 },
            { titre: 'Valeur', largeur: 62, chiffres: true },
          ],
          lignes: d.lignes.map((l) => ({
            type: 'donnees' as const,
            cellules: [
              formaterDate(l.date),
              { texte: l.designation, sousLigne: l.precision },
              l.quantite === null ? '—' : nombre(l.quantite),
              { texte: MOTIFS[l.motif].libelle },
              l.emplacement,
              l.auteur,
              { texte: montant(l.valeur), couleur: COULEURS.rupture },
            ],
          })),
          totaux: ['Total', '', '', '', '', '', montant(d.synthese.total)],
        }),
      );
    }

    contenu.push(
      titreSection(
        'Concentration par emplacement',
        'Un emplacement qui pèse plus dans les pertes que dans le stock a un problème : c’est l’écart entre les deux parts qui compte, pas le total.',
      ),
      tableau({
        colonnes: [
          { titre: 'Emplacement', largeur: '*' },
          { titre: 'Pertes', largeur: 70, chiffres: true },
          { titre: 'Part des pertes', largeur: 62, chiffres: true },
          { titre: 'Valeur du stock', largeur: 78, chiffres: true },
          { titre: 'Part du stock', largeur: 58, chiffres: true },
          { titre: 'Écart', largeur: 54, chiffres: true },
        ],
        lignes: d.concentration.map((c) => ({
          type: 'donnees' as const,
          cellules: [
            c.emplacement,
            montant(c.pertes),
            { texte: pourcentage(c.partPertes), gras: true },
            montant(c.valeurStock),
            pourcentage(c.partStock),
            {
              texte: `${c.ecart > 0 ? '+' : ''}${pourcentage(c.ecart).replace('%', 'pts')}`,
              couleur: c.ecart > 0 ? COULEURS.rupture : COULEURS.ok,
            },
          ],
        })),
      }),
      {
        text: 'Valeur du stock au prix d’achat à la date d’édition. Les lots périmés ont leur propre suivi (écran Péremptions) et ne figurent pas dans ce rapport.',
        style: 'paragraphe',
        color: COULEURS.discret,
      },
    );
    if (filtres.signature) contenu.push(zoneSignature(['Établi par', 'Vérifié par']));

    const document = documentRapport(
      entreprise,
      { titre: 'Rapport de pertes', periode: formaterPeriode(d.periode.debut, d.periode.fin), editeLe, editePar },
      contenu,
    );
    return {
      nomFichier: `pertes-${dateIso(d.periode.debut)}-${dateIso(d.periode.fin)}`,
      pdf: () => this.pdf.rendre(document),
      csv: () =>
        BOM_UTF8 +
        ligneCsv(['Date', 'Désignation', 'Quantité', 'Motif', 'Emplacement', 'Déclarée par', 'Valeur', 'Précision'], ';') +
        d.lignes
          .map((l) => ligneCsv([formaterDate(l.date), l.designation, l.quantite ?? '', MOTIFS[l.motif].libelle, l.emplacement, l.auteur, l.valeur, l.precision ?? ''], ';'))
          .join(''),
    };
  }
}
