import { Injectable, NotFoundException } from '@nestjs/common';
import type { Content } from 'pdfmake/interfaces.js';
import { PrismaService } from '../../config/prisma.service.js';
import { BOM_UTF8, ligneCsv } from '../../common/pagination/csv.js';
import { dateIso, formaterDate } from './format.js';
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
  type LigneTableau,
} from './pdf/gabarit.js';
import { COULEURS_SERIES, type RapportGenere } from './rapports.types.js';

export interface FiltresStock {
  emplacementId?: string;
  categorieId?: string;
  detail: boolean;
  graphiques: boolean;
  signature: boolean;
}

export type EtatStock = 'En stock' | 'Seuil' | 'Rupture';

export interface LigneStock {
  produitId: string;
  designation: string;
  fournisseur: string | null;
  reference: string | null;
  categorie: string;
  emplacement: string;
  quantite: number;
  prixAchat: number;
  valeur: number;
  peremption: Date | null;
  etat: EtatStock;
}

/** Même règle que l'application : rupture à 0, seuil strictement en dessous. */
function etatStock(stockTotal: number, seuil: number): EtatStock {
  if (stockTotal <= 0) return 'Rupture';
  if (stockTotal < seuil) return 'Seuil';
  return 'En stock';
}

const SANS_CATEGORIE = 'Sans catégorie';

/**
 * État du stock à l'instant de l'édition : synthèse, répartition de la
 * valeur par emplacement, détail par catégorie avec sous-totaux. Valeurs
 * au prix d'achat actuel de chaque référence (et de vente pour la marge).
 */
@Injectable()
export class RapportStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  async donnees(entrepriseId: string, filtres: Pick<FiltresStock, 'emplacementId' | 'categorieId'>) {
    const [emplacements, categorie] = await Promise.all([
      this.prisma.emplacement.findMany({
        where: { entrepriseId, ...(filtres.emplacementId ? { id: filtres.emplacementId } : {}) },
        select: { id: true, nom: true },
        orderBy: { nom: 'asc' },
      }),
      filtres.categorieId
        ? this.prisma.categorie.findUnique({ where: { id: filtres.categorieId }, select: { entrepriseId: true, nom: true } })
        : null,
    ]);
    if (filtres.emplacementId && emplacements.length === 0) throw new NotFoundException('Emplacement introuvable.');
    if (filtres.categorieId && categorie?.entrepriseId !== entrepriseId) throw new NotFoundException('Catégorie introuvable.');

    const produits = await this.prisma.produit.findMany({
      where: { entrepriseId, archive: false, ...(filtres.categorieId ? { categorieId: filtres.categorieId } : {}) },
      select: {
        id: true,
        nom: true,
        reference: true,
        seuilAlerte: true,
        prixAchat: true,
        prixVente: true,
        suiviParLot: true,
        categorie: { select: { nom: true } },
        fournisseursAssocies: { select: { fournisseur: { select: { nom: true } } } },
        stocks: { select: { emplacementId: true, quantite: true } },
      },
      orderBy: { nom: 'asc' },
    });

    // Première péremption encore en stock, par référence et emplacement.
    const lots = await this.prisma.lot.groupBy({
      by: ['produitId', 'emplacementId'],
      where: { entrepriseId, quantite: { gt: 0 }, datePeremption: { not: null } },
      _min: { datePeremption: true },
    });
    const peremptionDe = new Map(lots.map((l) => [`${l.produitId}:${l.emplacementId}`, l._min.datePeremption]));
    const nomEmplacement = new Map(emplacements.map((e) => [e.id, e.nom]));

