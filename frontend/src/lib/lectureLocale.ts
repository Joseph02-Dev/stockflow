import { baseLocale, type BaseLocale, type EmplacementLocal } from './baseLocale';
import { getSession } from './session';

/**
 * Lecture locale (docs/adr/0001, ticket SYNC-06) : réponses de l'API
 * reconstituées depuis la base de l'appareil, quand le serveur est
 * injoignable (lib/api.ts). Même forme et mêmes filtres que le serveur
 * (recherche, archives, emplacement) : les écrans n'en savent rien, et une
 * recherche jamais faite en ligne fonctionne quand même.
 *
 * Comme le serveur, ces réponses ignorent les opérations encore en attente
 * d'envoi : les écrans les superposent eux-mêmes (lib/superpositionFile.ts).
 */

/** Même séparateur que le serveur (backend, emplacements/arborescence.ts). */
const SEPARATEUR_CHEMIN = ' / ';

const contient = (valeur: unknown, terme: string) =>
  typeof valeur === 'string' && valeur.toLocaleLowerCase('fr').includes(terme.toLocaleLowerCase('fr'));
const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, 'fr');

function chemin(id: string, parId: Map<string, EmplacementLocal>): string {
  const noms: string[] = [];
  const vus = new Set<string>();
  let courant = parId.get(id);
  while (courant && !vus.has(courant.id)) {
    vus.add(courant.id);
    noms.unshift(courant.nom);
    courant = typeof courant.parentId === 'string' ? parId.get(courant.parentId) : undefined;
  }
  return noms.join(SEPARATEUR_CHEMIN);
}

type Lecteur = (base: BaseLocale, parametres: URLSearchParams) => Promise<unknown>;

/** Routes lues localement, à l'image de leur service côté serveur. */
const LECTEURS: Partial<Record<string, Lecteur>> = {
  // EmplacementsService.lister
  '/emplacements': async (base, p) => {
    const tous = await base.emplacements.toArray();
    const parId = new Map(tous.map((e) => [e.id, e]));
    return tous
      .filter((e) => p.get('archive') === 'true' || !e.archive)
      .map((e) => ({ ...e, chemin: chemin(e.id, parId) }))
      .sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
  },

  // MouvementsService.listerStock
  '/stock': async (base, p) => {
    const produitId = p.get('produit_id');
    const emplacementId = p.get('emplacement_id');
    const [lignes, produits, emplacements] = await Promise.all([
      emplacementId ? base.stock.where('emplacementId').equals(emplacementId).toArray() : base.stock.toArray(),
      base.produits.toArray(),
      base.emplacements.toArray(),
    ]);
    const produitsParId = new Map(produits.map((pr) => [pr.id, pr]));
    const emplacementsParId = new Map(emplacements.map((e) => [e.id, e]));
    return lignes
      .filter((l) => !produitId || l.produitId === produitId)
      .flatMap((l) => {
        const produit = produitsParId.get(l.produitId);
        const emplacement = emplacementsParId.get(l.emplacementId);
        if (!produit || !emplacement) return [];
        const { id, nom, reference, seuilAlerte, photoUrl, uniteMesure, prixAchat, prixVente, prixGros, prixDemiGros, tauxTva, archive } =
          produit;
        return [
          {
            produitId: l.produitId,
            emplacementId: l.emplacementId,
            quantite: l.quantite,
            produit: { id, nom, reference, seuilAlerte, photoUrl, uniteMesure, prixAchat, prixVente, prixGros, prixDemiGros, tauxTva, archive },
            emplacement: { id: emplacement.id, nom: emplacement.nom },
          },
        ];
      });
  },

  // ProduitsService.lister
  '/produits': async (base, p) => {
    const recherche = p.get('search')?.trim();
    const modeleId = p.get('modele_id');
    const [produits, categories, marques] = await Promise.all([
      base.produits.toArray(),
      base.categories.toArray(),
      base.marques.toArray(),
    ]);
    const categoriesParId = new Map(categories.map((c) => [c.id, c]));
    const marquesParId = new Map(marques.map((m) => [m.id, m]));
    return produits
      .filter((pr) => p.get('archive') === 'true' || !pr.archive)
      .filter((pr) => !modeleId || pr.modeleId === modeleId)
      .filter((pr) => !recherche || contient(pr.nom, recherche))
      .map((pr) => ({
        ...pr,
        categorie: (pr.categorieId && categoriesParId.get(pr.categorieId)) || null,
        marque: (pr.marqueId && marquesParId.get(pr.marqueId)) || null,
        // Le nom du modèle n'est pas recopié sur l'appareil : seul compte qu'il y en ait un.
        modele: typeof pr.modeleId === 'string' ? { id: pr.modeleId, nom: '' } : null,
      }))
      .sort(parNom);
  },

  // ClientsService.lister
  '/clients': async (base, p) => {
    const recherche = p.get('search')?.trim();
    const clients = await base.clients.toArray();
    return clients
      .filter((c) => p.get('archive') === 'true' || !c.archive)
      .filter((c) => !recherche || contient(c.nom, recherche) || contient(c.nomCommerce, recherche) || contient(c.telephone, recherche))
      .sort(parNom);
  },
};

/**
 * Réponse reconstituée pour cette requête GET, ou undefined : route non
 * couverte, personne de connecté, ou appareil jamais synchronisé (une liste
 * vide serait trompeuse).
 */
export async function lireLocalement(url: string | undefined, params?: unknown): Promise<unknown> {
  if (!url) return undefined;
  const adresse = new URL(url, 'http://appareil.local');
  const lecteur = LECTEURS[adresse.pathname.replace(/\/+$/, '')];
  const entrepriseId = getSession()?.entreprise.id;
  const base = lecteur && entrepriseId ? baseLocale(entrepriseId) : null;
  if (!lecteur || !base) return undefined;
  if (!(await base.etat.get('synchronisation'))?.derniereReussite) return undefined;
  if (params && typeof params === 'object') {
    for (const [cle, valeur] of Object.entries(params)) {
      if (valeur !== undefined && valeur !== null) adresse.searchParams.set(cle, String(valeur));
    }
  }
  return lecteur(base, adresse.searchParams);
}
