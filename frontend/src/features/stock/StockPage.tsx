import { useState, type CSSProperties } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Boxes, Download, MapPin, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { exporterCsv, telechargerExport } from '@/lib/exporterCsv';
import { formatNombre, pluriel } from '@/lib/format';
import { pageSuivante, TAILLE_PAGE, urlPage } from '@/lib/pagination';
import { useModules } from '@/lib/useModules';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { Onglets } from '@/components/patterns/Onglets';
import { libelleStatut, statutStock } from '@/components/patterns/statutStock';
import { MouvementModal } from './MouvementModal';
import { InventairesTab } from './InventairesTab';
import { StockActuel } from './StockActuel';
import { FAMILLES, JournalMouvements, type CleFamille, type Mouvement } from './JournalMouvements';
import type { Emplacement, LieuAffiche, LigneStock } from './types';
import './stock.css';

const onglets = [
  { cle: 'stock', libelle: 'Stock actuel' },
  { cle: 'mouvements', libelle: 'Mouvements' },
  { cle: 'inventaires', libelle: 'Inventaires' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

/** Une teinte par emplacement, dans l'ordre de la liste ; les couleurs de statut restent aux états du stock. */
const TEINTES_LIEUX = ['var(--color-action)', 'var(--color-accent)', '#2f6fb3', '#8a6d3b', '#5b7083', '#b0487a'];

export function StockPage() {
  const [actif, setActif] = useState<CleOnglet>('stock');
  // Module « inventaires » désactivé par un opérateur : l'onglet disparaît.
  const modules = useModules();
  const ongletsVisibles = onglets.filter((o) => o.cle !== 'inventaires' || modules.inventaires);
  const actifVisible: CleOnglet = actif === 'inventaires' && !modules.inventaires ? 'stock' : actif;
  const [emplacementFiltre, setEmplacementFiltre] = useState('');
  const [famille, setFamille] = useState<CleFamille>('tous');
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Emplacement[]>('/emplacements')).data,
  });
  const lieux: LieuAffiche[] = (emplacements.data ?? []).map((e, i) => ({
    id: e.id,
    nom: e.nom,
    teinte: TEINTES_LIEUX[i % TEINTES_LIEUX.length],
  }));

  // Tout le stock d'un coup (même cache que Produits et Alertes) : les cartes
  // d'emplacement en tirent leurs totaux, le filtre se fait ici.
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock')).data,
  });
  const lignesStock = (stock.data ?? []).filter((l) => !emplacementFiltre || l.emplacementId === emplacementFiltre);

  const filtresMouvements = new URLSearchParams(emplacementFiltre ? { emplacement_id: emplacementFiltre } : {});
  const typesFamille = FAMILLES.find((f) => f.cle === famille)?.types ?? [];
  if (typesFamille.length > 0) filtresMouvements.set('type', typesFamille.join(','));
  // Historique par pages de 50 (« Charger plus ») : il grossit chaque
  // jour, on ne le télécharge jamais en entier pour l'afficher.
  const mouvements = useInfiniteQuery({
    queryKey: ['mouvements', emplacementFiltre, famille],
    queryFn: async ({ pageParam }) =>
      (await api.get<Mouvement[]>(urlPage('/mouvements', filtresMouvements, pageParam))).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (derniere) => pageSuivante(derniere),
    enabled: actifVisible === 'mouvements',
  });
  const listeMouvements = mouvements.data?.pages.flat() ?? [];

  // Mouvements du jour : la première page de l'historique suffit ; pleine
  // et entièrement datée d'aujourd'hui, le chiffre s'affiche « 50+ ».
  const duJour = useQuery({
    queryKey: ['mouvements', 'jour', emplacementFiltre],
    queryFn: async () => {
      const p = new URLSearchParams(emplacementFiltre ? { emplacement_id: emplacementFiltre } : {});
      const page = (await api.get<Mouvement[]>(urlPage('/mouvements', p, undefined))).data;
      const aujourdhui = new Date().toDateString();
      const nombre = page.filter((m) => new Date(m.createdAt).toDateString() === aujourdhui).length;
      return { nombre, plus: nombre === TAILLE_PAGE };
    },
    enabled: actifVisible === 'stock',
  });

  const exporter = async () => {
    const date = new Date().toISOString().slice(0, 10);
    if (actifVisible === 'stock') {
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
        lignesStock,
      );
      return;
    }
    // L'export porte sur TOUT l'historique filtré (emplacement et type), pas
    // seulement les pages affichées : fichier généré par le serveur.
    setExportEnCours(true);
    await telechargerExport(`/mouvements/export?${filtresMouvements.toString()}`, `mouvements-${date}.csv`).finally(
      () => setExportEnCours(false),
    );
  };

  const cartesLieux = [
    { id: '', nom: 'Tous les emplacements', teinte: 'var(--color-ink-900)' },
    ...lieux,
  ].map((l) => {
    const lignes = (stock.data ?? []).filter((ligne) => !l.id || ligne.emplacementId === l.id);
    return { ...l, unites: lignes.reduce((s, ligne) => s + ligne.quantite, 0), produits: new Set(lignes.map((x) => x.produitId)).size };
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Stock & mouvements"
        description="Les quantités de chaque emplacement et l’historique de chaque entrée, vente et transfert."
        action={
          actifVisible !== 'inventaires' && (
            <>
              <Button
                variant="secondary"
                disabled={actifVisible === 'stock' ? lignesStock.length === 0 : listeMouvements.length === 0}
                loading={exportEnCours}
                onClick={exporter}
              >
                <Download className="size-4" aria-hidden="true" />
                Exporter CSV
              </Button>
              <Button onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Enregistrer un mouvement
              </Button>
            </>
          )
        }
      />

      {lieux.length > 1 && (
        <div className="stock-lieux" role="group" aria-label="Emplacement">
          {cartesLieux.map((l) => {
            const Icone = l.id ? MapPin : Boxes;
            return (
              <button
                key={l.id || 'tous'}
                type="button"
                className="stock-lieu"
                aria-pressed={emplacementFiltre === l.id}
                onClick={() => setEmplacementFiltre(l.id)}
                style={{ '--teinte': l.teinte } as CSSProperties}
              >
                <span className="stock-lieu-tuile" aria-hidden="true">
                  <Icone className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-corps font-semibold text-ink-900">{l.nom}</span>
                  <span className="block text-meta whitespace-nowrap text-steel-400">
                    {stock.data
                      ? `${formatNombre(l.unites)} ${pluriel('unité', l.unites)} · ${l.produits} ${pluriel('produit', l.produits)}`
                      : '…'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Onglets onglets={ongletsVisibles} actif={actifVisible} onChange={setActif} libelle="Vues du stock" />

      <div role="tabpanel">
        {actifVisible === 'stock' &&
          (stock.isLoading ? (
            <Card>
              <LoadingState />
            </Card>
          ) : stock.isError ? (
            <Card>
              <ErrorState message={messageErreur(stock.error)} onRetry={() => stock.refetch()} />
            </Card>
          ) : (
            <StockActuel
              key={emplacementFiltre}
              lignes={lignesStock}
              lieux={lieux}
              emplacementId={emplacementFiltre}
              mouvementsDuJour={duJour.data ?? null}
              onVoirMouvements={() => {
                setFamille('tous');
                setActif('mouvements');
              }}
              onNouveauMouvement={() => setModaleOuverte(true)}
            />
          ))}

        {actifVisible === 'mouvements' && (
          <JournalMouvements
            requete={mouvements}
            famille={famille}
            onFamille={setFamille}
            onNouveauMouvement={() => setModaleOuverte(true)}
          />
        )}

        {actifVisible === 'inventaires' && (
          <InventairesTab emplacements={emplacements.data} emplacementId={emplacementFiltre} />
        )}
      </div>

      {/* Monté seulement à l'ouverture : garantit un formulaire vierge
          à chaque fois, sans effet de réinitialisation. */}
      {modaleOuverte && <MouvementModal ouvert onFermer={() => setModaleOuverte(false)} />}
    </div>
  );
}
