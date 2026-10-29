import { useState } from 'react';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { useQuery } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { formatNombre } from '@/lib/format';
import { dateHeure, gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { presentationMouvement, type TypeMouvement } from '@/components/patterns/typeMouvement';

interface Ligne {
  produit: { id: string; nom: string; reference: string | null; uniteMesure: string | null; categorie: { nom: string } | null };
  quantite: number;
  valeur: number;
  coutMoyen: number | null;
}

interface Couche {
  id: string;
  quantite: number;
  coutUnitaire: number;
  valeur: number;
  quantiteRestante: number;
  libelle: string | null;
  createdAt: string;
  mouvement: { type: TypeMouvement; vente: { numero: string } | null } | null;
}

/**
 * Valorisation du stock (module « valorisation ») : valeur au coût par
 * produit, et le détail de ses couches (chaque entrée et sortie, au coût
 * retenu par la méthode).
 */
export function ValorisationPage() {
  const [produit, setProduit] = useState<Ligne['produit'] | null>(null);
  const resume = useQuery({
    queryKey: ['valorisation'],
    queryFn: async () => (await api.get<{ methode: 'FIFO' | 'PMP'; valeurTotale: number; produits: Ligne[] }>('/valorisation')).data,
  });
  const couches = useQuery({
    queryKey: ['valorisation', produit?.id],
    enabled: produit !== null,
    queryFn: async () => (await api.get<Couche[]>(`/valorisation/produits/${produit!.id}/couches`)).data,
  });
  const { visibles, ancre, pagination } = usePagination(resume.data?.produits ?? []);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Valorisation du stock"
        description={
          resume.data
            ? `Méthode : ${resume.data.methode === 'FIFO' ? 'FIFO (premier entré, premier sorti)' : 'coût moyen pondéré'}. Valeur au coût d’achat, hors taxes.`
            : 'Valeur du stock au coût d’achat.'
        }
      />
      {resume.isLoading ? (
        <LoadingState variante="cartes" />
      ) : resume.isError ? (
        <ErrorState message={messageErreur(resume.error)} onRetry={() => resume.refetch()} />
      ) : (
        <>
          <Card className="p-5">
            <p className="text-meta text-steel-500">Valeur totale du stock</p>
            <p className="text-titre text-ink-900">{gnf(resume.data!.valeurTotale)}</p>
          </Card>
          <Card>
            <PanneauEntete titre="Par produit" meta="Cliquez un produit pour voir le détail de ses coûts." />
            {resume.data!.produits.length === 0 ? (
              <EmptyState titre="Aucun stock valorisé" description="Les prochaines entrées de stock apparaîtront ici avec leur coût." />
            ) : (
              <>
                <div ref={ancre} className="scroll-mt-20" />
                <ul className="divide-y divide-rule">
                  {visibles.map((l) => (
                    <li key={l.produit.id}>
                      <button
                        type="button"
                        onClick={() => setProduit(l.produit)}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-entete-tableau sm:px-5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-corps font-medium text-ink-900">{l.produit.nom}</span>
                          <span className="block truncate text-meta text-steel-500">
                            {formatNombre(l.quantite)} {l.produit.uniteMesure ?? 'unité'}
                            {l.quantite > 1 ? 's' : ''}
                            {l.coutMoyen !== null && ` · coût moyen ${gnf(l.coutMoyen)}`}
                            {l.produit.categorie && ` · ${l.produit.categorie.nom}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-corps font-semibold text-ink-900">{gnf(l.valeur)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Pagination etat={pagination} className="border-t border-rule" />
              </>
            )}
          </Card>
        </>
      )}

      {produit && (
        <Modal ouvert onFermer={() => setProduit(null)} titre={produit.nom} description="Couches de valorisation, des plus récentes aux plus anciennes.">
          {couches.isLoading ? (
            <LoadingState lignes={4} />
          ) : couches.isError ? (
            <ErrorState message={messageErreur(couches.error)} onRetry={() => couches.refetch()} />
          ) : (
            <ul className="divide-y divide-rule">
              {couches.data!.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-corps text-ink-900">
                      {c.libelle ??
                        (c.mouvement
                          ? c.mouvement.vente
                            ? `Vente ${c.mouvement.vente.numero}`
                            : presentationMouvement[c.mouvement.type].libelle
                          : '—')}
                    </span>
                    <span className="block text-meta text-steel-500">
                      {dateHeure(c.createdAt)} · {gnf(c.coutUnitaire)} l’unité
                      {c.quantite > 0 && c.quantiteRestante > 0 && ` · ${formatNombre(c.quantiteRestante)} encore en stock`}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-corps font-semibold', c.quantite > 0 ? 'text-ok' : 'text-ink-900')}>
                    {c.quantite > 0 ? '+' : '−'}
                    {formatNombre(Math.abs(c.quantite))} · {gnf(Math.abs(c.valeur))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}
