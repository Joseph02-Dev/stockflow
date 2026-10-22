import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Activité de chaque fournisseur, tirée de requêtes déjà partagées avec
 * les écrans Commandes et Alertes (mêmes clés de cache) : commandes en
 * route, produits en alerte et délai réel moyen (envoi → réception).
 */

interface CommandeResume {
  statut: 'BROUILLON' | 'ENVOYEE' | 'RECUE' | 'ANNULEE';
  envoyeeAt: string | null;
  recueAt: string | null;
  fournisseur: { id: string };
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
}

const JOUR_MS = 86_400_000;
const VIDE: ActiviteFournisseur = { enRoute: 0, produitsEnAlerte: new Set(), delaiReel: null };

export function useActiviteFournisseurs() {
  const commandes = useQuery({
    queryKey: ['commandes'],
    queryFn: async () => (await api.get<CommandeResume[]>('/commandes')).data,
  });
  const alertes = useQuery({
    queryKey: ['alertes', 'ACTIVE'],
    queryFn: async () => (await api.get<AlerteResume[]>('/alertes?statut=ACTIVE')).data,
  });

  const parFournisseur = new Map<string, { enRoute: number; produitsEnAlerte: Set<string>; delais: number[] }>();
  const entree = (id: string) => {
    let e = parFournisseur.get(id);
    if (!e) {
      e = { enRoute: 0, produitsEnAlerte: new Set(), delais: [] };
      parFournisseur.set(id, e);
    }
    return e;
  };
  for (const c of commandes.data ?? []) {
    if (c.statut === 'ENVOYEE') entree(c.fournisseur.id).enRoute += 1;
    if (c.statut === 'RECUE' && c.envoyeeAt && c.recueAt) {
      entree(c.fournisseur.id).delais.push((new Date(c.recueAt).getTime() - new Date(c.envoyeeAt).getTime()) / JOUR_MS);
    }
  }
  for (const a of alertes.data ?? []) {
    for (const { fournisseur } of a.produit.fournisseursAssocies) entree(fournisseur.id).produitsEnAlerte.add(a.produit.id);
  }

  return (fournisseurId: string): ActiviteFournisseur => {
    const e = parFournisseur.get(fournisseurId);
    if (!e) return VIDE;
    const delaiReel = e.delais.length > 0 ? Math.round((e.delais.reduce((a, b) => a + b, 0) / e.delais.length) * 10) / 10 : null;
    return { enRoute: e.enRoute, produitsEnAlerte: e.produitsEnAlerte, delaiReel };
  };
}

/** Teinte stable par fournisseur, pour les avatars sans photo. */
const TEINTES = ['#2f6fb3', '#12705c', '#c2440b', '#9a6500', '#7a4bc2', '#3a7bd5'];
export function teinteFournisseur(id: string): string {
  let somme = 0;
  for (const caractere of id) somme += caractere.charCodeAt(0);
  return TEINTES[somme % TEINTES.length];
}
