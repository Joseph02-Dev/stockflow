import {
  ArrowRightToLine,
  Barcode,
  CalendarClock,
  Coins,
  Network,
  Package,
  RefreshCw,
  Rows3,
  Shapes,
  Sparkles,
  TrendingUp,
  Webhook,
} from 'lucide-react';

export type CleModule =
  | 'lots'
  | 'arborescence'
  | 'variantes'
  | 'conditionnements'
  | 'numerosSerie'
  | 'strategiesSortie'
  | 'reapprovisionnement'
  | 'rangement'
  | 'valorisation'
  | 'rotation'
  | 'webhooks'
  | 'assistant';

/** Modules métier : l'administrateur n'affiche que ce dont son activité a besoin. */
export const MODULES: { cle: CleModule; champ: string; libelle: string; aide: string }[] = [
  {
    cle: 'lots',
    champ: 'moduleLots',
    libelle: 'Lots et péremptions',
    aide: 'Numéros de lot, dates de péremption et sorties « premier périmé, premier sorti ». Pharmacie, alimentaire, cosmétique…',
  },
  {
    cle: 'arborescence',
    champ: 'moduleArborescence',
    libelle: 'Arborescence des emplacements',
    aide: 'Ranger les emplacements les uns dans les autres : Dépôt › Zone › Allée › Étagère.',
  },
  {
    cle: 'variantes',
    champ: 'moduleVariantes',
    libelle: 'Variantes de produits',
    aide: 'Un modèle décliné en tailles, couleurs… : chaque combinaison a son propre stock. Habillement, chaussures, peinture…',
  },
  {
    cle: 'conditionnements',
    champ: 'moduleConditionnements',
    libelle: 'Conditionnements',
    aide: 'Acheter en palettes, stocker en cartons, vendre à l’unité : les saisies en cartons sont converties automatiquement.',
  },
  {
    cle: 'numerosSerie',
    champ: 'moduleNumerosSerie',
    libelle: 'Numéros de série',
    aide: 'Chaque unité reçue avec son numéro, suivie jusqu’à sa vente. Téléphonie, informatique, électroménager, matériel médical…',
  },
  {
    cle: 'strategiesSortie',
    champ: 'moduleStrategiesSortie',
    libelle: 'Stratégies de sortie',
    aide: 'Choisir l’ordre de sortie des lots : FEFO (péremption), FIFO (ancienneté) ou LIFO, pour l’entreprise ou par emplacement.',
  },
  {
    cle: 'reapprovisionnement',
    champ: 'moduleReapprovisionnement',
    libelle: 'Réapprovisionnement automatique',
    aide: 'Stock minimum et maximum par produit : chaque matin, les brouillons de commande fournisseur sont préparés pour vous.',
  },
  {
    cle: 'rangement',
    champ: 'moduleRangement',
    libelle: 'Règles de rangement',
    aide: 'À la réception, chaque produit (ou catégorie) est dirigé vers son emplacement de rangement.',
  },
  {
    cle: 'valorisation',
    champ: 'moduleValorisation',
    libelle: 'Valorisation du stock',
    aide: 'Valeur réelle du stock au coût d’achat, en FIFO ou en coût moyen pondéré. À l’activation, le stock présent est valorisé au prix d’achat actuel.',
  },
  {
    cle: 'rotation',
    champ: 'moduleRotation',
    libelle: 'Rotation et stock dormant',
    aide: 'Ce qui se vend, ce qui dort et combien d’argent est immobilisé, par produit et par catégorie.',
  },
  {
    cle: 'webhooks',
    champ: 'moduleWebhooks',
    libelle: 'Webhooks',
    aide: 'Prévenir un autre logiciel (comptabilité, site marchand…) à chaque mouvement, alerte ou lot proche de péremption.',
  },
  {
    cle: 'assistant',
    champ: 'moduleAssistant',
    libelle: 'Assistant IA',
    aide: 'Poser des questions sur le stock et les ventes. Lecture seule ; les données utiles à la réponse sont transmises au fournisseur d’IA (Anthropic).',
  },
];

/** Familles d'affichage : on retrouve un module par ce qu'il touche. */
export const FAMILLES: { titre: string; modules: CleModule[] }[] = [
  { titre: 'Produits', modules: ['lots', 'variantes', 'conditionnements', 'numerosSerie'] },
  { titre: 'Entrepôt', modules: ['arborescence', 'rangement', 'strategiesSortie'] },
  { titre: 'Pilotage', modules: ['reapprovisionnement', 'valorisation', 'rotation'] },
  { titre: 'Connexions', modules: ['webhooks', 'assistant'] },
];

export const ICONES_MODULE: Record<CleModule, typeof Package> = {
  lots: CalendarClock,
  variantes: Shapes,
  conditionnements: Package,
  numerosSerie: Barcode,
  arborescence: Network,
  rangement: Rows3,
  strategiesSortie: ArrowRightToLine,
  reapprovisionnement: RefreshCw,
  valorisation: Coins,
  rotation: TrendingUp,
  webhooks: Webhook,
  assistant: Sparkles,
};
