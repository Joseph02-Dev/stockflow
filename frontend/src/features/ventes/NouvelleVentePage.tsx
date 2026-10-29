import { useMemo, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus, Search, TriangleAlert, UserPlus, UserRound, WifiOff, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { useEnLigne } from '@/lib/useEnLigne';
import {
  ajouterMouvementEnAttente,
  envoyerOuGarder,
  etatFile,
  nouvelIdClient,
  quantitesEnAttente,
  souscrireFile,
} from '@/lib/mouvementsHorsLigne';
import { useDebounce } from '@/lib/useDebounce';
import { calculerTotaux } from '@/lib/calculVente';
import { resoudrePrix } from '@/lib/tarifs';
import { gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PageHeader } from '@/components/patterns/Page';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { LIBELLES_CATEGORIE } from '@/features/clients/types';
import type { Client } from '@/features/clients/types';
import { appliquerClientsEnAttente } from '@/features/clients/clientsEnAttente';
import { PastillesPaiement } from './PastillesPaiement';
import './caisse.css';
import type { ModePaiement, ModeReglement, SituationClient, VenteDetail } from './types';

interface ProduitVendable {
  id: string;
  nom: string;
  reference: string | null;
  photoUrl: string | null;
  categorie: { id: string; nom: string } | null;
  uniteMesure: string | null;
  prixVente: number | null;
  prixGros: number | null;
  prixDemiGros: number | null;
  tauxTva: number | null;
  archive: boolean;
}

interface LigneStock {
  quantite: number;
  produit: ProduitVendable;
}

interface Emplacement {
  id: string;
  nom: string;
  chemin?: string;
  archive: boolean;
}

const MODES_VENTE: ModePaiement[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO', 'CREDIT'];
const MODES_AVANCE: ModeReglement[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO'];

/** Champ numérique entier ; vide = 0. Les montants GNF n'ont pas de décimales. */
function entier(valeur: string): number {
  const n = Number.parseInt(valeur.replace(/\s/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function NouvelleVentePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enLigne = useEnLigne();
  // Arrivée depuis « Brader » (écran Péremptions) : produit, dépôt,
  // quantité et remise pré-remplis, tous modifiables.
  const [parametres] = useSearchParams();
  const lotABrader = parametres.get('lot');

  const [client, setClient] = useState<Client | null>(null);
  // Client pas encore enregistré, saisi par son nom : créé à l'envoi de la vente.
  const [clientNouveau, setClientNouveau] = useState(false);
  const [rechercheClient, setRechercheClient] = useState('');
  const [emplacementChoisi, setEmplacementChoisi] = useState<string | null>(() => parametres.get('emplacement'));
  const [rechercheProduit, setRechercheProduit] = useState('');
  const [quantites, setQuantites] = useState<Map<string, number>>(() => {
    const produit = parametres.get('produit');
    const quantite = Number.parseInt(parametres.get('quantite') ?? '', 10);
    return produit && quantite > 0 ? new Map([[produit, quantite]]) : new Map();
  });
  const [tauxRemise, setTauxRemise] = useState(() => parametres.get('remise') ?? '');
  const [mode, setMode] = useState<ModePaiement>('ESPECES');
  const [avance, setAvance] = useState('');
  const [modeAvance, setModeAvance] = useState<ModeReglement>('ESPECES');
  const [echeance, setEcheance] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [categorieFiltre, setCategorieFiltre] = useState<string | null>(null);
  /** Dernier produit ajouté : sa tuile et sa ligne du ticket s'animent. */
  const [dernierAjout, setDernierAjout] = useState<{ produitId: string; n: number } | null>(null);
  /** Dernière vente gardée sur l'appareil faute de réseau (confirmation affichée). */
  const [venteEnAttente, setVenteEnAttente] = useState<{ total: number; articles: number } | null>(null);

  function choisirClient(choisi: Client | null, nouveau = false) {
    setClient(choisi);
    setClientNouveau(nouveau);
    setRechercheClient('');
  }

  /** Nouveau client : son identifiant est créé ici, comme pour un client créé hors ligne. */
  function nouveauClient(nom: string) {
    choisirClient(
      {
        id: nouvelIdClient(),
        nom,
        telephone: null,
        nomCommerce: null,
        categorie: 'DETAIL',
        plafondCredit: null,
        archive: false,
        createdAt: new Date().toISOString(),
      },
      true,
    );
  }

  const categorie = client?.categorie ?? 'DETAIL';
  // Pas de client : le crédit n'est pas possible, on revient au comptant.
  const modeEffectif: ModePaiement = !client && mode === 'CREDIT' ? 'ESPECES' : mode;

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Emplacement[]>('/emplacements')).data,
  });
  const actifs = (emplacements.data ?? []).filter((e) => !e.archive);
  const emplacementId = emplacementChoisi ?? actifs[0]?.id ?? null;

  const stock = useQuery({
    queryKey: ['stock', { emplacementId }],
    queryFn: async () => (await api.get<LigneStock[]>(`/stock?emplacement_id=${emplacementId}`)).data,
    enabled: emplacementId !== null,
  });
  const parProduit = useMemo(
    () => new Map((stock.data ?? []).filter((l) => !l.produit.archive).map((l) => [l.produit.id, l])),
    [stock.data],
  );
  // Ventes et sorties en attente d'envoi : le stock affiché les déduit déjà.
  const file = useSyncExternalStore(souscrireFile, etatFile, etatFile);
  const sortiesEnAttente = emplacementId ? quantitesEnAttente(file.mouvements, emplacementId) : new Map<string, number>();

  const situation = useQuery({
    queryKey: ['clients', client?.id, 'situation'],
    queryFn: async () => (await api.get<SituationClient>(`/clients/${client!.id}/situation`)).data,
    enabled: client !== null && !clientNouveau,
  });

  const rechercheClientRetardee = useDebounce(rechercheClient.trim(), 250);
  const clientsTrouves = useQuery({
    queryKey: ['clients', { recherche: rechercheClientRetardee, afficherArchives: false }],
    queryFn: async () =>
      (await api.get<Client[]>(`/clients?search=${encodeURIComponent(rechercheClientRetardee)}`)).data,
    enabled: client === null && rechercheClientRetardee.length > 0,
  });
  // Hors ligne, la recherche du serveur est impossible : on filtre la liste
  // complète des clients, préchargée pour le mode hors ligne.
  const tousClients = useQuery({
    queryKey: ['clients', 'tous-hors-ligne'],
    queryFn: async () => (await api.get<Client[]>('/clients?')).data,
    enabled: !enLigne && client === null && rechercheClientRetardee.length > 0,
  });
  const termeClient = rechercheClientRetardee.toLocaleLowerCase('fr');
  // Les clients créés hors ligne (pas encore envoyés) y figurent aussi.
  const clientsProposes = enLigne
    ? clientsTrouves.data
    : appliquerClientsEnAttente(tousClients.data ?? [], file.mouvements).clients.filter(
        (c) => !c.archive && [c.nom, c.telephone ?? ''].some((champ) => champ.toLocaleLowerCase('fr').includes(termeClient)),
      );

  // Lignes du panier, au prix de la catégorie du client (affichage seulement :
  // le serveur résout lui-même le prix au moment de valider).
  const lignes = [...quantites.entries()]
    .map(([produitId, quantite]) => {
      const ligne = parProduit.get(produitId);
      if (!ligne) return null;
      return {
        produit: ligne.produit,
        disponible: Math.max(ligne.quantite - (sortiesEnAttente.get(produitId) ?? 0), 0),
        quantite,
        prixUnitaire: resoudrePrix(ligne.produit, categorie) ?? 0,
        tauxTva: ligne.produit.tauxTva ?? 0,
      };
    })
    .filter((l) => l !== null);

  const totaux = calculerTotaux(lignes, Math.min(entier(tauxRemise), 100));
  const montantAvance = modeEffectif === 'CREDIT' ? entier(avance) : 0;
  const resteDu = modeEffectif === 'CREDIT' ? totaux.total - montantAvance : 0;
  const detteActuelle = situation.data?.solde ?? 0;
  const detteApres = detteActuelle + resteDu;
  const plafond = client?.plafondCredit ?? null;
  const depassePlafond = plafond !== null && detteApres > plafond;
  const surStock = lignes.some((l) => l.quantite > l.disponible);
  const avanceInvalide = montantAvance > totaux.total;

  // Catalogue en tuiles : produits du dépôt, filtrés par recherche (nom ou
  // référence) et par catégorie, 12 par page.
  const disponibleDe = (produitId: string) =>
    Math.max((parProduit.get(produitId)?.quantite ?? 0) - (sortiesEnAttente.get(produitId) ?? 0), 0);
  const categoriesCatalogue = [
    ...new Map(
      [...parProduit.values()].filter((l) => l.produit.categorie).map((l) => [l.produit.categorie!.id, l.produit.categorie!]),
    ).values(),
  ].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const termeProduit = rechercheProduit.trim().toLocaleLowerCase('fr');
  const catalogue = [...parProduit.values()]
    .filter(
      (l) =>
        (!categorieFiltre || l.produit.categorie?.id === categorieFiltre) &&
        (!termeProduit ||
          [l.produit.nom, l.produit.reference ?? ''].some((champ) => champ.toLocaleLowerCase('fr').includes(termeProduit))),
    )
    .sort((a, b) => a.produit.nom.localeCompare(b.produit.nom, 'fr'));
  const { visibles: tuiles, ancre, pagination } = usePagination(catalogue, {
    taille: 12,
    reinitialiser: [termeProduit, categorieFiltre, emplacementId],
  });

  function ajouter(produitId: string) {
    setQuantites((q) => new Map(q).set(produitId, (q.get(produitId) ?? 0) + 1));
    setDernierAjout((precedent) => ({ produitId, n: (precedent?.n ?? 0) + 1 }));
  }

  /** Entrée dans la recherche (douchette, saisie) : un seul produit vendable trouvé, il est ajouté. */
  function ajouterDepuisRecherche() {
    const vendables = catalogue.filter((l) => resoudrePrix(l.produit, categorie) !== null && disponibleDe(l.produit.id) > 0);
    if (vendables.length !== 1) return;
    ajouter(vendables[0].produit.id);
    setRechercheProduit('');
  }

  function changerQuantite(produitId: string, quantite: number) {
    setQuantites((q) => {
      const suivant = new Map(q);
      if (quantite <= 0) suivant.delete(produitId);
      else suivant.set(produitId, quantite);
      return suivant;
    });
  }

  const valider = useMutation({
    // Jamais mise en pause hors ligne : c'est mutationFn qui décide de
    // garder la vente sur l'appareil.
    networkMode: 'always',
    mutationFn: async (): Promise<VenteDetail | null> => {
      const corps = {
        // Créé avant le premier envoi : si la réponse se perd et que la
        // vente part en file, son renvoi ne l'enregistre pas deux fois.
        idClient: nouvelIdClient(),
        emplacementId,
        ...(client ? { clientId: client.id } : {}),
        modePaiement: modeEffectif,
        lignes: lignes.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
        ...(entier(tauxRemise) > 0 ? { tauxRemise: Math.min(entier(tauxRemise), 100) } : {}),
        ...(modeEffectif === 'CREDIT' && montantAvance > 0 ? { avance: { montant: montantAvance, mode: modeAvance } } : {}),
        ...(modeEffectif === 'CREDIT' && echeance ? { echeanceAt: new Date(`${echeance}T12:00:00`).toISOString() } : {}),
      };
      // Hors ligne : la vente est gardée sur l'appareil avec son heure
      // réelle, et envoyée au retour du réseau (voir mouvementsHorsLigne).
      const garderSurAppareil = () => {
        const nombre = lignes.length;
        const resume = `${nombre} article${nombre > 1 ? 's' : ''} · ${gnf(totaux.total)} · ${client?.nom ?? 'client de passage'}`;
        ajouterMouvementEnAttente('vente', { ...corps, saisieHorsLigneAt: new Date().toISOString() }, resume);
        return null;
      };
      // Nouveau client : enregistré juste avant la vente, avec l'identifiant
      // choisi ici (un renvoi ne le crée pas deux fois). Gardé sur
      // l'appareil faute de réseau : la vente le suit dans la file.
      if (client && clientNouveau) {
        const creation = await envoyerOuGarder(
          'client',
          { idClient: client.id, nom: client.nom, categorie: client.categorie },
          `Nouveau client · ${client.nom}`,
          { enLigne },
        );
        if (creation.horsLigne) return garderSurAppareil();
      }
      if (!enLigne) return garderSurAppareil();
      try {
        return (await api.post<VenteDetail>('/ventes', corps)).data;
      } catch (erreurEnvoi) {
        // Aucune réponse du serveur (coupure pendant l'envoi) : même chose
        // que hors ligne. Une erreur métier (stock, plafond…) reste affichée.
        const sansReponse =
          erreurEnvoi instanceof Object && 'isAxiosError' in erreurEnvoi && !(erreurEnvoi as { response?: unknown }).response;
        if (sansReponse) return garderSurAppareil();
        throw erreurEnvoi;
      }
    },
    onSuccess: (vente) => {
      if (!vente) {
        setVenteEnAttente({ total: totaux.total, articles: lignes.length });
        setQuantites(new Map());
        choisirClient(null);
        setTauxRemise('');
        setAvance('');
        setEcheance('');
        setMode('ESPECES');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      for (const cle of ['ventes', 'stock', 'mouvements', 'alertes', 'dashboard', 'creances', 'clients']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      navigate(`/ventes/${vente.id}`, { state: { nouvelle: true, alertePlafond: vente.alertePlafond ?? null } });
    },
    onError: (e) => setErreur(messageErreur(e, 'La vente n’a pas pu être enregistrée.')),
  });

  // Hors ligne, un manque de stock n'empêche pas la vente : elle sera
  // marquée « à régulariser » si le stock manque à la synchronisation.
  const peutValider = lignes.length > 0 && !(enLigne && surStock) && !avanceInvalide && emplacementId !== null;

  function soumettre() {
    setErreur(null);
    setVenteEnAttente(null);
    if (peutValider) valider.mutate();
  }

  return (
    <div className="flex flex-col gap-5 pb-24 md:pb-0">
      <PageHeader titre="Nouvelle vente" description="Touchez un produit pour l’ajouter au ticket, puis encaissez." />

      {lotABrader && (
        <Alert variant="info">
          Lot <span className="font-mono">{lotABrader}</span> à écouler avant péremption : quantité et remise sont
          pré-remplies, ajustez-les si besoin. La vente sort le stock dans l’ordre des péremptions.
        </Alert>
      )}

      {venteEnAttente && (
        <Alert variant="success">
          Vente de {gnf(venteEnAttente.total)} ({venteEnAttente.articles} article{venteEnAttente.articles > 1 ? 's' : ''}) enregistrée
          sur cet appareil. Elle sera envoyée dès le retour du réseau et recevra alors son numéro de reçu.
        </Alert>
      )}
      {!enLigne && (
        <Alert variant="info">
          Hors ligne : la vente est gardée sur cet appareil et envoyée au retour du réseau. Si le stock ne suffit plus à
          ce moment-là, elle est quand même enregistrée et marquée « à régulariser ».
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 1. Catalogue : les produits du dépôt, en tuiles à toucher. */}
        <Card>
          <div ref={ancre} className="flex scroll-mt-20 flex-col gap-3 border-b border-rule p-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block flex-1">
                <span className="sr-only">Rechercher ou scanner un produit</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
                <input
                  type="search"
                  value={rechercheProduit}
                  onChange={(e) => setRechercheProduit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      ajouterDepuisRecherche();
                    }
                  }}
                  placeholder="Rechercher ou scanner un produit…"
                  className="h-11 w-full champ rounded-md border border-rule-strong bg-surface-elevee pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 focus:border-action"
                />
              </label>
              {actifs.length > 1 && (
                <Selecteur
                  aria-label="Dépôt de sortie"
                  className="sm:w-48"
                  options={actifs.map((e) => ({ valeur: e.id, libelle: e.chemin ?? e.nom }))}
                  value={emplacementId ?? ''}
                  onChange={setEmplacementChoisi}
                />
              )}
            </div>
            {categoriesCatalogue.length > 0 && (
              <div className="-m-0.5 flex gap-1.5 overflow-x-auto p-0.5 [scrollbar-width:none]" role="group" aria-label="Catégorie">
                <button type="button" className="caisse-puce" aria-pressed={categorieFiltre === null} onClick={() => setCategorieFiltre(null)}>
                  Tout
                </button>
                {categoriesCatalogue.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="caisse-puce"
                    aria-pressed={categorieFiltre === c.id}
                    onClick={() => setCategorieFiltre(categorieFiltre === c.id ? null : c.id)}
                  >
                    {c.nom}
                  </button>
                ))}
              </div>
            )}
          </div>

          {stock.isLoading ? (
            <LoadingState lignes={4} />
          ) : catalogue.length === 0 ? (
            <EmptyState
              titre={parProduit.size === 0 ? 'Aucun produit en stock ici' : 'Aucun produit ne correspond'}
              description={
                parProduit.size === 0
                  ? 'Enregistrez une entrée de stock dans ce dépôt pour pouvoir le vendre.'
                  : 'Modifiez la recherche ou la catégorie.'
              }
            />
          ) : (
            <>
              <ul className="caisse-tuiles p-4 sm:px-5">
                {tuiles.map(({ produit }) => {
                  const prix = resoudrePrix(produit, categorie);
                  const disponible = disponibleDe(produit.id);
                  const auTicket = quantites.get(produit.id) ?? 0;
                  const indisponible = prix === null || disponible <= 0;
                  return (
                    <li key={produit.id}>
                      <button
                        type="button"
                        disabled={indisponible}
                        onClick={() => ajouter(produit.id)}
                        aria-label={`Ajouter ${produit.nom}${auTicket > 0 ? ` (déjà ${auTicket} au ticket)` : ''}`}
                        className={cn('caisse-tuile', auTicket > 0 && 'caisse-tuile-choisie')}
                      >
                        <span
                          key={dernierAjout?.produitId === produit.id ? dernierAjout.n : undefined}
                          className={cn('relative self-start', dernierAjout?.produitId === produit.id && 'caisse-rebond')}
                        >
                          <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={44} />
                          {auTicket > 0 && <span className="caisse-compteur">{auTicket}</span>}
                        </span>
                        <span className="line-clamp-2 text-corps leading-snug font-semibold text-ink-900">{produit.nom}</span>
                        <span className={cn('text-meta', disponible <= 0 ? 'text-rupture' : 'text-steel-500')}>
                          {disponible <= 0 ? 'Épuisé ici' : `${disponible} en stock`}
                        </span>
                        <span className="mt-auto text-corps font-bold whitespace-nowrap text-ink-900">
                          {prix === null ? 'Sans prix' : gnf(prix)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pagination etat={pagination} className="border-t border-rule" />
            </>
          )}
        </Card>

        {/* 2. Ticket : client, articles, totaux et paiement. */}
        <Card className="lg:sticky lg:top-20">
          <div id="ticket" className="flex scroll-mt-20 flex-col gap-4 p-4 sm:p-5">
            {/* Client : sa dette et son plafond sont visibles avant toute décision. */}
            {client ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-lg bg-action-wash px-3 py-2.5">
                  <Vignette nom={client.nom} taille={36} className="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-corps font-semibold text-ink-900">{client.nom}</p>
                    <p className="truncate text-meta text-steel-500">
                      {clientNouveau ? (
                        <span className="text-ok">Nouveau client · enregistré avec la vente</span>
                      ) : (
                        <>
                          {LIBELLES_CATEGORIE[categorie]} · doit {situation.isLoading ? '…' : gnf(detteActuelle)}
                          {plafond !== null && ` sur ${gnf(plafond)}`}
                        </>
                      )}
                    </p>
                  </div>
                  <Button variant="ghost" taille="sm" icone aria-label="Changer de client" onClick={() => choisirClient(null)}>
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                {depassePlafond && (
                  <p className="flex items-start gap-2 rounded-md bg-faible-wash px-3 py-2.5 text-meta text-faible">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      Après cette vente, sa dette atteindrait <strong>{gnf(detteApres)}</strong>, soit{' '}
                      <strong>{gnf(detteApres - (plafond ?? 0))}</strong> au-delà du plafond. La vente reste possible.
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="relative block">
                  <span className="sr-only">Rechercher un client</span>
                  <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={rechercheClient}
                    onChange={(e) => setRechercheClient(e.target.value)}
                    placeholder="Client : nom, commerce ou téléphone…"
                    className="h-10 w-full champ rounded-md border border-rule-strong bg-surface-elevee pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 focus:border-action"
                  />
                </label>
                {rechercheClientRetardee && (
                  <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule">
                    {(clientsProposes ?? []).slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => choisirClient(c)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-entete-tableau"
                        >
                          <Vignette nom={c.nom} taille={28} className="rounded-full" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-corps font-medium text-ink-900">{c.nom}</span>
                            <span className="block truncate text-meta text-steel-500">{c.telephone ?? c.nomCommerce ?? '—'}</span>
                          </span>
                          <span className="text-meta text-steel-500">{LIBELLES_CATEGORIE[c.categorie]}</span>
                        </button>
                      </li>
                    ))}
                    {/* Personne de ce nom : l'ajouter, il sera enregistré avec la vente. */}
                    {clientsProposes && !clientsProposes.some((c) => c.nom.trim().toLocaleLowerCase('fr') === termeClient) && (
                      <li>
                        <button
                          type="button"
                          onClick={() => nouveauClient(rechercheClientRetardee)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-entete-tableau"
                        >
                          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-action-wash text-action">
                            <UserPlus className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-corps font-medium text-ink-900">
                              Nouveau client « {rechercheClientRetardee} »
                            </span>
                            <span className="block truncate text-meta text-steel-500">Enregistré automatiquement avec la vente</span>
                          </span>
                        </button>
                      </li>
                    )}
                  </ul>
                )}
                <p className="text-meta text-steel-500">Sans client : vente comptant au prix de détail.</p>
              </div>
            )}

            {/* Articles du ticket */}
            <div className="border-y border-dashed border-rule-strong">
              {lignes.length === 0 ? (
                <p className="py-6 text-center text-meta text-steel-500">Le ticket est vide : touchez un produit pour l’ajouter.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {lignes.map((l, i) => (
                    <li
                      key={l.produit.id}
                      className={cn('flex flex-col gap-2 py-2.5', dernierAjout?.produitId === l.produit.id && 'caisse-ligne-ajoutee')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-corps leading-snug font-medium text-ink-900">{l.produit.nom}</p>
                        <span className="text-corps font-semibold whitespace-nowrap text-ink-900">{gnf(totaux.montantsLignes[i])}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className={cn('min-w-0 text-meta', l.quantite > l.disponible ? 'text-rupture' : 'text-steel-500')}>
                          {gnf(l.prixUnitaire)}
                          {l.produit.uniteMesure ? ` / ${l.produit.uniteMesure.toLocaleLowerCase('fr')}` : ''}
                          {l.quantite > l.disponible && ` · seulement ${l.disponible} en stock`}
                        </p>
                        <div className="flex items-center gap-1">
                          <div className="flex items-center rounded-md border border-rule-strong">
                            <button
                              type="button"
                              aria-label={`Retirer un ${l.produit.nom}`}
                              onClick={() => changerQuantite(l.produit.id, l.quantite - 1)}
                              className="flex size-8 items-center justify-center text-steel-700 hover:bg-survol"
                            >
                              <Minus className="size-3.5" aria-hidden="true" />
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              aria-label={`Quantité de ${l.produit.nom}`}
                              value={l.quantite}
                              onChange={(e) => changerQuantite(l.produit.id, entier(e.target.value) || 1)}
                              className="h-8 w-11 border-x border-rule-strong text-center text-corps font-medium text-ink-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              aria-label={`Ajouter un ${l.produit.nom}`}
                              onClick={() => changerQuantite(l.produit.id, l.quantite + 1)}
                              className="flex size-8 items-center justify-center text-steel-700 hover:bg-survol"
                            >
                              <Plus className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <Button variant="ghost" taille="sm" icone aria-label={`Supprimer ${l.produit.nom}`} onClick={() => changerQuantite(l.produit.id, 0)}>
                            <X className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <dl className="flex flex-col gap-1.5 text-corps">
              <div className="flex justify-between">
                <dt className="text-steel-500">Sous-total HT</dt>
                <dd className="text-ink-900">{gnf(totaux.sousTotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-steel-500">
                  <label htmlFor="taux-remise">Remise</label>
                  <span className="flex items-center rounded-md border border-rule-strong">
                    <input
                      id="taux-remise"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={tauxRemise}
                      onChange={(e) => setTauxRemise(e.target.value)}
                      placeholder="0"
                      className="h-8 w-12 rounded-l-md text-center text-ink-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="px-2 text-meta text-steel-500">%</span>
                  </span>
                </dt>
                <dd className="text-ink-900">{totaux.remise > 0 ? `−${gnf(totaux.remise)}` : gnf(0)}</dd>
              </div>
              {totaux.tvaParTaux.map((t) => (
                <div key={t.taux} className="flex justify-between">
                  <dt className="text-steel-500">TVA {t.taux} %</dt>
                  <dd className="text-ink-900">{gnf(t.montant)}</dd>
                </div>
              ))}
              <div className="mt-2 flex items-baseline justify-between border-t border-rule pt-3">
                <dt className="text-panneau text-ink-900">Total</dt>
                <dd className="text-chiffre text-ink-900">{gnf(totaux.total)}</dd>
              </div>
            </dl>

            <PastillesPaiement
              libelle="Mode de paiement"
              nom="mode-paiement"
              modes={MODES_VENTE}
              valeur={modeEffectif}
              onChange={setMode}
              desactives={client ? [] : ['CREDIT']}
            />
            {!client && <p className="-mt-2 text-meta text-steel-500">Le crédit demande un client identifié.</p>}

            {modeEffectif === 'CREDIT' && (
              <div className="flex flex-col gap-4 rounded-md border border-rule bg-entete-groupe p-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-corps font-medium text-ink-900">Avance versée aujourd’hui (facultatif)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={avance}
                    onChange={(e) => setAvance(e.target.value)}
                    placeholder="0"
                    className={cn(
                      'h-10 rounded-md border bg-surface-elevee px-3 text-corps text-ink-900',
                      avanceInvalide ? 'border-rupture' : 'border-rule-strong',
                    )}
                  />
                  {avanceInvalide && <span className="text-meta text-rupture">L’avance dépasse le total de la vente.</span>}
                </label>
                {montantAvance > 0 && (
                  <PastillesPaiement
                    libelle="Avance payée en"
                    nom="mode-avance"
                    modes={MODES_AVANCE}
                    valeur={modeAvance}
                    onChange={setModeAvance}
                  />
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-corps font-medium text-ink-900">Échéance du solde (facultatif)</span>
                  <input
                    type="date"
                    value={echeance}
                    onChange={(e) => setEcheance(e.target.value)}
                    className="h-10 champ rounded-md border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900"
                  />
                </label>
                <div className="flex items-baseline justify-between">
                  <span className="text-corps font-medium text-faible">Reste dû</span>
                  <span className="text-panneau text-faible">{gnf(Math.max(resteDu, 0))}</span>
                </div>
              </div>
            )}

            {erreur && <Alert variant="error">{erreur}</Alert>}
            {surStock && (
              <Alert variant="warning">
                {enLigne
                  ? 'Une quantité dépasse le stock disponible dans ce dépôt.'
                  : 'Une quantité dépasse le stock connu : la vente sera marquée « à régulariser » si le stock manque à la synchronisation.'}
              </Alert>
            )}

            {/* Sur mobile, l'encaissement est dans la barre fixe en bas d'écran. */}
            <div className="hidden md:block">
              <Button className="h-12 w-full text-base" onClick={soumettre} disabled={!peutValider} loading={valider.isPending}>
                {!enLigne && <WifiOff className="size-4" aria-hidden="true" />}
                Encaisser · {gnf(totaux.total)}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Mobile : ticket résumé et encaissement à portée de pouce, au-dessus de la barre de navigation. */}
      <div className="fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-rule bg-surface px-4 py-3 shadow-pop md:hidden">
        <a href="#ticket" className="min-w-0 flex-1">
          <p className="text-meta text-steel-500">
            {lignes.length === 0
              ? 'Ticket vide'
              : `${lignes.length} article${lignes.length > 1 ? 's' : ''}${modeEffectif === 'CREDIT' && resteDu > 0 ? ` · reste dû ${gnf(resteDu)}` : ' · voir le ticket'}`}
          </p>
          <p className="truncate text-panneau text-ink-900">{gnf(totaux.total)}</p>
        </a>
        <Button className="h-11 px-5" onClick={soumettre} disabled={!peutValider} loading={valider.isPending}>
          Encaisser
        </Button>
      </div>
    </div>
  );
}
