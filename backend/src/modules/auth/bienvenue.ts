import { adresseSite, LIBELLE_ROLE, type ContenuEmail } from '../../common/email/gabarit-email.js';

/** Fenêtre pendant laquelle le message de bienvenue reste dans la cloche (non lu). */
export const BIENVENUE_JOURS = 14;

/**
 * Email de bienvenue : à la personne qui vient de créer son entreprise
 * (email confirmé), ou de rejoindre une équipe (invitation acceptée).
 * Les premiers pas diffèrent : la première configure, la seconde travaille.
 */
export function contenuBienvenue(personne: {
  nom: string;
  entreprise: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
  createur: boolean;
}): ContenuEmail {
  const etapes = personne.createur
    ? [
        'Créez vos emplacements (boutique, dépôt) dans Paramètres.',
        'Ajoutez vos produits, un par un ou par import Excel, avec leur stock de départ.',
        'Invitez votre équipe et attribuez à chacun son rôle.',
        'Activez les alertes sur votre téléphone depuis la cloche : rupture et stock faible vous arrivent même appareil en veille.',
      ]
    : [
        'Retrouvez le stock de chaque emplacement dans Stock.',
        'Enregistrez vos ventes et mouvements, même sans connexion : ils partent dès le retour du réseau.',
        'Activez les alertes sur votre téléphone depuis la cloche pour être prévenu des ruptures.',
      ];
  return {
    apercu: personne.createur
      ? `Votre espace ${personne.entreprise} est prêt : voici les premiers pas.`
      : `Vous avez rejoint ${personne.entreprise} : voici l'essentiel pour démarrer.`,
    titre: `Bienvenue sur NimbaFlow, ${personne.nom}`,
    paragraphes: [
      personne.createur
        ? `Votre adresse est confirmée et l'espace de ${personne.entreprise} est prêt. NimbaFlow suit votre stock, vos ventes et vos commandes, en boutique comme au dépôt.`
        : `Vous faites désormais partie de l'équipe ${personne.entreprise} sur NimbaFlow, en tant que ${LIBELLE_ROLE[personne.role].toLowerCase()}.`,
      'Pour bien démarrer :',
      ...etapes.map((etape, i) => `${i + 1}. ${etape}`),
    ],
    bouton: { libelle: 'Ouvrir NimbaFlow', url: `${adresseSite()}/connexion` },
    mentions: ['Vous recevez cet email car un compte NimbaFlow vient d’être créé avec cette adresse.'],
  };
}
