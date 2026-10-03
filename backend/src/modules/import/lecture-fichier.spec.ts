import { describe, expect, it } from 'vitest';
import {
  decoderTexte,
  detecterSeparateur,
  lireCsv,
} from '../../../../frontend/src/lib/import/lecture.js';
import {
  proposerCorrespondance,
  reconnaitreEntete,
} from '../../../../frontend/src/lib/import/champs.js';

/** Encode un texte en Windows-1252 (caractères latins seulement), comme Excel sous Windows. */
function enWindows1252(texte: string): Uint8Array {
  const table: Record<string, number> = { '’': 0x92, '€': 0x80 };
  return Uint8Array.from([...texte].map((c) => table[c] ?? c.charCodeAt(0)));
}

describe('Lecture d’un fichier importé (navigateur)', () => {
  it('analyse un CSV au séparateur « ; » (Excel en français)', () => {
    const texte =
      'Désignation;Prix achat;Prix vente\nCiment 50 kg;82 000;95 000\nFer à béton;126 000;148 000\n';
    expect(detecterSeparateur(texte)).toBe(';');
    const lu = lireCsv(new TextEncoder().encode(texte));
    expect(lu.separateur).toBe(';');
    expect(lu.entetes).toEqual(['Désignation', 'Prix achat', 'Prix vente']);
    expect(lu.lignes[1].cellules).toEqual([
      'Fer à béton',
      '126 000',
      '148 000',
    ]);
  });

  it('garde la virgule quand elle donne les colonnes cohérentes, même avec des « ; » dans le texte', () => {
    const texte =
      'nom,prix,description\nVis,500,"inox; tête plate"\nClou,100,acier\n';
    expect(detecterSeparateur(texte)).toBe(',');
    expect(detecterSeparateur('a\tb\tc\n1\t2\t3\n')).toBe('\t');
  });

  it('restitue les accents d’un CSV en Windows-1252', () => {
    const octets = enWindows1252(
      'Nom;Catégorie\nCiment Portland;Matériaux\nRéserve d’eau;Plomberie\n',
    );
    const { texte, encodage } = decoderTexte(octets);
    expect(encodage).toBe('windows-1252');
    expect(texte).toContain('Réserve d’eau');
    const lu = lireCsv(octets);
    expect(lu.entetes).toEqual(['Nom', 'Catégorie']);
    expect(lu.lignes[0].cellules).toEqual(['Ciment Portland', 'Matériaux']);
  });

  it('lit l’UTF-8 avec ou sans BOM', () => {
    const avecBom = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('Nom\nRéserve\n'),
    ]);
    expect(lireCsv(avecBom).entetes).toEqual(['Nom']);
    expect(decoderTexte(new TextEncoder().encode('Réserve')).encodage).toBe(
      'utf-8',
    );
  });

  it('ignore les lignes vides, nettoie les espaces et numérote comme le fichier', () => {
    const lu = lireCsv(
      new TextEncoder().encode(
        'Nom;Prix\n  Ciment  ; 95 000 \n\n;;\nTôle;72000\n\n\n',
      ),
    );
    expect(lu.lignes).toEqual([
      { numero: 2, cellules: ['Ciment', '95 000'] },
      { numero: 5, cellules: ['Tôle', '72000'] },
    ]);
  });

  it('reconnaît les variantes réelles des en-têtes', () => {
    for (const entete of [
      'designation',
      'Libellé',
      'NOM',
      'Produit',
      'article',
      'name',
    ]) {
      expect(reconnaitreEntete(entete)).toBe('nom');
    }
    for (const entete of [
      'prix_achat',
      'PA',
      'Coût',
      'purchase_price',
      'Prix d’achat',
    ]) {
      expect(reconnaitreEntete(entete)).toBe('prixAchat');
    }
    expect(reconnaitreEntete('Colonne mystère')).toBeNull();
    expect(proposerCorrespondance(['Désignation', 'Libellé', 'Qté'])).toEqual([
      'nom',
      null,
      'quantite',
    ]);
  });
});
