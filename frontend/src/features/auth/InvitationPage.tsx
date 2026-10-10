import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ImagePlus, Mail, User, Users, X } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { PointsChargement } from '@/components/ui/PointsChargement';
import { ChampMotDePasse } from './ChampMotDePasse';
import { IndicateurForceMotDePasse } from './IndicateurForceMotDePasse';
import { api, messageErreur } from '@/lib/api';
import { setSession } from '@/lib/session';
import type { Session } from '@/lib/session';

const schema = z
  .object({
    nom: z.string().trim().min(2, 'Votre nom complet doit contenir au moins 2 caractères.').max(100),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(72),
    confirmation: z.string(),
  })
  .refine((v) => v.password === v.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmation'],
  });

type Formulaire = z.infer<typeof schema>;

interface DetailsInvitation {
  email: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
  entreprise: string;
  invitePar: string;
}

const LIBELLE_ROLE: Record<DetailsInvitation['role'], string> = {
  ADMIN: 'Administrateur',
  GESTIONNAIRE: 'Gestionnaire de stock',
};

const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;
const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Inscription d'une personne invitée par un Admin, depuis le lien reçu par
 * email (/invitation?token=…). L'adresse, l'entreprise et le rôle viennent
 * de l'invitation et ne se modifient pas ici.
 *
 * La photo est choisie avant l'inscription mais téléversée juste après :
 * le téléversement exige une session, que l'acceptation ouvre.
 */
