import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ArrowLeftRight, Mail, WifiOff } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ChampMotDePasse } from './ChampMotDePasse';
import { api, messageErreur } from '@/lib/api';
import { setSession } from '@/lib/session';
import { useEnLigne } from '@/lib/useEnLigne';
import type { Session } from '@/lib/session';

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

type Formulaire = z.infer<typeof schema>;

const REPERES = [
  { Icone: AlertTriangle, titre: 'Alertes automatiques', description: 'Prévient avant la rupture, seuil par produit.' },
  { Icone: ArrowLeftRight, titre: 'Entrées et sorties tracées', description: 'Qui, quand, où — sur chaque emplacement.' },
  { Icone: WifiOff, titre: 'Fonctionne en réseau faible', description: 'Saisie hors-ligne, synchronisation au retour.' },
];

// Au-delà de ce délai, on affiche un message rassurant plutôt que de
// laisser un spinner muet — la personne sait que ce n'est pas figé.
const SEUIL_CONNEXION_LENTE_MS = 2500;

export function ConnexionPage() {
  const navigate = useNavigate();
  const enLigne = useEnLigne();
  const [erreur, setErreur] = useState<string | null>(null);
  const [resterConnecte, setResterConnecte] = useState(true);
  const [connexionLente, setConnexionLente] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  async function onSubmit(valeurs: Formulaire) {
    setErreur(null);
    setConnexionLente(false);
    const minuteur = setTimeout(() => setConnexionLente(true), SEUIL_CONNEXION_LENTE_MS);
    try {
      const { data } = await api.post<Session>('/auth/login', valeurs);
      setSession(data, resterConnecte);
      navigate('/', { replace: true });
    } catch (error) {
      setErreur(messageErreur(error, 'Email ou mot de passe incorrect.'));
    } finally {
      clearTimeout(minuteur);
      setConnexionLente(false);
    }
  }

  return (
    <AuthLayout
      titre="Connexion"
      description="Accédez à votre espace StockFlow."
      panneauGauche={
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Votre stock, à jour à chaque ouverture de boutique.
            </h2>
            <p className="mt-3 text-sm text-navy-text">
              Entrées, sorties, seuils d’alerte et fournisseurs au même endroit. Conçu pour fonctionner même
              quand la connexion faiblit.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {REPERES.map(({ Icone, titre, description }) => (
              <li key={titre} className="flex items-start gap-3 rounded-(--radius-button) bg-navy-light p-3">
                <Icone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-white">{titre}</p>
                  <p className="text-xs text-navy-text">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
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
        {!enLigne && (
          <Alert variant="warning">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" aria-hidden="true" />
              Vous êtes hors-ligne. La connexion nécessite une première synchronisation réseau.
            </span>
          </Alert>
        )}
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <Input
          label="Adresse email"
          type="email"
          autoComplete="email"
          icone={<Mail className="size-4" aria-hidden="true" />}
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium text-text-primary">
              Mot de passe
            </label>
            <Link to="/mot-de-passe-oublie" className="text-xs font-medium text-primary hover:underline">
              Mot de passe oublié ?
            </Link>
          </div>
          <ChampMotDePasse
            label=""
            id="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={resterConnecte}
            onChange={(event) => setResterConnecte(event.target.checked)}
            className="size-4 rounded border-border-subtle text-primary"
          />
          Rester connectée sur cet appareil
        </label>

        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          {isSubmitting && connexionLente ? 'Connexion lente détectée…' : 'Se connecter'}
        </Button>
      </form>
    </AuthLayout>
  );
}
