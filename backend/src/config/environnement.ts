/**
 * Validation de l'environnement au démarrage, avant toute connexion.
 *
 * - Erreur (arrêt immédiat, message explicite) : une variable sans laquelle
 *   l'API ne peut pas fonctionner correctement. Sans cette vérification,
 *   l'échec surviendrait plus tard, au premier appel, avec une erreur
 *   obscure (ex. signature JWT impossible).
 * - Avertissement (journalisé, démarrage maintenu) : une configuration
 *   faible. Volontairement non bloquant, pour ne jamais empêcher la
 *   production actuelle de redémarrer après une mise à jour.
 *
 * Aucune valeur n'est jamais affichée, seulement le nom des variables.
 */
export interface DiagnosticEnvironnement {
  erreurs: string[];
  avertissements: string[];
}

/** Longueur minimale recommandée d'un secret HMAC (256 bits en hexadécimal). */
const LONGUEUR_SECRET_MIN = 32;

export function diagnostiquerEnvironnement(env: NodeJS.ProcessEnv): DiagnosticEnvironnement {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const production = env.NODE_ENV === 'production';
  const absente = (nom: string) => !env[nom]?.trim();
  // « Absente » et « vide » n'ont pas la même cause (variable non liée au
  // service ou à cet environnement, ou valeur effacée) : on les distingue.
  const etat = (nom: string) => (env[nom] === undefined ? 'absente de ce service' : 'définie mais vide');

  for (const nom of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (absente(nom)) erreurs.push(`${nom} est obligatoire (${etat(nom)}).`);
  }
  // Sans FRONTEND_URL, le CORS reste fermé : l'application web ne peut rien appeler.
  if (production && absente('FRONTEND_URL')) erreurs.push(`FRONTEND_URL est obligatoire en production, CORS (${etat('FRONTEND_URL')}).`);

  for (const nom of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_CONSOLE_SECRET']) {
    const valeur = env[nom];
    if (valeur && valeur.length < LONGUEUR_SECRET_MIN) {
      avertissements.push(`${nom} fait moins de ${LONGUEUR_SECRET_MIN} caractères : secret faible, à remplacer.`);
    }
  }
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    avertissements.push('JWT_ACCESS_SECRET et JWT_REFRESH_SECRET sont identiques : utilisez deux secrets distincts.');
  }
  if (production && env.FRONTEND_URL && !env.FRONTEND_URL.startsWith('https://')) {
    avertissements.push('FRONTEND_URL n’est pas en https en production.');
  }
  if (Number(env.WEB_CONCURRENCY ?? 1) > 1 && absente('REDIS_URL')) {
    avertissements.push('WEB_CONCURRENCY > 1 sans REDIS_URL : limites de débit multipliées par le nombre de processus.');
  }
  if (erreurs.length > 0) erreurs.push(contexteDeploiement(env));
  return { erreurs, avertissements };
}

/**
 * Aide au diagnostic d'une variable « manquante » alors qu'elle semble
 * définie : où tourne ce processus, et quelles variables apparentées il
 * voit réellement. Noms uniquement, jamais de valeur. Les variables
 * RAILWAY_* sont fournies par Railway et ne sont pas secrètes.
 */
function contexteDeploiement(env: NodeJS.ProcessEnv): string {
  const service = env.RAILWAY_SERVICE_NAME ?? '?';
  const environnement = env.RAILWAY_ENVIRONMENT_NAME ?? '?';
  // Nom approchant (casse, espace parasite, préfixe) d'une variable attendue.
  const proches = Object.keys(env)
    .filter((nom) => /JWT|DATABASE|FRONTEND/i.test(nom))
    .sort();
  return `Contexte : service Railway « ${service} », environnement « ${environnement} ». Variables apparentées visibles par ce processus : ${
    proches.length > 0 ? proches.map((nom) => JSON.stringify(nom)).join(', ') : 'aucune'
  }.`;
}
