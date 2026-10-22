import { useEffect, useState, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { getSession, setSession, sessionActuelleEstPersistante } from '@/lib/session';
import { CHAMPS_IDENTITE, useEntreprise, type EntrepriseDetail } from './donnees';
import { EnteteCarte, EnteteSection } from './EnteteSection';

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

function versFormulaire(data: EntrepriseDetail): Formulaire {
  return {
    nom: data.nom,
    adresse: data.adresse ?? '',
    telephone: data.telephone ?? '',
    email: data.email ?? '',
    rccm: data.rccm ?? '',
    nif: data.nif ?? '',
    logoUrl: data.logoUrl ?? '',
  };
}

function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .map((mot) => mot[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function EntrepriseSection() {
  const queryClient = useQueryClient();
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch } = useEntreprise();

  const { register, handleSubmit, reset, setValue, control, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });
  // L'aperçu suit la saisie, avant même l'enregistrement.
  const valeurs = useWatch({ control });

  // Le formulaire doit refléter la donnée serveur dès qu'elle est chargée.
  useEffect(() => {
    if (data) reset(versFormulaire(data));
  }, [data, reset]);

  const mutation = useMutation({
    // Chaîne vide → null côté serveur : le champ est effacé.
    mutationFn: async (v: Formulaire) => (await api.patch<EntrepriseDetail>('/entreprise', v)).data,
    onSuccess: (entreprise) => {
      setErreur(null);
      setSucces(true);
      reset(versFormulaire(entreprise));
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

  const remplis = CHAMPS_IDENTITE.filter(({ champ }) => valeurs[champ]?.trim()).length;
  const complet = remplis === CHAMPS_IDENTITE.length;
  const nom = valeurs.nom?.trim() || 'Nom de l’entreprise';
  const mention = (champ: (typeof CHAMPS_IDENTITE)[number]['champ'], libelle: string) =>
    valeurs[champ]?.trim() || <span className="parametres-manque">{libelle} manquant{champ === 'adresse' ? 'e' : ''}</span>;

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      noValidate
      className="flex flex-col gap-4"
      onChange={() => setSucces(false)}
    >
      <EnteteSection titre="Entreprise" description="Ce qui apparaît en en-tête de vos rapports PDF : relevés clients, état du stock, pertes." />

      {succes && <Alert variant="success">Les informations ont été enregistrées.</Alert>}
      {erreur && <Alert variant="error">{erreur}</Alert>}

      <div className="parametres-carte parametres-apercu">
        <div className="parametres-feuille-zone">
          <p className="mb-2.5 text-[11.5px] font-semibold tracking-[0.06em] text-steel-400 uppercase">Aperçu de l’en-tête</p>
          <div className="parametres-feuille" role="img" aria-label={`Aperçu de l’en-tête des rapports PDF de ${nom}`}>
            <span className="parametres-feuille-doc">RELEVÉ CLIENT</span>
            <div className="flex items-start gap-3.5 border-b-2 border-[#15161a] pb-3.5">
              {valeurs.logoUrl ? (
                <img src={valeurs.logoUrl} alt="" className="size-[52px] shrink-0 rounded-lg object-contain" />
              ) : (
                <span className="grid size-[52px] shrink-0 place-items-center rounded-lg bg-[linear-gradient(140deg,#c2440b,#8a2f06)] font-display text-[18px] font-bold text-white">
                  {initiales(valeurs.nom ?? '')}
                </span>
              )}
              <div className="min-w-0 sm:pr-24">
                <p className="font-display text-[17px] leading-tight font-bold tracking-[-0.01em] break-words">{nom}</p>
                <p className="mt-1 text-[11.5px] leading-[1.6] break-words text-[#5d616b]">
                  {mention('adresse', 'Adresse')} · {mention('telephone', 'Téléphone')} · {mention('email', 'Email')}
                </p>
                <p className="text-[11.5px] leading-[1.6] text-[#5d616b]">
                  RCCM {mention('rccm', 'RCCM')} · NIF {mention('nif', 'NIF')}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3.5 p-4 sm:p-[22px]">
          <div className="flex items-center gap-3.5">
            <div
              className="parametres-anneau"
              style={{ '--part': (remplis / CHAMPS_IDENTITE.length) * 100, '--teinte': complet ? 'var(--color-ok)' : 'var(--color-faible)' } as CSSProperties}
            >
              <span className="tabular-nums">
                {remplis}/{CHAMPS_IDENTITE.length}
              </span>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ink-900">{complet ? 'Identité complète' : 'Identité incomplète'}</p>
              <p className="text-[12.5px] text-steel-500">
                {complet
                  ? 'Vos documents portent toutes les mentions attendues.'
                  : 'Sans ces mentions, vos documents ont peu de valeur auprès d’un banquier ou d’un contrôleur.'}
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5" aria-label="Mentions de l’en-tête">
            {CHAMPS_IDENTITE.map(({ champ, libelle }) => {
              const rempli = Boolean(valeurs[champ]?.trim());
              return (
                <li key={champ} className={cn('flex items-center gap-2.5 text-corps', rempli ? 'text-steel-500' : 'text-steel-700')}>
                  <span
                    className={cn(
                      'grid size-[18px] shrink-0 place-items-center rounded-full',
                      rempli ? 'bg-ok text-white' : 'border-[1.5px] border-dashed border-rule-strong',
                    )}
                    aria-hidden="true"
                  >
                    {rempli && <Check className="size-[11px]" strokeWidth={3} />}
                  </span>
                  <span className={cn(rempli && 'line-through decoration-rule-strong')}>{libelle}</span>
                  <span className="sr-only">{rempli ? ' : renseigné' : ' : manquant'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="parametres-carte">
        <EnteteCarte titre="Raison sociale et logo" meta="Le nom affiché partout dans l’application et sur vos documents." />
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <Input label="Nom de l’entreprise (raison sociale)" error={formState.errors.nom?.message} {...register('nom')} />
          <ImageUploadField
            label="Logo"
            dossier="entreprise"
            valeur={valeurs.logoUrl || undefined}
            onChange={(url) => {
              setSucces(false);
              setValue('logoUrl', url ?? '', { shouldDirty: true });
            }}
          />
        </div>
      </div>

      <div className="parametres-carte">
        <EnteteCarte titre="Coordonnées" meta="Pour que vos clients et partenaires vous joignent." />
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <Input label="Adresse" placeholder="Ex. Marché Madina, Conakry" error={formState.errors.adresse?.message} {...register('adresse')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Téléphone" type="tel" placeholder="+224 6XX XX XX XX" error={formState.errors.telephone?.message} {...register('telephone')} />
            <Input label="Email" type="email" error={formState.errors.email?.message} {...register('email')} />
          </div>
        </div>
      </div>

      <div className="parametres-carte">
        <EnteteCarte titre="Mentions légales" meta="Attendues sur tout document opposable." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Input
            label="RCCM"
            hint="Registre du commerce et du crédit mobilier"
            placeholder="GN.TCC.2021.B.00000"
            error={formState.errors.rccm?.message}
            {...register('rccm')}
          />
          <Input label="NIF" hint="Numéro d’identification fiscale" error={formState.errors.nif?.message} {...register('nif')} />
        </div>
      </div>

      {formState.isDirty && (
        <div className="parametres-barre" role="status">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-corps opacity-80">
            <span className="size-[7px] shrink-0 rounded-full bg-faible-vif" aria-hidden="true" />
            Modifications non enregistrées
          </span>
          <Button
            type="button"
            variant="secondary"
            taille="sm"
            className="border-current/20! bg-transparent! text-current!"
            onClick={() => {
              setErreur(null);
              reset(versFormulaire(data));
            }}
          >
            Annuler
          </Button>
          <Button type="submit" taille="sm" loading={mutation.isPending}>
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  );
}
