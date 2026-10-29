import type { Content, TableCell } from 'pdfmake/interfaces.js';
import type { DefinitionRapport } from '../../rapports/pdf/rendu-pdf.js';
import { COULEURS, LARGEUR_UTILE, MARGE, montant, type IdentiteEntreprise } from '../../rapports/pdf/gabarit.js';
import { formaterDate, formaterDateHeure, formaterMontant, ESPACE_FINE_PDF } from '../../rapports/format.js';

/**
 * Facture d'une vente, A4 portrait : bandeau de marque, identité de
 * l'entreprise, client, lignes, totaux, règlements. Fonction pure : la vente
 * arrive déjà calculée (VentesService.obtenir), rien n'est recalculé ici.
 */

/** Couleur d'action de l'application (--color-action). */
const ACTION = '#C2440B';
const ACTION_PALE = '#FCEFE7';

export interface VentePourFacture {
  numero: string;
  statut: 'VALIDEE' | 'ANNULEE';
  createdAt: Date;
  sousTotal: number;
  remise: number;
  tauxRemise: number;
  tvaParTaux: { taux: number; montant: number }[];
  total: number;
  paye: number;
  resteDu: number;
  montantARembourser: number;
  echeanceAt: Date | null;
  annuleeAt: Date | null;
  motifAnnulation: string | null;
  client: { nom: string; nomCommerce: string | null; telephone: string | null } | null;
  emplacement: { nom: string };
  utilisateur: { nom: string };
  lignes: { libelle: string; quantite: number; prixUnitaire: number; tauxTva: number; montantLigne: number }[];
  reglements: { montant: number; mode: string; createdAt: Date }[];
}

const MODES: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
  CREDIT: 'Crédit',
  AVOIR: 'Avoir (retour)',
};

const quantite = (n: number) => formaterMontant(n, ESPACE_FINE_PDF);

/** Statut lisible et sa couleur : pastille en haut à droite. */
export function statutFacture(vente: Pick<VentePourFacture, 'statut' | 'paye' | 'resteDu'>) {
  if (vente.statut === 'ANNULEE') return { libelle: 'ANNULÉE', couleur: COULEURS.rupture, fond: '#FDECEA' };
  if (vente.resteDu <= 0) return { libelle: 'RÉGLÉE', couleur: COULEURS.ok, fond: '#E7F6EC' };
  if (vente.paye > 0) return { libelle: 'PARTIELLEMENT RÉGLÉE', couleur: COULEURS.faible, fond: '#FEF3E2' };
  return { libelle: 'À RÉGLER', couleur: COULEURS.faible, fond: '#FEF3E2' };
}

function coordonnees(entreprise: IdentiteEntreprise): string[] {
  return [
    entreprise.adresse,
    [entreprise.telephone, entreprise.email].filter(Boolean).join(' · ') || null,
    [entreprise.rccm && `RCCM ${entreprise.rccm}`, entreprise.nif && `NIF ${entreprise.nif}`].filter(Boolean).join(' · ') || null,
  ].filter((ligne): ligne is string => !!ligne);
}

function entete(vente: VentePourFacture, entreprise: IdentiteEntreprise): Content {
  const identite: Content = {
    stack: [
      { text: entreprise.nom, style: 'raisonSociale' },
      ...coordonnees(entreprise).map((ligne) => ({ text: ligne, style: 'coordonnees' })),
    ],
  };
  const statut = statutFacture(vente);
  return {
    columns: [
      entreprise.logo
        ? {
            width: '*',
            columns: [
              { image: entreprise.logo, fit: [56, 56], width: 56 },
              { ...identite, margin: [12, 2, 0, 0] },
            ],
          }
        : { ...identite, width: '*' },
      {
        width: 'auto',
        stack: [
          { text: 'FACTURE', style: 'titreFacture', alignment: 'right' },
          { text: `N° ${vente.numero}`, style: 'numeroFacture', alignment: 'right' },
          {
            alignment: 'right',
            margin: [0, 8, 0, 0],
            table: { body: [[{ text: statut.libelle, style: 'pastille', color: statut.couleur, fillColor: statut.fond }]] },
            layout: 'noBorders',
          },
        ],
      },
    ],
    columnGap: 16,
    margin: [0, 0, 0, 22],
  };
}

