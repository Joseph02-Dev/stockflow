import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/patterns/Logo';
import { ChampMotDePasse } from '@/features/auth/ChampMotDePasse';
import { messageErreur } from '@/lib/api';
import { apiConsole } from './api';
import { setSessionConsole, useSessionConsole } from './session';
import type { SessionConsole } from './session';

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  motDePasse: z.string().min(1, 'Le mot de passe est requis.'),
});

type Formulaire = z.infer<typeof schema>;

/**
 * Connexion opérateur. Volontairement sobre, et sans lien « créer un
 * compte » : un opérateur ne se crée qu'en ligne de commande.
 */
export function ConsoleConnexionPage() {
  const session = useSessionConsole();
  const navigate = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  if (session) return <Navigate to="/console/apercu" replace />;

  async function onSubmit(valeurs: Formulaire) {
    setErreur(null);
    try {
      const { data } = await apiConsole.post<SessionConsole>('/console/auth/login', valeurs);
      setSessionConsole(data);
      navigate('/console/apercu', { replace: true });
    } catch (error) {
      setErreur(messageErreur(error, 'Email ou mot de passe incorrect.'));
    }
  }

  return (
    <main className="zone-console flex min-h-full items-center justify-center bg-console-fond px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo taille={32} />
          <span className="text-panneau text-white">StockFlow</span>
          <span className="rounded-full bg-console px-2 py-0.5 text-meta font-medium text-white">Console</span>
        </div>

        <div className="rounded-xl bg-surface p-7 shadow-pop">
          <h1 className="text-titre text-ink-900">Console opérateur</h1>
          <p className="mt-1 text-corps text-steel-500">Accès réservé à l’exploitation de la plateforme.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
            {erreur && <Alert variant="error">{erreur}</Alert>}
            <Input
              label="Adresse email"
              type="email"
              autoComplete="username"
              icone={<Mail className="size-4" aria-hidden="true" />}
              error={errors.email?.message}
              {...register('email')}
            />
            <ChampMotDePasse
              label="Mot de passe"
              autoComplete="current-password"
              error={errors.motDePasse?.message}
              {...register('motDePasse')}
            />
            <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
              Se connecter
            </Button>
          </form>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-meta text-white/60">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Chaque connexion est inscrite au journal d’audit.
        </p>
      </div>
    </main>
  );
}
