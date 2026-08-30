import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
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

  const { register, handleSubmit, formState } = useForm<Formulaire>({ resolver: zodResolver(schema) });

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
      sousTitre="Choisissez votre nom et votre mot de passe pour activer votre compte."
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
            hint="Il figure dans l’email d’invitation que vous avez reçu."
          />
        )}

        <Input
          label="Votre nom"
          autoComplete="name"
          error={formState.errors.nom?.message}
          {...register('nom')}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          hint="Au moins 8 caractères."
          error={formState.errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={formState.isSubmitting} className="mt-2 w-full">
          Activer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}