function carte(titre: string, lignes: { texte: string; fort?: boolean }[]): TableCell {
  return {
    stack: [
      { text: titre.toUpperCase(), style: 'titreCarte' },
      ...lignes.map((l) => ({ text: l.texte, style: l.fort ? 'valeurCarteForte' : 'valeurCarte' })),
    ],
    fillColor: COULEURS.fondSynthese,
    margin: [12, 10, 12, 10],
  };
}

function cartes(vente: VentePourFacture): Content {
  const client = vente.client
    ? [
        { texte: vente.client.nom, fort: true },
        ...(vente.client.nomCommerce ? [{ texte: vente.client.nomCommerce }] : []),
        ...(vente.client.telephone ? [{ texte: vente.client.telephone }] : []),
      ]
    : [{ texte: 'Client de passage', fort: true }];
  const details = [
    { texte: `Date : ${formaterDateHeure(vente.createdAt)}` },
    { texte: `Point de vente : ${vente.emplacement.nom}` },
    { texte: `Vendeur : ${vente.utilisateur.nom}` },
    ...(vente.statut === 'VALIDEE' && vente.resteDu > 0 && vente.echeanceAt
      ? [{ texte: `Échéance du solde : ${formaterDate(vente.echeanceAt)}`, fort: true }]
      : []),
  ];
  return {
    table: { widths: ['*', '*'], body: [[carte('Facturé à', client), carte('Détails', details)]] },
    layout: 'facture-cartes',
    margin: [0, 0, -8, 20],
  };
}

function lignes(vente: VentePourFacture): Content {
  const entetes = ['#', 'Désignation', 'Qté', 'Prix unitaire', 'TVA', 'Montant HT'].map(
    (texte, i): TableCell => ({ text: texte, style: 'enteteLignes', fillColor: COULEURS.encre, alignment: i >= 2 ? 'right' : 'left' }),
  );
  const corps = vente.lignes.map((l, i): TableCell[] => [
    { text: String(i + 1), color: COULEURS.discret },
    { text: l.libelle, color: COULEURS.encre },
    { text: quantite(l.quantite), alignment: 'right', noWrap: true },
    { text: montant(l.prixUnitaire), alignment: 'right', noWrap: true },
    { text: `${l.tauxTva} %`, alignment: 'right', noWrap: true, color: COULEURS.discret },
    { text: montant(l.montantLigne), alignment: 'right', noWrap: true, bold: true, color: COULEURS.encre },
  ]);
  return {
    table: {
      headerRows: 1,
      widths: [16, '*', 'auto', 'auto', 'auto', 'auto'],
      body: [entetes, ...corps],
      dontBreakRows: true,
    },
    layout: 'facture-lignes',
    margin: [0, 0, 0, 14],
  };
}

function totaux(vente: VentePourFacture): Content {
  const ligne = (libelle: string, valeur: string, options: { couleur?: string; gras?: boolean } = {}): TableCell[] => [
    { text: libelle, color: options.couleur ?? COULEURS.texte, bold: options.gras },
    { text: valeur, alignment: 'right', noWrap: true, color: options.couleur ?? COULEURS.encre, bold: options.gras },
  ];
  const corps: TableCell[][] = [ligne('Sous-total HT', montant(vente.sousTotal))];
  if (vente.remise > 0) corps.push(ligne(`Remise ${vente.tauxRemise} %`, montant(-vente.remise)));
  for (const t of vente.tvaParTaux) {
    if (t.montant > 0 || vente.tvaParTaux.length === 1) corps.push(ligne(`TVA ${t.taux} %`, montant(t.montant)));
  }
  corps.push([
    { text: 'TOTAL TTC', style: 'libelleTotal', fillColor: ACTION },
    { text: `${montant(vente.total)} GNF`, style: 'valeurTotal', alignment: 'right', noWrap: true, fillColor: ACTION },
  ]);
  if (vente.statut === 'VALIDEE') {
    corps.push(ligne('Payé', montant(vente.paye)));
    corps.push(
      vente.resteDu > 0
        ? ligne('Reste dû', `${montant(vente.resteDu)} GNF`, { couleur: COULEURS.rupture, gras: true })
        : ligne('Reste dû', '0', { couleur: COULEURS.ok, gras: true }),
    );
  } else if (vente.montantARembourser > 0) {
    corps.push(ligne('À rembourser au client', `${montant(vente.montantARembourser)} GNF`, { couleur: COULEURS.rupture, gras: true }));
  }
  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 250,
        table: { widths: ['*', 'auto'], body: corps },
        layout: 'facture-totaux',
      },
    ],
    margin: [0, 0, 0, 20],
  };
}

