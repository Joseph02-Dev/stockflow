import type {
  Alignment,
  Content,
  ContentText,
  ContentTable,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';
import { ESPACE_FINE_PDF, formaterDateHeure, formaterMontant, formaterPourcentage } from '../format.js';

/**
 * Gabarit commun à tous les rapports PDF : A4 portrait, marges de 15 mm,
 * en-tête d'entreprise, pied paginé, bandeau de synthèse, tableaux à
 * en-tête répété, barre de répartition et zone de signature. Fonctions
 * pures : elles ne lisent aucune donnée, elles mettent en page celles
 * qu'on leur donne.
 */

/** 15 mm en points PDF (1 mm = 72 / 25,4 pt). */
export const MARGE = (15 * 72) / 25.4;
/** Largeur utile d'une page A4 (595,28 pt) entre les marges. */
export const LARGEUR_UTILE = 595.28 - 2 * MARGE;

export const COULEURS = {
  encre: '#101828',
  texte: '#344054',
  discret: '#667085',
  filet: '#E4E7EC',
  fondSynthese: '#FAFBFC',
  enteteTableau: '#F2F4F7',
  ligneAlternee: '#FCFCFD',
  noir: '#000000',
  rupture: '#C0362C',
  faible: '#B54708',
  ok: '#067647',
} as const;

export interface IdentiteEntreprise {
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
  /** Logo déjà téléchargé, en data URL PNG ou JPEG ; absent sinon. */
  logo?: string;
}

export interface MetaRapport {
  /** « État du stock » : titre de l'en-tête et intitulé du pied de page. */
  titre: string;
  /** « du 01/07/2026 au 30/09/2026 », « au 06/10/2026 »… */
  periode: string;
  editeLe: Date;
  editePar: string;
}

/** Montant prêt pour le PDF (espace fine, voir format.ts). */
export const montant = (valeur: number) => formaterMontant(valeur, ESPACE_FINE_PDF);
export const nombre = montant;
export const pourcentage = (valeur: number) =>
  formaterPourcentage(valeur).replace(/ /g, ESPACE_FINE_PDF);

// ---------------------------------------------------------------------------
// En-tête et pied de page
// ---------------------------------------------------------------------------

export function entete(entreprise: IdentiteEntreprise, meta: MetaRapport): Content {
  const coordonnees = [
    entreprise.adresse,
    [entreprise.telephone, entreprise.email].filter(Boolean).join(' · ') || null,
    [entreprise.rccm && `RCCM ${entreprise.rccm}`, entreprise.nif && `NIF ${entreprise.nif}`]
      .filter(Boolean)
      .join(' · ') || null,
  ].filter((ligne): ligne is string => !!ligne);

  const identite: Content = {
    stack: [
      { text: entreprise.nom, style: 'raisonSociale' },
      ...coordonnees.map((ligne) => ({ text: ligne, style: 'coordonnees' })),
    ],
  };

  return {
    stack: [
      {
        columns: [
          entreprise.logo
            ? {
                columns: [
                  { image: entreprise.logo, fit: [52, 52], width: 52 },
                  { ...identite, margin: [10, 0, 0, 0] },
                ],
                width: '*',
              }
            : { ...identite, width: '*' },
          {
            width: 'auto',
            stack: [
              { text: meta.titre, style: 'titreRapport', alignment: 'right' },
              { text: meta.periode, style: 'periode', alignment: 'right' },
              {
                text: `Édité le ${formaterDateHeure(meta.editeLe)} par ${meta.editePar}`,
                style: 'mention',
                alignment: 'right',
              },
            ],
          },
        ],
        columnGap: 16,
      },
      filet(2, COULEURS.noir, [0, 10, 0, 14]),
    ],
  };
}

export function filet(epaisseur: number, couleur: string, marge: [number, number, number, number]): Content {
  return {
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: LARGEUR_UTILE, y2: 0, lineWidth: epaisseur, lineColor: couleur },
    ],
    margin: marge,
  };
}

function piedDePage(intitule: string) {
  return (page: number, pages: number): Content => ({
    columns: [
      { text: intitule, style: 'pied' },
      {
        text: `Document généré par StockFlow · page ${page} sur ${pages}`,
        style: 'pied',
        alignment: 'right',
        width: 'auto',
      },
    ],
    margin: [MARGE, 14, MARGE, 0],
  });
}

// ---------------------------------------------------------------------------
// Bandeau de synthèse
// ---------------------------------------------------------------------------

export interface Indicateur {
  libelle: string;
  valeur: string;
  /** Précision sous la valeur : « au prix d'achat », « marge 23,4 % »… */
  detail?: string;
}

