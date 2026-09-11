import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ShoppingCart } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';

interface Alerte {
  id: string;
  type: 'STOCK_FAIBLE' | 'RUPTURE';
  statut: 'ACTIVE' | 'RESOLUE';
  quantiteAuDeclenchement: number;
  createdAt: string;
  resolvedAt: string | null;
  produit: {
    id: string;
    nom: string;
    reference: string | null;
    seuilAlerte: number;
    fournisseursAssocies: { fournisseur: { id: string; nom: string } }[];
  };
}

const filtres = [
  { cle: 'ACTIVE', libelle: 'Actives' },
  { cle: 'RESOLUE', libelle: 'Résolues' },
] as const;

type Statut = (typeof filtres)[number]['cle'];

export function AlertesPage() {
  const navigate = useNavigate();
  const [statut, setStatut] = useState<Statut>('ACTIVE');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['alertes', statut],
    queryFn: async () => (await api.get<Alerte[]>(`/alertes?statut=${statut}`)).data,
  });

  // Regroupe les alertes actives par fournisseur habituel (première
  // association du produit, même logique que la fiche produit) — permet
  // de proposer « Préparer la commande » sans que l'utilisateur ait à
  // sélectionner les produits un par un.
  const groupesParFournisseur =
    statut === 'ACTIVE' && data
      ? Object.values(
          data.reduce<Record<string, { fournisseur: { id: string; nom: string }; alertes: Alerte[] }>>(
            (acc, alerte) => {
              const fournisseur = alerte.produit.fournisseursAssocies[0]?.fournisseur;
              if (!fournisseur) return acc;
              acc[fournisseur.id] ??= { fournisseur, alertes: [] };
              acc[fournisseur.id].alertes.push(alerte);
              return acc;
            },
            {},
          ),
        )
      : [];

  function preparerCommande(groupe: (typeof groupesParFournisseur)[number]) {
    navigate('/commandes/nouvelle', {
      state: {
        fournisseurId: groupe.fournisseur.id,
        lignes: groupe.alertes.map((a) => ({
          produitId: a.produit.id,
          // Suggestion raisonnable : ramener le stock au seuil, jamais 0.
          quantiteCommandee: Math.max(a.produit.seuilAlerte - a.quantiteAuDeclenchement, 1),
        })),
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Alertes"
        description="Les produits dont le stock est passé sous leur seuil."
      />

      <div className="border-b border-border-subtle" role="tablist" aria-label="Statut des alertes">
        <div className="flex gap-1">
          {filtres.map((filtre) => (
            <button
              key={filtre.cle}
              type="button"
              role="tab"
              aria-selected={statut === filtre.cle}
              onClick={() => setStatut(filtre.cle)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                statut === filtre.cle
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {filtre.libelle}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel">
        <Card>
          {isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
          ) : data && data.length > 0 ? (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b border-border-subtle bg-background text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Type</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">
                      Stock au déclenchement
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">
                      {statut === 'ACTIVE' ? 'Déclenchée le' : 'Résolue le'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.map((alerte) => (
                    <tr key={alerte.id}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-text-primary">{alerte.produit.nom}</span>
                        {alerte.produit.reference && (
                          <span className="ml-2 text-xs text-text-secondary">
                            {alerte.produit.reference}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={alerte.type === 'RUPTURE' ? 'error' : 'warning'}>
                          {alerte.type === 'RUPTURE' ? 'Rupture' : 'Stock faible'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {alerte.quantiteAuDeclenchement} · seuil {alerte.produit.seuilAlerte}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                        {new Date(
                          statut === 'ACTIVE' ? alerte.createdAt : (alerte.resolvedAt ?? alerte.createdAt),
                        ).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cartes empilées sous md, conformément à la spécification
                  UX validée — un tableau ne se lit pas sur un écran étroit. */}
              <ul className="divide-y divide-border-subtle md:hidden">
                {data.map((alerte) => (
                  <li key={alerte.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-text-primary">
                        {alerte.produit.nom}
                      </span>
                      <Badge variant={alerte.type === 'RUPTURE' ? 'error' : 'warning'}>
                        {alerte.type === 'RUPTURE' ? 'Rupture' : 'Stock faible'}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {alerte.quantiteAuDeclenchement} · seuil {alerte.produit.seuilAlerte} ·{' '}
                      {new Date(
                        statut === 'ACTIVE' ? alerte.createdAt : (alerte.resolvedAt ?? alerte.createdAt),
                      ).toLocaleDateString('fr-FR')}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : statut === 'ACTIVE' ? (
            // État vide volontairement positif : aucune alerte active est
            // une bonne nouvelle, pas un manque à combler.
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
              <p className="font-medium text-text-primary">Aucune alerte</p>
              <p className="max-w-sm text-sm text-text-secondary">
                Tous vos produits sont au-dessus de leur seuil.
              </p>
            </div>
          ) : (
            <EmptyState
              titre="Aucune alerte résolue"
              description="Les alertes se résolvent automatiquement lorsqu’une entrée de stock fait repasser le produit au-dessus de son seuil."
            />
          )}
        </Card>
      </div>

      {groupesParFournisseur.length > 0 && (
        <div className="flex flex-col gap-2">
          {groupesParFournisseur.map((groupe) => (
            <div
              key={groupe.fournisseur.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-border-subtle bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm text-text-primary">
                  Regrouper {groupe.alertes.length} alerte{groupe.alertes.length > 1 ? 's' : ''} en une commande{' '}
                  <span className="font-medium">{groupe.fournisseur.nom}</span>
                </p>
              </div>
              <Button variant="secondary" onClick={() => preparerCommande(groupe)}>
                Préparer la commande
              </Button>
            </div>
          ))}
        </div>
      )}

      {statut === 'ACTIVE' && data && data.length > 0 && (
        <div>
          <Link
            to="/stock"
            className="inline-flex items-center justify-center gap-2 rounded-(--radius-button) border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-background"
          >
            Enregistrer un réapprovisionnement
          </Link>
        </div>
      )}
    </div>
  );
}
