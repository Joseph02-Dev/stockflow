import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, messageErreur } from '@/lib/api';
import { formatNombre } from '@/lib/format';
import { dateCourte, gnf } from '@/lib/montant';
import { Badge } from '@/components/ui/Badge';
import { Onglets } from '@/components/patterns/Onglets';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface LigneRotation {
  produit: { id: string; nom: string; reference: string | null; categorie: string | null };
  stock: number;
  sorties: number;
  derniereSortie: string | null;
  valeur: number | null;
  rotation: number | null;
  couvertureJours: number | null;
  dormant: boolean;
}

interface Rapport {
  jours: number;
  valorisation: 'couches' | 'prix_achat';
  totaux: { valeurStock: number; valeurDormante: number; produitsDormants: number };
  categories: { categorie: string; valeur: number; produits: number; dormants: number; rotation: number | null }[];
  produits: LigneRotation[];
}

const PERIODES = [
  { cle: '30', libelle: '30 jours' },
  { cle: '90', libelle: '90 jours' },
  { cle: '180', libelle: '6 mois' },
  { cle: '365', libelle: '12 mois' },
] as const;

/**
 * Rotation et stock dormant (module « rotation ») : ce qui se vend, ce qui
 * dort, et l'argent immobilisé — sur la période choisie.
 */
export function RotationPage() {
  const [jours, setJours] = useState<(typeof PERIODES)[number]['cle']>('90');
  const rapport = useQuery({
    queryKey: ['rotation', jours],
    queryFn: async () => (await api.get<Rapport>(`/statistiques/rotation?jours=${jours}`)).data,
  });
  const montant = (v: number | null) => (v === null ? '—' : gnf(v));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Rotation et stock dormant"
        description="Ventes nettes (retours et annulations déduits) rapportées au stock actuel."
        action={<Onglets onglets={PERIODES} actif={jours} onChange={setJours} libelle="Période" />}
      />
      {rapport.isLoading ? (
        <LoadingState variante="cartes" />
      ) : rapport.isError ? (
        <ErrorState message={messageErreur(rapport.error)} onRetry={() => rapport.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-meta text-steel-500">Valeur du stock</p>
              <p className="text-titre text-ink-900">{gnf(rapport.data!.totaux.valeurStock)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-meta text-steel-500">Stock dormant</p>
              <p className="text-titre text-faible">{gnf(rapport.data!.totaux.valeurDormante)}</p>
            </Card>
            <Card className="p-5">
              <p className="text-meta text-steel-500">Produits sans vente</p>
              <p className="text-titre text-ink-900">{formatNombre(rapport.data!.totaux.produitsDormants)}</p>
            </Card>
          </div>

          <Card>
            <PanneauEntete titre="Par catégorie" meta="Rotation en valeur : sorties au coût / valeur du stock" />
            <ul className="divide-y divide-rule">
              {rapport.data!.categories.map((c) => (
                <li key={c.categorie} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-corps font-medium text-ink-900">{c.categorie}</span>
                  {c.dormants > 0 && <Badge variant="faible">{c.dormants} sans vente</Badge>}
                  <span className="w-24 text-right text-meta text-steel-500">rotation {c.rotation ?? '—'}</span>
                  <span className="w-32 text-right text-corps font-semibold text-ink-900">{gnf(c.valeur)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <PanneauEntete titre="Par produit" meta="Produits sans vente d’abord, puis du plus lent au plus rapide." />
            {rapport.data!.produits.length === 0 ? (
              <EmptyState titre="Aucun produit" />
            ) : (
              <ul className="divide-y divide-rule">
                {rapport.data!.produits.map((p) => (
                  <li key={p.produit.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                    <Link to={`/produits/${p.produit.id}`} className="min-w-0 flex-1 basis-56">
                      <span className="block truncate text-corps font-medium text-ink-900 hover:underline">{p.produit.nom}</span>
                      <span className="block truncate text-meta text-steel-500">
                        {formatNombre(p.stock)} en stock · {formatNombre(p.sorties)} vendus
                        {p.derniereSortie ? ` · dernière vente le ${dateCourte(p.derniereSortie)}` : ' · jamais vendu'}
                      </span>
                    </Link>
                    {p.dormant ? (
                      <Badge variant="faible">Dormant</Badge>
                    ) : p.couvertureJours !== null ? (
                      <Badge variant={p.couvertureJours > 180 ? 'faible' : 'neutral'}>{formatNombre(p.couvertureJours)} j de stock</Badge>
                    ) : null}
                    <span className="w-28 text-right text-corps font-semibold text-ink-900">{montant(p.valeur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
