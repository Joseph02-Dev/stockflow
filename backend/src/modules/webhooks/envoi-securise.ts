import { lookup as resoudre, type LookupAddress } from 'node:dns';
import { request as requeteHttp } from 'node:http';
import { request as requeteHttps } from 'node:https';
import type { LookupFunction } from 'node:net';
import { adresseInterdite } from './regles-webhook.js';

/** La résolution DNS, faite au moment de la connexion, désigne un réseau privé ou local. */
export class AdresseRefusee extends Error {
  constructor() {
    super('Cette adresse désigne un réseau privé ou local : elle est refusée.');
    this.name = 'AdresseRefusee';
  }
}

/**
 * Résolution DNS contrôlée au moment même de la connexion. Vérifier l'URL
 * avant l'envoi ne suffit pas : un domaine piégé peut répondre une adresse
 * publique au contrôle puis une adresse interne à la connexion (« DNS
 * rebinding »). Ici, l'adresse vérifiée est celle à laquelle on se connecte.
 */
export function resolutionVerifiee(reseauPriveAutorise: boolean): LookupFunction {
  return (hote, options, rappel) => {
    resoudre(hote, { family: options.family, hints: options.hints, all: true, verbatim: true }, (erreur, adresses: LookupAddress[]) => {
      if (erreur) return rappel(erreur, '', 0);
      if (!reseauPriveAutorise && (adresses.length === 0 || adresses.some((a) => adresseInterdite(a.address)))) {
        return rappel(new AdresseRefusee(), '', 0);
      }
      if (options.all) return (rappel as (e: null, a: LookupAddress[]) => void)(null, adresses);
      rappel(null, adresses[0].address, adresses[0].family);
    });
  };
}

/**
 * POST d'un webhook : jamais de redirection suivie, délai de réponse borné,
 * corps de la réponse ignoré. Renvoie le code HTTP.
 */
export function posterWebhook(
  url: string,
  entetes: Record<string, string>,
  corps: string,
  delaiMs: number,
  reseauPriveAutorise: boolean,
): Promise<number> {
  return new Promise((resoudrePromesse, rejeter) => {
    const cible = new URL(url);
    const requete = (cible.protocol === 'http:' ? requeteHttp : requeteHttps)(
      cible,
      {
        method: 'POST',
        headers: { ...entetes, 'Content-Length': Buffer.byteLength(corps) },
        lookup: resolutionVerifiee(reseauPriveAutorise),
        signal: AbortSignal.timeout(delaiMs),
      },
      (reponse) => {
        reponse.resume();
        resoudrePromesse(reponse.statusCode ?? 0);
      },
    );
    requete.on('error', rejeter);
    requete.end(corps);
  });
}
