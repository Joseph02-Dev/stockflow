import { afterEach, describe, expect, it } from 'vitest';
import { composerEmail } from './gabarit-email.js';

const CONTENU = {
  apercu: 'Aperçu',
  titre: 'Bienvenue sur StockFlow',
  paragraphes: ['Confirmez votre adresse.'],
  bouton: { libelle: 'Confirmer', url: 'https://stockflowgn.com/verifier-email?token=abc123&x=1' },
  mentions: ['Ce lien expire dans 24 heures.'],
};

describe('Gabarit des emails', () => {
  const frontendUrl = process.env.FRONTEND_URL;
  afterEach(() => {
    process.env.FRONTEND_URL = frontendUrl;
  });

  it('produit une version texte et une version HTML portant le même lien', () => {
    process.env.FRONTEND_URL = 'https://stockflowgn.com';
    const { body, html } = composerEmail(CONTENU);
    expect(body).toContain('Confirmer : https://stockflowgn.com/verifier-email?token=abc123&x=1');
    expect(body).toContain('Ce lien expire dans 24 heures.');
    // Bouton et lien de secours, avec l'esperluette échappée dans le HTML.
    expect(html.match(/href="https:\/\/stockflowgn\.com\/verifier-email\?token=abc123&amp;x=1"/g)).toHaveLength(2);
    expect(html).toContain('<img src="https://stockflowgn.com/logo-mark.png"');
    expect(html).toContain('stockflowgn.com</a>');
  });

  it('échappe tout texte inséré', () => {
    const { html } = composerEmail({ ...CONTENU, titre: '<script>alert(1)</script>', paragraphes: ['"Vis" & <b>écrous</b>'] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;Vis&quot; &amp; &lt;b&gt;écrous&lt;/b&gt;');
  });

  it('sans adresse HTTPS du site, pas de logo (images non sécurisées bloquées)', () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
    expect(composerEmail(CONTENU).html).not.toContain('<img');
  });
});
