/**
 * Contenu commercial de la page d'accueil publique.
 *
 * Seul le propriétaire du produit fixe les valeurs à `null` : prix, devise,
 * périodicité, limites et conditions de l'essai. Elles n'existent nulle part
 * dans l'application (aucun module d'abonnement ni de facturation à ce
 * jour). Une valeur `null` n'est jamais remplacée par un texte inventé :
 * la page affiche « bientôt disponible », ou masque l'élément (FAQ).
 */

export interface Prix {
  montant: number;
  devise: 'GNF';
  periode: 'mois' | 'an';
}

export interface Offre {
  cle: 'essai' | 'standard' | 'premium';
  nom: string;
  positionnement: string;
  /** null : tarif non décidé, affiché « bientôt disponible ». */
  prix: Prix | null;
  /** Contenu confirmé de l'offre ; vide : non encore défini. */
  inclus: string[];
}

/**
 * Durée de l'essai, décidée par le propriétaire. À NOTER : l'application
 * ne met aujourd'hui fin à aucun essai ; un compte créé reste actif sans
 * limite de durée tant qu'un opérateur ne le suspend pas (console).
 */
export const DUREE_ESSAI_JOURS = 30;

export type CleReseau = 'facebook' | 'instagram' | 'x' | 'whatsapp' | 'tiktok' | 'linkedin';

/**
 * Adresses des comptes de NimbaFlow, à fournir par le propriétaire. null :
 * l'icône s'affiche sans lien. WhatsApp : https://wa.me/ suivi du numéro
 * au format international, sans « + » ni espaces.
 */
export const RESEAUX_SOCIAUX: Record<CleReseau, string | null> = {
  facebook: null,
  instagram: null,
  x: null,
  whatsapp: null,
  tiktok: null,
  linkedin: null,
};

export const OFFRES: Offre[] = [
  {
    cle: 'essai',
    nom: 'Essai gratuit',
    positionnement: 'Découvrir NimbaFlow avec vos propres produits.',
    prix: null,
    inclus: [
      `${DUREE_ESSAI_JOURS} jours pour essayer NimbaFlow`,
      'Inscription en ligne, sans installation',
      'Ordinateur, tablette et téléphone',
    ],
  },
  {
    cle: 'standard',
    nom: 'Standard',
    positionnement: 'Pour une activité individuelle ou une petite équipe.',
    prix: null,
    inclus: [],
  },
  {
    cle: 'premium',
    nom: 'Premium',
    positionnement: 'Pour des besoins plus avancés.',
    prix: null,
    inclus: [],
  },
];

export interface QuestionFaq {
  question: string;
  /** null : réponse à rédiger par le propriétaire ; la question n'est pas affichée. */
  reponse: string | null;
}

export function faq(adresseAide: string): QuestionFaq[] {
  return [
    {
      question: 'Qu’est-ce que NimbaFlow ?',
      reponse:
        'Une application web de gestion de stock et de ventes : produits, entrées, sorties, transferts, inventaires, ventes au comptoir, alertes et rapports, dans un seul espace.',
    },
    {
      question: 'À qui s’adresse NimbaFlow ?',
      reponse:
        'Aux commerçants, grossistes et vendeurs qui veulent suivre leur stock, leurs ventes et leurs clients, sur un ou plusieurs emplacements (boutique, dépôt, magasin).',
    },
    {
      question: 'Comment commencer l’essai ?',
      reponse:
        'Créez votre compte depuis la page d’inscription : votre entreprise, puis votre premier emplacement. Confirmez ensuite votre adresse email pour vous connecter.',
    },
    {
      question: 'Puis-je utiliser NimbaFlow sur mon téléphone ?',
      reponse:
        'Oui, depuis le navigateur du téléphone : l’interface s’adapte à l’écran. Sans réseau, les mouvements de stock sont mis en attente puis envoyés dès le retour de la connexion.',
    },
    {
      question: 'Dans quelle devise sont gérés les montants ?',
      reponse: 'En francs guinéens (GNF).',
    },
    {
      question: 'Comment obtenir de l’aide ?',
      reponse: `Écrivez-nous à ${adresseAide}.`,
    },
    // À rédiger par le propriétaire avant publication de la réponse.
    { question: 'Que se passe-t-il à la fin de l’essai ?', reponse: null },
    // Aucune documentation utilisateur n'existe encore dans le projet.
    { question: 'Où trouver la documentation ?', reponse: null },
  ];
}
