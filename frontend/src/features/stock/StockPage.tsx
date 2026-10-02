import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { exporterCsv } from '@/lib/exporterCsv';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { MouvementModal } from './MouvementModal';
import { InventairesTab } from './InventairesTab';
import { cn } from '@/lib/cn';
import { Onglets } from '@/components/patterns/Onglets';
import { Vignette } from '@/components/patterns/Vignette';
import { tableau } from '@/components/patterns/tableau';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';
import { presentationMouvement, quantiteSignee } from '@/components/patterns/typeMouvement';
import type { TypeMouvement } from '@/components/patterns/typeMouvement';

interface LigneStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
  produit: { nom: string; reference: string | null; seuilAlerte: number; photoUrl: string | null; uniteMesure: string | null };
  emplacement: { nom: string };
}

interface Mouvement {
  id: string;
  type: TypeMouvement;
  quantite: number;
  createdAt: string;
  produit: { nom: string };
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
  utilisateur: { nom: string };
  fournisseur: { nom: string } | null;
}

interface Emplacement {
  id: string;
  nom: string;
}

const onglets = [
  { cle: 'stock', libelle: 'Stock actuel' },
  { cle: 'mouvements', libelle: 'Mouvements' },
  { cle: 'inventaires', libelle: 'Inventaires' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

export function StockPage() {
  const [actif, setActif] = useState<CleOnglet>('stock');
  const [emplacementFiltre, setEmplacementFiltre] = useState('');
  const [modaleOuverte, setModaleOuverte] = useState(false);

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Emplacement[]>('/emplacements')).data,
  });

  const stock = useQuery({
    queryKey: ['stock', emplacementFiltre],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (emplacementFiltre) p.set('emplacement_id', emplacementFiltre);
      return (await api.get<LigneStock[]>(`/stock?${p.toString()}`)).data;
    },
    enabled: actif === 'stock',
  });

  const mouvements = useQuery({
    queryKey: ['mouvements', emplacementFiltre],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (emplacementFiltre) p.set('emplacement_id', emplacementFiltre);
      return (await api.get<Mouvement[]>(`/mouvements?${p.toString()}`)).data;
    },
    enabled: actif === 'mouvements',
  });

  const dateHeure = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lieu = (m: Mouvement) =>
    m.type === 'TRANSFERT' && m.emplacementDestination
      ? `${m.emplacement.nom} vers ${m.emplacementDestination.nom}`
      : m.emplacement.nom;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Stock & mouvements"
        description="Ce qu’il y a dans chaque emplacement, et tout ce qui est entré ou sorti."
        action={
          actif !== 'inventaires' && (
            <>
              <Button
                variant="secondary"
                disabled={actif === 'stock' ? !stock.data?.length : !mouvements.data?.length}
                onClick={() => {
                  const date = new Date().toISOString().slice(0, 10);
                  if (actif === 'stock' && stock.data) {
                    exporterCsv(
                      `stock-${date}.csv`,
                      [
                        { entete: 'Produit', valeur: (l: LigneStock) => l.produit.nom },
                        { entete: 'Référence', valeur: (l: LigneStock) => l.produit.reference ?? '' },
                        { entete: 'Emplacement', valeur: (l: LigneStock) => l.emplacement.nom },
                        { entete: 'Quantité', valeur: (l: LigneStock) => l.quantite },
                        {
                          entete: 'Statut',
                          valeur: (l: LigneStock) => libelleStatut[statutStock(l.quantite, l.produit.seuilAlerte)],
                        },
                      ],
                      stock.data,
                    );
                  } else if (mouvements.data) {
                    exporterCsv(
                      `mouvements-${date}.csv`,
                      [
                        {
                          entete: 'Date',
                          valeur: (m: Mouvement) => new Date(m.createdAt).toLocaleDateString('fr-FR'),
                        },
                        { entete: 'Type', valeur: (m: Mouvement) => presentationMouvement[m.type].libelle },
                        { entete: 'Produit', valeur: (m: Mouvement) => m.produit.nom },
                        { entete: 'Emplacement', valeur: (m: Mouvement) => m.emplacement.nom },
                        {
                          entete: 'Emplacement destination',
                          valeur: (m: Mouvement) => m.emplacementDestination?.nom ?? '',
                        },
                        { entete: 'Quantité', valeur: (m: Mouvement) => m.quantite },
                        { entete: 'Utilisateur', valeur: (m: Mouvement) => m.utilisateur.nom },
                        {
                          entete: 'Fournisseur',
                          valeur: (m: Mouvement) => m.fournisseur?.nom ?? '',
                        },
                      ],
                      mouvements.data,
                    );
                  }
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                Exporter CSV
              </Button>
              <Button onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Nouveau mouvement
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Onglets onglets={onglets} actif={actif} onChange={setActif} libelle="Vues du stock" />

        {actif !== 'inventaires' && (
          <div className="flex items-center gap-2">
            <label htmlFor="filtre-emplacement" className="text-corps text-steel-500">
              Emplacement
            </label>
            <select
              id="filtre-emplacement"
              value={emplacementFiltre}
              onChange={(event) => setEmplacementFiltre(event.target.value)}
              className="h-9 min-w-0 rounded-md border border-rule-strong bg-surface px-3 text-corps text-ink-900 hover:border-steel-400"
            >
              <option value="">Tous les emplacements</option>
              {(emplacements.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div role="tabpanel">
        {actif === 'stock' && (
          <Card>
            {stock.isLoading ? (
              <LoadingState />
            ) : stock.isError ? (
              <ErrorState message={messageErreur(stock.error)} onRetry={() => stock.refetch()} />
            ) : stock.data && stock.data.length > 0 ? (
              <>
                <table className={cn(tableau.table, 'hidden md:table')}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th scope="col" className={tableau.th}>Produit</th>
                      <th scope="col" className={tableau.th}>Emplacement</th>
                      <th scope="col" className={cn(tableau.th, 'text-right')}>Quantité</th>
                      <th scope="col" className={cn(tableau.th, 'w-[124px]')}>État</th>
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {stock.data.map((ligne) => {
                      const statut = statutStock(ligne.quantite, ligne.produit.seuilAlerte);
                      return (
                        <tr key={`${ligne.produitId}-${ligne.emplacementId}`} className={tableau.tr}>
                          <td className={cn(tableau.td, 'py-2.5')}>
                            <span className="flex min-w-0 items-center gap-3">
                              <Vignette nom={ligne.produit.nom} photoUrl={ligne.produit.photoUrl} taille={32} />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-ink-900">{ligne.produit.nom}</span>
                                {ligne.produit.reference && (
                                  <span className="block font-mono text-meta text-steel-500">
                                    {ligne.produit.reference}
                                  </span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className={cn(tableau.td, 'text-steel-700')}>{ligne.emplacement.nom}</td>
                          <td className={cn(tableau.td, 'text-right whitespace-nowrap')}>
                            <span className="font-semibold text-ink-900">{ligne.quantite}</span>{' '}
                            {ligne.produit.uniteMesure && (
                              <span className="text-meta text-steel-400">{ligne.produit.uniteMesure}</span>
                            )}
                          </td>
                          <td className={tableau.td}>
                            <Badge variant={varianteStatut[statut]}>{libelleStatut[statut]}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ul className="divide-y divide-rule md:hidden">
                  {stock.data.map((ligne) => {
                    const statut = statutStock(ligne.quantite, ligne.produit.seuilAlerte);
                    return (
                      <li key={`${ligne.produitId}-${ligne.emplacementId}`} className="flex items-center gap-3 px-4 py-3">
                        <Vignette nom={ligne.produit.nom} photoUrl={ligne.produit.photoUrl} taille={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-corps font-medium text-ink-900">{ligne.produit.nom}</p>
                          <p className="truncate text-meta text-steel-500">{ligne.emplacement.nom}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="whitespace-nowrap">
                            <span className="font-semibold text-ink-900">{ligne.quantite}</span>{' '}
                            {ligne.produit.uniteMesure && (
                              <span className="text-meta text-steel-400">{ligne.produit.uniteMesure}</span>
                            )}
                          </p>
                          <Badge variant={varianteStatut[statut]}>{libelleStatut[statut]}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <EmptyState
                titre="Aucun stock"
                description="Enregistrez une entrée de stock pour voir apparaître vos quantités."
                action={<Button onClick={() => setModaleOuverte(true)}>Enregistrer un mouvement</Button>}
              />
            )}
          </Card>
        )}

        {actif === 'mouvements' && (
          <Card>
            {mouvements.isLoading ? (
              <LoadingState />
            ) : mouvements.isError ? (
              <ErrorState message={messageErreur(mouvements.error)} onRetry={() => mouvements.refetch()} />
            ) : mouvements.data && mouvements.data.length > 0 ? (
              <>
                <table className={cn(tableau.table, 'hidden md:table')}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th scope="col" className={tableau.th}>Mouvement</th>
                      <th scope="col" className={tableau.th}>Emplacement</th>
                      <th scope="col" className={cn(tableau.th, 'text-right')}>Quantité</th>
                      <th scope="col" className={tableau.th}>Date</th>
                      <th scope="col" className={tableau.th}>Par</th>
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {mouvements.data.map((mouvement) => {
                      const p = presentationMouvement[mouvement.type];
                      return (
                        <tr key={mouvement.id} className={tableau.tr}>
                          <td className={cn(tableau.td, 'py-2.5')}>
                            {/* Le type n'est jamais porté par la couleur seule : icône + libellé. */}
                            <span className="flex min-w-0 items-center gap-3">
                              <span
                                className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-sm', p.fond)}
                                aria-hidden="true"
                              >
                                <p.Icone className="size-3.5" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-ink-900">{mouvement.produit.nom}</span>
                                <span className="block text-meta text-steel-500">
                                  {p.libelle}
                                  {mouvement.fournisseur && ` de ${mouvement.fournisseur.nom}`}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className={cn(tableau.td, 'text-steel-700')}>{lieu(mouvement)}</td>
                          <td className={cn(tableau.td, 'text-right font-semibold whitespace-nowrap', p.couleur)}>
                            {quantiteSignee(mouvement.type, mouvement.quantite)}
                          </td>
                          <td className={cn(tableau.td, 'whitespace-nowrap text-steel-500')}>
                            {dateHeure(mouvement.createdAt)}
                          </td>
                          <td className={cn(tableau.td, 'text-steel-500')}>{mouvement.utilisateur.nom}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ul className="divide-y divide-rule md:hidden">
                  {mouvements.data.map((mouvement) => {
                    const p = presentationMouvement[mouvement.type];
                    return (
                      <li key={mouvement.id} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-sm', p.fond)}
                          aria-hidden="true"
                        >
                          <p.Icone className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-corps font-medium text-ink-900">{mouvement.produit.nom}</p>
                          <p className="truncate text-meta text-steel-500">
                            {p.libelle}, {lieu(mouvement)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn('text-corps font-semibold', p.couleur)}>
                            {quantiteSignee(mouvement.type, mouvement.quantite)}
                          </p>
                          <p className="text-meta whitespace-nowrap text-steel-400">{dateHeure(mouvement.createdAt)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <EmptyState
                titre="Aucun mouvement"
                description="L’historique se remplira au fil de vos entrées et sorties de stock."
                action={<Button onClick={() => setModaleOuverte(true)}>Enregistrer un mouvement</Button>}
              />
            )}
          </Card>
        )}

        {actif === 'inventaires' && <InventairesTab emplacements={emplacements.data} />}
      </div>

      {/* Monté seulement à l'ouverture : garantit un formulaire vierge
          à chaque fois, sans effet de réinitialisation. */}
      {modaleOuverte && <MouvementModal ouvert onFermer={() => setModaleOuverte(false)} />}
    </div>
  );
}