/** Jusqu'à quatre indicateurs en grille, fond #FAFBFC, filets #E4E7EC. */
export function bandeauSynthese(indicateurs: Indicateur[]): Content {
  const cellules = indicateurs.slice(0, 4).map(
    (i): TableCell => ({
      stack: [
        { text: i.libelle, style: 'libelleIndicateur' },
        { text: i.valeur, style: 'valeurIndicateur', noWrap: true },
        ...(i.detail ? [{ text: i.detail, style: 'detailIndicateur' }] : []),
      ],
      margin: [10, 8, 10, 8],
    }),
  );
  return {
    table: { widths: cellules.map(() => '*'), body: [cellules], dontBreakRows: true },
    layout: {
      fillColor: () => COULEURS.fondSynthese,
      hLineColor: () => COULEURS.filet,
      vLineColor: () => COULEURS.filet,
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
    },
    margin: [0, 0, 0, 16],
  };
}

// ---------------------------------------------------------------------------
// Titres de section
// ---------------------------------------------------------------------------

export function titreSection(texte: string, sousTitre?: string): Content {
  return {
    stack: [
      { text: texte, style: 'titreSection' },
      ...(sousTitre ? [{ text: sousTitre, style: 'sousTitreSection' }] : []),
    ],
    margin: [0, 6, 0, 8],
  };
}

// ---------------------------------------------------------------------------
// Tableaux
// ---------------------------------------------------------------------------

export interface Colonne {
  titre: string;
  largeur: number | '*' | 'auto';
  /** Toute colonne de chiffres est alignée à droite, totaux compris. */
  chiffres?: boolean;
}

/** Cellule : texte simple, ou texte principal + sous-ligne discrète. */
export type Cellule =
  | string
  | { texte: string; sousLigne?: string | null; mono?: boolean; couleur?: string; gras?: boolean };

export type LigneTableau =
  | { type: 'donnees'; cellules: Cellule[] }
  /** Titre de groupe (catégorie…), sur toute la largeur. */
  | { type: 'groupe'; texte: string }
  /** Sous-total d'un groupe, en gras, sans filet épais. */
  | { type: 'sousTotal'; cellules: Cellule[] };

function cellule(c: Cellule, colonne: Colonne, options: { gras?: boolean } = {}): TableCell {
  const alignment: Alignment = colonne.chiffres ? 'right' : 'left';
  if (typeof c === 'string') {
    return { text: c, alignment, noWrap: colonne.chiffres, bold: options.gras };
  }
  const principal: ContentText = {
    text: c.texte,
    alignment,
    noWrap: colonne.chiffres,
    bold: options.gras || c.gras,
    color: c.couleur,
    // Courier a des métriques plus hautes que Roboto : léger décalage pour
    // garder la même ligne de base que les cellules voisines.
    ...(c.mono ? { font: 'Courier', fontSize: 7.5, margin: [0, 2.2, 0, 0] as [number, number, number, number] } : {}),
  };
  return c.sousLigne
    ? { stack: [principal, { text: c.sousLigne, style: 'sousLigne', alignment }] }
    : principal;
}

/**
 * Tableau du gabarit : en-tête gris répété à chaque page (headerRows),
 * lignes alternées, lignes jamais coupées entre deux pages, ligne de
 * totaux séparée par un filet noir de 2 pt.
 */
export function tableau(options: {
  colonnes: Colonne[];
  lignes: LigneTableau[];
  totaux?: Cellule[];
  /** Taille de police des lignes (8 pt par défaut, 7,5 pour les tableaux denses). */
  taillePolice?: number;
}): ContentTable {
  const { colonnes, lignes, totaux } = options;
  const corps: TableCell[][] = [
    colonnes.map((col) => ({
      text: col.titre,
      style: 'enteteTableau',
      alignment: col.chiffres ? 'right' : 'left',
      noWrap: col.chiffres,
    })),
  ];
  const fonds: (string | null)[] = [COULEURS.enteteTableau];
  let alternance = 0;

  for (const ligne of lignes) {
    if (ligne.type === 'groupe') {
      corps.push([
        { text: ligne.texte, colSpan: colonnes.length, style: 'titreGroupe' },
        ...colonnes.slice(1).map(() => ({ text: '' })),
      ]);
      fonds.push(null);
      alternance = 0;
    } else {
      corps.push(colonnes.map((col, i) => cellule(ligne.cellules[i] ?? '', col, { gras: ligne.type === 'sousTotal' })));
      fonds.push(ligne.type === 'sousTotal' ? COULEURS.enteteTableau : alternance++ % 2 === 1 ? COULEURS.ligneAlternee : null);
    }
  }

  const indexTotaux = totaux ? corps.length : -1;
  if (totaux) {
    corps.push(colonnes.map((col, i) => cellule(totaux[i] ?? '', col, { gras: true })));
    fonds.push(null);
  }

  const layout: CustomTableLayout = {
    fillColor: (i) => fonds[i] ?? null,
    hLineWidth: (i) => (i === indexTotaux ? 2 : i === 0 || i === corps.length ? 0 : 0.5),
    hLineColor: (i) => (i === indexTotaux ? COULEURS.noir : COULEURS.filet),
    vLineWidth: () => 0,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 2.5,
    paddingBottom: () => 2.5,
  };

  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: colonnes.map((c) => c.largeur),
      body: corps,
    },
    layout,
    fontSize: options.taillePolice ?? 8,
    margin: [0, 0, 0, 14],
  };
}

