import { describe, expect, it } from 'vitest';
import { ligneCsv, neutraliserFormule } from './csv.js';

describe('CSV : neutralisation des formules (OWASP CSV Injection)', () => {
  it('préfixe d’une apostrophe toute cellule texte qui serait interprétée comme une formule', () => {
    for (const dangereux of ['=1+1', '+33 1', '-2+3', '@SUM(A1)', '\t=1', '\r=1', '=HYPERLINK("http://x","clic")']) {
      expect(neutraliserFormule(dangereux)).toBe(`'${dangereux}`);
    }
  });

  it('laisse intacts les nombres (même négatifs) et le texte ordinaire', () => {
    expect(neutraliserFormule(-30)).toBe(-30);
    expect(neutraliserFormule(1500)).toBe(1500);
    expect(neutraliserFormule('Ciment Portland 50 kg')).toBe('Ciment Portland 50 kg');
    expect(neutraliserFormule('Prix = 82 000')).toBe('Prix = 82 000');
  });

  it('ligneCsv applique la neutralisation puis l’échappement habituel', () => {
    expect(ligneCsv(['=1+1', -30, 'a;b'], ';')).toBe(`'=1+1;-30;"a;b"\r\n`);
    expect(ligneCsv(['=A1,B1'])).toBe(`"'=A1,B1"\r\n`);
  });
});
