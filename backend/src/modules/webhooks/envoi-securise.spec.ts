import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdresseRefusee, posterWebhook, resolutionVerifiee } from './envoi-securise.js';
import { messageEchecEnvoi } from './livreur-webhooks.js';

/** Serveur local de test : compte les requêtes reçues et répond selon le chemin. */
function serveur(): Promise<{ url: string; recues: string[]; fermer: () => Promise<void> }> {
  const recues: string[] = [];
  const s: Server = createServer((req, res) => {
    recues.push(req.url ?? '');
    if (req.url === '/redirection') {
      res.writeHead(302, { Location: '/cible' }).end();
    } else if (req.url === '/muet') {
      // Ne répond jamais : le délai de l'appelant doit couper.
    } else {
      res.writeHead(204).end();
    }
  });
  return new Promise((ok) =>
    s.listen(0, '127.0.0.1', () =>
      ok({
        // « localhost » passe par la résolution DNS (une IP littérale ne la déclencherait pas).
        url: `http://localhost:${(s.address() as AddressInfo).port}`,
        recues,
        fermer: () => new Promise<void>((fin) => s.close(() => fin())),
      }),
    ),
  );
}

describe('Webhooks — envoi protégé au moment de la connexion', () => {
  let local: Awaited<ReturnType<typeof serveur>>;
  beforeAll(async () => {
    local = await serveur();
  });
  afterAll(async () => {
    local.fermer();
  });

  it('résolution refusée vers la boucle locale, sauf réseau privé autorisé (développement)', async () => {
    const resoudre = (autorise: boolean) =>
      new Promise((ok, ko) => resolutionVerifiee(autorise)('localhost', { all: false }, (e, adresse) => (e ? ko(e) : ok(adresse))));
    await expect(resoudre(false)).rejects.toBeInstanceOf(AdresseRefusee);
    await expect(resoudre(true)).resolves.toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  it('refuse la connexion à une adresse interne : aucune requête n’arrive', async () => {
    const avant = local.recues.length;
    await expect(posterWebhook(`${local.url}/hook`, {}, '{}', 2_000, false)).rejects.toBeInstanceOf(AdresseRefusee);
    expect(local.recues.length).toBe(avant);
  });

  it('livre quand le réseau privé est autorisé, sans suivre les redirections', async () => {
    expect(await posterWebhook(`${local.url}/hook`, { 'Content-Type': 'application/json' }, '{"a":1}', 2_000, true)).toBe(204);
    const avant = local.recues.length;
    expect(await posterWebhook(`${local.url}/redirection`, {}, '{}', 2_000, true)).toBe(302);
    expect(local.recues.slice(avant)).toEqual(['/redirection']);
  });

  it('coupe une réponse trop lente', async () => {
    const erreur = await posterWebhook(`${local.url}/muet`, {}, '{}', 300, true).catch((e: unknown) => e);
    expect(messageEchecEnvoi(erreur)).toBe('Pas de réponse en 5 s.');
  });

  it('motif d’échec sans détail du réseau de l’hébergeur', () => {
    const refus = Object.assign(new Error('connect ECONNREFUSED 10.0.3.7:443'), { code: 'ECONNREFUSED' });
    expect(messageEchecEnvoi(refus)).toBe('Connexion impossible au serveur destinataire (ECONNREFUSED).');
    expect(messageEchecEnvoi(new Error('détail interne'))).toBe('Connexion impossible au serveur destinataire.');
    expect(messageEchecEnvoi(new AdresseRefusee())).toMatch(/réseau privé ou local/);
  });
});
