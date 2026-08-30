import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

type Formulaire = z.infer<typeof schema>;

export function ConnexionPage() {
  const navigate = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  async function onSubmit(valeurs: Formulaire) {
    setErreur(null);
    try {
      const { data } = await api.post<Session>('/auth/login', valeurs);
      setSession(data);
      navigate('/', { replace: true });
    } catch (error) {
      setErreur(messageErreur(error, 'Email ou mot de passe incorrect.'));
    }
  }

  return (
    <AuthLayout
      titre="Connexion"
      sousTitre="Accédez à votre espace StockFlow."
      pied={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-medium text-primary hover:underline">
            Créer une entreprise
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          Se connecter
        </Button>
      </form>
    </AuthLayout>
  );
}
