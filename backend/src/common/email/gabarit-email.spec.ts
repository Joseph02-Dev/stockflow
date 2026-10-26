import { afterEach, describe, expect, it } from 'vitest';
import { composerEmail, dureeEnClair, RESEAUX_SOCIAUX } from './gabarit-email.js';
import { RESEAUX_SOCIAUX as RESEAUX_ACCUEIL } from '../../../../frontend/src/features/accueil/contenu.js';

const CONTENU = {
  apercu: 'Aperçu',
  titre: 'Bienvenue sur NimbaFlow',
  paragraphes: ['Confirmez votre adresse.'],
  bouton: { libelle: 'Confirmer', url: 'https://stockflowgn.com/verifier-email?token=abc123&x=1' },
  mentions: ['Ce lien expire dans 24 heures.'],
};

describe('Gabarit des emails', () => {
  const frontendUrl = process.env.FRONTEND_URL;
  afterEach(() => {
    process.env.FRONTEND_URL = frontendUrl;
    delete process.env.EMAIL_REPLY_TO;
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

  it('affiche l’adresse de contact quand EMAIL_REPLY_TO est définie, sinon « ne pas répondre »', () => {
    expect(composerEmail(CONTENU).html).toContain('merci de ne pas y répondre');
    process.env.EMAIL_REPLY_TO = 'contact@stockflowgn.com';
    const { body, html } = composerEmail(CONTENU);
    expect(html).toContain('<a href="mailto:contact@stockflowgn.com"');
    expect(html).not.toContain('ne pas y répondre');
    expect(body).toContain('Une question ? Écrivez à contact@stockflowgn.com.');
  });
});

describe('Gabarit des emails — identité NimbaFlow', () => {
  const frontendUrl = process.env.FRONTEND_URL;
  afterEach(() => {
    process.env.FRONTEND_URL = frontendUrl;
  });

  it('pied de page : icônes des réseaux sociaux et copyright centré', () => {
    process.env.FRONTEND_URL = 'https://stockflowgn.com';
    const { body, html } = composerEmail(CONTENU);
    for (const { cle } of RESEAUX_SOCIAUX) expect(html).toContain(`src="https://stockflowgn.com/email/${cle}.png"`);
    expect(html).toContain(`© ${new Date().getFullYear()} NimbaFlow`);
    expect(body).toContain(`© ${new Date().getFullYear()} NimbaFlow`);
  });

  it('un réseau sans adresse s’affiche sans lien (aucune adresse inventée)', () => {
    process.env.FRONTEND_URL = 'https://stockflowgn.com';
    const { html } = composerEmail(CONTENU);
    for (const { nom, url } of RESEAUX_SOCIAUX) {
      if (!url) expect(html).not.toContain(`title="NimbaFlow sur ${nom}"`);
    }
  });

  it('mêmes réseaux et mêmes adresses que la page d’accueil', () => {
    expect(Object.fromEntries(RESEAUX_SOCIAUX.map((r) => [r.cle, r.url]))).toEqual(RESEAUX_ACCUEIL);
  });

  it('encadré de détails, échappé, aussi dans la version texte', () => {
    const { body, html } = composerEmail({ ...CONTENU, details: [{ libelle: 'Produit', valeur: 'Riz <25 kg>' }] });
    expect(html).toContain('Riz &lt;25 kg&gt;');
    expect(body).toContain('Produit : Riz <25 kg>');
  });
});

describe('Durée lisible', () => {
  it('jours entiers au-delà de 24 h, heures sinon', () => {
    expect(dureeEnClair(7 * 86_400_000)).toBe('7 jours');
    expect(dureeEnClair(86_400_000)).toBe('24 heures');
    expect(dureeEnClair(30 * 60_000)).toBe('30 minutes');
    expect(dureeEnClair(3_600_000)).toBe('1 heure');
    expect(dureeEnClair(36 * 3_600_000)).toBe('36 heures');
  });
});
