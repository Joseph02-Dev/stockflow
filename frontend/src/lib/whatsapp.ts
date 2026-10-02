import { montantTexte, texteRecu, type VentePourRecu } from './recu';

/**
 * WhatsApp sans API : un lien https://wa.me/<numéro>?text=<texte>, ouvert
 * dans un nouvel onglet — l'application sur mobile, WhatsApp Web sur
 * ordinateur. Aucun message n'est envoyé par StockFlow lui-même.
 */

/** « +224 622-45 18 03 » → « 224622451803 » : chiffres seuls, indicatif compris. */
export function nettoyerNumero(telephone: string): string {
  return telephone.replace(/\D/g, '');
}

export function lienWhatsApp(telephone: string, texte: string): string {
  return `https://wa.me/${nettoyerNumero(telephone)}?text=${encodeURIComponent(texte)}`;
}

/**
 * Reçu pour WhatsApp : entouré de ``` pour que WhatsApp l'affiche en
 * police monospace — les colonnes de montants restent alignées.
 */
export function texteRecuWhatsApp(vente: VentePourRecu): string {
  return '```\n' + texteRecu(vente) + '\n```';
}

/** Message de rappel de solde (bouton « Relancer » des créances). */
export function texteRelance(relance: {
  entreprise: string;
  client: string;
  solde: number;
  ancienneteJours: number;
  echeanceAt: string | null;
}): string {
  const lignes = [
    relance.entreprise,
    '',
    `Bonjour ${relance.client},`,
    '',
    'Sauf erreur de notre part, votre solde',
    `s’élève à ${montantTexte(relance.solde)} GNF`,
    `(plus ancien achat non réglé : il y a ${relance.ancienneteJours} jour${relance.ancienneteJours > 1 ? 's' : ''}).`,
  ];
  if (relance.echeanceAt) {
    lignes.push(`Échéance : ${new Date(relance.echeanceAt).toLocaleDateString('fr-FR')}.`);
  }
  lignes.push('', 'Merci de passer le régler à votre convenance.', 'Bonne journée.');
  return lignes.join('\n');
}
