import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { adresseInterdite, delaiAvantNouvelleTentative, signer } from './regles-webhook.js';
import { refusUrlWebhook } from './securite-url.js';

describe('Webhooks — règles pures', () => {
  it('signature HMAC-SHA256 de « horodatage.corps »', () => {
    const attendu = createHmac('sha256', 'secret').update('1700000000.{"a":1}').digest('hex');
    expect(signer('secret', 1700000000, '{"a":1}')).toBe(`t=1700000000,v1=${attendu}`);
  });

  it('adresses interdites : boucle locale, privées, lien local, CGNAT, IPv6 locales', () => {
    for (const ip of ['127.0.0.1', '10.0.0.8', '172.16.4.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(adresseInterdite(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '41.202.219.10', '2001:4860:4860::8888']) {
      expect(adresseInterdite(ip), ip).toBe(false);
    }
  });

  it('tentatives de plus en plus espacées', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => delaiAvantNouvelleTentative(n) / 60_000)).toEqual([1, 5, 30, 120, 360, 360]);
  });

  it('URL : https obligatoire, pas d’identifiants, pas de réseau local (sauf développement autorisé)', async () => {
    const prod = { NODE_ENV: 'production' };
    expect(await refusUrlWebhook('http://exemple.com/hook', prod)).toMatch(/https/);
    expect(await refusUrlWebhook('https://user:mdp@exemple.com', prod)).toMatch(/identifiants/);
    expect(await refusUrlWebhook('https://127.0.0.1/hook', prod)).toMatch(/réseau privé/);
    expect(await refusUrlWebhook('https://[::1]/hook', prod)).toMatch(/réseau privé/);
    expect(await refusUrlWebhook('pas une url', prod)).toMatch(/invalide/);
    expect(await refusUrlWebhook('http://127.0.0.1:9/hook', { NODE_ENV: 'test', WEBHOOKS_RESEAU_PRIVE: 'true' })).toBeNull();
    expect(await refusUrlWebhook('http://127.0.0.1:9/hook', { NODE_ENV: 'production', WEBHOOKS_RESEAU_PRIVE: 'true' })).toMatch(/https/);
  });
});
