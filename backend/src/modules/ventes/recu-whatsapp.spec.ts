import { describe, it, expect } from 'vitest';
// Code frontend (affichage et WhatsApp), testé ici faute de lanceur de
// tests côté frontend — même approche que le test de parité du calcul.
import { texteRecu } from '../../../../frontend/src/lib/recu.js';
import {
  lienWhatsApp,
  nettoyerNumero,
  texteRecuWhatsApp,
  texteRelance,
} from '../../../../frontend/src/lib/whatsapp.js';

const vente = {
  numero: 'V-2026-0847',
  statut: 'VALIDEE' as const,
  createdAt: new Date(2026, 8, 11, 11, 24).toISOString(),
  sousTotal: 7_436_000,
  remise: 297_440,
  tauxRemise: 4,
  tvaParTaux: [{ taux: 18, montant: 1_284_941 }],
  total: 8_423_501,
  paye: 3_000_000,
  resteDu: 5_423_501,
  echeanceAt: new Date(2026, 9, 11, 12).toISOString(),
  entreprise: { nom: 'Ets Camara & Frères' },
  lignes: [
    {
      libelle: 'Ciment Portland 50 kg',
      quantite: 40,
      prixUnitaire: 95_000,
      montantLigne: 3_800_000,
    },
    {
      libelle: 'Fer à béton 12 mm',
      quantite: 12,
      prixUnitaire: 148_000,
      montantLigne: 1_776_000,
    },
    {
      libelle: 'Tôle ondulée 3 m',
      quantite: 20,
      prixUnitaire: 93_000,
      montantLigne: 1_860_000,
    },
  ],
};

describe('Reçu texte', () => {
  it('suit le format convenu, montants alignés à droite', () => {
    expect(texteRecu(vente)).toBe(
      [
        'Ets Camara & Frères',
        '',
        'REÇU N° V-2026-0847',
        '11/09/2026 · 11:24',
        '',
        'Ciment Portland 50 kg',
        '  40 × 95 000 = 3 800 000',
        'Fer à béton 12 mm',
        '  12 × 148 000 = 1 776 000',
        'Tôle ondulée 3 m',
        '  20 × 93 000 = 1 860 000',
        '──────────────────',
        'Sous-total      7 436 000',
        'Remise 4 %       −297 440',
        'TVA 18 %        1 284 941',
        'TOTAL           8 423 501',
        '',
        'Payé            3 000 000',
        'RESTE DÛ        5 423 501',
        '',
        'Merci de votre confiance.',
        'Échéance du solde : 11/10/2026.',
      ].join('\n'),
    );
  });

  it('n’affiche ni « Payé » ni « RESTE DÛ » pour une vente réglée', () => {
    const texte = texteRecu({ ...vente, paye: vente.total, resteDu: 0 });
    expect(texte).not.toContain('RESTE DÛ');
    expect(texte).not.toContain('Échéance');
  });

  it('signale une vente annulée', () => {
    expect(texteRecu({ ...vente, statut: 'ANNULEE' })).toContain(
      '*** VENTE ANNULÉE ***',
    );
  });

  it('entoure le reçu WhatsApp de ``` pour un affichage monospace', () => {
    const texte = texteRecuWhatsApp(vente);
    expect(texte.startsWith('```\n')).toBe(true);
    expect(texte.endsWith('\n```')).toBe(true);
  });
});

describe('Lien WhatsApp', () => {
  it('nettoie le numéro : sans +, sans espaces, sans tirets', () => {
    expect(nettoyerNumero('+224 622 45 18 03')).toBe('224622451803');
    expect(nettoyerNumero('+224-622-45-18-03')).toBe('224622451803');
  });

  it('construit un lien wa.me avec le texte encodé', () => {
    const lien = lienWhatsApp(
      '+224 622 45 18 03',
      'Reçu & total : 8 423 501\nMerci',
    );
    expect(lien).toBe(
      `https://wa.me/224622451803?text=${encodeURIComponent('Reçu & total : 8 423 501\nMerci')}`,
    );
    expect(
      decodeURIComponent(new URL(lien).searchParams.get('text')!),
    ).toContain('Reçu & total');
  });

  it('rédige une relance de solde plutôt qu’un reçu', () => {
    const texte = texteRelance({
      entreprise: 'Ets Camara & Frères',
      client: 'Kadiatou Barry',
      solde: 1_473_000,
      ancienneteJours: 71,
      echeanceAt: null,
    });
    expect(texte).toContain('Bonjour Kadiatou Barry,');
    expect(texte).toContain('1 473 000 GNF');
    expect(texte).toContain('il y a 71 jours');
    expect(texte).not.toContain('REÇU');
  });
});
