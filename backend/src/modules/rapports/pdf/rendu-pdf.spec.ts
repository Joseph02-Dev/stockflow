import { afterAll, describe, expect, it } from 'vitest';
import { RenduPdf, type DefinitionRapport } from './rendu-pdf.js';

const document = (texte: string): DefinitionRapport => ({
  content: [
    { text: texte },
    { table: { headerRows: 1, body: [['A'], ['B']], fonds: ['#F2F4F7', null], indexTotaux: -1 } as never, layout: 'gabarit-tableau' },
  ],
  defaultStyle: { font: 'Roboto' },
  piedDePage: 'Pied de test',
});

describe('Rendu PDF dans un fil dédié', () => {
  const rendu = new RenduPdf();
  afterAll(() => rendu.arreter());

  it('produit un PDF complet, mises en forme nommées et pied de page compris', async () => {
    const pdf = await rendu.rendre(document('Bonjour'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
  });

  it('plusieurs demandes simultanées : chacune reçoit son propre document', async () => {
    const pdfs = await Promise.all(['un', 'deux', 'trois'].map((t) => rendu.rendre(document(t.repeat(200)))));
    expect(new Set(pdfs.map((p) => p.length)).size).toBeGreaterThan(1);
    for (const p of pdfs) expect(p.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('un document invalide échoue proprement, le rendu suivant fonctionne', async () => {
    await expect(rendu.rendre({ content: [{ table: { body: [] } }] } as DefinitionRapport)).rejects.toThrow(/rendu PDF impossible/);
    // Une fonction ne peut pas traverser d'un fil à l'autre : refus explicite.
    await expect(rendu.rendre({ content: [], footer: () => 'x' } as unknown as DefinitionRapport)).rejects.toThrow(/rendu PDF impossible/);
    expect((await rendu.rendre(document('après erreur'))).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('un refus d’envoi ne laisse aucune demande en attente (pas de relance tardive du fil)', async () => {
    await expect(rendu.rendre({ content: [], footer: () => 'x' } as unknown as DefinitionRapport)).rejects.toThrow();
    expect((rendu as unknown as { attentes: Map<number, unknown> }).attentes.size).toBe(0);
  });

  it('après arrêt, le fil est relancé à la demande suivante', async () => {
    await rendu.arreter();
    expect((await rendu.rendre(document('relance'))).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
