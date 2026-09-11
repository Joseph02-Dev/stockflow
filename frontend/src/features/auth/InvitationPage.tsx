import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, User, Users } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ChampMotDePasse } from './ChampMotDePasse';
import { IndicateurForceMotDePasse } from './IndicateurForceMotDePasse';
import { api, messageErreur } from '@/lib/api';
import { setSession } from '@/lib/session';
import type { Session } from '@/lib/session';

const schema = z.object({
  nom: z.string().min(2, 'Votre nom doit contenir au moins 2 caractères.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
});

type Formulaire = z.infer<typeof schema>;

export function InvitationPage() {
  const navigate = useNavigate();
  const [parametres] = useSearchParams();
  const [erreur, setErreur] = useState<string | null>(null);

  // Le jeton peut venir du lien reçu par email, ou être saisi à la main
  // si l'utilisateur l'a recopié.
  const tokenDepuisUrl = parametres.get('token') ?? '';
  const [token, setToken] = useState(tokenDepuisUrl);

  const { register, handleSubmit, formState, control } = useForm<Formulaire>({ resolver: zodResolver(schema) });
  const motDePasseSaisi = useWatch({ control, name: 'password' }) ?? '';

  async function accepter(valeurs: Formulaire) {
    setErreur(null);
    if (!token.trim()) {
      setErreur('Le jeton d’invitation est requis.');
      return;
    }
    try {
      const { data } = await api.post<Session>('/auth/accept-invite', { token, ...valeurs });
      setSession(data);
      navigate('/', { replace: true });
    } catch (error) {
      setErreur(messageErreur(error, 'Invitation invalide, déjà utilisée ou expirée.'));
    }
  }

  return (
    <AuthLayout
      titre="Rejoindre l’entreprise"
      description="Choisissez votre nom et votre mot de passe pour activer votre compte."
      panneauGauche={
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="text-2xl font-semibold text-white">Vous avez été invité(e).</h2>
            <p className="mt-3 text-sm text-navy-text">
              Un administrateur vous a ouvert un accès à son espace StockFlow. Activez votre compte en quelques
              secondes pour commencer à suivre le stock avec le reste de l’équipe.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-(--radius-button) bg-navy-light p-3">
            <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs text-navy-text">
              Votre rôle a déjà été défini par l’administrateur — vous verrez uniquement ce dont vous avez besoin
              au quotidien.
            </p>
          </div>
        </div>
      }
      pied={
        <>
          Vous avez déjà un compte ?{' '}
          <Link to="/connexion" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(accepter)} className="flex flex-col gap-4" noValidate>
        {erreur && <Alert variant="error">{erreur}</Alert>}

        {!tokenDepuisUrl && (
          <Input
            label="Jeton d’invitation"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            icone={<KeyRound className="size-4" aria-hidden="true" />}
            hint="Il figure dans l’email d’invitation que vous avez reçu."
          />
        )}

        <Input
          label="Votre nom"
          autoComplete="name"
          icone={<User className="size-4" aria-hidden="true" />}
          error={formState.errors.nom?.message}
          {...register('nom')}
        />
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
              <p className="text-xs text-text-secondary">Au moins 8 caractères.</p>
            </>
          )}
        </div>

        <Button type="submit" loading={formState.isSubmitting} className="mt-2 w-full">
          Activer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}
