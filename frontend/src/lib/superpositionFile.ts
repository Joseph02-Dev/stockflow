import type { ClientLocal, StockLocal, VenteLocale } from './baseLocale';
import type { MouvementEnAttente } from './mouvementsHorsLigne';

/**
 * Superposition de la file d'opérations hors ligne à la base locale
 * (docs/adr/0001, ticket SYNC-05) : la base n'est jamais modifiée par ces
 * opérations ; elles s'ajoutent à la lecture. Une opération quitte la file
 * quand le serveur l'accepte, et la synchronisation suivante apporte sa
 * valeur réelle ; un refus la retire sans rien à défaire.
 * Fonctions pures, sans dépendance : lues par lib/vueLocale.ts.
 */

/** Une ligne issue (ou modifiée par) une opération pas encore envoyée. */
export type EnAttente<T> = T & { enAttente?: true };

const nombre = (valeur: unknown) => (typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : 0);
const texte = (valeur: unknown) => (typeof valeur === 'string' ? valeur : null);

/**
 * Stock après les entrées, sorties, transferts, pertes et ventes en attente.
 * Une quantité peut devenir négative : une vente hors ligne n'est pas
 * bloquée par le stock, le serveur la marquera « à régulariser ».
 * Non pris en compte : les réceptions de commande (les quantités viennent
 * de la commande, sur le serveur) ; elles arrivent à la synchronisation.
 */
export function stockAvecFile(stock: StockLocal[], file: MouvementEnAttente[]): EnAttente<StockLocal>[] {
  const parCle = new Map<string, EnAttente<StockLocal>>(stock.map((s) => [`${s.produitId}|${s.emplacementId}`, s]));
  const ajuster = (produitId: unknown, emplacementId: unknown, ecart: number, creeAt: string) => {
    const produit = texte(produitId);
    const emplacement = texte(emplacementId);
    if (!produit || !emplacement || ecart === 0) return;
    const cle = `${produit}|${emplacement}`;
    const actuel = parCle.get(cle);
    parCle.set(cle, {
      ...(actuel ?? { produitId: produit, emplacementId: emplacement, updatedAt: creeAt }),
      quantite: (actuel?.quantite ?? 0) + ecart,
      enAttente: true,
    });
  };
  for (const { type, corps, creeAt, methode } of file) {
    if (methode === 'PATCH') continue;
    const quantite = nombre(corps.quantite);
    if (type === 'entree') ajuster(corps.produitId, corps.emplacementId, quantite, creeAt);
    else if (type === 'sortie' || type === 'perte') ajuster(corps.produitId, corps.emplacementId, -quantite, creeAt);
    else if (type === 'transfert') {
      ajuster(corps.produitId, corps.emplacementSourceId, -quantite, creeAt);
      ajuster(corps.produitId, corps.emplacementDestinationId, quantite, creeAt);
    } else if (type === 'vente' && Array.isArray(corps.lignes)) {
      for (const ligne of corps.lignes as Record<string, unknown>[]) {
        ajuster(ligne.produitId, corps.emplacementId, -nombre(ligne.quantite), creeAt);
      }
    }
  }
  return [...parCle.values()];
}

/** Clients créés ou modifiés hors ligne, par-dessus ceux de la base. */
export function clientsAvecFile(clients: ClientLocal[], file: MouvementEnAttente[]): EnAttente<ClientLocal>[] {
  const parId = new Map<string, EnAttente<ClientLocal>>(clients.map((c) => [c.id, c]));
  for (const { type, corps, chemin, methode, creeAt } of file) {
    if (type !== 'client') continue;
    if (methode === 'PATCH') {
      const id = chemin?.split('/').pop();
      const actuel = id ? parId.get(id) : undefined;
      if (id && actuel) parId.set(id, { ...actuel, ...corps, enAttente: true });
    } else {
      const id = texte(corps.idClient);
      if (id) parId.set(id, { categorie: 'DETAIL', archive: false, createdAt: creeAt, updatedAt: creeAt, ...corps, id, nom: String(corps.nom ?? ''), enAttente: true });
    }
  }
  return [...parId.values()];
}

/** Ventes saisies hors ligne, en tête, puis celles de la base (plus récentes d'abord). */
export function ventesAvecFile(ventes: VenteLocale[], file: MouvementEnAttente[]): EnAttente<VenteLocale>[] {
  const enAttente: EnAttente<VenteLocale>[] = file
    .filter((m) => m.type === 'vente' && texte(m.corps.idClient))
    .map(({ corps, creeAt }) => ({
      ...corps,
      id: corps.idClient as string,
      createdAt: texte(corps.saisieHorsLigneAt) ?? creeAt,
      clientId: texte(corps.clientId),
      emplacementId: String(corps.emplacementId ?? ''),
      numero: null,
      updatedAt: creeAt,
      enAttente: true as const,
    }));
  const deja = new Set(enAttente.map((v) => v.id));
  return [...enAttente, ...ventes.filter((v) => !deja.has(v.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
