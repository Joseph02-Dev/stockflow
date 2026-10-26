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

/** `segments` : parties variables de l'adresse (ex. l'identifiant d'un fournisseur). */
type Lecteur = (base: BaseLocale, parametres: URLSearchParams, segments: string[]) => Promise<unknown>;

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

  // FournisseursService.lister
  '/fournisseurs': async (base) => (await base.fournisseurs.toArray()).sort(parNom),

  // AlertesService.lister : produit, et ses fournisseurs pour « Préparer la commande ».
  '/alertes': async (base, p) => {
    const statut = p.get('statut') ?? 'ACTIVE';
    const [alertes, produits, fournisseurs, associations] = await Promise.all([
      base.alertes.where('statut').equals(statut).toArray(),
      base.produits.toArray(),
      base.fournisseurs.toArray(),
      base.fournisseursProduits.toArray(),
    ]);
    const produitsParId = new Map(produits.map((pr) => [pr.id, pr]));
    const fournisseursParId = new Map(fournisseurs.map((f) => [f.id, f]));
    return alertes
      .flatMap((a) => {
        const produit = produitsParId.get(a.produitId);
        if (!produit) return [];
        const fournisseursAssocies = associations
          .filter((asso) => asso.produitId === produit.id)
          .flatMap((asso) => {
            const fournisseur = fournisseursParId.get(asso.fournisseurId);
            return fournisseur ? [{ ...asso, fournisseur: { id: fournisseur.id, nom: fournisseur.nom } }] : [];
          });
        return [{ ...a, produit: { ...produit, fournisseursAssocies } }];
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // CommandesService.lister : valeur estimée au prix d'achat actuel, comme le serveur.
  '/commandes': async (base, p) => {
    const fournisseurId = p.get('fournisseur_id');
    const statut = p.get('statut');
    const [commandes, produits, fournisseurs, emplacements] = await Promise.all([
      base.commandes.toArray(),
      base.produits.toArray(),
      base.fournisseurs.toArray(),
      base.emplacements.toArray(),
    ]);
    const prixAchat = new Map(produits.map((pr) => [pr.id, pr.prixAchat]));
    const fournisseursParId = new Map(fournisseurs.map((f) => [f.id, f]));
    const emplacementsParId = new Map(emplacements.map((e) => [e.id, e]));
    return commandes
      .filter((c) => (!fournisseurId || c.fournisseurId === fournisseurId) && (!statut || c.statut === statut))
      .map(({ lignes, ...c }) => {
        const liste = Array.isArray(lignes) ? (lignes as { produitId: string; quantiteCommandee: number }[]) : [];
        let valeur = 0;
        let incomplete = false;
        for (const l of liste) {
          const prix = prixAchat.get(l.produitId);
          if (typeof prix === 'number') valeur += l.quantiteCommandee * prix;
          else incomplete = true;
        }
        const fournisseur = fournisseursParId.get(c.fournisseurId);
        const emplacement = emplacementsParId.get(c.emplacementId);
        return {
          ...c,
          fournisseur: fournisseur ? { id: fournisseur.id, nom: fournisseur.nom } : null,
          emplacement: emplacement ? { id: emplacement.id, nom: emplacement.nom } : null,
          _count: { lignes: liste.length },
          valeurEstimee: valeur,
          valeurIncomplete: incomplete,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // VentesService.lister : filtres, du plus récent au plus ancien, pages « après » une vente.
  '/ventes': async (base, p) => {
    const [ventes, clients, emplacements] = await Promise.all([
      base.ventes.toArray(),
      base.clients.toArray(),
      base.emplacements.toArray(),
    ]);
    const clientsParId = new Map(clients.map((c) => [c.id, c]));
    const emplacementsParId = new Map(emplacements.map((e) => [e.id, e]));
    const du = p.get('du');
    const au = p.get('au');
    const triees = ventes
      .filter((v) => !p.get('clientId') || v.clientId === p.get('clientId'))
      .filter((v) => !p.get('emplacementId') || v.emplacementId === p.get('emplacementId'))
      .filter((v) => p.get('aRegulariser') !== 'true' || v.aRegulariser === true)
      .filter((v) => (!du || Date.parse(v.createdAt) >= Date.parse(du)) && (!au || Date.parse(v.createdAt) <= Date.parse(au)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const apres = p.get('apres');
    const debut = apres ? triees.findIndex((v) => v.id === apres) + 1 : 0;
    const limite = Number(p.get('limite')) || 50;
    return triees.slice(debut, debut + limite).map(({ lignes, reglements, ...v }) => {
      const client = v.clientId ? clientsParId.get(v.clientId) : undefined;
      const emplacement = emplacementsParId.get(v.emplacementId);
      const total = typeof v.total === 'number' ? v.total : 0;
      const paye =
        v.statut === 'VALIDEE' && Array.isArray(reglements)
          ? (reglements as { montant: number }[]).reduce((somme, r) => somme + r.montant, 0)
          : 0;
      return {
        ...v,
        client: client ? { id: client.id, nom: client.nom, telephone: client.telephone ?? null } : null,
        emplacement: emplacement ? { id: emplacement.id, nom: emplacement.nom } : null,
        nombreLignes: Array.isArray(lignes) ? lignes.length : 0,
        paye,
        resteDu: v.statut === 'VALIDEE' ? total - paye : 0,
      };
    });
  },
};

/**
 * Routes avec identifiant. undefined (pas de réponse locale) quand l'élément
 * n'est pas sur l'appareil : l'écran affiche alors l'erreur réseau habituelle.
 */
const LECTEURS_PARAMETRES: [RegExp, Lecteur][] = [
  // FournisseursService.obtenir
  [/^\/fournisseurs\/([^/]+)$/, async (base, _p, [id]) => base.fournisseurs.get(id)],
  // FournisseursService.listerProduitsAssocies
  [
    /^\/fournisseurs\/([^/]+)\/produits$/,
    async (base, _p, [id]) => {
      if (!(await base.fournisseurs.get(id))) return undefined;
      const associations = await base.fournisseursProduits.where('fournisseurId').equals(id).toArray();
      const produits = await base.produits.bulkGet(associations.map((a) => a.produitId));
      return produits.filter((pr) => pr !== undefined);
    },
  ],
  // FournisseursService.listerReceptions : entrées de ce fournisseur (90 derniers jours sur l'appareil).
  [
    /^\/fournisseurs\/([^/]+)\/receptions$/,
    async (base, _p, [id]) => {
      if (!(await base.fournisseurs.get(id))) return undefined;
      const [mouvements, produits, emplacements] = await Promise.all([
        base.mouvements.toArray(),
        base.produits.toArray(),
        base.emplacements.toArray(),
      ]);
      const produitsParId = new Map(produits.map((pr) => [pr.id, pr]));
      const emplacementsParId = new Map(emplacements.map((e) => [e.id, e]));
      return mouvements
        .filter((m) => m.fournisseurId === id && m.type === 'ENTREE')
        .map((m) => ({ ...m, produit: produitsParId.get(m.produitId) ?? null, emplacement: emplacementsParId.get(m.emplacementId) ?? null }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  ],
];

/**
 * Réponse reconstituée pour cette requête GET, ou undefined : route non
 * couverte, personne de connecté, ou appareil jamais synchronisé (une liste
 * vide serait trompeuse).
 */
export async function lireLocalement(url: string | undefined, params?: unknown): Promise<unknown> {
  if (!url) return undefined;
  const adresse = new URL(url, 'http://appareil.local');
  const chemin = adresse.pathname.replace(/\/+$/, '');
  let lecteur = LECTEURS[chemin];
  let segments: string[] = [];
  for (const [motif, avecParametres] of LECTEURS_PARAMETRES) {
    const correspondance = lecteur ? null : motif.exec(chemin);
    if (correspondance) {
      lecteur = avecParametres;
      segments = correspondance.slice(1).map(decodeURIComponent);
    }
  }
  const entrepriseId = getSession()?.entreprise.id;
  const base = lecteur && entrepriseId ? baseLocale(entrepriseId) : null;
  if (!lecteur || !base) return undefined;
  if (!(await base.etat.get('synchronisation'))?.derniereReussite) return undefined;
  if (params && typeof params === 'object') {
    for (const [cle, valeur] of Object.entries(params)) {
      if (valeur !== undefined && valeur !== null) adresse.searchParams.set(cle, String(valeur));
    }
  }
  return lecteur(base, adresse.searchParams, segments);
}