    const lignes: LigneStock[] = [];
    let valeurVente = 0;
    for (const p of produits) {
      const stockTotal = p.stocks.reduce((a, s) => a + s.quantite, 0);
      const commun = {
        produitId: p.id,
        designation: p.nom,
        fournisseur: p.fournisseursAssocies.map((f) => f.fournisseur.nom).sort().join(', ') || null,
        reference: p.reference,
        categorie: p.categorie?.nom ?? SANS_CATEGORIE,
        prixAchat: p.prixAchat ?? 0,
        etat: etatStock(stockTotal, p.seuilAlerte),
      };
      // Filtre d'emplacement : une ligne par référence, même à zéro (la
      // rupture dans ce dépôt est une information). Sinon, une ligne par
      // emplacement détenteur, ou une seule ligne « — » sans aucun stock.
      const parts = filtres.emplacementId
        ? [{ emplacementId: filtres.emplacementId, quantite: p.stocks.find((s) => s.emplacementId === filtres.emplacementId)?.quantite ?? 0 }]
        : p.stocks.filter((s) => s.quantite !== 0);
      if (parts.length === 0) {
        lignes.push({ ...commun, emplacement: '—', quantite: 0, valeur: 0, peremption: null });
        continue;
      }
      for (const part of parts.sort((a, b) => (nomEmplacement.get(a.emplacementId) ?? '').localeCompare(nomEmplacement.get(b.emplacementId) ?? ''))) {
        lignes.push({
          ...commun,
          emplacement: nomEmplacement.get(part.emplacementId) ?? '—',
          quantite: part.quantite,
          valeur: part.quantite * commun.prixAchat,
          peremption: p.suiviParLot ? (peremptionDe.get(`${p.id}:${part.emplacementId}`) ?? null) : null,
        });
        valeurVente += part.quantite * (p.prixVente ?? 0);
      }
    }

