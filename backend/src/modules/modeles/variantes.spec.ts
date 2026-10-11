import { describe, expect, it } from 'vitest';
import {
  cleVariante,
  combinaisons,
  nomVariante,
  normaliserAttributs,
  referenceVariante,
  refusModificationAttributs,
  tailleGrille,
} from './variantes.js';

describe('Variantes — règles pures', () => {
  const attributs = [
    { nom: 'Couleur', valeurs: ['Rouge', 'Bleu'] },
    { nom: 'Taille', valeurs: ['S', 'M', 'L'] },
  ];

  it('grille complète : produit cartésien dans l’ordre des attributs', () => {
    expect(tailleGrille(attributs)).toBe(6);
    expect(tailleGrille([])).toBe(0);
    expect(combinaisons(attributs)).toEqual([
      { Couleur: 'Rouge', Taille: 'S' },
      { Couleur: 'Rouge', Taille: 'M' },
      { Couleur: 'Rouge', Taille: 'L' },
      { Couleur: 'Bleu', Taille: 'S' },
      { Couleur: 'Bleu', Taille: 'M' },
      { Couleur: 'Bleu', Taille: 'L' },
    ]);
  });

  it('normalisation : espaces superflus et doublons sans tenir compte de la casse', () => {
    expect(normaliserAttributs([{ nom: '  Taille ', valeurs: [' M', 'm', 'XL  ', '', 'Très   grand'] }])).toEqual([
      { nom: 'Taille', valeurs: ['M', 'XL', 'Très grand'] },
    ]);
  });

  it('clé indépendante de la casse et de l’ordre ; nom et référence générés', () => {
    expect(cleVariante({ Taille: 'M', Couleur: 'Rouge' })).toBe(cleVariante({ couleur: 'rouge', taille: 'm' }));
    const ordre = ['Couleur', 'Taille'];
    expect(nomVariante('T-shirt', { Taille: 'M', Couleur: 'Rouge' }, ordre)).toBe('T-shirt — Rouge / M');
    expect(referenceVariante('tshirt', { Couleur: 'Bleu ciel', Taille: 'XL' }, ordre)).toBe('TSHIRT-BLEUCIEL-XL');
    expect(referenceVariante('TS', { Couleur: 'Écru', Taille: '42' }, ordre)).toBe('TS-ECRU-42');
    expect(referenceVariante(null, { Couleur: 'Rouge', Taille: 'M' }, ordre)).toBeNull();
  });

  it('modification des attributs : ajout de valeurs seulement', () => {
    expect(
      refusModificationAttributs(attributs, [
        { nom: 'couleur', valeurs: ['rouge', 'Bleu', 'Vert'] },
        { nom: 'Taille', valeurs: ['S', 'M', 'L', 'XL'] },
      ]),
    ).toBeNull();
    expect(refusModificationAttributs(attributs, [{ nom: 'Couleur', valeurs: ['Rouge', 'Bleu'] }])).toMatch(/axes/);
    expect(
      refusModificationAttributs(attributs, [
        { nom: 'Couleur', valeurs: ['Rouge'] },
        { nom: 'Taille', valeurs: ['S', 'M', 'L'] },
      ]),
    ).toMatch(/« Bleu »/);
  });
});
