import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArrowLeftRight, ArrowRight, MapPin, Pencil, Plus, Warehouse } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { useModules } from '@/lib/useModules';
import { STRATEGIES, type StrategieSortie } from '@/lib/strategieSortie';
import { PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { TEINTES_LIEUX } from '@/features/stock/types';
import './emplacements.css';

interface Emplacement {
  id: string;
  nom: string;
  adresse: string | null;
  archive: boolean;
  parentId: string | null;
  strategieSortie: StrategieSortie | null;
  /** « Dépôt / Zone A / Allée 3 » (le nom seul sans arborescence). */
  chemin: string;
}

interface LigneStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
}

interface ProduitPrix {
  id: string;
  prixAchat: number | null;
}

/** Ce qu'un lieu contient : ses propres lignes de stock, ou tout son sous-arbre. */
interface Contenu {
  produits: Set<string>;
  unites: number;
  valeur: number;
  sansPrix: Set<string>;
}

const schema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  adresse: z.string().optional(),
  parentId: z.string().optional(),
  strategieSortie: z.string().optional(),
});

/** L'emplacement et tous ses sous-emplacements : jamais parents possibles de lui-même. */
function descendants(id: string, tous: Emplacement[]): Set<string> {
  const exclus = new Set([id]);
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const e of tous) {
      if (e.parentId && exclus.has(e.parentId) && !exclus.has(e.id)) {
        exclus.add(e.id);
        ajout = true;
      }
    }
  }
  return exclus;
}

/** « Dépôt / Zone A » → « Dépôt › Zone A ». */
const cheminLisible = (e: Emplacement) => e.chemin.split(' / ').join(' › ');

type Formulaire = z.infer<typeof schema>;

