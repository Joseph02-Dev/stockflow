import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Check, Mail, ShieldCheck, WifiOff } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ChampMotDePasse } from './ChampMotDePasse';
import { ActiviteDirect } from './ActiviteDirect';
import { api, messageErreur } from '@/lib/api';
import { setSession } from '@/lib/session';
import { useEnLigne } from '@/lib/useEnLigne';
import type { ReponseSession } from '@/lib/session';
import { lienEnLigneClasses } from '@/components/ui/lienActionClasses';

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

type Formulaire = z.infer<typeof schema>;

// Au-delà de ce délai, on affiche un message rassurant plutôt que de
// laisser un spinner muet — la personne sait que ce n'est pas figé.
const SEUIL_CONNEXION_LENTE_MS = 2500;

export function ConnexionPage() {
  const navigate = useNavigate();
  const [parametres] = useSearchParams();
  const enLigne = useEnLigne();
  const [erreur, setErreur] = useState<string | null>(null);
  // Incrémenté à chaque échec : rejoue l'animation de tremblement du formulaire.
  const [echecs, setEchecs] = useState(0);
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const element = formulaire.current;
    if (!element || echecs === 0) return;
    element.classList.remove('auth-secoue');
    void element.offsetWidth; // relance l'animation même si la classe était déjà là
    element.classList.add('auth-secoue');
  }, [echecs]);
  const [resterConnecte, setResterConnecte] = useState(true);
  const [connexionLente, setConnexionLente] = useState(false);
  const [emailNonConfirme, setEmailNonConfirme] = useState<string | null>(null);
  const [renvoiEnCours, setRenvoiEnCours] = useState(false);
  const [renvoiConfirme, setRenvoiConfirme] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  async function onSubmit(valeurs: Formulaire) {
    setErreur(null);
    setEmailNonConfirme(null);
    setRenvoiConfirme(false);
    setConnexionLente(false);
    const minuteur = setTimeout(() => setConnexionLente(true), SEUIL_CONNEXION_LENTE_MS);
    try {
      const { data } = await api.post<ReponseSession>('/auth/login', { ...valeurs, resterConnecte });
      setSession(data, resterConnecte);
      navigate('/', { replace: true });
    } catch (error) {
      const message = messageErreur(error, 'Email ou mot de passe incorrect.');
      setErreur(message);
      setEchecs((n) => n + 1);
      // Repère textuel simple plutôt qu'un code d'erreur structuré côté
      // API — suffisant ici, ce message est le seul à contenir ce mot.
      if (message.includes('Confirmez votre adresse email')) {
        setEmailNonConfirme(valeurs.email);
      }
    } finally {
      clearTimeout(minuteur);
      setConnexionLente(false);
    }
  }

  async function renvoyerConfirmation() {
    if (!emailNonConfirme) return;
    setRenvoiEnCours(true);
    try {
      await api.post('/auth/resend-verification', { email: emailNonConfirme });
      setRenvoiConfirme(true);
    } catch {
      // resend-verification ne renvoie normalement jamais d'erreur
      // métier (même non-fuite que forgot-password) — rien de plus
      // utile à afficher qu'un nouvel essai possible.
    } finally {
      setRenvoiEnCours(false);
    }
  }

  return (
    <AuthLayout
      titre="Bon retour parmi nous"
      description="Connectez-vous à votre espace NimbaFlow."
      panneauGauche={
        <div>
          <h2 className="max-w-[18ch] font-display text-[2.375rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-white">
            Votre boutique continue de tourner.
          </h2>
          <p className="mt-3 max-w-[44ch] text-[1rem] text-white/65">
            Ventes, entrées, alertes : retrouvez tout ce qui s’est passé dans votre espace, même saisi sans réseau.
          </p>
          <ActiviteDirect />
        </div>
      }
    >
      <form ref={formulaire} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {!enLigne && (
          <Alert variant="warning">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" aria-hidden="true" />
              Vous êtes hors-ligne. La connexion nécessite une première synchronisation réseau.
            </span>
          </Alert>
        )}
        {parametres.get('suspendue') && !erreur && (
          <Alert variant="error">L’accès de votre entreprise a été suspendu. Contactez votre administrateur.</Alert>
        )}
        {parametres.get('desactive') && !erreur && (
          <Alert variant="error">Votre accès a été retiré par un administrateur de votre entreprise.</Alert>
        )}
        {erreur && <Alert variant="error">{erreur}</Alert>}
        {emailNonConfirme &&
          (renvoiConfirme ? (
            <Alert variant="success">Nouveau lien envoyé — vérifiez votre boîte mail.</Alert>
          ) : (
            <Button type="button" variant="secondary" onClick={renvoyerConfirmation} loading={renvoiEnCours}>
              Renvoyer le lien de confirmation
            </Button>
          ))}

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
            <label htmlFor="password" className="text-corps font-medium text-ink-900">
              Mot de passe
            </label>
            <Link to="/mot-de-passe-oublie" className={lienEnLigneClasses('text-meta')}>
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

        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-corps text-steel-700 select-none">
          <input
            type="checkbox"
            checked={resterConnecte}
            onChange={(event) => setResterConnecte(event.target.checked)}
            className="sr-only"
          />
          <span className="auth-case" aria-hidden="true">
            <Check />
          </span>
          Se souvenir de moi sur cet appareil
        </label>

        <Button type="submit" loading={isSubmitting} className="mt-1 w-full">
          {isSubmitting && connexionLente ? 'Connexion lente détectée…' : 'Se connecter'}
          {!isSubmitting && <ArrowRight className="size-[18px]" aria-hidden="true" />}
        </Button>
      </form>

      <p className="auth-separateur">Nouveau sur NimbaFlow ?</p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-rule-strong px-4 py-3.5 text-corps text-steel-700">
        <span>Créez votre entreprise en quelques minutes.</span>
        <Link to="/inscription" className={lienEnLigneClasses('whitespace-nowrap')}>
          Essai gratuit →
        </Link>
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-meta text-steel-500">
        <ShieldCheck className="size-3.5 text-ok" aria-hidden="true" />
        Connexion sécurisée (HTTPS)
      </p>
    </AuthLayout>
  );
}
