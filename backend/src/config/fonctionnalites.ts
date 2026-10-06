/**
 * Interrupteurs globaux : couper une fonctionnalité pour toutes les
 * entreprises sans livrer de code (incident d'un service externe, charge
 * excessive, défaut découvert en production). Par défaut tout est actif.
 *
 *   FONCTIONNALITES_DESACTIVEES=rapports,import
 *
 * Sur Railway, modifier la variable redéploie le service (1 à 2 minutes).
 * Les modules réglés entreprise par entreprise depuis la console restent
 * gérés par ModuleRequis.
 */
export const FONCTIONNALITES = ['import', 'rapports', 'uploads'] as const;
export type Fonctionnalite = (typeof FONCTIONNALITES)[number];

const noms = (env: NodeJS.ProcessEnv) =>
  (env.FONCTIONNALITES_DESACTIVEES ?? '')
    .split(',')
    .map((nom) => nom.trim().toLowerCase())
    .filter(Boolean);

const connue = (nom: string): nom is Fonctionnalite => (FONCTIONNALITES as readonly string[]).includes(nom);

export function fonctionnalitesSuspendues(env: NodeJS.ProcessEnv = process.env): Fonctionnalite[] {
  return [...new Set(noms(env).filter(connue))];
}

/** Noms non reconnus (faute de frappe) : signalés au démarrage. */
export function fonctionnalitesInconnues(env: NodeJS.ProcessEnv = process.env): string[] {
  return noms(env).filter((nom) => !connue(nom));
}
