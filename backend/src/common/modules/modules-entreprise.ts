/**
 * Registre des modules activables par entreprise (feature flags en base).
 * Un module désactivé disparaît de l'interface ET ses routes sont refusées
 * par EntrepriseActiveGuard (403 MODULE_DESACTIVE) — masquer ne suffit pas.
 *
 * - console : réglé par un opérateur NimbaFlow (offre commerciale) ;
 * - entreprise : réglé par l'administrateur selon son activité (Paramètres),
 *   pour ne montrer que ce dont son métier a besoin.
 *
 * Ajouter un module : une colonne booléenne sur Entreprise, une entrée ici,
 * puis @ModuleRequis('cle') sur ses routes.
 */
export const MODULES_ENTREPRISE = {
  inventaires: { champ: 'moduleInventaires', nom: 'Inventaires', reglePar: 'console' },
  transferts: { champ: 'moduleTransferts', nom: 'Transferts', reglePar: 'console' },
  lots: { champ: 'moduleLots', nom: 'Lots et péremptions', reglePar: 'entreprise' },
  arborescence: { champ: 'moduleArborescence', nom: 'Arborescence des emplacements', reglePar: 'entreprise' },
  variantes: { champ: 'moduleVariantes', nom: 'Variantes de produits', reglePar: 'entreprise' },
  conditionnements: { champ: 'moduleConditionnements', nom: 'Conditionnements', reglePar: 'entreprise' },
  numerosSerie: { champ: 'moduleNumerosSerie', nom: 'Numéros de série', reglePar: 'entreprise' },
  strategiesSortie: { champ: 'moduleStrategiesSortie', nom: 'Stratégies de sortie', reglePar: 'entreprise' },
  reapprovisionnement: { champ: 'moduleReapprovisionnement', nom: 'Réapprovisionnement automatique', reglePar: 'entreprise' },
  rangement: { champ: 'moduleRangement', nom: 'Règles de rangement', reglePar: 'entreprise' },
  valorisation: { champ: 'moduleValorisation', nom: 'Valorisation du stock', reglePar: 'entreprise' },
  rotation: { champ: 'moduleRotation', nom: 'Rotation et stock dormant', reglePar: 'entreprise' },
  webhooks: { champ: 'moduleWebhooks', nom: 'Webhooks', reglePar: 'entreprise' },
  assistant: { champ: 'moduleAssistant', nom: 'Assistant IA', reglePar: 'entreprise' },
} as const;

export type ModuleOptionnel = keyof typeof MODULES_ENTREPRISE;
export type ChampModule = (typeof MODULES_ENTREPRISE)[ModuleOptionnel]['champ'];

export const CLES_MODULES = Object.keys(MODULES_ENTREPRISE) as ModuleOptionnel[];

/** Sélection Prisma de toutes les colonnes de modules d'une entreprise. */
export const SELECTION_MODULES = Object.fromEntries(
  CLES_MODULES.map((cle) => [MODULES_ENTREPRISE[cle].champ, true]),
) as Record<ChampModule, true>;

/** { inventaires: true, lots: false, … } depuis une ligne Entreprise. */
export function modulesActifs(entreprise: Record<ChampModule, boolean>): Record<ModuleOptionnel, boolean> {
  return Object.fromEntries(
    CLES_MODULES.map((cle) => [cle, entreprise[MODULES_ENTREPRISE[cle].champ]]),
  ) as Record<ModuleOptionnel, boolean>;
}
