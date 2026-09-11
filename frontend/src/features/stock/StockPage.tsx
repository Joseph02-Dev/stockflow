import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Download, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { exporterCsv } from '@/lib/exporterCsv';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { MouvementModal } from './MouvementModal';
import { InventairesTab } from './InventairesTab';
import { cn } from '@/lib/cn';

interface LigneStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
  produit: { nom: string; reference: string | null; seuilAlerte: number };
  emplacement: { nom: string };
}

interface Mouvement {
  id: string;
  type: 'ENTREE' | 'SORTIE' | 'TRANSFERT';
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
  { cle: 'mouvements', libelle: 'Historique des mouvements' },
  { cle: 'inventaires', libelle: 'Inventaires' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

/** Statut dérivé du stock par rapport au seuil, cohérent avec le backend. */
function statutStock(quantite: number, seuil: number) {
  if (quantite === 0) return { variante: 'error' as const, libelle: 'Rupture' };
  if (quantite < seuil) return { variante: 'warning' as const, libelle: 'Stock faible' };
  return { variante: 'success' as const, libelle: 'OK' };
}

/** Icône, libellé, couleur et signe pour chaque type de mouvement. */
function infosTypeMouvement(type: Mouvement['type']) {
  if (type === 'ENTREE') return { libelle: 'Entrée', Icone: ArrowDownToLine, classe: 'text-success', signe: '+' };
  if (type === 'SORTIE') return { libelle: 'Sortie', Icone: ArrowUpFromLine, classe: 'text-warning', signe: '−' };
  return { libelle: 'Transfert', Icone: ArrowRightLeft, classe: 'text-info', signe: '' };
}

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Stock & Mouvements"
        description="L’état de votre stock et la traçabilité de chaque entrée et sortie."
        action={
          <div className="flex gap-2">
            {actif !== 'inventaires' && (
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
                        valeur: (l: LigneStock) => statutStock(l.quantite, l.produit.seuilAlerte).libelle,
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
                      { entete: 'Type', valeur: (m: Mouvement) => infosTypeMouvement(m.type).libelle },
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
            )}
            {actif !== 'inventaires' && (
              <Button onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Nouveau mouvement
              </Button>
            )}
          </div>
        }
      />

      <div className="border-b border-border-subtle" role="tablist" aria-label="Vues du stock">
        <div className="flex gap-1">
          {onglets.map((onglet) => (
            <button
              key={onglet.cle}
              type="button"
              role="tab"
              aria-selected={actif === onglet.cle}
              onClick={() => setActif(onglet.cle)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                actif === onglet.cle
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {onglet.libelle}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="filtre-emplacement" className="text-sm text-text-secondary">
          Emplacement
        </label>
        <select
          id="filtre-emplacement"
          value={emplacementFiltre}
          onChange={(event) => setEmplacementFiltre(event.target.value)}
          className="rounded-(--radius-button) border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="">Tous les emplacements</option>
          {(emplacements.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
            </option>
          ))}
        </select>
      </div>

      <div role="tabpanel">
        {actif === 'stock' && (
          <Card>
            {stock.isLoading ? (
              <LoadingState />
            ) : stock.isError ? (
              <ErrorState message={messageErreur(stock.error)} onRetry={() => stock.refetch()} />
            ) : stock.data && stock.data.length > 0 ? (
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b border-border-subtle bg-background text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Emplacement</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Quantité</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {stock.data.map((ligne) => {
                    const statut = statutStock(ligne.quantite, ligne.produit.seuilAlerte);
                    return (
                      <tr key={`${ligne.produitId}-${ligne.emplacementId}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-text-primary">{ligne.produit.nom}</span>
                          {ligne.produit.reference && (
                            <span className="ml-2 text-xs text-text-secondary">
                              {ligne.produit.reference}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{ligne.emplacement.nom}</td>
                        <td className="px-4 py-3 font-medium text-text-primary">{ligne.quantite}</td>
                        <td className="px-4 py-3">
                          <Badge variant={statut.variante}>{statut.libelle}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                titre="Aucun stock"
                description="Enregistrez une entrée de stock pour voir apparaître vos quantités."
                action={<Button onClick={() => setModaleOuverte(true)}>Enregistrer un mouvement</Button>}
              />
            )}
            {stock.data && stock.data.length > 0 && (
              <ul className="divide-y divide-border-subtle md:hidden">
                {stock.data.map((ligne) => {
                  const statut = statutStock(ligne.quantite, ligne.produit.seuilAlerte);
                  return (
                    <li
                      key={`${ligne.produitId}-${ligne.emplacementId}`}
                      className="flex items-center justify-between gap-2 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{ligne.produit.nom}</p>
                        <p className="truncate text-sm text-text-secondary">
                          {ligne.emplacement.nom} · {ligne.quantite}
                        </p>
                      </div>
                      <Badge variant={statut.variante}>{statut.libelle}</Badge>
                    </li>
                  );
                })}
              </ul>
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
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b border-border-subtle bg-background text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Date</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Type</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Emplacement</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Quantité</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {mouvements.data.map((mouvement) => {
                    const infos = infosTypeMouvement(mouvement.type);
                    return (
                      <tr key={mouvement.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                          {new Date(mouvement.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          {/* Le type n'est jamais porté par la couleur seule :
                              icône + libellé explicite. */}
                          <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', infos.classe)}>
                            <infos.Icone className="size-4" aria-hidden="true" />
                            {infos.libelle}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">{mouvement.produit.nom}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {mouvement.type === 'TRANSFERT' && mouvement.emplacementDestination
                            ? `${mouvement.emplacement.nom} → ${mouvement.emplacementDestination.nom}`
                            : mouvement.emplacement.nom}
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">
                          {infos.signe}
                          {mouvement.quantite}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{mouvement.utilisateur.nom}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                titre="Aucun mouvement"
                description="L’historique se remplira au fil de vos entrées et sorties de stock."
                action={<Button onClick={() => setModaleOuverte(true)}>Enregistrer un mouvement</Button>}
              />
            )}
            {mouvements.data && mouvements.data.length > 0 && (
              <ul className="divide-y divide-border-subtle md:hidden">
                {mouvements.data.map((mouvement) => {
                  const infos = infosTypeMouvement(mouvement.type);
                  return (
                    <li key={mouvement.id} className="flex flex-col gap-1 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text-primary">{mouvement.produit.nom}</span>
                        <span className={cn('inline-flex items-center gap-1 text-sm font-medium', infos.classe)}>
                          <infos.Icone className="size-4" aria-hidden="true" />
                          {infos.signe}
                          {mouvement.quantite}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary">
                        {mouvement.type === 'TRANSFERT' && mouvement.emplacementDestination
                          ? `${mouvement.emplacement.nom} → ${mouvement.emplacementDestination.nom}`
                          : mouvement.emplacement.nom}{' '}
                        · {new Date(mouvement.createdAt).toLocaleDateString('fr-FR')} · {mouvement.utilisateur.nom}
                      </p>
                    </li>
                  );
                })}
              </ul>
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
