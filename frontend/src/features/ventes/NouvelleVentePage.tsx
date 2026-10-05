import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus, Search, TriangleAlert, UserRound, WifiOff, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { useEnLigne } from '@/lib/useEnLigne';
import { useDebounce } from '@/lib/useDebounce';
import { calculerTotaux } from '@/lib/calculVente';
import { resoudrePrix } from '@/lib/tarifs';
import { gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { LIBELLES_CATEGORIE } from '@/features/clients/types';
import type { Client } from '@/features/clients/types';
import { PastillesPaiement } from './PastillesPaiement';
import type { ModePaiement, ModeReglement, SituationClient, VenteDetail } from './types';

interface ProduitVendable {
  id: string;
  nom: string;
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

  const situation = useQuery({
    queryKey: ['clients', client?.id, 'situation'],
    queryFn: async () => (await api.get<SituationClient>(`/clients/${client!.id}/situation`)).data,
    enabled: client !== null,
  });

  const rechercheClientRetardee = useDebounce(rechercheClient.trim(), 250);
  const clientsTrouves = useQuery({
    queryKey: ['clients', { recherche: rechercheClientRetardee, afficherArchives: false }],
    queryFn: async () =>
      (await api.get<Client[]>(`/clients?search=${encodeURIComponent(rechercheClientRetardee)}`)).data,
    enabled: client === null && rechercheClientRetardee.length > 0,
  });

  // Lignes du panier, au prix de la catégorie du client (affichage seulement :
  // le serveur résout lui-même le prix au moment de valider).
  const lignes = [...quantites.entries()]
    .map(([produitId, quantite]) => {
      const ligne = parProduit.get(produitId);
      if (!ligne) return null;
      return {
        produit: ligne.produit,
        disponible: ligne.quantite,
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

  const rechercheProduitNormalisee = rechercheProduit.trim().toLocaleLowerCase('fr');
  const produitsProposes = rechercheProduitNormalisee
    ? [...parProduit.values()]
        .filter((l) => !quantites.has(l.produit.id) && l.produit.nom.toLocaleLowerCase('fr').includes(rechercheProduitNormalisee))
        .slice(0, 8)
    : [];

  function ajouter(produitId: string) {
    setQuantites((q) => new Map(q).set(produitId, 1));
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
    mutationFn: async () =>
      (
        await api.post<VenteDetail>('/ventes', {
          emplacementId,
          ...(client ? { clientId: client.id } : {}),
          modePaiement: modeEffectif,
          lignes: lignes.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
          ...(entier(tauxRemise) > 0 ? { tauxRemise: Math.min(entier(tauxRemise), 100) } : {}),
          ...(modeEffectif === 'CREDIT' && montantAvance > 0 ? { avance: { montant: montantAvance, mode: modeAvance } } : {}),
          ...(modeEffectif === 'CREDIT' && echeance ? { echeanceAt: new Date(`${echeance}T12:00:00`).toISOString() } : {}),
        })
      ).data,
    onSuccess: (vente) => {
      for (const cle of ['ventes', 'stock', 'mouvements', 'alertes', 'dashboard', 'creances', 'clients']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      navigate(`/ventes/${vente.id}`, { state: { nouvelle: true, alertePlafond: vente.alertePlafond ?? null } });
    },
    onError: (e) => setErreur(messageErreur(e, 'La vente n’a pas pu être enregistrée.')),
  });

  const peutValider = enLigne && lignes.length > 0 && !surStock && !avanceInvalide && emplacementId !== null;

  function soumettre() {
    setErreur(null);
    if (peutValider) valider.mutate();
  }

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <PageHeader titre="Nouvelle vente" description="Client, articles, paiement : la dette du client reste sous vos yeux." />

      {lotABrader && (
        <Alert variant="info">
          Lot <span className="font-mono">{lotABrader}</span> à écouler avant péremption : quantité et remise sont
          pré-remplies, ajustez-les si besoin. La vente sort le stock dans l’ordre des péremptions.
        </Alert>
      )}

      {!enLigne && (
        <Alert variant="warning">
          Connexion requise : une vente touche au stock, à l’argent et à la dette du client, elle n’est jamais
          enregistrée hors ligne.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 1. Client — sa dette et son plafond sont visibles avant toute décision. */}
          <Card>
            <PanneauEntete titre="Client" meta="Le tarif dépend de sa catégorie" />
            <div className="p-4 sm:p-5">
              {client ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Vignette nom={client.nom} taille={40} className="rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-semibold text-ink-900">{client.nom}</p>
                      {client.nomCommerce && <p className="truncate text-meta text-steel-500">{client.nomCommerce}</p>}
                      <p className="text-meta whitespace-nowrap text-steel-500">{client.telephone ?? 'Pas de téléphone'}</p>
                    </div>
                    <Badge variant={categorie === 'GROS' ? 'action' : categorie === 'DEMI_GROS' ? 'accent' : 'neutral'}>
                      {LIBELLES_CATEGORIE[categorie]}
                    </Badge>
                    <Button variant="ghost" taille="sm" icone aria-label="Changer de client" onClick={() => setClient(null)}>
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule">
                    <div className="bg-entete-groupe px-3 py-2.5">
                      <dt className="text-meta text-steel-500">Dette actuelle</dt>
                      <dd className="mt-0.5 text-corps font-semibold text-ink-900">
                        {situation.isLoading ? '…' : gnf(detteActuelle)}
                      </dd>
                    </div>
                    <div className="bg-entete-groupe px-3 py-2.5">
                      <dt className="text-meta text-steel-500">Plafond de crédit</dt>
                      <dd className="mt-0.5 text-corps font-semibold text-ink-900">{plafond === null ? 'Aucun' : gnf(plafond)}</dd>
                    </div>
                  </dl>
                  {depassePlafond && (
                    <p className="flex items-start gap-2 rounded-md bg-faible-wash px-3 py-2.5 text-corps text-faible">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        Après cette vente, sa dette atteindrait <strong>{gnf(detteApres)}</strong>, soit{' '}
                        <strong>{gnf(detteApres - (plafond ?? 0))}</strong> au-delà du plafond. La vente reste possible.
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="relative block">
                    <span className="sr-only">Rechercher un client</span>
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
                    <input
                      type="search"
                      value={rechercheClient}
                      onChange={(e) => setRechercheClient(e.target.value)}
                      placeholder="Nom, commerce ou téléphone du client…"
                      className="h-11 w-full rounded-md border border-rule-strong bg-surface pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 focus:border-action"
                    />
                  </label>
                  {rechercheClientRetardee && (
                    <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule">
                      {(clientsTrouves.data ?? []).slice(0, 6).map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setClient(c);
                              setRechercheClient('');
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-entete-tableau"
                          >
                            <Vignette nom={c.nom} taille={30} className="rounded-full" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-corps font-medium text-ink-900">{c.nom}</span>
                              <span className="block truncate text-meta text-steel-500">{c.telephone ?? c.nomCommerce ?? '—'}</span>
                            </span>
                            <span className="text-meta text-steel-500">{LIBELLES_CATEGORIE[c.categorie]}</span>
                          </button>
                        </li>
                      ))}
                      {clientsTrouves.data?.length === 0 && (
                        <li className="px-3 py-2.5 text-corps text-steel-500">Aucun client trouvé.</li>
                      )}
                    </ul>
                  )}
                  <p className="flex items-center gap-2 text-meta text-steel-500">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    Sans client : vente comptant au prix de détail (client de passage).
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* 2. Articles */}
          <Card>
            <PanneauEntete
              titre="Articles"
              meta={`${lignes.length} ${lignes.length > 1 ? 'lignes' : 'ligne'}`}
              action={
                actifs.length > 1 && (
                  <Selecteur
                    aria-label="Dépôt de sortie"
                    taille="sm"
                    className="w-44"
                    options={actifs.map((e) => ({ valeur: e.id, libelle: e.nom }))}
                    value={emplacementId ?? ''}
                    onChange={setEmplacementChoisi}
                  />
                )
              }
            />
            <div className="border-b border-rule p-4 sm:px-5">
              <label className="relative block">
                <span className="sr-only">Ajouter un produit</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
                <input
                  type="search"
                  value={rechercheProduit}
                  onChange={(e) => setRechercheProduit(e.target.value)}
                  placeholder="Ajouter un produit en stock…"
                  className="h-11 w-full rounded-md border border-rule-strong bg-surface pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 focus:border-action"
                />
              </label>
              {produitsProposes.length > 0 && (
                <ul className="mt-2 divide-y divide-rule overflow-hidden rounded-md border border-rule">
                  {produitsProposes.map(({ produit, quantite }) => {
                    const prix = resoudrePrix(produit, categorie);
                    return (
                      <li key={produit.id}>
                        <button
                          type="button"
                          disabled={prix === null || quantite <= 0}
                          onClick={() => ajouter(produit.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-entete-tableau disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-corps font-medium text-ink-900">{produit.nom}</span>
                            <span className="block text-meta text-steel-500">
                              {quantite} en stock{prix === null ? ' · sans prix de vente' : ''}
                            </span>
                          </span>
                          {prix !== null && <span className="text-corps font-medium whitespace-nowrap text-ink-900">{gnf(prix)}</span>}
                          <Plus className="size-4 shrink-0 text-action" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {stock.isLoading ? (
              <LoadingState lignes={3} />
            ) : lignes.length === 0 ? (
              <EmptyState titre="Aucun article" description="Recherchez un produit ci-dessus pour l’ajouter à la vente." />
            ) : (
              <ul className="divide-y divide-rule">
                {lignes.map((l, i) => (
                  <li key={l.produit.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-medium text-ink-900">{l.produit.nom}</p>
                      <p className={cn('text-meta', l.quantite > l.disponible ? 'text-rupture' : 'text-steel-500')}>
                        {gnf(l.prixUnitaire)} {l.produit.uniteMesure ? `/ ${l.produit.uniteMesure.toLocaleLowerCase('fr')}` : 'l’unité'}
                        {' · '}
                        {l.quantite > l.disponible ? `seulement ${l.disponible} en stock` : `${l.disponible} en stock`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center rounded-md border border-rule-strong">
                        <button
                          type="button"
                          aria-label={`Retirer un ${l.produit.nom}`}
                          onClick={() => changerQuantite(l.produit.id, l.quantite - 1)}
                          className="flex size-10 items-center justify-center text-steel-700 hover:bg-paper"
                        >
                          <Minus className="size-4" aria-hidden="true" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          aria-label={`Quantité de ${l.produit.nom}`}
                          value={l.quantite}
                          onChange={(e) => changerQuantite(l.produit.id, entier(e.target.value) || 1)}
                          className="h-10 w-14 border-x border-rule-strong text-center text-corps font-medium text-ink-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          aria-label={`Ajouter un ${l.produit.nom}`}
                          onClick={() => changerQuantite(l.produit.id, l.quantite + 1)}
                          className="flex size-10 items-center justify-center text-steel-700 hover:bg-paper"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="min-w-28 text-right text-corps font-semibold text-ink-900">
                        {gnf(totaux.montantsLignes[i])}
                      </span>
                      <Button variant="ghost" taille="sm" icone aria-label={`Supprimer ${l.produit.nom}`} onClick={() => changerQuantite(l.produit.id, 0)}>
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* 3. Récapitulatif et paiement */}
        <Card className="lg:sticky lg:top-20">
          <PanneauEntete titre="Paiement" />
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <dl className="flex flex-col gap-1.5 text-corps">
              <div className="flex justify-between">
                <dt className="text-steel-500">Sous-total</dt>
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
            {!client && <p className="-mt-3 text-meta text-steel-500">Le crédit demande un client identifié.</p>}

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
                      'h-10 rounded-md border bg-surface px-3 text-corps text-ink-900',
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
                    className="h-10 rounded-md border border-rule-strong bg-surface px-3 text-corps text-ink-900"
                  />
                </label>
                <div className="flex items-baseline justify-between">
                  <span className="text-corps font-medium text-faible">Reste dû</span>
                  <span className="text-panneau text-faible">{gnf(Math.max(resteDu, 0))}</span>
                </div>
              </div>
            )}

            {erreur && <Alert variant="error">{erreur}</Alert>}
            {surStock && <Alert variant="warning">Une quantité dépasse le stock disponible dans ce dépôt.</Alert>}

            {/* Sur mobile, la validation est dans la barre fixe en bas d'écran. */}
            <div className="hidden md:block">
              <Button className="h-11 w-full" onClick={soumettre} disabled={!peutValider} loading={valider.isPending}>
                {!enLigne && <WifiOff className="size-4" aria-hidden="true" />}
                Valider la vente · {gnf(totaux.total)}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Mobile : total et validation toujours à portée de pouce, au-dessus de la barre de navigation. */}
      <div className="fixed inset-x-0 bottom-[60px] z-30 flex items-center gap-3 border-t border-rule bg-surface px-4 py-3 shadow-pop md:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-meta text-steel-500">{modeEffectif === 'CREDIT' && resteDu > 0 ? `Reste dû ${gnf(resteDu)}` : 'Total'}</p>
          <p className="truncate text-panneau text-ink-900">{gnf(totaux.total)}</p>
        </div>
        <Button className="h-11 px-5" onClick={soumettre} disabled={!peutValider} loading={valider.isPending}>
          Valider
        </Button>
      </div>
    </div>
  );
}