    const valeurAchat = lignes.reduce((a, l) => a + l.valeur, 0);
    const parEmplacement = emplacements.map((e) => ({
      emplacementId: e.id,
      nom: e.nom,
      valeur: lignes.filter((l) => l.emplacement === e.nom).reduce((a, l) => a + l.valeur, 0),
    }));
    return {
      emplacement: filtres.emplacementId ? emplacements[0].nom : null,
      categorie: categorie?.nom ?? null,
      synthese: {
        references: produits.length,
        quantite: lignes.reduce((a, l) => a + l.quantite, 0),
        valeurAchat,
        valeurVente,
        tauxMarge: valeurAchat > 0 ? ((valeurVente - valeurAchat) / valeurAchat) * 100 : null,
        sansPrixAchat: produits.filter((p) => p.prixAchat === null).length,
      },
      parEmplacement,
      avecPeremption: produits.some((p) => p.suiviParLot),
      lignes,
    };
  }

  async generer(entrepriseId: string, utilisateurId: string, filtres: FiltresStock): Promise<RapportGenere> {
    const [d, entreprise, editePar] = await Promise.all([
      this.donnees(entrepriseId, filtres),
      this.pdf.identite(entrepriseId),
      this.pdf.nomUtilisateur(utilisateurId),
    ]);
    const editeLe = new Date();
    const perimetre = [d.emplacement, d.categorie].filter(Boolean).join(' · ');

    const contenu: Content[] = [
      bandeauSynthese([
        { libelle: 'Références actives', valeur: nombre(d.synthese.references), detail: perimetre || 'Tous emplacements' },
        { libelle: 'Quantité totale', valeur: nombre(d.synthese.quantite), detail: 'unités en stock' },
        {
          libelle: 'Valeur d’achat',
          valeur: `${montant(d.synthese.valeurAchat)} GNF`,
          detail: d.synthese.sansPrixAchat > 0 ? `${d.synthese.sansPrixAchat} réf. sans prix d’achat (comptées à 0)` : 'au prix d’achat actuel',
        },
        {
          libelle: 'Valeur de vente',
          valeur: `${montant(d.synthese.valeurVente)} GNF`,
          detail: d.synthese.tauxMarge === null ? 'taux de marge : —' : `taux de marge ${pourcentage(d.synthese.tauxMarge)} (sur prix d’achat)`,
        },
      ]),
    ];

    if (filtres.graphiques && d.parEmplacement.length > 0) {
      contenu.push(
        titreSection('Répartition par emplacement', 'Valeur d’achat du stock détenu par chaque emplacement'),
        barreRepartition(
          d.parEmplacement.map((e, i) => ({ libelle: e.nom, valeur: e.valeur, couleur: COULEURS_SERIES[i % COULEURS_SERIES.length] })),
        ),
      );
    }

    if (filtres.detail) {
      const colonnes = [
        { titre: 'Désignation', largeur: '*' as const },
        { titre: 'Référence', largeur: 58 },
        { titre: 'Emplacement', largeur: 62 },
        { titre: 'Qté', largeur: 34, chiffres: true },
        { titre: 'Prix d’achat', largeur: 48, chiffres: true },
        { titre: 'Valeur', largeur: 62, chiffres: true },
        ...(d.avecPeremption ? [{ titre: 'Péremption', largeur: 44 }] : []),
        { titre: 'État', largeur: 38 },
      ];
      const couleurEtat = { 'En stock': COULEURS.ok, Seuil: COULEURS.faible, Rupture: COULEURS.rupture } as const;
      const ligneTableau = (l: LigneStock): LigneTableau => ({
        type: 'donnees',
        cellules: [
          { texte: l.designation, sousLigne: l.fournisseur },
          { texte: l.reference ?? '—', mono: !!l.reference },
          l.emplacement,
          nombre(l.quantite),
          montant(l.prixAchat),
          montant(l.valeur),
          ...(d.avecPeremption ? [l.peremption ? formaterDate(l.peremption) : '—'] : []),
          { texte: l.etat, couleur: couleurEtat[l.etat] },
        ],
      });
      const vide = (n: number) => Array.from({ length: n }, () => '');
      const totalLigne = (libelle: string, groupe: LigneStock[]) => [
        libelle,
        ...vide(2),
        nombre(groupe.reduce((a, l) => a + l.quantite, 0)),
        '',
        montant(groupe.reduce((a, l) => a + l.valeur, 0)),
        ...vide(d.avecPeremption ? 2 : 1),
      ];

      const categories = [...new Set(d.lignes.map((l) => l.categorie))].sort((a, b) =>
        a === SANS_CATEGORIE ? 1 : b === SANS_CATEGORIE ? -1 : a.localeCompare(b),
      );
      const lignes: LigneTableau[] = categories.flatMap((cat) => {
        const groupe = d.lignes.filter((l) => l.categorie === cat);
        return [
          { type: 'groupe' as const, texte: cat },
          ...groupe.map(ligneTableau),
          { type: 'sousTotal' as const, cellules: totalLigne(`Sous-total ${cat}`, groupe) },
        ];
      });
      contenu.push(
        titreSection('Détail par catégorie', 'État : stock total de la référence, tous emplacements, comparé à son seuil d’alerte'),
        tableau({ colonnes, lignes, totaux: totalLigne('Total général', d.lignes), taillePolice: 7.5 }),
      );
    }

    if (filtres.signature) contenu.push(zoneSignature(['Établi par', 'Vérifié par']));

    const titre = 'État du stock';
    const document = documentRapport(
      entreprise,
      { titre, periode: `au ${formaterDate(editeLe)}${perimetre ? ` · ${perimetre}` : ''}`, editeLe, editePar },
      contenu,
    );
    return {
      nomFichier: `etat-du-stock-${dateIso(editeLe)}`,
      pdf: () => this.pdf.rendre(document),
      csv: () =>
        BOM_UTF8 +
        ligneCsv(['Catégorie', 'Désignation', 'Fournisseur', 'Référence', 'Emplacement', 'Quantité', 'Prix d’achat', 'Valeur', 'Péremption', 'État'], ';') +
        d.lignes
          .map((l) =>
            ligneCsv(
              [l.categorie, l.designation, l.fournisseur ?? '', l.reference ?? '', l.emplacement, l.quantite, l.prixAchat, l.valeur, l.peremption ? formaterDate(l.peremption) : '', l.etat],
              ';',
            ),
          )
          .join(''),
    };
  }
}
