import { resolveMx } from 'node:dns/promises';

/**
 * Vérifie que le domaine d'une adresse email possède des enregistrements
 * MX valides — détecte les domaines inexistants ou les fautes de frappe
 * grossières (ex. "gmial.com") sans jamais envoyer d'email. Ne garantit
 * pas qu'une boîte précise existe (seul un clic de confirmation le
 * prouve réellement, voir la vérification par email), seulement que le
 * domaine est configuré pour recevoir du courrier.
 *
 * Volontairement tolérant en cas d'échec de résolution DNS générique
 * (timeout, résolveur indisponible) : on ne bloque pas une inscription
 * légitime à cause d'un problème réseau transitoire côté serveur — seul
 * un domaine explicitement inexistant (ENOTFOUND/ENODATA) est rejeté.
 */
export async function domaineEmailExiste(email: string): Promise<boolean> {
  const domaine = email.split('@')[1];
  if (!domaine) return false;

  try {
    const enregistrements = await resolveMx(domaine);
    return enregistrements.length > 0;
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return false;
    }
    // Échec DNS générique (timeout, résolveur indisponible) : on laisse
    // passer plutôt que de bloquer une inscription légitime.
    return true;
  }
}
