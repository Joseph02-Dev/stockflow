import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

/**
 * Règles pures des webhooks, testées unitairement : événements, signature,
 * adresses interdites (SSRF), délais entre tentatives.
 */
export const EVENEMENTS_WEBHOOK = ['mouvement.cree', 'alerte.stock', 'lot.peremption'] as const;
export type EvenementWebhook = (typeof EVENEMENTS_WEBHOOK)[number];
/** Envoyé à la demande (« Tester ») : n'est jamais un abonnement. */
export const EVENEMENT_TEST = 'test.ping';

export const MAX_TENTATIVES = 6;
export const ECHECS_AVANT_DESACTIVATION = 20;

/**
 * En-tête X-StockFlow-Signature : « t=<horodatage>,v1=<HMAC-SHA256 hex de
 * `${t}.${corps}`> ». Le destinataire recalcule avec son secret et refuse
 * un horodatage trop ancien (rejeu).
 */
export function signer(secret: string, horodatage: number, corps: string): string {
  const empreinte = createHmac('sha256', secret).update(`${horodatage}.${corps}`).digest('hex');
  return `t=${horodatage},v1=${empreinte}`;
}

/** Après la n-ième tentative échouée : 1 min, 5 min, 30 min, 2 h, 6 h. */
export function delaiAvantNouvelleTentative(tentatives: number): number {
  const minutes = [1, 5, 30, 120, 360];
  return minutes[Math.min(tentatives, minutes.length) - 1] * 60_000;
}

/**
 * Adresse vers laquelle NimbaFlow ne doit jamais envoyer de requête :
 * boucle locale, réseaux privés, lien local (métadonnées des clouds),
 * CGNAT, adresses non routables — sans quoi un webhook servirait à
 * sonder le réseau interne de l'hébergeur (SSRF).
 */
export function adresseInterdite(adresse: string): boolean {
  if (isIPv4(adresse)) {
    const [a, b] = adresse.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIPv6(adresse)) {
    const ip = adresse.toLowerCase();
    const mappee = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappee) return adresseInterdite(mappee[1]);
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff');
  }
  return true;
}
