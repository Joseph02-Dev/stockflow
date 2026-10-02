import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Mail, Pencil, Phone, Plus, ShoppingCart, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { Vignette } from '@/components/patterns/Vignette';
import { tableau } from '@/components/patterns/tableau';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { pluriel } from '@/lib/format';
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
  { cle: 'produits', libelle: 'Produits fournis' },
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

  if (fournisseur.isLoading) return <LoadingState variante="page" />;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Vignette nom={fournisseur.data.nom} photoUrl={fournisseur.data.photoUrl} taille={44} />
          <div className="min-w-0">
            <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.006em] text-ink-900">
              {fournisseur.data.nom}
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 text-meta text-steel-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3 text-steel-400" aria-hidden="true" />
                {fournisseur.data.delaiLivraisonJours !== null
                  ? `Délai moyen ${fournisseur.data.delaiLivraisonJours} ${pluriel('jour', fournisseur.data.delaiLivraisonJours)}`
                  : 'Délai non renseigné'}
              </span>
              {fournisseur.data.telephone && (
                <a
                  href={`tel:${fournisseur.data.telephone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-1 hover:text-ink-900"
                >
                  <Phone className="size-3 text-steel-400" aria-hidden="true" />
                  {fournisseur.data.telephone}
                </a>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={ouvrirEdition}>
            <Pencil className="size-4" aria-hidden="true" />
            Modifier
          </Button>
          <Link
            to="/commandes/nouvelle"
            state={{ fournisseurId }}
            className={boutonClasses('primary')}
          >
            <ShoppingCart className="size-4" aria-hidden="true" />
            Commander
          </Link>
        </div>
      </div>

      <Onglets onglets={onglets} actif={actif} onChange={setActif} libelle="Sections du fournisseur" />

      {erreur && !editionOuverte && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      <div role="tabpanel">
        {actif === 'informations' && (
          <Card>
            <dl className="divide-y divide-rule">
              {[
                {
                  Icone: Mail,
                  libelle: 'Email de contact',
                  valeur: fournisseur.data.emailContact && (
                    <a href={`mailto:${fournisseur.data.emailContact}`} className="text-action hover:underline">
                      {fournisseur.data.emailContact}
                    </a>
                  ),
                },
                {
                  Icone: Phone,
                  libelle: 'Téléphone',
                  valeur: fournisseur.data.telephone && (
                    <a
                      href={`tel:${fournisseur.data.telephone.replace(/\s/g, '')}`}
                      className="text-action hover:underline"
                    >
                      {fournisseur.data.telephone}
                    </a>
                  ),
                },
                {
                  Icone: Clock,
                  libelle: 'Délai de livraison annoncé',
                  valeur:
                    fournisseur.data.delaiLivraisonJours !== null &&
                    `${fournisseur.data.delaiLivraisonJours} ${pluriel('jour', fournisseur.data.delaiLivraisonJours)}`,
                },
              ].map(({ Icone, libelle, valeur }) => (
                <div key={libelle} className="flex items-center justify-between gap-4 px-5 py-3 text-corps">
                  <dt className="flex items-center gap-2 text-steel-500">
                    <Icone className="size-4 text-steel-400" aria-hidden="true" />
                    {libelle}
                  </dt>
                  <dd className="min-w-0 truncate text-right text-ink-900">
                    {valeur || <span className="text-steel-400">Non renseigné</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {actif === 'produits' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 basis-64 text-corps text-steel-500">
                Ces produits sont regroupés chez ce fournisseur dans « Ce qui manque ».
              </p>
              <Button variant="secondary" onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Associer un produit
              </Button>
            </div>

            <Card>
              {produitsAssocies.isLoading ? (
                <LoadingState />
              ) : produitsAssocies.data && produitsAssocies.data.length > 0 ? (
                <ul className="divide-y divide-rule">
                  {produitsAssocies.data.map((produit) => (
                    <li key={produit.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <Vignette nom={produit.nom} taille={32} />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/produits/${produit.id}`}
                          className="block truncate text-corps font-medium text-ink-900 hover:underline"
                        >
                          {produit.nom}
                        </Link>
                        {produit.reference && (
                          <p className="truncate font-mono text-meta text-steel-500">{produit.reference}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        taille="sm"
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
                <table className={cn(tableau.table, 'hidden md:table')}>
                  <thead className={tableau.thead}>
                    <tr>
                      <th scope="col" className={tableau.th}>Produit</th>
                      <th scope="col" className={tableau.th}>Emplacement</th>
                      <th scope="col" className={tableau.th}>Date</th>
                      <th scope="col" className={cn(tableau.th, 'text-right')}>Quantité</th>
                    </tr>
                  </thead>
                  <tbody className={tableau.tbody}>
                    {receptions.data.map((reception) => (
                      <tr key={reception.id} className={tableau.tr}>
                        <td className={cn(tableau.td, 'font-medium text-ink-900')}>{reception.produit.nom}</td>
                        <td className={cn(tableau.td, 'text-steel-700')}>{reception.emplacement.nom}</td>
                        <td className={cn(tableau.td, 'whitespace-nowrap text-steel-500')}>
                          {new Date(reception.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className={cn(tableau.td, 'text-right font-semibold text-ok')}>+{reception.quantite}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="divide-y divide-rule md:hidden">
                  {receptions.data.map((reception) => (
                    <li key={reception.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-corps font-medium text-ink-900">{reception.produit.nom}</p>
                        <p className="truncate text-meta text-steel-500">
                          {reception.emplacement.nom}, le {new Date(reception.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <span className="shrink-0 text-corps font-semibold text-ok">+{reception.quantite}</span>
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
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-corps transition-colors hover:bg-paper disabled:opacity-50"
                >
                  <span className="truncate text-ink-900">{produit.nom}</span>
                  {produit.reference && (
                    <span className="shrink-0 font-mono text-meta text-steel-500">{produit.reference}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-corps text-steel-500">
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