export function EmplacementsSection() {
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState<Emplacement | null>(null);
  const [aArchiver, setAArchiver] = useState<Emplacement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [mesure, setMesure] = useState<'unites' | 'valeur'>('unites');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Emplacement[]>('/emplacements')).data,
  });
  // Mêmes requêtes et clés de cache que les écrans Stock et Produits.
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock?')).data,
  });
  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<ProduitPrix[]>('/produits?')).data,
  });

  const modules = useModules();
  const { register, handleSubmit, reset, formState, control } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  /** parentId : « Ajouter un sous-emplacement » depuis la carte d'un lieu. */
  function ouvrirCreation(parentId = '') {
    setEnEdition(null);
    setErreur(null);
    reset({ nom: '', adresse: '', parentId, strategieSortie: '' });
    setModaleOuverte(true);
  }

  function ouvrirEdition(emplacement: Emplacement) {
    setEnEdition(emplacement);
    setErreur(null);
    reset({
      nom: emplacement.nom,
      adresse: emplacement.adresse ?? '',
      parentId: emplacement.parentId ?? '',
      strategieSortie: emplacement.strategieSortie ?? '',
    });
    setModaleOuverte(true);
  }

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      // L'adresse est facultative : on n'envoie pas de chaîne vide, qui
      // serait stockée telle quelle au lieu de rester nulle.
      const corps = {
        nom: valeurs.nom,
        ...(valeurs.adresse ? { adresse: valeurs.adresse } : {}),
        // Arborescence : '' = premier niveau. Rien n'est envoyé sans le module.
        ...(modules.arborescence ? { parentId: valeurs.parentId || null } : {}),
        // '' = la stratégie de l'entreprise.
        ...(modules.strategiesSortie ? { strategieSortie: valeurs.strategieSortie || null } : {}),
      };
      if (enEdition) {
        await api.patch(`/emplacements/${enEdition.id}`, corps);
      } else {
        await api.post('/emplacements', corps);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setModaleOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/emplacements/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAArchiver(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’archivage a échoué.')),
  });

  const emplacements = data ?? [];
  const prixAchat = new Map((produits.data ?? []).map((p) => [p.id, p.prixAchat]));
  const teinteDe = new Map(emplacements.map((e, i) => [e.id, TEINTES_LIEUX[i % TEINTES_LIEUX.length]]));
  const enfantsDe = (id: string) => emplacements.filter((e) => e.parentId === id);
  const connus = new Set(emplacements.map((e) => e.id));
  const racines = emplacements.filter((e) => !e.parentId || !connus.has(e.parentId));

  // Contenu propre de chaque lieu, puis cumulé sur son sous-arbre.
  const propres = new Map<string, Contenu>();
  for (const e of emplacements) propres.set(e.id, { produits: new Set(), unites: 0, valeur: 0, sansPrix: new Set() });
  for (const ligne of stock.data ?? []) {
    const c = propres.get(ligne.emplacementId);
    if (!c || ligne.quantite <= 0) continue;
    c.produits.add(ligne.produitId);
    c.unites += ligne.quantite;
    const prix = prixAchat.get(ligne.produitId);
    if (prix == null) c.sansPrix.add(ligne.produitId);
    else c.valeur += prix * ligne.quantite;
  }
  const contenus = new Map<string, Contenu>();
  const cumuler = (e: Emplacement): Contenu => {
    const propre = propres.get(e.id)!;
    const total: Contenu = { produits: new Set(propre.produits), unites: propre.unites, valeur: propre.valeur, sansPrix: new Set(propre.sansPrix) };
    for (const enfant of enfantsDe(e.id)) {
      const c = cumuler(enfant);
      c.produits.forEach((p) => total.produits.add(p));
      c.sansPrix.forEach((p) => total.sansPrix.add(p));
      total.unites += c.unites;
      total.valeur += c.valeur;
    }
    contenus.set(e.id, total);
    return total;
  };
  racines.forEach(cumuler);

  const unitesTotales = emplacements.reduce((a, e) => a + propres.get(e.id)!.unites, 0);
  const valeurTotale = emplacements.reduce((a, e) => a + propres.get(e.id)!.valeur, 0);
  const vides = emplacements.filter((e) => (contenus.get(e.id)?.unites ?? 0) === 0);
  const sousEmplacements = emplacements.length - racines.length;
  const parts = emplacements
    .filter((e) => propres.get(e.id)![mesure] > 0)
    .sort((a, b) => propres.get(b.id)![mesure] - propres.get(a.id)![mesure]);
  const sommeMesure = mesure === 'unites' ? unitesTotales : valeurTotale;
  const pourcent = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  /** Sous-emplacements dans l'ordre de l'arbre, avec leur niveau. */
  const arbre = (e: Emplacement, niveau = 1): { e: Emplacement; niveau: number; suite: boolean }[] =>
    enfantsDe(e.id).flatMap((enfant, i, freres) => [{ e: enfant, niveau, suite: i < freres.length - 1 }, ...arbre(enfant, niveau + 1)]);

  const boutonsLieu = (e: Emplacement) => {
    const actifs = enfantsDe(e.id).length;
    return (
      <>
        <Button variant="ghost" taille="sm" icone aria-label={`Modifier ${e.nom}`} title="Modifier" onClick={() => ouvrirEdition(e)}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          taille="sm"
          icone
          disabled={actifs > 0}
          aria-label={
            actifs > 0 ? `${e.nom} contient ${actifs} ${pluriel('sous-emplacement', actifs)} actif${actifs > 1 ? 's' : ''} : archivage impossible` : `Archiver ${e.nom}`
          }
          title={actifs > 0 ? `Contient ${actifs} ${pluriel('sous-emplacement', actifs)} actif${actifs > 1 ? 's' : ''}` : 'Archiver'}
          onClick={() => setAArchiver(e)}
        >
          <Archive className="size-4" aria-hidden="true" />
        </Button>
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titre="Emplacements"
        description="Vos dépôts, boutiques et réserves : là où le stock est rangé."
        action={
          <Button onClick={() => ouvrirCreation()}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvel emplacement
          </Button>
        }
      />

      {erreur && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      {isLoading || stock.isLoading || produits.isLoading ? (
        <LoadingState />
      ) : isError || stock.isError || produits.isError ? (
        <ErrorState
          message={messageErreur(error ?? stock.error ?? produits.error)}
          onRetry={() => [refetch, stock.refetch, produits.refetch].forEach((f) => f())}
        />
      ) : emplacements.length === 0 ? (
        <div className="emplacements-carte">
          <EmptyState
            titre="Aucun emplacement"
            description="Créez un emplacement pour commencer à y enregistrer du stock."
            action={<Button onClick={() => ouvrirCreation()}>Créer un emplacement</Button>}
          />
        </div>
      ) : (
        <>
          <section className="emplacements-synthese" aria-label="Synthèse">
            <div className="emplacements-tuile">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-steel-500">
                <span className="size-2 rounded-full bg-action" aria-hidden="true" />
                Emplacements actifs
              </p>
              <p className="font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">{formatNombre(emplacements.length)}</p>
              <p className="text-[12.5px] text-steel-400">
                {sousEmplacements > 0
                  ? `${racines.length} ${pluriel('principal', racines.length, 'principaux')} · ${sousEmplacements} ${pluriel('sous-emplacement', sousEmplacements)}`
                  : 'Tous au premier niveau'}
              </p>
            </div>
            <div className="emplacements-tuile">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-steel-500">
                <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
                Unités en stock
              </p>
              <p className="font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">{formatNombre(unitesTotales)}</p>
              <p className="text-[12.5px] text-steel-400 tabular-nums">{formatNombre(valeurTotale)} GNF au prix d’achat</p>
            </div>
            <div className="emplacements-tuile">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-steel-500">
                <span className="size-2 rounded-full bg-faible" aria-hidden="true" />
                Emplacements vides
              </p>
              <p className="font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">{formatNombre(vides.length)}</p>
              <p className="truncate text-[12.5px] text-steel-400">
                {vides.length > 0 ? vides.map((e) => e.nom).join(', ') : 'Tous contiennent du stock'}
              </p>
            </div>
          </section>

          {parts.length > 0 && (
            <section className="emplacements-carte flex flex-col gap-3.5 p-4 sm:p-5" aria-labelledby="titre-repartition">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="titre-repartition" className="text-[15.5px] font-semibold text-ink-900">
                  Où est votre stock
                </h2>
                <div className="inline-flex rounded-lg border border-rule bg-paper p-0.5" role="group" aria-label="Mesure">
                  {(['unites', 'valeur'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mesure === m}
                      onClick={() => setMesure(m)}
                      className={
                        mesure === m
                          ? 'h-7 rounded-md bg-surface px-2.5 text-[12.5px] font-semibold text-ink-900 shadow-sm'
                          : 'h-7 rounded-md px-2.5 text-[12.5px] font-semibold text-steel-500'
                      }
                    >
                      {m === 'unites' ? 'Unités' : 'Valeur'}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="emplacements-barre"
                role="img"
                aria-label={`Répartition du stock (${mesure === 'unites' ? 'unités' : 'valeur'}) : ${parts.map((e) => `${cheminLisible(e)} ${pourcent(propres.get(e.id)![mesure], sommeMesure)} %`).join(', ')}`}
              >
                {parts.map((e) => (
                  <i key={e.id} style={{ '--teinte': teinteDe.get(e.id), flex: `${propres.get(e.id)![mesure]} 0 0` } as CSSProperties} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4.5 gap-y-1.5">
                {parts.map((e) => (
                  <li key={e.id} className="flex items-center gap-1.5 text-corps">
                    <span className="size-[9px] rounded-[3px]" style={{ background: teinteDe.get(e.id) }} aria-hidden="true" />
                    <span className="font-semibold text-ink-900">{cheminLisible(e)}</span>
                    <span className="font-mono text-[12px] text-steel-400">{pourcent(propres.get(e.id)![mesure], sommeMesure)} %</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[19px] font-semibold text-ink-900">Vos lieux</h2>
            {sousEmplacements > 0 && <p className="text-[13px] text-steel-400">Les chiffres d’un lieu incluent ses sous-emplacements.</p>}
          </div>

          <ul className="emplacements-grille">
            {racines.map((e, i) => {
              const c = contenus.get(e.id)!;
              const sous = arbre(e);
              const teinte = teinteDe.get(e.id);
              return (
                <li key={e.id} className="emplacements-carte" style={{ '--teinte': teinte, animationDelay: `${Math.min(i, 6) * 60}ms` } as CSSProperties}>
                  <div className="flex items-start gap-3 p-4 pb-3 sm:px-[18px] sm:pt-[18px]">
                    <span className="emplacements-pastille" aria-hidden="true">
                      <Warehouse className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-ink-900">{e.nom}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-steel-400">
                        {e.adresse ? (
                          <>
                            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{e.adresse}</span>
                          </>
                        ) : (
                          'Pas d’adresse'
                        )}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {modules.strategiesSortie && (
                          <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-rule bg-paper px-2 text-[11.5px] font-semibold text-steel-500">
                            {e.strategieSortie ? 'Sortie' : 'Sortie de l’entreprise ·'}{' '}
                            <span className="font-mono">{e.strategieSortie ?? modules.strategieSortie}</span>
                          </span>
                        )}
                        {c.unites === 0 && (
                          <span className="inline-flex h-[22px] items-center rounded-full bg-faible-wash px-2 text-[11.5px] font-semibold text-faible">Vide</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">{boutonsLieu(e)}</div>
                  </div>

                  <dl className="emplacements-chiffres mx-4 sm:mx-[18px]">
                    <div>
                      <dt className="text-[11.5px] text-steel-400">Produits</dt>
                      <dd className="font-display text-[17px] font-semibold text-ink-900 tabular-nums">{formatNombre(c.produits.size)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11.5px] text-steel-400">Unités</dt>
                      <dd className="font-display text-[17px] font-semibold text-ink-900 tabular-nums">{formatNombre(c.unites)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11.5px] text-steel-400">Valeur</dt>
                      <dd className="font-display text-[17px] font-semibold text-ink-900 tabular-nums">
                        {formatNombre(c.valeur)} <span className="font-sans text-[11.5px] text-steel-400">GNF</span>
                      </dd>
                    </div>
                  </dl>
                  <div className="mx-4 mt-3 flex items-center gap-2.5 text-[12px] text-steel-400 sm:mx-[18px]">
                    <div className="emplacements-jauge" aria-hidden="true">
                      <i style={{ width: `${pourcent(c.unites, unitesTotales)}%` }} />
                    </div>
                    <span className="tabular-nums">{pourcent(c.unites, unitesTotales)} % des unités</span>
                  </div>
                  {c.sansPrix.size > 0 && (
                    <p className="mx-4 mt-1.5 text-[12px] text-steel-400 sm:mx-[18px]">
                      {c.sansPrix.size} {pluriel('produit', c.sansPrix.size)} sans prix d’achat, hors valeur.
                    </p>
                  )}

                  {sous.length > 0 && (
                    <div className="mt-3.5 border-t border-rule px-4 pt-1 sm:px-[18px]">
                      <p className="mt-2.5 mb-1 text-[11.5px] font-semibold tracking-[0.06em] text-steel-400 uppercase">Sous-emplacements</p>
                      <ul>
                        {sous.map(({ e: s, niveau, suite }) => {
                          const cs = contenus.get(s.id)!;
                          return (
                            <li key={s.id} className="emplacements-sous" style={{ '--niveau': niveau } as CSSProperties} data-suite={suite || undefined}>
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-semibold text-ink-900">{s.nom}</p>
                                <p className="text-[12px] text-steel-400">
                                  {cs.unites > 0 ? `${cs.produits.size} ${pluriel('produit', cs.produits.size)}` : 'Vide'}
                                  {modules.strategiesSortie && s.strategieSortie && ` · Sortie ${s.strategieSortie}`}
                                </p>
                              </div>
                              <span className="font-mono text-[13px] font-semibold whitespace-nowrap text-steel-700">{formatNombre(cs.unites)} u.</span>
                              <span className="flex">{boutonsLieu(s)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-rule bg-entete-groupe px-4 py-3 sm:px-[18px]">
                    {modules.arborescence ? (
                      <button
                        type="button"
                        onClick={() => ouvrirCreation(e.id)}
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-steel-500 hover:text-ink-900"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        Ajouter un sous-emplacement
                      </button>
                    ) : (
                      <span />
                    )}
                    <span className="flex gap-3.5">
                      <Link
                        to="/stock"
                        state={{ emplacementId: e.id, nouveauMouvement: true }}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-action hover:underline"
                      >
                        <ArrowLeftRight className="size-4" aria-hidden="true" />
                        Mouvement
                      </Link>
                      <Link to="/stock" state={{ emplacementId: e.id }} className="inline-flex items-center gap-1 text-[13px] font-semibold text-action hover:underline">
                        Voir le stock
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre={enEdition ? 'Modifier l’emplacement' : 'Nouvel emplacement'}
        modifie={formState.isDirty}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-emplacement" loading={enregistrer.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form
          id="formulaire-emplacement"
          onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
          <Input label="Adresse (facultatif)" {...register('adresse')} />
          {modules.arborescence && (
            <SelecteurChamp<Formulaire>
              name="parentId"
              control={control}
              label="Rangé dans (facultatif)"
              placeholder="Premier niveau"
              options={[
                { valeur: '', libelle: 'Premier niveau' },
                ...(data ?? [])
                  .filter((e) => !(enEdition ? descendants(enEdition.id, data ?? []) : new Set<string>()).has(e.id))
                  .map((e) => ({ valeur: e.id, libelle: e.chemin })),
              ]}
            />
          )}
          {modules.strategiesSortie && (
            <SelecteurChamp<Formulaire>
              name="strategieSortie"
              control={control}
              label="Ordre de sortie des lots"
              options={[
                {
                  valeur: '',
                  libelle: `Celui de l’entreprise (${modules.strategieSortie})`,
                },
                ...STRATEGIES.map((s) => ({ valeur: s.valeur, libelle: s.libelle, sousTitre: s.aide })),
              ]}
            />
          )}

        </form>
      </Modal>

      <Modal
        ouvert={aArchiver !== null}
        onFermer={() => setAArchiver(null)}
        titre="Archiver cet emplacement ?"
        description={`« ${aArchiver?.nom} » n’apparaîtra plus dans les listes et ne pourra plus recevoir de mouvements. Son historique est conservé.`}
        pied={
          <>
            {/* Le focus par défaut reste sur Annuler : une action à
                conséquence ne doit jamais être déclenchée par mégarde. */}
            <Button variant="secondary" onClick={() => setAArchiver(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={archiver.isPending}
              onClick={() => aArchiver && archiver.mutate(aArchiver.id)}
            >
              Archiver
            </Button>
          </>
        }
      >
        {aArchiver && (contenus.get(aArchiver.id)?.unites ?? 0) > 0 ? (
          <Alert variant="warning">
            Il contient encore {formatNombre(contenus.get(aArchiver.id)!.unites)} {pluriel('unité', contenus.get(aArchiver.id)!.unites)} en stock.
          </Alert>
        ) : (
          <p className="text-corps text-steel-500">Il ne contient aucun stock.</p>
        )}
      </Modal>
    </div>
  );
}
