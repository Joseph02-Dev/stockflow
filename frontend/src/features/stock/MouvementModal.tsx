import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';

interface Option {
  id: string;
  nom: string;
}

const schema = z.object({
  produitId: z.string().min(1, 'Sélectionnez un produit.'),
  emplacementId: z.string().min(1, 'Sélectionnez un emplacement.'),
  quantite: z
    .number({ message: 'La quantité doit être un nombre.' })
    .int('La quantité doit être un nombre entier.')
    .min(1, 'La quantité doit être supérieure à 0.'),
  fournisseurId: z.string().optional(),
});

type Formulaire = z.infer<typeof schema>;
type TypeMouvement = 'ENTREE' | 'SORTIE';

/**
 * Le parent monte ce composant uniquement lorsque la modale doit être
 * ouverte, et le démonte à la fermeture : l'état (type, erreur, champs)
 * repart donc neuf à chaque ouverture, sans effet de réinitialisation.
 */
export function MouvementModal({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TypeMouvement>('ENTREE');
  const [erreur, setErreur] = useState<string | null>(null);

  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<Option[]>('/produits')).data,
    enabled: ouvert,
  });

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Option[]>('/emplacements')).data,
    enabled: ouvert,
  });

  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Option[]>('/fournisseurs')).data,
    // Le fournisseur ne concerne que les entrées.
    enabled: ouvert && type === 'ENTREE',
  });

  const { register, handleSubmit, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { produitId: '', emplacementId: '', quantite: 1, fournisseurId: '' },
  });

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      const route = type === 'ENTREE' ? '/mouvements/entree' : '/mouvements/sortie';
      const corps =
        type === 'ENTREE'
          ? {
              produitId: valeurs.produitId,
              emplacementId: valeurs.emplacementId,
              quantite: valeurs.quantite,
              ...(valeurs.fournisseurId ? { fournisseurId: valeurs.fournisseurId } : {}),
            }
          : {
              produitId: valeurs.produitId,
              emplacementId: valeurs.emplacementId,
              quantite: valeurs.quantite,
            };
      return api.post(route, corps);
    },
    onSuccess: () => {
      // Un mouvement change le stock, l'historique, les alertes et les
      // indicateurs du dashboard : tout doit être rafraîchi.
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['mouvements'] });
      queryClient.invalidateQueries({ queryKey: ['alertes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onFermer();
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const optionsProduits = [
    { valeur: '', libelle: 'Sélectionner un produit…' },
    ...(produits.data ?? []).map((p) => ({ valeur: p.id, libelle: p.nom })),
  ];
  const optionsEmplacements = [
    { valeur: '', libelle: 'Sélectionner un emplacement…' },
    ...(emplacements.data ?? []).map((e) => ({ valeur: e.id, libelle: e.nom })),
  ];
  const optionsFournisseurs = [
    { valeur: '', libelle: 'Aucun fournisseur' },
    ...(fournisseurs.data ?? []).map((f) => ({ valeur: f.id, libelle: f.nom })),
  ];

  const aucunProduit = produits.data?.length === 0;
  const aucunEmplacement = emplacements.data?.length === 0;

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Nouveau mouvement">
      <form
        onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex gap-2" role="group" aria-label="Type de mouvement">
          {(
            [
              { valeur: 'ENTREE', libelle: 'Entrée', Icone: ArrowDownToLine },
              { valeur: 'SORTIE', libelle: 'Sortie', Icone: ArrowUpFromLine },
            ] as const
          ).map(({ valeur, libelle, Icone }) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={type === valeur}
              onClick={() => setType(valeur)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-(--radius-button) border px-3 py-2 text-sm font-medium transition-colors',
                type === valeur
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border-subtle text-text-secondary hover:bg-background',
              )}
            >
              <Icone className="size-4" aria-hidden="true" />
              {libelle}
            </button>
          ))}
        </div>

        {erreur && <Alert variant="error">{erreur}</Alert>}

        {/* Un mouvement est impossible sans catalogue ni emplacement :
            mieux vaut le dire clairement que laisser un select vide. */}
        {(aucunProduit || aucunEmplacement) && (
          <Alert variant="warning">
            {aucunProduit
              ? 'Créez d’abord un produit dans la section Produits.'
              : 'Créez d’abord un emplacement dans Paramètres.'}
          </Alert>
        )}

        <Select
          label="Produit"
          options={optionsProduits}
          error={formState.errors.produitId?.message}
          {...register('produitId')}
        />
        <Select
          label="Emplacement"
          options={optionsEmplacements}
          error={formState.errors.emplacementId?.message}
          {...register('emplacementId')}
        />
        <Input
          label="Quantité"
          type="number"
          min={1}
          error={formState.errors.quantite?.message}
          {...register('quantite', { valueAsNumber: true })}
        />

        {type === 'ENTREE' && (
          <Select label="Fournisseur (facultatif)" options={optionsFournisseurs} {...register('fournisseurId')} />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            type="submit"
            loading={enregistrer.isPending}
            disabled={aucunProduit || aucunEmplacement}
          >
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
