import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';

interface Regle {
  id: string;
  produit: { nom: string } | null;
  categorie: { nom: string } | null;
  emplacementReception: { nom: string } | null;
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

  const emplacements = (options.data?.emplacements ?? []).map((e) => ({ valeur: e.id, libelle: e.chemin ?? e.nom }));

  return (
    <Card>
      <PanneauEntete
        titre="Règles de rangement"
        meta="La règle d’un produit l’emporte sur celle de sa catégorie."
      />
      {regles.isLoading ? (
        <LoadingState lignes={2} />
      ) : regles.isError ? (
        <ErrorState message={messageErreur(regles.error)} onRetry={() => regles.refetch()} />
      ) : (
        regles.data!.length > 0 && (
          <ul className="divide-y divide-rule border-b border-rule">
            {regles.data!.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1 text-corps text-ink-900">
                  <span className="font-medium">{r.produit?.nom ?? `Catégorie ${r.categorie?.nom}`}</span>
                  <span className="text-steel-500"> arrivant {r.emplacementReception ? `à ${r.emplacementReception.nom}` : 'n’importe où'}</span>
                  <ArrowRight className="mx-2 inline size-4 text-steel-400" aria-hidden="true" />
                  <span className="font-medium">{r.emplacement.nom}</span>
                </span>
                {estAdmin && (
                  <Button variant="ghost" taille="sm" loading={supprimer.isPending} onClick={() => supprimer.mutate(r.id)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only">Supprimer la règle</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      {estAdmin && (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <div className="grid gap-3 md:grid-cols-3">
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
          </div>
          <Button
            taille="sm"
            className="self-end"
            disabled={!cible || !destination}
            loading={creer.isPending}
            onClick={() => creer.mutate()}
          >
            <Plus className="size-4" aria-hidden="true" />
            Ajouter la règle
          </Button>
        </div>
      )}
    </Card>
  );
}
