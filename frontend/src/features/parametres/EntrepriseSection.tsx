import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { getSession, setSession, sessionActuelleEstPersistante } from '@/lib/session';

interface EntrepriseDetail {
  id: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
  logoUrl: string | null;
}

const schema = z.object({
  nom: z.string().min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères.'),
  adresse: z.string().max(200, '200 caractères au maximum.'),
  telephone: z.string().max(40, '40 caractères au maximum.'),
  email: z.union([z.literal(''), z.string().email('Adresse email invalide.').max(120)]),
  rccm: z.string().max(60, '60 caractères au maximum.'),
  nif: z.string().max(60, '60 caractères au maximum.'),
  logoUrl: z.string(),
});

type Formulaire = z.infer<typeof schema>;

/** Champs d'identité attendus en en-tête de tout document opposable. */
const CHAMPS_IDENTITE = ['adresse', 'telephone', 'email', 'rccm', 'nif'] as const;

export function EntrepriseSection() {
  const queryClient = useQueryClient();
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['entreprise'],
    queryFn: async () => (await api.get<EntrepriseDetail>('/entreprise')).data,
  });

  const { register, handleSubmit, reset, setValue, control, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });
  const logoUrl = useWatch({ control, name: 'logoUrl' });

  // Le formulaire doit refléter la donnée serveur dès qu'elle est chargée.
  useEffect(() => {
    if (data)
      reset({
        nom: data.nom,
        adresse: data.adresse ?? '',
        telephone: data.telephone ?? '',
        email: data.email ?? '',
        rccm: data.rccm ?? '',
        nif: data.nif ?? '',
        logoUrl: data.logoUrl ?? '',
      });
  }, [data, reset]);

  const mutation = useMutation({
    // Chaîne vide → null côté serveur : le champ est effacé.
    mutationFn: async (valeurs: Formulaire) => (await api.patch<EntrepriseDetail>('/entreprise', valeurs)).data,
    onSuccess: (entreprise) => {
      setErreur(null);
      setSucces(true);
      queryClient.invalidateQueries({ queryKey: ['entreprise'] });

      // Le nom de l'entreprise est affiché dans la barre supérieure depuis
      // la session : il faut la mettre à jour pour éviter d'afficher une
      // valeur périmée jusqu'à la prochaine connexion.
      const session = getSession();
      if (session) setSession({ ...session, entreprise: { ...session.entreprise, nom: entreprise.nom } }, sessionActuelleEstPersistante());
    },
    onError: (err) => {
      setSucces(false);
      setErreur(messageErreur(err, 'La modification a échoué.'));
    },
  });

  if (isLoading) return <LoadingState variante="fiche" lignes={4} />;
  if (isError || !data) return <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />;

  const identiteIncomplete = CHAMPS_IDENTITE.some((champ) => !data[champ]);

  return (
    <Card>
      <form onSubmit={handleSubmit((valeurs) => mutation.mutate(valeurs))} noValidate>
        <div className="flex max-w-2xl flex-col gap-4 p-5">
          {succes && <Alert variant="success">Les informations ont été enregistrées.</Alert>}
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Input label="Nom de l’entreprise (raison sociale)" error={formState.errors.nom?.message} {...register('nom')} />
        </div>

        <PanneauEntete
          titre="Identité de l’entreprise"
          meta="Imprimée en en-tête de vos rapports PDF : relevés clients, état du stock, pertes."
          className="border-t"
        />
        <div className="flex max-w-2xl flex-col gap-4 p-5">
          {identiteIncomplete && (
            <Alert variant="warning">
              Ces informations apparaissent en en-tête de tous vos rapports PDF. Sans elles, vos documents n’auront pas de valeur auprès d’un
              banquier ou d’un contrôleur.
            </Alert>
          )}
          <ImageUploadField
            label="Logo"
            dossier="entreprise"
            valeur={logoUrl || undefined}
            onChange={(url) => setValue('logoUrl', url ?? '', { shouldDirty: true })}
          />
          <Input label="Adresse" placeholder="Ex. Marché Madina, Conakry" error={formState.errors.adresse?.message} {...register('adresse')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Téléphone" type="tel" placeholder="+224 6XX XX XX XX" error={formState.errors.telephone?.message} {...register('telephone')} />
            <Input label="Email" type="email" error={formState.errors.email?.message} {...register('email')} />
            <Input
              label="RCCM"
              hint="Registre du commerce et du crédit mobilier"
              placeholder="GN.TCC.2021.B.00000"
              error={formState.errors.rccm?.message}
              {...register('rccm')}
            />
            <Input label="NIF" hint="Numéro d’identification fiscale" error={formState.errors.nif?.message} {...register('nif')} />
          </div>
          <div>
            <Button type="submit" loading={mutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
