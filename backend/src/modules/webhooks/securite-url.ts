import { lookup } from 'node:dns/promises';
import { adresseInterdite } from './regles-webhook.js';

/**
 * Réseau local autorisé (http et adresses privées) : uniquement hors
 * production, pour les tests et le développement.
 */
export function reseauPriveAutorise(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WEBHOOKS_RESEAU_PRIVE === 'true' && env.NODE_ENV !== 'production';
}

/**
 * Motif du refus d'une URL de webhook, ou null si elle est acceptable :
 * https obligatoire, et l'hôte ne doit résoudre vers aucune adresse
 * interdite. Vérifiée à l'abonnement ET avant chaque envoi (le DNS peut
 * changer entre-temps).
 */
export async function refusUrlWebhook(url: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  let cible: URL;
  try {
    cible = new URL(url);
  } catch {
    return 'URL invalide.';
  }
  const local = reseauPriveAutorise(env);
  if (cible.protocol !== 'https:' && !(local && cible.protocol === 'http:')) return 'L’URL doit commencer par https://.';
  if (cible.username || cible.password) return 'L’URL ne doit pas contenir d’identifiants.';
  if (local) return null;
  const hote = cible.hostname.replace(/^\[|\]$/g, '');
  try {
    const adresses = await lookup(hote, { all: true, verbatim: true });
    if (adresses.length === 0 || adresses.some((a) => adresseInterdite(a.address))) {
      return 'Cette adresse désigne un réseau privé ou local : elle est refusée.';
    }
  } catch {
    return 'Nom d’hôte introuvable.';
  }
  return null;
}
