import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, RotateCcwClock, ShieldCheck, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/patterns/Logo';
import { ChampMotDePasse } from '@/features/auth/ChampMotDePasse';
import { messageErreur } from '@/lib/api';
import { apiConsole } from './api';
import { setSessionConsole, useSessionConsole } from './session';
import type { SessionConsole } from './session';
import './console.css';

const GARANTIES = [
  { Icone: RotateCcwClock, texte: 'Chaque connexion et chaque action sont journalisées' },
  { Icone: Timer, texte: 'Session limitée à 2 heures, sans renouvellement' },
  { Icone: ShieldCheck, texte: 'Aucun accès aux mots de passe des entreprises' },
];

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
  const [majuscules, setMajuscules] = useState(false);
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
    <main className="console-connexion">
      <section className="flex flex-col gap-8 px-5 pt-7 md:justify-between md:px-12 md:py-10 md:pb-24">
        <div className="flex items-center gap-2.5">
          <Logo taille={30} />
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold">NimbaFlow</p>
            <p className="text-meta text-console-clair">Console opérateur</p>
          </div>
        </div>
        <div>
          <h1 className="max-w-[440px] font-display text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.02em] md:text-[2.5rem]">
            L’exploitation de la plateforme, sous contrôle.
          </h1>
          <p className="mt-3 max-w-[420px] text-corps text-white/70">
            Accès réservé aux opérateurs. Les comptes se créent uniquement depuis le serveur.
          </p>
          <ul className="mt-5 flex flex-col gap-2.5 text-corps text-white/80">
            {GARANTIES.map(({ Icone, texte }) => (
              <li key={texte} className="flex items-center gap-2.5">
                <Icone className="size-[17px] shrink-0 text-console-clair" strokeWidth={1.75} aria-hidden="true" />
                {texte}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid place-items-center px-4 pt-6 pb-10 md:p-8">
        <div className="w-full max-w-[400px] rounded-[22px] bg-surface p-7 text-ink-900 shadow-pop">
          <h2 className="font-display text-[1.5rem] font-semibold">Console opérateur</h2>
          <p className="mt-1 text-corps text-steel-500">Connecte-toi avec ton compte opérateur.</p>

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
              hint={majuscules ? 'Majuscules verrouillées' : undefined}
              onKeyUp={(e) => setMajuscules(e.getModifierState('CapsLock'))}
              {...register('motDePasse')}
            />
            <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
              Se connecter
            </Button>
          </form>

          <p className="mt-4 flex items-center gap-1.5 text-meta text-steel-400">
            <ShieldCheck className="size-[15px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Chaque connexion est inscrite au journal d’audit.
          </p>
        </div>
      </section>
    </main>
  );
}