function reglements(vente: VentePourFacture): Content[] {
  if (vente.reglements.length === 0) return [];
  const corps = vente.reglements.map((r): TableCell[] => [
    { text: formaterDateHeure(r.createdAt) },
    { text: MODES[r.mode] ?? r.mode },
    { text: montant(r.montant), alignment: 'right', noWrap: true, color: COULEURS.encre },
  ]);
  return [
    { text: 'Règlements', style: 'titreSection', margin: [0, 0, 0, 6] },
    {
      table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto'],
        body: [
          [
            { text: 'Date', style: 'enteteLignes', fillColor: COULEURS.encre },
            { text: 'Mode', style: 'enteteLignes', fillColor: COULEURS.encre },
            { text: 'Montant', style: 'enteteLignes', fillColor: COULEURS.encre, alignment: 'right' },
          ],
          ...corps,
        ],
      },
      layout: 'facture-lignes',
      margin: [0, 0, 0, 20],
    },
  ];
}

export function definitionFacture(vente: VentePourFacture, entreprise: IdentiteEntreprise): DefinitionRapport {
  const annulee = vente.statut === 'ANNULEE';
  const titre = `Facture ${vente.numero}`;
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGE, MARGE + 6, MARGE, MARGE + 14],
    info: { title: `${titre} — ${entreprise.nom}`, author: entreprise.nom, creator: 'NimbaFlow', producer: 'NimbaFlow' },
    piedDePage: `${titre} — ${entreprise.nom}`,
    // Bandeau de marque en haut de chaque page.
    background: [{ canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 6, color: ACTION }] }],
    ...(annulee ? { watermark: { text: 'ANNULÉE', color: COULEURS.rupture, opacity: 0.08, bold: true } } : {}),
    content: [
      entete(vente, entreprise),
      cartes(vente),
      ...(annulee
        ? [
            {
              text: `Vente annulée le ${formaterDateHeure(vente.annuleeAt!)}${vente.motifAnnulation ? ` — ${vente.motifAnnulation}` : ''}.`,
              style: 'avertissement',
              margin: [0, 0, 0, 14] as [number, number, number, number],
            },
          ]
        : []),
      lignes(vente),
      totaux(vente),
      ...reglements(vente),
      {
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGEUR_UTILE, y2: 0, lineWidth: 0.75, lineColor: COULEURS.filet }] },
          { text: 'Merci de votre confiance.', style: 'remerciement', margin: [0, 12, 0, 2] },
          { text: 'Montants en francs guinéens (GNF).', style: 'mention', alignment: 'center' },
        ],
        unbreakable: true,
      },
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COULEURS.texte, lineHeight: 1.2 },
    styles: {
      raisonSociale: { fontSize: 14, bold: true, color: COULEURS.encre },
      coordonnees: { fontSize: 8, color: COULEURS.discret, margin: [0, 2, 0, 0] },
      titreFacture: { fontSize: 24, bold: true, color: ACTION, characterSpacing: 1.5 },
      numeroFacture: { fontSize: 10, bold: true, color: COULEURS.encre, margin: [0, 2, 0, 0] },
      pastille: { fontSize: 7.5, bold: true, characterSpacing: 0.6, margin: [6, 2, 6, 2] },
      titreCarte: { fontSize: 7, bold: true, color: COULEURS.discret, characterSpacing: 0.8, margin: [0, 0, 0, 4] },
      valeurCarte: { fontSize: 8.5, color: COULEURS.texte, margin: [0, 1, 0, 0] },
      valeurCarteForte: { fontSize: 10, bold: true, color: COULEURS.encre, margin: [0, 1, 0, 0] },
      enteteLignes: { fontSize: 7.5, bold: true, color: '#FFFFFF' },
      libelleTotal: { fontSize: 10, bold: true, color: '#FFFFFF' },
      valeurTotal: { fontSize: 11, bold: true, color: '#FFFFFF' },
      titreSection: { fontSize: 10, bold: true, color: COULEURS.encre },
      avertissement: { fontSize: 9, bold: true, color: COULEURS.rupture, fillColor: ACTION_PALE },
      remerciement: { fontSize: 11, bold: true, color: COULEURS.encre, alignment: 'center' },
      mention: { fontSize: 7.5, color: COULEURS.discret },
      pied: { fontSize: 7.5, color: COULEURS.discret },
    },
  };
}
