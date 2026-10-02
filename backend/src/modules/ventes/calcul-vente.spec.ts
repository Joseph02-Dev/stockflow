import { describe, it, expect } from 'vitest';
import { calculerTotaux } from './calcul-vente.js';

describe('calculerTotaux', () => {
  it('reproduit exactement le reçu de référence (un seul taux)', () => {
    // Sous-total 7 436 000 : 40 × 95 000 + 12 × 148 000 + 1 860 000 d'autres lignes.
    const t = calculerTotaux(
      [
        { quantite: 40, prixUnitaire: 95_000, tauxTva: 18 },
        { quantite: 12, prixUnitaire: 148_000, tauxTva: 18 },
        { quantite: 20, prixUnitaire: 93_000, tauxTva: 18 },
      ],
      4,
    );
    expect(t.montantsLignes).toEqual([3_800_000, 1_776_000, 1_860_000]);
    expect(t.sousTotal).toBe(7_436_000);
    expect(t.remise).toBe(297_440);
    expect(t.baseTva).toBe(7_138_560);
    expect(t.montantTva).toBe(1_284_941);
    expect(t.total).toBe(8_423_501);
    expect(t.tvaParTaux).toEqual([
      { taux: 18, base: 7_138_560, montant: 1_284_941 },
    ]);
  });

  it('arrondit au plus proche, demi vers le haut, à chaque étape', () => {
    // remise = 1 001 × 50 / 100 = 500,5 → 501 ; TVA = 500 × 1 / 100 = 5.
    const t = calculerTotaux(
      [{ quantite: 1, prixUnitaire: 1_001, tauxTva: 1 }],
      50,
    );
    expect(t.remise).toBe(501);
    expect(t.montantTva).toBe(5);
    expect(t.total).toBe(505);
  });

  it('ventile la remise entre taux sans perdre ni créer un franc', () => {
    const t = calculerTotaux(
      [
        { quantite: 3, prixUnitaire: 333_333, tauxTva: 18 },
        { quantite: 1, prixUnitaire: 100_001, tauxTva: 0 },
      ],
      7,
    );
    const remiseVentilee = t.tvaParTaux.reduce(
      (a, g) => a + (g.taux === 18 ? 999_999 : 100_001) - g.base,
      0,
    );
    expect(remiseVentilee).toBe(t.remise);
    expect(t.tvaParTaux.map((g) => g.taux)).toEqual([18, 0]);
    expect(t.tvaParTaux[1].montant).toBe(0);
    expect(t.montantTva).toBe(t.tvaParTaux[0].montant);
    expect(t.total).toBe(t.baseTva + t.montantTva);
  });

  it('reste exact sur de très gros montants (pas de perte flottante)', () => {
    const t = calculerTotaux(
      [{ quantite: 10_000, prixUnitaire: 950_000, tauxTva: 18 }],
      3,
    );
    expect(t.sousTotal).toBe(9_500_000_000);
    expect(t.remise).toBe(285_000_000);
    expect(t.montantTva).toBe(1_658_700_000);
    expect(t.total).toBe(10_873_700_000);
  });

  it('gère une vente sans remise ni TVA', () => {
    const t = calculerTotaux([
      { quantite: 2, prixUnitaire: 45_000, tauxTva: 0 },
    ]);
    expect(t).toMatchObject({
      sousTotal: 90_000,
      remise: 0,
      montantTva: 0,
      total: 90_000,
    });
  });
});

describe('miroir frontend du calcul', () => {
  it('donne exactement les mêmes totaux que le serveur', async () => {
    // Le frontend affiche les totaux pendant la saisie : toute divergence
    // avec le serveur ferait mentir l'écran de vente.
    const { calculerTotaux: calculFrontend } =
      await import('../../../../frontend/src/lib/calculVente.js');
    const cas: [Parameters<typeof calculerTotaux>[0], number][] = [
      [
        [
          { quantite: 40, prixUnitaire: 95_000, tauxTva: 18 },
          { quantite: 12, prixUnitaire: 148_000, tauxTva: 18 },
        ],
        4,
      ],
      [
        [
          { quantite: 3, prixUnitaire: 333_333, tauxTva: 18 },
          { quantite: 1, prixUnitaire: 100_001, tauxTva: 0 },
        ],
        7,
      ],
      [
        [
          { quantite: 7, prixUnitaire: 12_345, tauxTva: 5 },
          { quantite: 2, prixUnitaire: 999, tauxTva: 18 },
          { quantite: 1, prixUnitaire: 1, tauxTva: 0 },
        ],
        33,
      ],
      [[{ quantite: 1, prixUnitaire: 1_001, tauxTva: 1 }], 50],
    ];
    for (const [lignes, remise] of cas) {
      expect(calculFrontend(lignes, remise)).toEqual(
        calculerTotaux(lignes, remise),
      );
    }
  });
});
