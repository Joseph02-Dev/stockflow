import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { statutStock } from '@/components/patterns/statutStock';
import './referentiels.css';
import { FlecheLien } from '@/components/ui/LienAction';
import { lienActionClasses } from '@/components/ui/lienActionClasses';

interface ElementReference {
  id: string;
  nom: string;
}

/** Champs du produit utiles au classement (la liste en renvoie davantage). */
interface ProduitClasse {
  id: string;
  seuilAlerte: number;
  prixAchat: number | null;
  categorie: { id: string } | null;
  marque: { id: string } | null;
}

interface LigneStock {
  produitId: string;
  quantite: number;
}

interface ReferenceListSectionProps {
  /** Segment d'URL de l'API, ex. "categories" ou "marques". */
  endpoint: 'categories' | 'marques';
  /** Champ du produit qui porte ce classement. */
  champ: 'categorie' | 'marque';
  libelleSingulier: string;
  /** Exemple de nom proposé dans le champ d'ajout. */
  exemple: string;
  /** La page Produits sait filtrer sur ce classement (?categorie=). */
  lienProduits?: boolean;
}

/** Teinte par position dans la liste : deux voisines ne se ressemblent jamais. */
const TEINTES = ['#c2440b', '#2f6fb3', '#12705c', '#7a4bc2', '#9a6500', '#b8336a', '#3a7bd5'];

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Liste de référence (catégories ou marques) : un nom, rien d'autre côté
 * serveur. Chaque élément est mis en regard des produits qu'il classe et
 * de leur stock (mêmes requêtes et clés de cache que l'écran Produits).
 */
export function ReferenceListSection({ endpoint, champ, libelleSingulier, exemple, lienProduits = false }: ReferenceListSectionProps) {
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [enEdition, setEnEdition] = useState<ElementReference | null>(null);
  const [nomEdite, setNomEdite] = useState('');
  const [aSupprimer, setASupprimer] = useState<ElementReference | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const champAjout = useRef<HTMLInputElement>(null);

  const liste = useQuery({
    queryKey: [endpoint],
    queryFn: async () => (await api.get<ElementReference[]>(`/${endpoint}`)).data,
  });
  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<ProduitClasse[]>('/produits?')).data,
  });
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock?')).data,
  });

  const invalider = () => {
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    // Un renommage ou une suppression change l'affichage du catalogue.
    queryClient.invalidateQueries({ queryKey: ['produits'] });
  };

  const ajouter = useMutation({
    mutationFn: async (nom: string) => api.post(`/${endpoint}`, { nom }),
    onSuccess: () => {
      setErreur(null);
      setNouveau('');
      invalider();
      champAjout.current?.focus();
    },
    onError: (err) => setErreur(messageErreur(err, 'L’ajout a échoué.')),
  });

  const renommer = useMutation({
    mutationFn: async ({ id, nom }: { id: string; nom: string }) => api.patch(`/${endpoint}/${id}`, { nom }),
    onSuccess: () => {
      setErreur(null);
      setEnEdition(null);
      invalider();
    },
    onError: (err) => setErreur(messageErreur(err, 'Le renommage a échoué.')),
  });

  const supprimer = useMutation({
    mutationFn: async (id: string) => api.delete(`/${endpoint}/${id}`),
    onSuccess: () => {
      setErreur(null);
      setASupprimer(null);
      invalider();
    },
    onError: (err) => {
      setASupprimer(null);
      setErreur(messageErreur(err, 'La suppression a échoué.'));
    },
  });

  function surAjout(e: FormEvent) {
    e.preventDefault();
    const nom = nouveau.trim();
    if (nom) ajouter.mutate(nom);
  }

  function validerRenommage() {
    const nom = nomEdite.trim();
    if (!enEdition || !nom || nom === enEdition.nom) return setEnEdition(null);
    renommer.mutate({ id: enEdition.id, nom });
  }

  if (liste.isLoading || produits.isLoading || stock.isLoading) return <LoadingState />;
  const enErreur = [liste, produits, stock].find((q) => q.isError);
  if (enErreur || !liste.data || !produits.data || !stock.data) {
    return <ErrorState message={messageErreur(enErreur?.error)} onRetry={() => [liste, produits, stock].forEach((q) => q.refetch())} />;
  }

  const quantites = new Map<string, number>();
  for (const ligne of stock.data) quantites.set(ligne.produitId, (quantites.get(ligne.produitId) ?? 0) + ligne.quantite);

  const elements = liste.data.map((element, i) => {
    const classes = produits.data.filter((p) => p[champ]?.id === element.id);
    let unites = 0;
    let valeur = 0;
    let sansPrix = 0;
    let alertes = 0;
    for (const p of classes) {
      const quantite = quantites.get(p.id) ?? 0;
      unites += quantite;
      if (p.prixAchat === null) sansPrix += 1;
      else valeur += p.prixAchat * quantite;
      if (statutStock(quantite, p.seuilAlerte) !== 'ok') alertes += 1;
    }
    return { ...element, teinte: TEINTES[i % TEINTES.length], produits: classes.length, unites, valeur, sansPrix, alertes };
  });

  const total = produits.data.length;
  const sans = produits.data.filter((p) => !p[champ]).length;
  const valeurTotale = elements.reduce((a, e) => a + e.valeur, 0);
  const sansPrixTotal = elements.reduce((a, e) => a + e.sansPrix, 0);
  const parValeur = elements.filter((e) => e.valeur > 0).sort((a, b) => b.valeur - a.valeur);
  const enAlerte = elements.filter((e) => e.alertes > 0);
  const produitsEnAlerte = enAlerte.reduce((a, e) => a + e.alertes, 0);
  const visibles = elements.filter((e) => e.nom.toLocaleLowerCase('fr').includes(recherche.trim().toLocaleLowerCase('fr')));
  const part = (valeur: number) => (valeurTotale > 0 ? Math.round((valeur / valeurTotale) * 100) : 0);
  const lienSans = lienProduits ? `/produits?${champ}=sans` : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="referentiels-synthese" aria-label="Synthèse">
        <div className="referentiels-tuile">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-steel-500">
            <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
            Produits classés
          </p>
          <p className="font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">
            {formatNombre(total - sans)} <span className="font-sans text-[14px] font-semibold text-steel-400">/ {formatNombre(total)}</span>
          </p>
          <div className="referentiels-jauge" style={{ '--teinte': 'var(--color-ok)' } as CSSProperties} aria-hidden="true">
            <i style={{ width: `${total ? ((total - sans) / total) * 100 : 0}%` }} />
          </div>
          <p className="text-[12.5px] text-steel-400">
            {sans === 0 ? (
              `Tous vos produits ont une ${libelleSingulier}.`
            ) : (
              <>
                {sans} {pluriel('produit', sans)} sans {libelleSingulier}
                {lienSans && (
                  <>
                    {' · '}
                    <Link to={lienSans} className={lienActionClasses()}>
                      Les classer dans Produits
                    <FlecheLien /></Link>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div className="referentiels-tuile">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-steel-500">
            <span className="size-2 rounded-full bg-action" aria-hidden="true" />
            Plus grosse valeur
          </p>
          <p className="truncate font-display text-[24px] leading-none font-semibold text-ink-900">{parValeur[0]?.nom ?? '—'}</p>
          <p className="text-[12.5px] text-steel-400">
            {parValeur[0] ? `${part(parValeur[0].valeur)} % de la valeur du stock classé` : 'Aucune valeur de stock classée'}
          </p>
        </div>
        <div className="referentiels-tuile">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-steel-500">
            <span className="size-2 rounded-full bg-faible" aria-hidden="true" />
            Sous le seuil
          </p>
          <p className="font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">
            {formatNombre(produitsEnAlerte)}{' '}
            <span className="font-sans text-[14px] font-semibold text-steel-400">{pluriel('produit', produitsEnAlerte)}</span>
          </p>
          <p className="text-[12.5px] text-steel-400">
            {enAlerte.length > 0 ? `dans ${enAlerte.length} ${pluriel(libelleSingulier, enAlerte.length)}` : 'Aucun produit classé sous son seuil'}
          </p>
        </div>
      </section>

      {parValeur.length > 0 && (
        <section className="referentiels-carte gap-3.5!" aria-labelledby={`repartition-${endpoint}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`repartition-${endpoint}`} className="text-[15.5px] font-semibold text-ink-900">
              Valeur du stock par {libelleSingulier}
            </h2>
            <p className="text-[12.5px] text-steel-400 tabular-nums">
              {formatNombre(valeurTotale)} GNF au prix d’achat
              {sansPrixTotal > 0 && ` · ${sansPrixTotal} ${pluriel('produit', sansPrixTotal)} sans prix d’achat non ${pluriel('compté', sansPrixTotal)}`}
            </p>
          </div>
          <div
            className="referentiels-barre"
            data-survol={survol ? '' : undefined}
            role="img"
            aria-label={`Répartition de la valeur du stock : ${parValeur.map((e) => `${e.nom} ${part(e.valeur)} %`).join(', ')}`}
          >
            {parValeur.map((e) => (
              <i
                key={e.id}
                data-actif={survol === e.id ? '' : undefined}
                style={{ '--teinte': e.teinte, flex: `${e.valeur} 0 0` } as CSSProperties}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4.5 gap-y-1.5" onMouseLeave={() => setSurvol(null)}>
            {parValeur.map((e) => (
              <li key={e.id} className="flex items-center gap-1.5 text-corps text-steel-700" onMouseEnter={() => setSurvol(e.id)}>
                <span className="size-[9px] rounded-[3px]" style={{ background: e.teinte }} aria-hidden="true" />
                <span className="font-semibold text-ink-900">{e.nom}</span>
                <span className="font-mono text-[12px] text-steel-400">{part(e.valeur)} %</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2.5">
        <label className="relative min-w-0 flex-[1_1_240px]">
          <span className="sr-only">Rechercher une {libelleSingulier}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={`Rechercher une ${libelleSingulier}…`}
            className="h-10 w-full champ rounded-lg border border-rule-strong bg-surface-elevee pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
          />
        </label>
        <form onSubmit={surAjout} className="flex min-w-0 flex-[1_1_320px] gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Nom de la nouvelle {libelleSingulier}</span>
            <input
              ref={champAjout}
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              maxLength={80}
              placeholder={`Nouvelle ${libelleSingulier}, ex. ${exemple}`}
              className="h-10 w-full champ rounded-lg border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
            />
          </label>
          <Button type="submit" className="h-10!" disabled={!nouveau.trim()} loading={ajouter.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Ajouter
          </Button>
        </form>
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      {elements.length === 0 ? (
        <div className="referentiels-carte">
          <EmptyState
            titre={`Aucune ${libelleSingulier}`}
            description={`Ajoutez votre première ${libelleSingulier} pour classer vos produits.`}
            action={
              <Button variant="secondary" onClick={() => champAjout.current?.focus()}>
                Saisir un nom
              </Button>
            }
          />
        </div>
      ) : visibles.length === 0 ? (
        <div className="referentiels-carte">
          <EmptyState titre={`Aucune ${libelleSingulier} trouvée`} description="Essayez un autre nom." />
        </div>
      ) : (
        <ul className="referentiels-grille" aria-label={`${visibles.length} ${pluriel(libelleSingulier, visibles.length)}`}>
          {visibles.map((e, i) => {
            const edition = enEdition?.id === e.id;
            return (
              <li
                key={e.id}
                className="referentiels-carte"
                style={{ '--teinte': e.teinte, animationDelay: `${Math.min(i, 8) * 40}ms` } as CSSProperties}
              >
                <div className="flex min-h-11 items-center gap-3">
                  <span className="referentiels-pastille" aria-hidden="true">
                    {initiales(e.nom)}
                  </span>
                  {edition ? (
                    <>
                      <input
                        autoFocus
                        value={nomEdite}
                        maxLength={80}
                        aria-label={`Nouveau nom pour ${e.nom}`}
                        onChange={(ev) => setNomEdite(ev.target.value)}
                        onFocus={(ev) => ev.target.select()}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') validerRenommage();
                          if (ev.key === 'Escape') setEnEdition(null);
                        }}
                        className="h-9 min-w-0 flex-1 champ rounded-lg border border-rule-strong bg-surface-elevee px-2.5 text-corps text-ink-900 focus:border-action"
                      />
                      <Button variant="secondary" taille="sm" icone aria-label="Valider le nouveau nom" loading={renommer.isPending} onClick={validerRenommage}>
                        <Check className="size-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" taille="sm" icone aria-label="Annuler le renommage" onClick={() => setEnEdition(null)}>
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[15px] font-semibold text-ink-900">{e.nom}</h3>
                        <p className="text-[12.5px] text-steel-400">
                          {e.produits > 0 ? `${e.produits} ${pluriel('produit', e.produits)}` : 'Aucun produit'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        taille="sm"
                        icone
                        aria-label={`Renommer ${e.nom}`}
                        title="Renommer"
                        onClick={() => {
                          setErreur(null);
                          setNomEdite(e.nom);
                          setEnEdition(e);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        taille="sm"
                        icone
                        className="hover:bg-rupture-wash hover:text-rupture"
                        disabled={e.produits > 0}
                        aria-label={e.produits > 0 ? `${e.nom} est utilisée par ${e.produits} ${pluriel('produit', e.produits)} : suppression impossible` : `Supprimer ${e.nom}`}
                        title={e.produits > 0 ? `Utilisée par ${e.produits} ${pluriel('produit', e.produits)}` : 'Supprimer'}
                        onClick={() => {
                          setErreur(null);
                          setASupprimer(e);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>

                <dl className={e.produits === 0 ? 'grid grid-cols-2 gap-2.5 rounded-xl bg-paper p-3 opacity-60' : 'grid grid-cols-2 gap-2.5 rounded-xl bg-paper p-3'}>
                  <div>
                    <dt className="text-[11.5px] text-steel-400">Unités en stock</dt>
                    <dd className="font-display text-[16px] font-semibold text-ink-900 tabular-nums">{formatNombre(e.unites)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-steel-400">Valeur au prix d’achat</dt>
                    <dd>
                      {e.valeur > 0 ? (
                        <span className="font-display text-[16px] font-semibold text-ink-900 tabular-nums">
                          {formatNombre(e.valeur)} <span className="font-sans text-[12px] text-steel-400">GNF</span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-steel-400">{e.sansPrix > 0 ? 'Sans prix d’achat' : '—'}</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="flex items-center gap-2.5 text-[12px] text-steel-400">
                  <div className="referentiels-jauge h-1.5! flex-1" aria-hidden="true">
                    <i style={{ width: `${part(e.valeur)}%` }} />
                  </div>
                  <span className="tabular-nums">
                    {part(e.valeur)} %<span className="sr-only"> de la valeur du stock classé</span>
                  </span>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-rule pt-2.5">
                  {e.produits === 0 ? (
                    <>
                      <span className="inline-flex h-[22px] items-center rounded-full border border-rule bg-paper px-2 text-[11.5px] font-semibold text-steel-500">
                        Pas encore utilisée
                      </span>
                      <span className="text-[11.5px] text-steel-400">Peut être supprimée</span>
                    </>
                  ) : (
                    <>
                      {e.alertes > 0 ? (
                        <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-faible-wash px-2 text-[11.5px] font-semibold text-faible">
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          {e.alertes} sous le seuil
                        </span>
                      ) : (
                        <span className="inline-flex h-[22px] items-center rounded-full bg-ok-wash px-2 text-[11.5px] font-semibold text-ok">
                          Stock au-dessus des seuils
                        </span>
                      )}
                      {lienProduits && (
                        <Link to={`/produits?${champ}=${e.id}`} className={lienActionClasses()}>
                          Voir les produits
                        <FlecheLien /></Link>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {sans > 0 && recherche.trim() === '' && (
            <li className="referentiels-carte" data-sans="">
              <div className="flex min-h-11 items-center gap-3">
                <span className="referentiels-pastille" aria-hidden="true">
                  ?
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-ink-900">Sans {libelleSingulier}</h3>
                  <p className="text-[12.5px] text-steel-400">
                    {sans} {pluriel('produit', sans)} à classer
                  </p>
                </div>
              </div>
              <p className="text-corps text-steel-500">Une {libelleSingulier} se choisit dans la fiche du produit.</p>
              {lienSans && (
                <div className="mt-auto border-t border-dashed border-rule pt-2.5">
                  <Link to={lienSans} className={lienActionClasses()}>
                    Voir {sans > 1 ? 'ces produits' : 'ce produit'}
                  <FlecheLien /></Link>
                </div>
              )}
            </li>
          )}
        </ul>
      )}

      <Modal
        ouvert={aSupprimer !== null}
        onFermer={() => setASupprimer(null)}
        titre={`Supprimer « ${aSupprimer?.nom ?? ''} » ?`}
        description={`Elle n’est utilisée par aucun produit. Cette suppression est définitive.`}
        pied={
          <>
            <Button variant="secondary" onClick={() => setASupprimer(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={supprimer.isPending} onClick={() => aSupprimer && supprimer.mutate(aSupprimer.id)}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-corps text-steel-500">Vous pourrez toujours la recréer plus tard.</p>
      </Modal>
    </div>
  );
}