export function InvitationPage() {
  const navigate = useNavigate();
  const [parametres] = useSearchParams();
  const token = parametres.get('token') ?? '';
  const [erreur, setErreur] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () =>
      (
        await api.get<DetailsInvitation>('/auth/invitation', {
          params: { token },
        })
      ).data,
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  const { register, handleSubmit, formState, control } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });
  const motDePasseSaisi = useWatch({ control, name: 'password' }) ?? '';

  async function rejoindre(valeurs: Formulaire) {
    setErreur(null);
    let session: Session;
    try {
      ({ data: session } = await api.post<Session>('/auth/accept-invite', {
        token,
        nom: valeurs.nom,
        password: valeurs.password,
      }));
    } catch (error) {
      setErreur(messageErreur(error, 'Invitation invalide, déjà utilisée ou expirée.'));
      return;
    }
    setSession(session);

    // Compte créé : une photo qui échoue ne doit pas bloquer l'arrivée dans
    // l'entreprise (elle reste modifiable depuis le profil).
    if (photo) {
      try {
        const formData = new FormData();
        formData.append('fichier', photo);
        const { data } = await api.post<{ url: string }>('/uploads/image?type=utilisateurs', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        await api.patch('/users/me/photo', { photoUrl: data.url });
        setSession({
          ...session,
          utilisateur: { ...session.utilisateur, photoUrl: data.url },
        });
      } catch {
        // Ignoré volontairement : voir ci-dessus.
      }
    }
    navigate('/', { replace: true });
  }

  const details = invitation.data;
  const panneauGauche = (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-titre text-white">
          {details ? `${details.entreprise} vous attend.` : 'Vous avez été invité(e).'}
        </h2>
        <p className="mt-3 text-corps text-white/65">
          {details
            ? `${details.invitePar} vous a ouvert un accès à l’espace StockFlow de ${details.entreprise}. Créez votre compte pour rejoindre l’équipe.`
            : 'Un administrateur vous a ouvert un accès à son espace StockFlow.'}
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.05] p-3">
        <Users className="mt-0.5 size-4 shrink-0 text-action-clair" aria-hidden="true" />
        <p className="text-meta text-white/65">
          {details
            ? `Votre rôle : ${LIBELLE_ROLE[details.role]}. Il a été défini par l’administrateur.`
            : 'Votre rôle a déjà été défini par l’administrateur.'}
        </p>
      </div>
    </div>
  );

  const pied = (
    <>
      Vous avez déjà un compte ?{' '}
      <Link to="/connexion" className="font-medium text-action hover:underline">
        Se connecter
      </Link>
    </>
  );

  // Lien sans jeton, ou invitation introuvable, utilisée ou expirée.
  if (!token || invitation.isError) {
    return (
      <AuthLayout titre="Invitation indisponible" panneauGauche={panneauGauche} pied={pied}>
        <div className="flex flex-col gap-4">
          <Alert variant="error">
            {!token
              ? 'Ce lien d’invitation est incomplet. Ouvrez le lien reçu par email.'
              : messageErreur(invitation.error, 'Invitation invalide, déjà utilisée ou expirée.')}
          </Alert>
          <p className="text-corps text-steel-500">
            Demandez à l’administrateur de votre entreprise de vous envoyer une nouvelle invitation.
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (!details) {
    return (
      <AuthLayout titre="Rejoindre l’entreprise" panneauGauche={panneauGauche} pied={pied}>
        <div className="flex flex-col items-center gap-3 py-8">
          <PointsChargement className="h-10 text-action [&>span]:size-2" />
          <p className="text-corps text-steel-500">Chargement de l’invitation…</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      titre={`Rejoindre ${details.entreprise}`}
      description="Complétez votre profil pour activer votre compte."
      panneauGauche={panneauGauche}
      pied={pied}
    >
      <form onSubmit={handleSubmit(rejoindre)} className="flex flex-col gap-4" noValidate>
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <Input
          label="Entreprise"
          value={details.entreprise}
          readOnly
          className="bg-paper text-steel-700 hover:border-rule-strong"
          icone={<Building2 className="size-4" aria-hidden="true" />}
        />
        <Input
          label="Adresse email"
          type="email"
          value={details.email}
          readOnly
          className="bg-paper text-steel-700 hover:border-rule-strong"
          autoComplete="username"
          icone={<Mail className="size-4" aria-hidden="true" />}
          hint="L’adresse à laquelle l’invitation a été envoyée."
        />
        <Input
          label="Nom complet"
          autoComplete="name"
          icone={<User className="size-4" aria-hidden="true" />}
          error={formState.errors.nom?.message}
          {...register('nom')}
        />
        <ChoixPhoto fichier={photo} onChange={setPhoto} />
        <div className="flex flex-col gap-1.5">
          <ChampMotDePasse
            label="Mot de passe"
            autoComplete="new-password"
            error={formState.errors.password?.message}
            {...register('password')}
          />
          {!formState.errors.password && (
            <>
              <IndicateurForceMotDePasse motDePasse={motDePasseSaisi} />
              <p className="text-meta text-steel-500">Au moins 8 caractères.</p>
            </>
          )}
        </div>
        <ChampMotDePasse
          label="Confirmer le mot de passe"
          autoComplete="new-password"
          error={formState.errors.confirmation?.message}
          {...register('confirmation')}
        />

        <Button type="submit" loading={formState.isSubmitting} className="mt-2 w-full">
          Rejoindre {details.entreprise}
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Photo de profil facultative : choisie et prévisualisée ici, téléversée après l'inscription. */
function ChoixPhoto({ fichier, onChange }: { fichier: File | null; onChange: (fichier: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  // Libère l'aperçu précédent à chaque changement, et le dernier en quittant la page.
  useEffect(
    () => () => {
      if (apercu) URL.revokeObjectURL(apercu);
    },
    [apercu],
  );

  function choisir(choisi: File | null) {
    setApercu(choisi ? URL.createObjectURL(choisi) : null);
    onChange(choisi);
  }

  function surSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const choisi = event.target.files?.[0];
    event.target.value = '';
    if (!choisi) return;
    if (!TYPES_ACCEPTES.includes(choisi.type)) {
      setErreur('Seules les images JPEG, PNG ou WEBP sont acceptées.');
      return;
    }
    if (choisi.size > TAILLE_MAX_OCTETS) {
      setErreur('Image trop volumineuse (5 Mo maximum).');
      return;
    }
    setErreur(null);
    choisir(choisi);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-corps font-medium text-ink-900">
        Photo de profil <span className="font-normal text-steel-500">(facultative)</span>
      </span>
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-rule bg-paper">
          {apercu ? (
            <img src={apercu} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5 text-steel-500" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-rule bg-surface px-3 py-1.5 text-corps font-medium text-ink-900 transition-colors hover:bg-survol"
            >
              {fichier ? 'Changer' : 'Choisir une photo'}
            </button>
            {fichier && (
              <button
                type="button"
                onClick={() => choisir(null)}
                aria-label="Retirer la photo"
                className="rounded-md p-1.5 text-steel-500 transition-colors hover:bg-survol hover:text-rupture"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <span className="text-meta text-steel-500">JPEG, PNG ou WEBP — 5 Mo maximum.</span>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={surSelection}
        className="hidden"
      />
      {erreur && <p className="text-meta text-rupture">{erreur}</p>}
    </div>
  );
}
