import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';

interface Fournisseur {
  id: string;
  nom: string;
  emailContact: string | null;
  telephone: string | null;
  photoUrl: string | null;
  delaiLivraisonJours: number | null;
}

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
}

interface Reception {
  id: string;
  quantite: number;
  createdAt: string;
  produit: { nom: string };
  emplacement: { nom: string };
}

const onglets = [
  { cle: 'informations', libelle: 'Informations' },
  { cle: 'produits', libelle: 'Produits associés' },
  { cle: 'receptions', libelle: 'Réceptions' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

const schemaEdition = z.object({
  nom: z.string().min(1, 'Le nom du fournisseur est requis.'),
  emailContact: z.string().email('Adresse email invalide.').optional().or(z.literal('')),
  telephone: z.string().optional(),
  delaiLivraisonJours: z.union([z.number().int().min(0), z.nan()]).optional(),
});

type FormulaireEdition = z.infer<typeof schemaEdition>;

export function FournisseurDetail({ fournisseurId }: { fournisseurId: string }) {
  const queryClient = useQueryClient();
  const [actif, setActif] = useState<CleOnglet>('informations');
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const fournisseur = useQuery({
    queryKey: ['fournisseur', fournisseurId],
    queryFn: async () => (await api.get<Fournisseur>(`/fournisseurs/${fournisseurId}`)).data,
  });

  const produitsAssocies = useQuery({
    queryKey: ['fournisseur', fournisseurId, 'produits'],
    queryFn: async () => (await api.get<Produit[]>(`/fournisseurs/${fournisseurId}/produits`)).data,
  });

  const receptions = useQuery({
    queryKey: ['fournisseur', fournisseurId, 'receptions'],
    queryFn: async () => (await api.get<Reception[]>(`/fournisseurs/${fournisseurId}/receptions`)).data,
    enabled: actif === 'receptions',
  });

  const catalogue = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<Produit[]>('/produits')).data,
    enabled: modaleOuverte,
  });

  const { register, handleSubmit, reset, formState } = useForm<FormulaireEdition>({
    resolver: zodResolver(schemaEdition),
  });

  function ouvrirEdition() {
    if (!fournisseur.data) return;
    setErreur(null);
    setPhotoUrl(fournisseur.data.photoUrl ?? undefined);
    reset({
      nom: fournisseur.data.nom,
      emailContact: fournisseur.data.emailContact ?? '',
      telephone: fournisseur.data.telephone ?? '',
      delaiLivraisonJours: fournisseur.data.delaiLivraisonJours ?? undefined,
    });
    setEditionOuverte(true);
  }

  const modifier = useMutation({
    mutationFn: async (v: FormulaireEdition) =>
      api.patch(`/fournisseurs/${fournisseurId}`, {
        nom: v.nom,
        ...(v.emailContact ? { emailContact: v.emailContact } : {}),
        ...(v.telephone ? { telephone: v.telephone } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(v.delaiLivraisonJours !== undefined && !Number.isNaN(v.delaiLivraisonJours)
          ? { delaiLivraisonJours: v.delaiLivraisonJours }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fournisseur', fournisseurId] });
      queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      setEditionOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'La modification a échoué.')),
  });

  const associer = useMutation({
    mutationFn: async (produitId: string) => api.post(`/fournisseurs/${fournisseurId}/produits`, { produitId }),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['fournisseur', fournisseurId, 'produits'] });
      setModaleOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’association a échoué.')),
  });

  const dissocier = useMutation({
    mutationFn: async (produitId: string) => api.delete(`/fournisseurs/${fournisseurId}/produits/${produitId}`),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['fournisseur', fournisseurId, 'produits'] });
    },
    onError: (err) => setErreur(messageErreur(err, 'La dissociation a échoué.')),
  });

  if (fournisseur.isLoading) return <LoadingState />;
  if (fournisseur.isError) {
    return (
      <ErrorState
        message={messageErreur(fournisseur.error, 'Fournisseur introuvable.')}
        onRetry={() => fournisseur.refetch()}
      />
    );
  }
  if (!fournisseur.data) return null;

  const dejaAssocies = new Set((produitsAssocies.data ?? []).map((p) => p.id));
  const produitsDisponibles = (catalogue.data ?? []).filter((p) => !dejaAssocies.has(p.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {fournisseur.data.photoUrl ? (
              <img src={fournisseur.data.photoUrl} alt="" className="size-full object-cover" />
            ) : (
              fournisseur.data.nom.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{fournisseur.data.nom}</h1>
            {fournisseur.data.delaiLivraisonJours !== null && (
              <p className="text-sm text-text-secondary">
                Délai moyen : {fournisseur.data.delaiLivraisonJours} j
              </p>
            )}
          </div>
        </div>
        <Button variant="secondary" onClick={ouvrirEdition}>
          <Pencil className="size-4" aria-hidden="true" />
          Modifier
        </Button>
      </div>

      <div className="border-b border-border-subtle" role="tablist" aria-label="Sections du fournisseur">
        <div className="flex gap-1 overflow-x-auto">
          {onglets.map((onglet) => (
            <button
              key={onglet.cle}
              type="button"
              role="tab"
              aria-selected={actif === onglet.cle}
              onClick={() => setActif(onglet.cle)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
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

      {erreur && !editionOuverte && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      <div role="tabpanel">
        {actif === 'informations' && (
          <Card>
            <dl className="divide-y divide-border-subtle">
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-text-secondary">Email de contact</dt>
                <dd className="text-text-primary">{fournisseur.data.emailContact ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-text-secondary">Téléphone</dt>
                <dd className="text-text-primary">{fournisseur.data.telephone ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-text-secondary">Délai de livraison moyen</dt>
                <dd className="text-text-primary">
                  {fournisseur.data.delaiLivraisonJours !== null
                    ? `${fournisseur.data.delaiLivraisonJours} jour(s)`
                    : '—'}
                </dd>
              </div>
            </dl>
          </Card>
        )}

        {actif === 'produits' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Associer un produit
              </Button>
            </div>

            <Card>
              {produitsAssocies.isLoading ? (
                <LoadingState />
              ) : produitsAssocies.data && produitsAssocies.data.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {produitsAssocies.data.map((produit) => (
                    <li key={produit.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{produit.nom}</p>
                        {produit.reference && (
                          <p className="truncate text-sm text-text-secondary">{produit.reference}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => dissocier.mutate(produit.id)}
                        disabled={dissocier.isPending}
                      >
                        <X className="size-4" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Dissocier</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  titre="Aucun produit associé"
                  description="Associez les produits que ce fournisseur vous livre."
                  action={<Button onClick={() => setModaleOuverte(true)}>Associer un produit</Button>}
                />
              )}
            </Card>
          </div>
        )}

        {actif === 'receptions' && (
          <Card>
            {receptions.isLoading ? (
              <LoadingState />
            ) : receptions.isError ? (
              <ErrorState message={messageErreur(receptions.error)} onRetry={() => receptions.refetch()} />
            ) : receptions.data && receptions.data.length > 0 ? (
              <>
                <table className="hidden w-full text-sm md:table">
                  <thead className="border-b border-border-subtle bg-background text-left">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Date</th>
                      <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
                      <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Emplacement</th>
                      <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Quantité</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {receptions.data.map((reception) => (
                      <tr key={reception.id}>
                        <td className="px-4 py-3 text-text-secondary">
                          {new Date(reception.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">{reception.produit.nom}</td>
                        <td className="px-4 py-3 text-text-secondary">{reception.emplacement.nom}</td>
                        <td className="px-4 py-3">
                          <Badge variant="success">+{reception.quantite}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="divide-y divide-border-subtle md:hidden">
                  {receptions.data.map((reception) => (
                    <li key={reception.id} className="flex items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{reception.produit.nom}</p>
                        <p className="truncate text-sm text-text-secondary">
                          {reception.emplacement.nom} · {new Date(reception.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <Badge variant="success">+{reception.quantite}</Badge>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                titre="Aucune réception"
                description="Les entrées de stock enregistrées avec ce fournisseur apparaîtront ici."
              />
            )}
          </Card>
        )}
      </div>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Associer un produit"
        description="Seuls les produits pas encore associés sont proposés."
      >
        {catalogue.isLoading ? (
          <LoadingState />
        ) : produitsDisponibles.length > 0 ? (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {produitsDisponibles.map((produit) => (
              <li key={produit.id}>
                <button
                  type="button"
                  onClick={() => associer.mutate(produit.id)}
                  disabled={associer.isPending}
                  className="flex w-full items-center justify-between gap-3 rounded-(--radius-button) px-3 py-2 text-left text-sm transition-colors hover:bg-background disabled:opacity-50"
                >
                  <span className="truncate text-text-primary">{produit.nom}</span>
                  {produit.reference && (
                    <span className="shrink-0 text-xs text-text-secondary">{produit.reference}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-text-secondary">
            Tous vos produits sont déjà associés à ce fournisseur.
          </p>
        )}
      </Modal>

      <Modal ouvert={editionOuverte} onFermer={() => setEditionOuverte(false)} titre="Modifier le fournisseur">
        <form
          onSubmit={handleSubmit((v) => modifier.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <ImageUploadField label="Photo" valeur={photoUrl} dossier="fournisseurs" onChange={setPhotoUrl} forme="rond" />

          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
          <Input
            label="Email de contact (facultatif)"
            type="email"
            error={formState.errors.emailContact?.message}
            {...register('emailContact')}
          />
          <Input
            label="Téléphone (facultatif)"
            error={formState.errors.telephone?.message}
            {...register('telephone')}
          />
          <Input
            label="Délai de livraison moyen, en jours (facultatif)"
            type="number"
            min={0}
            error={formState.errors.delaiLivraisonJours?.message}
            {...register('delaiLivraisonJours', { valueAsNumber: true })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditionOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={modifier.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
