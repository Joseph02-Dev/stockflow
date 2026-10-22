import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { api, messageErreur } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Selecteur } from '@/components/ui/Selecteur';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import './emplacements.css';

interface Regle {
  id: string;
  produit: { nom: string } | null;
  categorie: { nom: string } | null;
  emplacementReceptionId: string | null;
  emplacementReception: { nom: string } | null;
  emplacementId: string;
  emplacement: { nom: string };
}

interface Option {
  id: string;
  nom: string;
  chemin?: string;
}

/**
 * Règles de rangement (module « rangement ») : à la réception, tel produit
 * ou telle catégorie va directement à tel emplacement. Appliquées d'office
 * à la réception d'une commande, proposées lors d'une entrée manuelle.
 */
export function RangementSection() {
  const queryClient = useQueryClient();
  const estAdmin = useSession()?.utilisateur.role === 'ADMIN';
  const [cible, setCible] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [destination, setDestination] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const regles = useQuery({
    queryKey: ['rangement'],
    queryFn: async () => (await api.get<Regle[]>('/rangement/regles')).data,
  });
  const options = useQuery({
    queryKey: ['rangement', 'options'],
    enabled: estAdmin,
    queryFn: async () => {
      const [produits, categories, emplacements] = await Promise.all([
        api.get<Option[]>('/produits'),
        api.get<Option[]>('/categories'),
        api.get<Option[]>('/emplacements'),
      ]);
      return { produits: produits.data, categories: categories.data, emplacements: emplacements.data };
    },
  });

  const creer = useMutation({
    mutationFn: async () => {
      const [type, id] = cible.split(':');
      return api.post('/rangement/regles', {
        [type === 'produit' ? 'produitId' : 'categorieId']: id,
        ...(arrivee ? { emplacementReceptionId: arrivee } : {}),
        emplacementId: destination,
      });
    },
    onSuccess: () => {
      setCible('');
      setArrivee('');
      setDestination('');
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['rangement'] });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’ajout a échoué.')),
  });
  const supprimer = useMutation({
    mutationFn: async (id: string) => api.delete(`/rangement/regles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rangement'] }),
    onError: (e) => setErreur(messageErreur(e, 'La suppression a échoué.')),
  });

  const emplacements = (options.data?.emplacements ?? []).map((e) => ({ valeur: e.id, libelle: (e.chemin ?? e.nom).split(' / ').join(' › ') }));
  // Chemin complet (« Dépôt › Zone A ») quand la liste des emplacements est chargée.
  const lieu = (id: string | null, nom: string): ReactNode => {
    const chemin = emplacements.find((e) => e.valeur === id)?.libelle ?? nom;
    const i = chemin.lastIndexOf(' › ');
    return i < 0 ? chemin : (
      <>
        <span className="font-medium text-steel-400">{chemin.slice(0, i + 3)}</span>
        {chemin.slice(i + 3)}
      </>
    );
  };
  const jeton = 'inline-flex max-w-full items-center gap-1.5 rounded-lg border border-rule bg-paper px-2.5 py-1 text-[13px] font-semibold text-ink-900';

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titre-rangement">
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-rangement" className="font-display text-[19px] font-semibold text-ink-900">
          Règles de rangement
        </h2>
        <p className="text-[13px] text-steel-400">La règle d’un produit l’emporte sur celle de sa catégorie.</p>
      </div>
      <div className="emplacements-carte">
        {regles.isLoading ? (
          <LoadingState lignes={2} />
        ) : regles.isError ? (
          <ErrorState message={messageErreur(regles.error)} onRetry={() => regles.refetch()} />
        ) : regles.data!.length === 0 ? (
          <p className="px-4 py-4 text-corps text-steel-500 sm:px-5">
            Aucune règle : à la réception, chaque produit reste à l’emplacement où il arrive.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {regles.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-3.5 sm:px-5">
                <span className="emplacements-jeton" data-cible="">
                  {r.produit ? (
                    r.produit.nom
                  ) : (
                    <>
                      <span className="font-medium opacity-70">Catégorie</span> {r.categorie?.nom}
                    </>
                  )}
                </span>
                {r.emplacementReception ? (
                  <>
                    <span className="text-[13px] text-steel-400">arrivant à</span>
                    <span className={jeton}>{lieu(r.emplacementReceptionId, r.emplacementReception.nom)}</span>
                  </>
                ) : (
                  <span className="text-[13px] text-steel-400">arrivant n’importe où</span>
                )}
                <span className="inline-flex items-center gap-1.5 text-[13px] text-steel-400">
                  <ArrowRight className="size-4" aria-hidden="true" />
                  rangé à
                </span>
                <span className={jeton}>{lieu(r.emplacementId, r.emplacement.nom)}</span>
                {estAdmin && (
                  <Button
                    variant="ghost"
                    taille="sm"
                    icone
                    className="ml-auto hover:bg-rupture-wash hover:text-rupture"
                    loading={supprimer.isPending && supprimer.variables === r.id}
                    onClick={() => supprimer.mutate(r.id)}
                    aria-label="Supprimer la règle"
                    title="Supprimer la règle"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {estAdmin && (
          <div className="flex flex-col gap-3 border-t border-rule bg-entete-groupe p-4 sm:p-5">
            {erreur && <Alert variant="error">{erreur}</Alert>}
            <div className="grid items-end gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
              <Selecteur
                label="Produit ou catégorie"
                value={cible}
                onChange={setCible}
                placeholder="Choisir…"
                options={[
                  ...(options.data?.categories ?? []).map((c) => ({ valeur: `categorie:${c.id}`, libelle: c.nom, groupe: 'Catégories' })),
                  ...(options.data?.produits ?? []).map((p) => ({ valeur: `produit:${p.id}`, libelle: p.nom, groupe: 'Produits' })),
                ]}
              />
              <Selecteur
                label="Arrivant à"
                value={arrivee}
                onChange={setArrivee}
                options={[{ valeur: '', libelle: 'N’importe quel emplacement' }, ...emplacements]}
              />
              <Selecteur
                label="Ranger à"
                value={destination}
                onChange={setDestination}
                placeholder="Choisir…"
                options={emplacements.filter((e) => e.valeur !== arrivee)}
              />
              <Button disabled={!cible || !destination} loading={creer.isPending} onClick={() => creer.mutate()}>
                <Plus className="size-4" aria-hidden="true" />
                Ajouter
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
