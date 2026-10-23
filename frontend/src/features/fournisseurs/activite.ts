import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { joursEntre } from '@/lib/periode';
import type { StatutCommande } from '@/features/commandes/statutsCommande';
import type { ListeRetoursFournisseur, RetourFournisseur } from '@/features/retours/types';

/**
 * Activité de chaque fournisseur, tirée de requêtes déjà partagées avec
 * les écrans Commandes, Alertes et Retours (mêmes clés de cache) :
 * commandes en route, produits en alerte, délais réels et avoirs.
 */

export interface CommandeFournisseur {
  id: string;
  statut: StatutCommande;
  createdAt: string;
  envoyeeAt: string | null;
  recueAt: string | null;
  fournisseur: { id: string };
  _count: { lignes: number };
  /** Absente d'un serveur pas encore à jour. */
  valeurEstimee?: number;
  valeurIncomplete?: boolean;
}

interface AlerteResume {
  produit: { id: string; fournisseursAssocies: { fournisseur: { id: string } }[] };
}

export interface ActiviteFournisseur {
  enRoute: number;
  /** Produits associés à ce fournisseur et sous leur seuil (ou en rupture). */
  produitsEnAlerte: Set<string>;
  /** Moyenne en jours entre envoi et réception ; null sans commande reçue. */
  delaiReel: number | null;
  /** Durée de chaque commande reçue, en jours calendaires (envoi → réception). */
  durees: number[];
  /** Commandes de ce fournisseur, les plus récentes d'abord. */
  commandes: CommandeFournisseur[];
  /** Retours à ce fournisseur, les plus récents d'abord. */
  retours: RetourFournisseur[];
  avoirsEnAttente: { nombre: number; valeur: number };
  avoirsRecus: number;
  avoirsRefuses: number;
}

const JOUR_MS = 86_400_000;
const VIDE: ActiviteFournisseur = {
  enRoute: 0,
  produitsEnAlerte: new Set(),
  delaiReel: null,
  durees: [],
  commandes: [],
  retours: [],
  avoirsEnAttente: { nombre: 0, valeur: 0 },
  avoirsRecus: 0,
  avoirsRefuses: 0,
};

/** Commandes reçues dans le délai annoncé, en jours calendaires ; null sans délai annoncé ou sans réception. */
export function ponctualite(activite: ActiviteFournisseur, annonce: number | null): { aLHeure: number; total: number } | null {
  if (annonce === null || activite.durees.length === 0) return null;
  return { aLHeure: activite.durees.filter((d) => d <= annonce).length, total: activite.durees.length };
}

export function useActiviteFournisseurs() {
  const commandes = useQuery({
    queryKey: ['commandes'],
    queryFn: async () => (await api.get<CommandeFournisseur[]>('/commandes')).data,
  });
  const alertes = useQuery({
    queryKey: ['alertes', 'ACTIVE'],
    queryFn: async () => (await api.get<AlerteResume[]>('/alertes?statut=ACTIVE')).data,
  });
  const retours = useQuery({
    queryKey: ['retours-fournisseur'],
    queryFn: async () => (await api.get<ListeRetoursFournisseur>('/retours-fournisseur')).data,
  });

  const parFournisseur = new Map<string, ActiviteFournisseur & { delais: number[] }>();
  const entree = (id: string) => {
    let e = parFournisseur.get(id);
    if (!e) {
      e = { ...VIDE, produitsEnAlerte: new Set(), durees: [], commandes: [], retours: [], avoirsEnAttente: { nombre: 0, valeur: 0 }, delais: [] };
      parFournisseur.set(id, e);
    }
    return e;
  };
  for (const c of commandes.data ?? []) {
    const e = entree(c.fournisseur.id);
    e.commandes.push(c);
    if (c.statut === 'ENVOYEE') e.enRoute += 1;
    if (c.statut === 'RECUE' && c.envoyeeAt && c.recueAt) {
      const envoi = new Date(c.envoyeeAt);
      const reception = new Date(c.recueAt);
      e.delais.push((reception.getTime() - envoi.getTime()) / JOUR_MS);
      e.durees.push(joursEntre(envoi, reception));
    }
  }
  for (const a of alertes.data ?? []) {
    for (const { fournisseur } of a.produit.fournisseursAssocies) entree(fournisseur.id).produitsEnAlerte.add(a.produit.id);
  }
  for (const r of retours.data?.retours ?? []) {
    const e = entree(r.fournisseur.id);
    e.retours.push(r);
    if (r.statutAvoir === 'ATTENDU') {
      e.avoirsEnAttente.nombre += 1;
      e.avoirsEnAttente.valeur += r.valeurTotale;
    } else if (r.statutAvoir === 'RECU') e.avoirsRecus += 1;
    else e.avoirsRefuses += 1;
  }

  return (fournisseurId: string): ActiviteFournisseur => {
    const e = parFournisseur.get(fournisseurId);
    if (!e) return VIDE;
    const delaiReel = e.delais.length > 0 ? Math.round((e.delais.reduce((a, b) => a + b, 0) / e.delais.length) * 10) / 10 : null;
    return { ...e, commandes: [...e.commandes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), delaiReel };
  };
}

/** Teinte stable par fournisseur, pour les avatars sans photo. */
const TEINTES = ['#2f6fb3', '#12705c', '#c2440b', '#9a6500', '#7a4bc2', '#3a7bd5'];
export function teinteFournisseur(id: string): string {
  let somme = 0;
  for (const caractere of id) somme += caractere.charCodeAt(0);
  return TEINTES[somme % TEINTES.length];
}