// ---------------------------------------------------------------------------
// Barre de répartition segmentée
// ---------------------------------------------------------------------------

export interface Segment {
  libelle: string;
  valeur: number;
  couleur: string;
  /** Texte de droite de la légende ; montant formaté par défaut. */
  valeurAffichee?: string;
}

/** Barre horizontale segmentée + légende chiffrée (valeur et part). */
export function barreRepartition(segments: Segment[]): Content {
  const total = segments.reduce((a, s) => a + Math.max(s.valeur, 0), 0);
  const hauteur = 10;
  let x = 0;
  const rectangles = total > 0
    ? segments
        .filter((s) => s.valeur > 0)
        .map((s) => {
          const largeur = (s.valeur / total) * LARGEUR_UTILE;
          const rect = { type: 'rect' as const, x, y: 0, w: largeur, h: hauteur, color: s.couleur };
          x += largeur;
          return rect;
        })
    : [{ type: 'rect' as const, x: 0, y: 0, w: LARGEUR_UTILE, h: hauteur, color: COULEURS.filet }];

  const legende: TableCell[][] = segments.map((s) => [
    { canvas: [{ type: 'rect', x: 0, y: 2, w: 7, h: 7, color: s.couleur }], width: 7 },
    { text: s.libelle },
    { text: s.valeurAffichee ?? montant(s.valeur), alignment: 'right', noWrap: true },
    { text: total > 0 ? pourcentage((s.valeur / total) * 100) : '—', alignment: 'right', noWrap: true, color: COULEURS.discret },
  ]);

  return {
    stack: [
      { canvas: rectangles, margin: [0, 0, 0, 8] },
      {
        table: { widths: [10, '*', 'auto', 44], body: legende },
        layout: 'noBorders',
        fontSize: 8,
      },
    ],
    margin: [0, 0, 0, 16],
    unbreakable: true,
  };
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

/** Cadres de signature côte à côte, jamais coupés entre deux pages. */
export function zoneSignature(signataires: string[]): Content {
  return {
    unbreakable: true,
    margin: [0, 18, 0, 0],
    columns: signataires.map((libelle) => ({
      stack: [
        { text: libelle, style: 'libelleSignature' },
        { text: 'Date, nom et signature', style: 'mention', margin: [0, 2, 0, 0] },
        {
          canvas: [{ type: 'rect', x: 0, y: 0, w: (LARGEUR_UTILE - 16 * (signataires.length - 1)) / signataires.length, h: 64, lineColor: COULEURS.filet, lineWidth: 0.75 }],
          margin: [0, 6, 0, 0],
        },
      ],
    })),
    columnGap: 16,
  };
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function documentRapport(
  entreprise: IdentiteEntreprise,
  meta: MetaRapport,
  contenu: Content[],
): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    // Marge basse élargie : le pied de page s'y inscrit.
    pageMargins: [MARGE, MARGE, MARGE, MARGE + 14],
    info: {
      title: `${meta.titre} — ${entreprise.nom}`,
      author: entreprise.nom,
      creator: 'StockFlow',
      producer: 'StockFlow',
    },
    footer: piedDePage(`${meta.titre} — ${entreprise.nom}`),
    content: [entete(entreprise, meta), ...contenu],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEURS.texte, lineHeight: 1.15 },
    styles: {
      raisonSociale: { fontSize: 13, bold: true, color: COULEURS.encre },
      coordonnees: { fontSize: 8, color: COULEURS.discret, margin: [0, 1.5, 0, 0] },
      titreRapport: { fontSize: 15, bold: true, color: COULEURS.encre },
      periode: { fontSize: 9, color: COULEURS.texte, margin: [0, 2, 0, 0] },
      mention: { fontSize: 7.5, color: COULEURS.discret, margin: [0, 2, 0, 0] },
      pied: { fontSize: 7.5, color: COULEURS.discret },
      libelleIndicateur: { fontSize: 7.5, color: COULEURS.discret },
      valeurIndicateur: { fontSize: 13, bold: true, color: COULEURS.encre, margin: [0, 3, 0, 0] },
      detailIndicateur: { fontSize: 7.5, color: COULEURS.discret, margin: [0, 2, 0, 0] },
      titreSection: { fontSize: 11, bold: true, color: COULEURS.encre },
      sousTitreSection: { fontSize: 8, color: COULEURS.discret, margin: [0, 2, 0, 0] },
      enteteTableau: { fontSize: 7.5, bold: true, color: COULEURS.texte },
      titreGroupe: { fontSize: 8.5, bold: true, color: COULEURS.encre, margin: [0, 4, 0, 0] },
      sousLigne: { fontSize: 7, color: COULEURS.discret },
      libelleSignature: { fontSize: 9, bold: true, color: COULEURS.encre },
      paragraphe: { fontSize: 8.5, color: COULEURS.texte, margin: [0, 0, 0, 6] },
    },
  };
}
