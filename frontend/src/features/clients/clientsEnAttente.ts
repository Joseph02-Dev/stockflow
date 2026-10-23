import type { MouvementEnAttente } from '@/lib/mouvementsHorsLigne';
import type { CategorieTarifaire, Client } from './types';

/**
 * Clients créés ou modifiés hors ligne, pas encore envoyés : appliqués à
 * la liste reçue du serveur pour que l'écran (et la recherche de la
 * nouvelle vente) les montre aussitôt. Renvoie aussi leurs identifiants,
 * pour les signaler « en attente ».
 */
export function appliquerClientsEnAttente(
  liste: Client[],
  file: MouvementEnAttente[],
): { clients: Client[]; enAttente: Set<string> } {
  const parId = new Map(liste.map((c) => [c.id, c]));
  const enAttente = new Set<string>();
  for (const { type, methode, chemin, corps, creeAt } of file) {
    if (type !== 'client') continue;
    if (methode === 'PATCH') {
      const id = chemin?.split('/').pop();
      const existant = id ? parId.get(id) : undefined;
      if (!id || !existant) continue;
      parId.set(id, { ...existant, ...(corps as Partial<Client>) });
      enAttente.add(id);
    } else if (typeof corps.idClient === 'string') {
      parId.set(corps.idClient, {
        id: corps.idClient,
        nom: String(corps.nom ?? ''),
        telephone: typeof corps.telephone === 'string' ? corps.telephone : null,
        nomCommerce: typeof corps.nomCommerce === 'string' ? corps.nomCommerce : null,
        categorie: (corps.categorie as CategorieTarifaire | undefined) ?? 'DETAIL',
        plafondCredit: typeof corps.plafondCredit === 'number' ? corps.plafondCredit : null,
        archive: false,
        createdAt: creeAt,
      });
      enAttente.add(corps.idClient);
    }
  }
  return { clients: [...parId.values()], enAttente };
}
